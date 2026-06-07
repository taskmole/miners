import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, getUserTeamIds } from "@/lib/supabase-server";

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
    // Fetch caller's role + teams in parallel with the three data sources
    const [roleRes, commentsRes, listsRes, activityLogRes, myTeamIds] = await Promise.all([
      supabase.from("user_profiles").select("role").eq("id", userId).single(),
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

    const callerRole = roleRes.data?.role || "franchisee";
    const isFranchisee = callerRole === "franchisee";

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

    let userProfiles: Array<{ id: string; display_name: string | null; email: string | null }> = [];
    if (userIds.size > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("user_profiles")
        .select("id, display_name, email")
        .in("id", Array.from(userIds));

      if (profilesError) {
        console.error("[api/db/activities] profiles error:", profilesError);
      } else {
        userProfiles = profiles || [];
      }
    }

    return NextResponse.json({ comments, lists, activityLog, userProfiles, callerRole, myTeamIds });
  } catch (err) {
    console.error("[api/db/activities] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
