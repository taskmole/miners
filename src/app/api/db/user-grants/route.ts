import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createServerSupabase,
  getTokenFromRequest,
  untypedDb as db,
} from "@/lib/supabase-server";

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
  can_see_financials: boolean;
  receives_alerts: boolean;
};

/** Postgres insufficient_privilege, raised when RLS refuses a write. */
const INSUFFICIENT_PRIVILEGE = "42501";
/** Postgres row-level-security violation on an INSERT's WITH CHECK. */
const RLS_VIOLATION = "42501";

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
        .select("user_id, city_id, level, can_see_financials, receives_alerts");

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
        .select("user_id, city_id, level, can_see_financials, receives_alerts")
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
          .select("is_super_admin, is_active, display_name")
          .eq("id", auth.userId)
          .single(),
        db(auth.supabase)
          .from("user_city_grants")
          .select("city_id, level, can_see_financials, receives_alerts")
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

    const keep = incoming.map((g) => g.city_id);

    // Remove the cities that are no longer in the list. Done first, so a
    // request that drops every city still clears them.
    let deleteQuery = db(supabase)
      .from("user_city_grants")
      .delete()
      .eq("user_id", userId);
    if (keep.length > 0) {
      deleteQuery = deleteQuery.not("city_id", "in", `(${keep.join(",")})`);
    }
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error("[api/db/user-grants] delete error:", deleteError);
      if (deleteError.code === INSUFFICIENT_PRIVILEGE) {
        return NextResponse.json(
          { error: "Only a super admin can change who has access to a city." },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    if (incoming.length > 0) {
      const { error: upsertError } = await db(supabase)
        .from("user_city_grants")
        .upsert(
          incoming.map((g) => ({
            user_id: userId,
            city_id: g.city_id,
            level: g.level,
            can_see_financials: g.can_see_financials === true,
            receives_alerts: g.receives_alerts === true,
          })),
          { onConflict: "user_id,city_id" },
        );

      if (upsertError) {
        console.error("[api/db/user-grants] upsert error:", upsertError);
        if (upsertError.code === RLS_VIOLATION) {
          return NextResponse.json(
            { error: "Only a super admin can change who has access to a city." },
            { status: 403 },
          );
        }
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    const { data, error } = await db(supabase)
      .from("user_city_grants")
      .select("user_id, city_id, level, can_see_financials, receives_alerts")
      .eq("user_id", userId);

    if (error) {
      console.error("[api/db/user-grants] reread error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data as GrantRow[]) || []);
  } catch (err) {
    console.error("[api/db/user-grants] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
