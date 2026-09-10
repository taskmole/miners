import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, untypedDb as db } from "@/lib/supabase-server";
import {
  notifyReviewersOfRequest,
  notifyRequesterOfDecision,
} from "@/lib/property-request-emails";

export const dynamic = "force-dynamic";

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = "23505";

const AUTO_REJECT_REASON = "Another request for this property was approved.";

interface PropertyRequestRow {
  id: string;
  property_place_id: string;
  requested_by: string;
  status: "pending" | "approved" | "rejected";
  property_name: string | null;
  property_address: string | null;
  property_url: string | null;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Look up a person's name and email for the notification emails. */
async function getPerson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ name: string; email: string | null }> {
  const { data } = await db(supabase)
    .from("user_profiles")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();

  return {
    name: data?.display_name || data?.email || "A franchisee",
    email: data?.email ?? null,
  };
}

/**
 * GET /api/db/property-requests
 *
 * Returns the requests the caller may see: their own, or all of them for
 * dashboard roles. RLS does the filtering, not this handler.
 * Optional ?status=pending narrows the list.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const status = request.nextUrl.searchParams.get("status");

  try {
    let query = db(supabase)
      .from("property_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[api/db/property-requests] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/property-requests] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/db/property-requests
 *
 * A franchisee asks for a property. The row always belongs to the caller and
 * always starts as pending; RLS enforces both regardless of what is posted.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body: {
    property_place_id?: string;
    property_name?: string | null;
    property_address?: string | null;
    property_url?: string | null;
    note?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.property_place_id) {
    return NextResponse.json(
      { error: "property_place_id is required" },
      { status: 400 },
    );
  }

  try {
    // A rejection is final for the person who was rejected. Without this the
    // partial unique index only stops a second *pending* request, so anyone
    // turned down could immediately ask again and the reviewer would see the
    // same request back in the queue.
    const { data: priorRejection } = await db(supabase)
      .from("property_requests")
      .select("id, decision_reason")
      .eq("property_place_id", body.property_place_id)
      .eq("requested_by", userId)
      .eq("status", "rejected")
      .limit(1)
      .maybeSingle();

    if (priorRejection) {
      return NextResponse.json(
        {
          error: priorRejection.decision_reason
            ? `Your request for this property was already declined: ${priorRejection.decision_reason}`
            : "Your request for this property was already declined.",
        },
        { status: 409 },
      );
    }

    const { data, error } = await db(supabase)
      .from("property_requests")
      .insert({
        property_place_id: body.property_place_id,
        requested_by: userId,
        status: "pending",
        // Snapshot: the listing may change or disappear before review.
        property_name: body.property_name ?? null,
        property_address: body.property_address ?? null,
        property_url: body.property_url ?? null,
        note: body.note ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: "You already have a pending request for this property." },
          { status: 409 },
        );
      }
      console.error("[api/db/property-requests] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Best effort: the request is already saved, so a mail failure must not
    // turn this into an error the client retries.
    const requester = await getPerson(supabase, userId);
    notifyReviewersOfRequest(supabase, {
      propertyName: data.property_name,
      propertyAddress: data.property_address,
      requesterName: requester.name,
      requesterEmail: requester.email,
      // Carries the property's coordinates, which is how the country (and so
      // any extra country reviewer, e.g. Spain's) is worked out.
      propertyPlaceId: data.property_place_id,
    }).catch(err => console.warn("[api/db/property-requests] reviewer email failed:", err));

    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/db/property-requests] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/db/property-requests
 *
 * A reviewer approves or rejects a request. Body: { id, decision, reason }.
 *
 * Approving does three things, in an order chosen so a crash or a double click
 * heals itself on retry:
 *
 *   1. Create the assignment first. property_assignments allows one row per
 *      property, so that constraint is the gate: if two reviewers approve at
 *      the same instant, the second one loses here and stops.
 *   2. If the property is already taken, check by whom. Already this same
 *      person means an earlier attempt got partway through, so carry on.
 *      Anyone else means stop and say so.
 *   3. Mark the request approved.
 *   4. Auto-reject everyone else still waiting on this property.
 *
 * Every step tolerates already being done.
 */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let body: { id?: string; decision?: string; reason?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, decision } = body;
  const reason = body.reason?.trim() || null;

  if (!id || (decision !== "approved" && decision !== "rejected")) {
    return NextResponse.json(
      { error: "id and decision ('approved' or 'rejected') are required" },
      { status: 400 },
    );
  }

  if (decision === "rejected" && !reason) {
    return NextResponse.json(
      { error: "A rejection needs a reason." },
      { status: 400 },
    );
  }

  try {
    const { data: req, error: fetchError } = await db(supabase)
      .from("property_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle<PropertyRequestRow>();

    if (fetchError) {
      console.error("[api/db/property-requests] fetch error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!req) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (req.requested_by === userId) {
      return NextResponse.json(
        { error: "You cannot decide your own request." },
        { status: 403 },
      );
    }

    // Already decided. A repeat of the same decision is a no-op success (double
    // click, retried request); a different one is refused.
    if (req.status !== "pending") {
      if (req.status === decision) {
        return NextResponse.json(req);
      }
      return NextResponse.json(
        { error: `This request was already ${req.status}.` },
        { status: 409 },
      );
    }

    const decidedAt = new Date().toISOString();

    if (decision === "approved") {
      const conflict = await claimAssignment(supabase, req, userId);
      if (conflict) return conflict;
    }

    const { data: updated, error: updateError } = await db(supabase)
      .from("property_requests")
      .update({
        status: decision,
        decided_by: userId,
        decided_at: decidedAt,
        decision_reason: reason,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle<PropertyRequestRow>();

    if (updateError) {
      console.error("[api/db/property-requests] decision error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // No row came back: RLS refused it (not a reviewer) or someone else
    // decided it a moment ago. Re-read to tell those apart.
    if (!updated) {
      const { data: current } = await db(supabase)
        .from("property_requests")
        .select("*")
        .eq("id", id)
        .maybeSingle<PropertyRequestRow>();

      if (current?.status === decision) {
        return NextResponse.json(current);
      }
      return NextResponse.json(
        { error: "You do not have permission to decide requests." },
        { status: 403 },
      );
    }

    if (decision === "approved") {
      await autoRejectOthers(supabase, updated, userId, decidedAt);
    }

    // Emails are best effort and never block the decision.
    void sendDecisionEmail(supabase, updated, userId, decision, reason);

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[api/db/property-requests] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Step 1 and 2 of approval: create the assignment, or work out whether an
 * existing one means "already done" or "someone else got there first".
 * Returns a response to send back on conflict, or null to carry on.
 */
async function claimAssignment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  req: PropertyRequestRow,
  reviewerId: string,
): Promise<NextResponse | null> {
  const { error } = await supabase.from("property_assignments").insert({
    property_place_id: req.property_place_id,
    assigned_to: req.requested_by,
    assigned_by: reviewerId,
    status: "assigned",
  });

  if (!error) return null;

  if (error.code !== UNIQUE_VIOLATION) {
    console.error("[api/db/property-requests] assignment error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The property already has an assignment. Whose is it?
  const { data: existing } = await supabase
    .from("property_assignments")
    .select("assigned_to, assigned_to_team, status")
    .eq("property_place_id", req.property_place_id)
    .maybeSingle();

  const alreadyCorrect =
    existing?.status === "assigned" && existing.assigned_to === req.requested_by;

  // A retry of a half-finished approval: carry on and finish the job.
  if (alreadyCorrect) return null;

  if (existing?.status === "pre_rejected") {
    return NextResponse.json(
      { error: "This property was pre-rejected. Clear that first to assign it." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { error: "This property has already been assigned to someone else." },
    { status: 409 },
  );
}

/**
 * Step 4 of approval: reject everyone else still waiting on this property.
 *
 * The reviewer's own pending requests are left alone: the database forbids
 * deciding your own request, so including them would fail the whole statement
 * and leave the others untouched. The property is assigned either way.
 */
async function autoRejectOthers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  approved: PropertyRequestRow,
  reviewerId: string,
  decidedAt: string,
) {
  const { data: losers, error } = await supabase
    .from("property_requests")
    .update({
      status: "rejected",
      decided_by: reviewerId,
      decided_at: decidedAt,
      decision_reason: AUTO_REJECT_REASON,
    })
    .eq("property_place_id", approved.property_place_id)
    .eq("status", "pending")
    .neq("id", approved.id)
    .neq("requested_by", reviewerId)
    .select();

  if (error) {
    console.warn("[api/db/property-requests] auto-reject failed:", error.message);
    return;
  }

  for (const loser of (losers || []) as PropertyRequestRow[]) {
    void sendDecisionEmail(supabase, loser, reviewerId, "rejected", AUTO_REJECT_REASON);
  }
}

/** Email the requester about a decision. Never throws. */
async function sendDecisionEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  req: PropertyRequestRow,
  reviewerId: string,
  decision: "approved" | "rejected",
  reason: string | null,
) {
  try {
    const [requester, reviewer] = await Promise.all([
      getPerson(supabase, req.requested_by),
      getPerson(supabase, reviewerId),
    ]);

    await notifyRequesterOfDecision({
      propertyName: req.property_name,
      propertyAddress: req.property_address,
      propertyPlaceId: req.property_place_id,
      requesterName: requester.name,
      requesterEmail: requester.email,
      decision,
      reason,
      reviewerName: reviewer.name,
    });
  } catch (err) {
    console.warn("[api/db/property-requests] decision email failed:", err);
  }
}
