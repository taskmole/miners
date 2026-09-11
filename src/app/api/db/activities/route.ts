import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  getUserTeamIds,
  untypedDb as db,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** Safely parse a JSON summary string, returning an empty object on failure. */
function parseSummary(summary: unknown): Record<string, unknown> {
  if (!summary) return {};
  try {
    return typeof summary === "string" ? JSON.parse(summary) : (summary as Record<string, unknown>);
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;

  const { supabase, userId } = auth;

  try {
    // Fetch whether the caller has a dashboard, plus their teams, in parallel
    // with the three data sources
    const [roleRes, commentsRes, listsRes, activityLogRes, myTeamIds] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)("is_dashboard_role"),
      supabase
        .from("comments")
        .select("id, entity_type, entity_id, entity_name, created_by, content, created_at")
        .eq("entity_type", "place")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("lists")
        .select("id, name, created_by, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("activity_log")
        .select("id, user_id, action_type, entity_type, entity_id, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      getUserTeamIds(supabase, userId),
    ]);

    if (commentsRes.error) console.error("[api/db/activities] comments error:", commentsRes.error);
    if (listsRes.error) console.error("[api/db/activities] lists error:", listsRes.error);
    if (activityLogRes.error) console.error("[api/db/activities] activity_log error:", activityLogRes.error);

    // "Franchisee" as a role is going away. What this check actually means is
    // "somebody with no dashboard", which is is_dashboard_role() inverted.
    // Defaulting to the narrow view on a failed lookup is the safe direction:
    // seeing too little is a support ticket, seeing too much is a leak.
    const isFranchisee = roleRes.data !== true;

    let comments = commentsRes.data || [];
    let lists = listsRes.data || [];
    let activityLog = activityLogRes.data || [];

    // Franchisees only see their own activities + activities involving them
    // or one of their teams.
    if (isFranchisee) {
      const teamIdSet = new Set(myTeamIds);

      // Places assigned to one of my teams: comments on these are relevant to me.
      let teamPlaceIds = new Set<string>();
      if (myTeamIds.length > 0) {
        const { data: teamAssignments } = await supabase
          .from("property_assignments")
          .select("property_place_id")
          .in("assigned_to_team", myTeamIds);
        teamPlaceIds = new Set((teamAssignments || []).map(a => a.property_place_id));
      }

      comments = comments.filter(c => c.created_by === userId || teamPlaceIds.has(c.entity_id));
      lists = lists.filter(l => l.created_by === userId);
      activityLog = activityLog.filter(e => {
        if (e.user_id === userId) return true;
        const parsed = parseSummary(e.summary);
        if (parsed.assigned_to === userId || parsed.trip_owner_id === userId) return true;
        // Addressed to me (e.g. added/removed from a team)
        if (parsed.target_user_id === userId) return true;
        // Tagged with one of my teams (assignment, pitch state change, etc.)
        if (typeof parsed.team_id === "string" && teamIdSet.has(parsed.team_id)) return true;
        return false;
      });
    }

    // Collect unique user IDs across all three sources for profile lookup
    const userIds = new Set<string>();
    for (const c of comments) if (c.created_by) userIds.add(c.created_by);
    for (const l of lists) if (l.created_by) userIds.add(l.created_by);
    for (const e of activityLog) if (e.user_id) userIds.add(e.user_id);

    // Names come from people_directory() rather than a direct read of
    // user_profiles, which no longer lets a non-admin see colleagues' rows.
    // It returns inactive people too, which matters here: the feed drops any
    // comment whose author it cannot name, so a directory that skipped them
    // would erase everything a switched-off person ever wrote.
    //
    // email rides along as null. It was only ever a cosmetic stand-in for a
    // missing display name, and this route has no business handing addresses
    // to a browser.
    let userProfiles: Array<{ id: string; display_name: string | null; email: string | null }> = [];
    if (userIds.size > 0) {
      const { data: directory, error: profilesError } = await db(supabase)
        .rpc("people_directory");

      if (profilesError) {
        console.error("[api/db/activities] profiles error:", profilesError);
      } else {
        const wanted = userIds;
        userProfiles = ((directory || []) as Array<{ id: string; display_name: string | null }>)
          .filter(p => wanted.has(p.id))
          .map(p => ({ id: p.id, display_name: p.display_name, email: null }));
      }
    }

    // A boolean rather than a role name. The realtime handler in
    // useActivities applies the same narrowing to rows that arrive live, and
    // it used to compare against the string 'franchisee' with a default of
    // 'admin', so a missing value quietly handed somebody the unfiltered
    // feed. There is no role to send any more, and the safe default for a
    // boolean is false.
    return NextResponse.json({
      comments, lists, activityLog, userProfiles, myTeamIds,
      hasDashboard: roleRes.data === true,
    });
  } catch (err) {
    console.error("[api/db/activities] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
