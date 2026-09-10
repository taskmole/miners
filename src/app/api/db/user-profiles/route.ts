import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createServerSupabase,
  getTokenFromRequest,
  untypedDb as db,
} from "@/lib/supabase-server";
import { isEmailAllowed, ALLOWED_DOMAINS } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "current";

  // "all" mode only needs a valid token (RLS handles permission)
  if (mode === "all") {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const supabase = createServerSupabase(token);

      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[api/db/user-profiles] all query error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data || []);
    } catch (err) {
      console.error("[api/db/user-profiles] unexpected error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // "single" mode: fetch one user profile by id
  if (mode === "single") {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    try {
      const supabase = createServerSupabase(token);

      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error("[api/db/user-profiles] single query error:", error);
        if (error.code === "PGRST116") {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    } catch (err) {
      console.error("[api/db/user-profiles] unexpected error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  }

  // "current" mode: get the authenticated user's role
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("role, display_name, is_active")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[api/db/user-profiles] current query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/user-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Fields that decide what someone is allowed to do, not who they are.
 *
 * The database trigger locks more than this (email, id, can_approve_level as
 * well), but ALLOWED_FIELDS below already drops those before an update is
 * built, so these three are the only ones that can reach the guard from here.
 */
const PRIVILEGED_FIELDS = ["role", "is_active", "city_ids"] as const;

/** Roles that may run the user screen. Mirrors is_admin() in the database. */
const ADMIN_ROLES = ["super_admin", "head_office_exec"];

/** Postgres insufficient_privilege, raised by enforce_profile_field_locks(). */
const INSUFFICIENT_PRIVILEGE = "42501";

export async function PATCH(request: NextRequest) {
  // getUser() rather than a bare token read: this handler decides permissions
  // from the caller's identity, so the identity has to be verified, not
  // assumed from whatever the Authorization header happens to say.
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { id, ...rawUpdates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ALLOWED_FIELDS = ['role', 'is_active', 'display_name', 'city_ids', 'team_id', 'receives_scraper_emails'];
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in rawUpdates) updates[key] = rawUpdates[key];
    }
    updates.updated_at = new Date().toISOString();

    // The database refuses these changes anyway (enforce_profile_field_locks),
    // but a raw Postgres exception reaches the screen as a 500 and reads like a
    // crash. Refuse here first, in words, with the status the situation calls
    // for. The two sets of rules are deliberately identical: if they ever
    // disagree, the answer people see stops matching what actually happened.
    const touchesPrivileged = PRIVILEGED_FIELDS.some(field => field in updates);

    if (touchesPrivileged) {
      // Caller and target in one trip. Someone editing their own profile is
      // both, hence the de-duplicated id list.
      const { data: rows, error: lookupError } = await db(supabase)
        .from("user_profiles")
        .select("id, role")
        .in("id", [...new Set([userId, id])]);

      // A failed lookup is not a refusal. Saying "only an admin can do this"
      // to an admin whose read timed out sends them hunting for a permission
      // problem that is not there.
      if (lookupError) {
        console.error("[api/db/user-profiles] role lookup failed:", lookupError);
        return NextResponse.json(
          { error: "Could not check permissions, please try again." },
          { status: 500 },
        );
      }

      const roleOf = (who: string) =>
        (rows as { id: string; role: string }[] | null)?.find(r => r.id === who)?.role ?? "";

      const callerRole = roleOf(userId);
      if (!ADMIN_ROLES.includes(callerRole)) {
        return NextResponse.json(
          { error: "Only an admin can change a profile's role, access or cities." },
          { status: 403 },
        );
      }

      // Super admins are off limits to everyone below them, and not only on
      // the role field: switching one off with is_active would put the
      // founders behind the "account pending" screen just as effectively.
      if (
        callerRole !== "super_admin" &&
        (updates.role === "super_admin" || roleOf(id) === "super_admin")
      ) {
        return NextResponse.json(
          { error: "Only a super admin can grant, remove or suspend the super admin role." },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[api/db/user-profiles] update error:", error);
      // The database guard fired: a permission problem, not a server fault.
      if (error.code === INSUFFICIENT_PRIVILEGE) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/user-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  try {
    const body = await request.json();

    const email = body.email?.trim()?.toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // The check_email_domain() trigger on auth.users refuses sign-ups from
    // addresses outside the allowlist, and GoTrue reports that refusal as an
    // opaque "Database error saving new user". Inviting such an address here
    // would create a profile for someone who can never log in, with nothing
    // to explain why. Reject it up front, while we can still say so.
    if (!isEmailAllowed(email)) {
      return NextResponse.json(
        {
          error:
            `${email} cannot sign in: only ${ALLOWED_DOMAINS.join(" and ")} ` +
            `addresses are permitted. Adding an exception means updating both ` +
            `src/lib/auth-config.ts and the check_email_domain() database function.`,
        },
        { status: 400 },
      );
    }

    // Check caller's role for privilege escalation prevention
    const { data: caller } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", auth.userId)
      .single();

    if (body.role === "super_admin" && caller?.role !== "super_admin") {
      return NextResponse.json({ error: "Only super admins can create super admin profiles" }, { status: 403 });
    }

    const profileData = {
      id: crypto.randomUUID(),
      display_name: body.display_name?.trim() || null,
      email,
      role: body.role || "franchisee",
      city_ids: body.city_ids || null,
      team_id: body.team_id || null,
      receives_scraper_emails: body.receives_scraper_emails || false,
      is_active: true,
    };

    const { data, error } = await supabase
      .from("user_profiles")
      .insert(profileData)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
      }
      console.error("[api/db/user-profiles] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[api/db/user-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
