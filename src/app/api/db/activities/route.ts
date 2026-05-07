import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabase(token);

    const [commentsRes, listsRes, activityLogRes] = await Promise.all([
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
    ]);

    if (commentsRes.error) console.error("[api/db/activities] comments error:", commentsRes.error);
    if (listsRes.error) console.error("[api/db/activities] lists error:", listsRes.error);
    if (activityLogRes.error) console.error("[api/db/activities] activity_log error:", activityLogRes.error);

    const comments = commentsRes.data || [];
    const lists = listsRes.data || [];
    const activityLog = activityLogRes.data || [];

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

    return NextResponse.json({ comments, lists, activityLog, userProfiles });
  } catch (err) {
    console.error("[api/db/activities] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
