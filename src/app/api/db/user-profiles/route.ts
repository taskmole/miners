import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";
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

export async function PATCH(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const supabase = createServerSupabase(token);

    const { data, error } = await supabase
      .from("user_profiles")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[api/db/user-profiles] update error:", error);
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
