import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, untypedDb as db } from "@/lib/supabase-server";
import { cities } from "@/lib/cities";
import {
  canReadHistoryOf,
  historyCityScope,
  toGrants,
  type Access,
  type CityGrantRow,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * One person's history: what they submitted, and what they decided.
 *
 * Who may look is a permission question in its own right, and it is answered
 * here rather than in the browser:
 *
 *   Super Admin  everyone
 *   Approver     only people whose highest level is Contribute or View, and
 *                only entries in cities the Approver approves in
 *   anyone else  nobody, they have no dashboard
 *
 * The old route this replaces was `/api/db/pitches?mode=admin&user_id=...`,
 * which handed any user's pitches to anyone with dashboard access. It is left
 * in place for other callers; this endpoint is the one the profile page uses.
 *
 * When the answer is "you may not look" the response is an explicit
 * `canSee: false`, never an empty list. "Nothing happened" and "you may not
 * see this" must not reach the screen as the same thing.
 */

const ALL_CITY_IDS = cities.map((c) => c.id);

type HistoryEntry = {
  id: string;
  kind: "pitch" | "request";
  title: string;
  cityId: string;
  status: string;
  date: string;
};

/** Read one person's access: the Super Admin switch plus their grants. */
async function accessFor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<Access | null> {
  const [{ data: profile, error: profileError }, { data: grants, error: grantsError }] =
    await Promise.all([
      db(supabase)
        .from("user_profiles")
        .select("is_super_admin, is_active, can_see_financials")
        .eq("id", userId)
        .maybeSingle(),
      db(supabase)
        .from("user_city_grants")
        .select("city_id, level, can_see_financials, receives_alerts")
        .eq("user_id", userId),
    ]);

  if (profileError || grantsError || !profile) return null;

  return {
    isSuperAdmin: profile.is_super_admin === true,
    // Only an explicit false counts as off, matching the SQL's
    // `IS DISTINCT FROM false`.
    isActive: profile.is_active !== false,
    canSeeFinancials: profile.can_see_financials === true,
    grants: toGrants(grants as CityGrantRow[]),
  };
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId: viewerId } = auth;

  const subjectId = request.nextUrl.searchParams.get("user_id");
  if (!subjectId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  try {
    const [viewer, subject] = await Promise.all([
      accessFor(supabase, viewerId),
      accessFor(supabase, subjectId),
    ]);

    // A failed lookup is not a refusal. Reporting "you may not see this" to
    // somebody whose read timed out sends them hunting for a permission
    // problem that is not there.
    if (!viewer || !subject) {
      return NextResponse.json(
        { error: "Could not check permissions, please try again." },
        { status: 500 },
      );
    }

    if (!canReadHistoryOf(viewer, subject)) {
      return NextResponse.json({ canSee: false, submitted: [], decided: [] });
    }

    // null means no narrowing, which is what a Super Admin gets.
    const scope = historyCityScope(viewer, ALL_CITY_IDS);

    const [pitches, requests] = await Promise.all([
      db(supabase)
        .from("pitches")
        .select("id, address, trip_name, status, city_id, submitted_at, created_at, created_by, final_reviewed_by")
        .or(`created_by.eq.${subjectId},final_reviewed_by.eq.${subjectId}`),
      db(supabase)
        .from("property_requests")
        .select("id, property_name, property_address, status, city_id, created_at, decided_at, requested_by, decided_by")
        .or(`requested_by.eq.${subjectId},decided_by.eq.${subjectId}`),
    ]);

    if (pitches.error || requests.error) {
      console.error("[api/db/user-history] query error:", pitches.error || requests.error);
      return NextResponse.json(
        { error: (pitches.error || requests.error)?.message },
        { status: 500 },
      );
    }

    const submitted: HistoryEntry[] = [];
    const decided: HistoryEntry[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (pitches.data as any[]) || []) {
      const entry: HistoryEntry = {
        id: `pitch-${p.id}`,
        kind: "pitch",
        title: p.address || p.trip_name || "Untitled",
        cityId: p.city_id || "",
        status: p.status,
        date: p.submitted_at || p.created_at,
      };
      if (scope && !scope.includes(entry.cityId)) continue;
      if (p.created_by === subjectId) submitted.push(entry);
      else if (p.final_reviewed_by === subjectId) decided.push(entry);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (requests.data as any[]) || []) {
      const entry: HistoryEntry = {
        id: `request-${r.id}`,
        kind: "request",
        title: r.property_address || r.property_name || "Untitled",
        cityId: r.city_id || "",
        status: r.status,
        date: r.decided_at || r.created_at,
      };
      if (scope && !scope.includes(entry.cityId)) continue;
      if (r.requested_by === subjectId) submitted.push(entry);
      else if (r.decided_by === subjectId) decided.push(entry);
    }

    const newestFirst = (a: HistoryEntry, b: HistoryEntry) =>
      new Date(b.date).getTime() - new Date(a.date).getTime();

    return NextResponse.json({
      canSee: true,
      // A narrowed list must say why, or a short history reads as a quiet
      // colleague rather than as a filter.
      scope,
      submitted: submitted.sort(newestFirst),
      decided: decided.sort(newestFirst),
    });
  } catch (err) {
    console.error("[api/db/user-history] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
