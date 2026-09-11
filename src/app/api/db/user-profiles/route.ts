import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createServerSupabase,
  getTokenFromRequest,
  untypedDb as db,
} from "@/lib/supabase-server";
import { isEmailAllowed, ALLOWED_DOMAINS } from "@/lib/auth-config";
import {
  sendInviteEmail,
  notifySuperAdminsOfUserChange,
  describeGrants,
} from "@/lib/user-emails";

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
 * built, so these are the only ones that can reach the guard from here.
 *
 * `role` is still listed even though nothing reads it any more. It is derived
 * from the grants by a trigger and kept until step 7 purely so steps 1 to 3
 * can be rolled back, which only works while it stays truthful. Letting it be
 * written by hand in the meantime would poison exactly that.
 */
const PRIVILEGED_FIELDS = [
  "role",
  "is_super_admin",
  "is_active",
  "city_ids",
  "can_see_financials",
] as const;

/** Postgres insufficient_privilege, raised by enforce_profile_field_locks(). */
const INSUFFICIENT_PRIVILEGE = "42501";

/** The pre-update picture of a profile, read by PATCH's permission lookup. */
interface ProfileBefore {
  id: string;
  is_super_admin: boolean;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
}

/**
 * How a person's access reads right now, for the alert emails.
 *
 * Its own small query because it is only wanted when something worth
 * alerting about actually changed, which is a handful of times a week.
 * Returns a plain sentence, never throws, and degrades to a blank rather
 * than failing the change that has already been written.
 */
async function currentAccessLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  isSuperAdmin: boolean,
): Promise<string> {
  try {
    const { data } = await client
      .from("user_city_grants")
      .select("city_id, level")
      .eq("user_id", userId);
    return describeGrants(data || [], isSuperAdmin);
  } catch {
    return describeGrants([], isSuperAdmin);
  }
}

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

    const ALLOWED_FIELDS = [
      'is_super_admin',
      'is_active',
      'can_see_financials',
      'display_name',
      'team_id',
    ];
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

    /**
     * What the target looked like before this update, used to tell a real
     * change from someone re-saving a value that was already set. Filled by
     * the permission lookup below, which has to happen anyway.
     */
    let before: ProfileBefore | null = null;

    /** Who is making the change, for the "Changed by" line in the alerts. */
    let changedByName: string | null = null;

    if (touchesPrivileged) {
      // Caller and target in one trip. Someone editing their own profile is
      // both, hence the de-duplicated id list.
      // email, display_name and is_active ride along on a query that already
      // runs, which is what makes the "before" picture free.
      const { data: rows, error: lookupError } = await db(supabase)
        .from("user_profiles")
        .select("id, is_super_admin, email, display_name, is_active")
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

      const profileRows = (rows as ProfileBefore[] | null) || [];
      before = profileRows.find(r => r.id === id) || null;

      const callerRow = profileRows.find(r => r.id === userId);
      changedByName = callerRow?.display_name || callerRow?.email || null;

      const isSuperAdminOf = (who: string) =>
        profileRows.find(r => r.id === who)?.is_super_admin === true;

      // "Can run the user screen" is now "approves somewhere, or holds the
      // switch", which is what is_admin() means in the database. Asked of the
      // database rather than re-derived here, so the two cannot drift.
      const { data: callerIsAdmin, error: adminError } = await db(supabase).rpc("is_admin");
      if (adminError) {
        console.error("[api/db/user-profiles] admin check failed:", adminError);
        return NextResponse.json(
          { error: "Could not check permissions, please try again." },
          { status: 500 },
        );
      }

      if (callerIsAdmin !== true) {
        return NextResponse.json(
          { error: "Only an admin can change a profile's access or cities." },
          { status: 403 },
        );
      }

      // Super admins are off limits to everyone below them, and not only on
      // the switch itself: switching one off with is_active would put the
      // founders behind the "account pending" screen just as effectively.
      if (
        !isSuperAdminOf(userId) &&
        (updates.is_super_admin === true || isSuperAdminOf(id))
      ) {
        return NextResponse.json(
          { error: "Only a super admin can grant, remove or suspend the super admin role." },
          { status: 403 },
        );
      }

      // Money is a super admin's call, on anyone's row including the editor's
      // own. The UPDATE policy on user_profiles lets anyone edit their own row
      // and any admin edit anyone's, so without this an Approver could tick
      // their own financials. enforce_profile_field_locks() refuses it too;
      // this is here so the answer is a sentence and a 403 rather than a
      // Postgres exception that reads like a crash.
      if (!isSuperAdminOf(userId) && "can_see_financials" in updates) {
        return NextResponse.json(
          { error: "Only a super admin can change who sees financials." },
          { status: 403 },
        );
      }
    }

    const { data, error } = await db(supabase)
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

    /**
     * Alerts, after the change has committed.
     *
     * Only real changes count: re-saving a value that was already set sends
     * nothing. Ordinary edits (a display name) never reach here at all,
     * because they are not privileged fields and `before` stays null.
     *
     * The response shape is deliberately unchanged. Nothing in the UI needs
     * the alert result, and the user list and detail page both read this
     * response as a profile row.
     */
    if (before) {
      const switchedOnOff =
        typeof updates.is_active === "boolean" && before.is_active !== data.is_active;
      const superAdminChanged =
        typeof updates.is_super_admin === "boolean" &&
        before.is_super_admin !== data.is_super_admin;

      if (switchedOnOff || superAdminChanged) {
        const access = await currentAccessLabel(
          db(supabase),
          id,
          data.is_super_admin === true,
        );
        if (switchedOnOff) {
          await notifySuperAdminsOfUserChange({
            kind: data.is_active ? "reactivated" : "deactivated",
            personId: id,
            personName: data.display_name,
            personEmail: data.email,
            personAccess: access,
            changedByName,
          });
        }

        if (superAdminChanged) {
          await notifySuperAdminsOfUserChange({
            kind: "super-admin",
            personId: id,
            personName: data.display_name,
            personEmail: data.email,
            personAccess: access,
            granted: data.is_super_admin === true,
            changedByName,
          });
        }
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/user-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Invite somebody.
 *
 * Two different defaults, because the two callers mean different things:
 *
 *   An Approver names one of their own cities. The person is created at
 *   Contribute in that city and is active immediately, because chasing a
 *   super admin to switch the account on would defeat the point of letting
 *   Approvers invite at all. Written through invite_contributor(), the one
 *   SECURITY DEFINER path into the grants table, which re-checks every one of
 *   those conditions in the database.
 *
 *   A Super Admin may omit the city. The person is then created with NO
 *   cities and INACTIVE. This is a change: profiles used to be created active
 *   with every enabled city. A half-configured person who can already sign in
 *   is worse than one who cannot, because nobody goes back to check.
 */
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

    const cityId: string | undefined = body.city_id || undefined;

    // The name comes along for the ride: this lookup already happens, and the
    // invite and the alerts both want to say who did it.
    const { data: caller } = await db(supabase)
      .from("user_profiles")
      .select("is_super_admin, display_name, email")
      .eq("id", auth.userId)
      .single();

    const callerIsSuperAdmin = caller?.is_super_admin === true;
    const inviterName: string | null = caller?.display_name || caller?.email || null;

    if (!callerIsSuperAdmin && !cityId) {
      return NextResponse.json(
        { error: "Pick the city this person will work in." },
        { status: 400 },
      );
    }

    // With a city: the database function does the work and the checking.
    if (cityId) {
      const { data: newId, error } = await db(supabase).rpc("invite_contributor", {
        p_email: email,
        p_city_id: cityId,
        p_display_name: body.display_name?.trim() || null,
      });

      if (error) {
        console.error("[api/db/user-profiles] invite_contributor failed:", error);
        // The function raises in plain words with a fitting SQLSTATE, so pass
        // its own message through rather than inventing a vaguer one.
        const status =
          error.code === INSUFFICIENT_PRIVILEGE ? 403 : error.code === "23505" ? 409 : 400;
        return NextResponse.json({ error: error.message }, { status });
      }

      const { data, error: readError } = await db(supabase)
        .from("user_profiles")
        .select("*")
        .eq("id", newId)
        .single();

      if (readError) {
        console.error("[api/db/user-profiles] post-invite read failed:", readError);
        return NextResponse.json({ error: readError.message }, { status: 500 });
      }

      // Everything below is best effort and happens only after the profile
      // exists. Neither call can throw, and neither result can fail the
      // request: creating a user must never break because of email.
      const access = describeGrants([{ city_id: cityId, level: "contribute" }]);

      const invite = await sendInviteEmail({
        email: data.email,
        isActive: data.is_active !== false,
      });

      await notifySuperAdminsOfUserChange({
        kind: "added",
        personId: data.id,
        personName: data.display_name,
        personEmail: data.email,
        personAccess: access,
        changedByName: inviterName,
      });

      // Two extra fields so the form can say what actually happened. The user
      // list strips them before storing the row.
      return NextResponse.json(
        { ...data, invite_sent: invite.sent, invite_redirected: invite.redirected },
        { status: 201 },
      );
    }

    // No city, super admin only: a blank profile, switched off.
    const profileData = {
      id: crypto.randomUUID(),
      display_name: body.display_name?.trim() || null,
      email,
      role: "franchisee",
      is_super_admin: false,
      city_ids: [] as string[],
      team_id: body.team_id || null,
      receives_scraper_emails: false,
      is_active: false,
    };

    const { data, error } = await db(supabase)
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

    // No invite on this path, on purpose. This person is switched off and has
    // no cities, so "you are in, go and sign in" would be a lie that ends at
    // the Account Pending screen. The super admins are still told, because a
    // half-configured profile nobody goes back to is exactly what gets missed.
    await notifySuperAdminsOfUserChange({
      kind: "added",
      personId: data.id,
      personName: data.display_name,
      personEmail: data.email,
      personAccess: "No cities yet, switched off",
      changedByName: inviterName,
    });

    return NextResponse.json(
      { ...data, invite_sent: false, invite_redirected: false },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/db/user-profiles] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
