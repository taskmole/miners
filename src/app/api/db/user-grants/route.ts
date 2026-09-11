import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createServerSupabase,
  getTokenFromRequest,
  untypedDb as db,
} from "@/lib/supabase-server";
import { notifySuperAdminsOfUserChange, describeGrants } from "@/lib/user-emails";

export const dynamic = "force-dynamic";

/**
 * Per-city permission grants.
 *
 * Reading is governed entirely by RLS on user_city_grants ("your own rows, or
 * everything if you run the user screen"), so these handlers do not second
 * guess it. Writing is super admin only, also by RLS; an Approver inviting
 * somebody into their own city goes through the invite_contributor() function
 * instead, never through this route.
 */

type GrantRow = {
  user_id: string;
  city_id: string;
  level: "view" | "contribute" | "approve";
  receives_alerts: boolean;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_super_admin: boolean;
};

type GrantRowLike = { city_id: string; level: GrantRow["level"] };

/**
 * Did anything actually move? Compared as a sorted "city:level" list, so the
 * order rows come back in cannot make a re-save look like a change. The
 * financials and alerts ticks are deliberately ignored: they are settings on
 * an access someone already has, not a change to what they can do.
 */
function grantsDiffer(
  before: GrantRowLike[] | null,
  after: GrantRowLike[] | null,
): boolean {
  const key = (rows: GrantRowLike[] | null) =>
    (rows || [])
      .map((g) => `${g.city_id}:${g.level}`)
      .sort()
      .join("|");
  return key(before) !== key(after);
}

/** Postgres insufficient_privilege, raised when RLS or set_user_grants refuses. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** foreign_key_violation. set_user_grants raises it for a city that does not exist. */
const NO_SUCH_CITY = "23503";
/** invalid_parameter_value. A bad level, a repeated city, a malformed list. */
const BAD_REQUEST_DATA = "22023";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("mode") || "current";
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabase(token);

    // "all": every grant the caller is allowed to see, for the user list.
    // One request rather than one per user: 17 people times 4 cities is 68
    // rows at the very most, and the table is nowhere near a size where that
    // matters.
    if (mode === "all") {
      const { data, error } = await db(supabase)
        .from("user_city_grants")
        .select("user_id, city_id, level, receives_alerts");

      if (error) {
        console.error("[api/db/user-grants] all query error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json((data as GrantRow[]) || []);
    }

    // "single": one person's grants, for their profile page.
    if (mode === "single") {
      const userId = request.nextUrl.searchParams.get("user_id");
      if (!userId) {
        return NextResponse.json({ error: "user_id is required" }, { status: 400 });
      }

      const { data, error } = await db(supabase)
        .from("user_city_grants")
        .select("user_id, city_id, level, receives_alerts")
        .eq("user_id", userId);

      if (error) {
        console.error("[api/db/user-grants] single query error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json((data as GrantRow[]) || []);
    }

    // "current": the caller's own access, the thing every permission gate in
    // the app is computed from. Returns the Super Admin switch alongside the
    // grants because a super admin holds the switch and no grants at all, and
    // a caller who only got the grants would read that as "no access".
    const auth = await authenticateRequest(request);
    if (auth.error) return auth.error;

    const [{ data: profile, error: profileError }, { data: grants, error: grantsError }] =
      await Promise.all([
        db(auth.supabase)
          .from("user_profiles")
          .select("is_super_admin, is_active, can_see_financials, display_name")
          .eq("id", auth.userId)
          .single(),
        db(auth.supabase)
          .from("user_city_grants")
          .select("city_id, level, receives_alerts")
          .eq("user_id", auth.userId),
      ]);

    if (profileError || grantsError) {
      console.error(
        "[api/db/user-grants] current query error:",
        profileError || grantsError,
      );
      // Deliberately a 500, never an empty access object. "We could not find
      // out what you are allowed to do" and "you are allowed nothing" must not
      // reach the client as the same answer, or a failed request silently
      // locks somebody out of their own cities.
      return NextResponse.json(
        { error: (profileError || grantsError)?.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      isSuperAdmin: profile?.is_super_admin === true,
      isActive: profile?.is_active !== false,
      // The financials switch lives on the person now. The per-city ticks are
      // still in `grants` and still read, until the grant column is dropped.
      canSeeFinancials: profile?.can_see_financials === true,
      grants: grants || [],
    });
  } catch (err) {
    console.error("[api/db/user-grants] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Replace one person's grants wholesale.
 *
 * The screen edits a whole city list at once, so it sends a whole city list.
 * Diffing here rather than in the browser keeps "set Madrid back to No access"
 * as a deletion the server can see, instead of an absence it has to infer.
 *
 * Only a super admin gets through: every write below is refused by RLS
 * otherwise. The check is not repeated in TypeScript, because two sets of
 * rules that can disagree are worse than one.
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  try {
    const body = await request.json();
    const userId: string | undefined = body.user_id;
    const incoming: GrantRow[] = Array.isArray(body.grants) ? body.grants : [];

    if (!userId) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const LEVELS = ["view", "contribute", "approve"];
    for (const g of incoming) {
      if (!g.city_id || !LEVELS.includes(g.level)) {
        return NextResponse.json(
          { error: `Invalid grant for city "${g.city_id}"` },
          { status: 400 },
        );
      }
    }

    // The "before" picture, read before anything is deleted. Changing
    // somebody's city access is the most common access change there is, and
    // it never touches the profiles route, so this is the only place it can
    // be noticed at all.
    const { data: previousGrants } = await db(supabase)
      .from("user_city_grants")
      .select("city_id, level")
      .eq("user_id", userId);

    // One call, one transaction, one answer.
    //
    // This used to be a DELETE followed by an UPSERT, which was wrong twice
    // over. A DELETE that matches zero rows under RLS is not an error, so a
    // caller who was not a super admin got back 200 and an unchanged list: the
    // screen said saved and the database had said no. And with no transaction
    // around the pair, a bad city meant the delete landed and the insert threw,
    // leaving the person with no cities at all.
    //
    // set_user_grants() re-checks is_super_admin() inside itself (SECURITY
    // DEFINER means RLS is no longer doing that job), validates every city
    // before it writes anything, and does the delete and the insert in one
    // function body.
    const { data: saved, error: saveError } = await db(supabase).rpc("set_user_grants", {
      p_user_id: userId,
      p_grants: incoming.map((g) => ({
        city_id: g.city_id,
        level: g.level,
        receives_alerts: g.receives_alerts === true,
      })),
    });

    if (saveError) {
      console.error("[api/db/user-grants] save error:", saveError);
      if (saveError.code === INSUFFICIENT_PRIVILEGE) {
        return NextResponse.json(
          { error: "Only a super admin can change who has access to a city." },
          { status: 403 },
        );
      }
      // Everything the function validates by hand: an unknown city, an unknown
      // level, the same city twice, a person who does not exist. These are bad
      // requests, not server faults, and the message is already written for a
      // human to read.
      if (saveError.code === NO_SUCH_CITY || saveError.code === BAD_REQUEST_DATA) {
        return NextResponse.json({ error: saveError.message }, { status: 400 });
      }
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    const data = (saved as GrantRow[] | null) || [];

    // Alert the super admins, after the change has committed, only when
    // something actually moved. Re-saving the same cities sends nothing.
    // Nothing below can throw or fail the request.
    if (grantsDiffer(previousGrants as GrantRowLike[] | null, data as GrantRow[] | null)) {
      const { data: people } = await db(supabase)
        .from("user_profiles")
        .select("id, display_name, email, is_super_admin")
        .in("id", [...new Set([userId, auth.userId])]);

      const rows = (people as ProfileRow[] | null) || [];
      const target = rows.find((r) => r.id === userId);
      const actor = rows.find((r) => r.id === auth.userId);

      const isSuperAdmin = target?.is_super_admin === true;
      const beforeLabel = describeGrants(previousGrants as GrantRowLike[], isSuperAdmin);
      const afterLabel = describeGrants(data as GrantRowLike[], isSuperAdmin);

      await notifySuperAdminsOfUserChange({
        kind: "access",
        personId: userId,
        personName: target?.display_name ?? null,
        personEmail: target?.email ?? null,
        personAccess: afterLabel,
        accessBefore: beforeLabel,
        accessAfter: afterLabel,
        changedByName: actor?.display_name || actor?.email || null,
      });
    }

    return NextResponse.json((data as GrantRow[]) || []);
  } catch (err) {
    console.error("[api/db/user-grants] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
