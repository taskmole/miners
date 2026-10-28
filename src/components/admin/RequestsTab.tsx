"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, MapPin } from "lucide-react";
import { focusPath } from "@/lib/place-id";
import { Button } from "@/components/ui/button";
import {
  DecisionPanel,
  EmptyRow,
  ErrorBar,
  FoldedSection,
  ListCard,
  PageIntro,
  SectionHeader,
  StatusBadge,
  formatShortDate,
} from "@/components/admin/admin-ui";
import type { PropertyRequest } from "@/hooks/usePropertyRequests";
import type { UserProfile } from "@/hooks/useUserProfiles";

interface RequestsTabProps {
  pending: PropertyRequest[];
  processed: PropertyRequest[];
  users: UserProfile[];
  /**
   * Who gets the approve and reject buttons: super admins and head office.
   * Other dashboard roles see the queue read-only, and the database agrees
   * (property_requests UPDATE is gated on is_admin()).
   */
  canReview: boolean;
  loading: boolean;
  onDecide: (
    id: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) => Promise<void>;
}

/**
 * Admin "Requests" tab: franchisees asking for properties.
 *
 * Approving assigns the property to the requester and auto-rejects everyone
 * else waiting on it; the server does that, this screen just reports it.
 */
export function RequestsTab({
  pending,
  processed,
  users,
  canReview,
  loading,
  onDecide,
}: RequestsTabProps) {
  // One panel at a time: which request is being decided and which way.
  // Approve takes an optional note, reject requires a reason.
  const [deciding, setDeciding] = useState<{ id: string; kind: "approved" | "rejected" } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nameFor = (userId: string | null) => {
    if (!userId) return "Unknown";
    const user = users.find((u) => u.id === userId);
    return user?.display_name || user?.email || "Unknown";
  };

  const titleFor = (request: PropertyRequest) =>
    request.property_address || request.property_name || "Untitled property";

  const decide = async (
    id: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) => {
    setError(null);
    setBusyId(id);
    try {
      await onDecide(id, decision, reason);
      setDeciding(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${decision === "approved" ? "approve" : "reject"}`);
    } finally {
      setBusyId(null);
    }
  };

  const open = (id: string, kind: "approved" | "rejected") => {
    setError(null);
    setDeciding({ id, kind });
  };

  return (
    <div className="space-y-8">
      <ErrorBar message={error} onDismiss={() => setError(null)} />

      <PageIntro
        title="Requests"
        description="Franchisees asking for a property. Approving gives it to them."
      />

      {loading && (
        <div className="text-center py-8 text-sm text-zinc-500">Loading requests...</div>
      )}

      {/* Awaiting a decision */}
      <section>
        <SectionHeader title="Waiting for a decision" count={pending.length} />
        {pending.length === 0 ? (
          <EmptyRow>No requests waiting for review</EmptyRow>
        ) : (
          <ListCard>
            {pending.map((request) => {
              const panel = canReview && deciding?.id === request.id ? deciding.kind : null;
              return (
                <div key={request.id} className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-zinc-900 break-words">
                        {titleFor(request)}
                      </div>
                      <div className="text-sm text-zinc-500 mt-0.5">
                        Requested by {nameFor(request.requested_by)}, {formatShortDate(request.created_at)}
                      </div>
                      {request.note && (
                        <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap">
                          {request.note}
                        </p>
                      )}
                      {/* Opens the property on our map (the link emails and
                          shared places use), not the portal it was scraped from.
                          The place card there still links out to the portal. */}
                      <Link
                        href={focusPath(request.property_place_id)}
                        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 mt-2"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        View on map
                      </Link>
                    </div>

                    {/* Disabled while ANY row is deciding, not just this one.
                        decide() closes the panel when it resolves, so opening
                        a second one mid-flight meant the first request landing
                        wiped the panel you were typing into. */}
                    {canReview && !panel && (
                      <div className="flex justify-end gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="action"
                          onClick={() => open(request.id, "rejected")}
                          disabled={busyId !== null}
                        >
                          Reject
                        </Button>
                        <Button
                          size="action"
                          onClick={() => open(request.id, "approved")}
                          disabled={busyId !== null}
                        >
                          <Check />
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>

                  {panel && (
                    <DecisionPanel
                      key={panel}
                      label={panel === "rejected" ? "Why are you rejecting it?" : "Add a note (optional)"}
                      // The reason also teaches the AI scout, so nudge it
                      // towards what is wrong with the place itself.
                      placeholder={
                        panel === "rejected"
                          ? "e.g. basement with stairs, quiet street. The requester sees this."
                          : "The requester will see this"
                      }
                      confirmLabel={panel === "rejected" ? "Reject request" : "Approve request"}
                      destructive={panel === "rejected"}
                      required={panel === "rejected"}
                      busy={busyId === request.id}
                      onConfirm={(note) => decide(request.id, panel, note || undefined)}
                      onCancel={() => setDeciding(null)}
                    />
                  )}
                </div>
              );
            })}
          </ListCard>
        )}
      </section>

      {/* Already decided, folded so the open queue is what you see */}
      <FoldedSection title="Decided" count={processed.length}>
        {processed.length === 0 ? (
          <EmptyRow>No decided requests yet</EmptyRow>
        ) : (
          <ListCard>
            {processed.map((request) => (
              <div key={request.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-zinc-900 break-words">
                    {titleFor(request)}
                  </div>
                  <div className="text-sm text-zinc-500 mt-0.5">
                    Requested by {nameFor(request.requested_by)}
                    {request.decided_at && `, decided ${formatShortDate(request.decided_at)}`}
                    {request.decided_by && ` by ${nameFor(request.decided_by)}`}
                  </div>
                  {request.decision_reason && (
                    <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap">
                      {request.decision_reason}
                    </p>
                  )}
                </div>
                <StatusBadge status={request.status} />
              </div>
            ))}
          </ListCard>
        )}
      </FoldedSection>
    </div>
  );
}
