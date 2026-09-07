"use client";

import { useState } from "react";
import { Check, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PropertyRequest } from "@/hooks/usePropertyRequests";
import type { UserProfile } from "@/hooks/useUserProfiles";

interface RequestsTabProps {
  pending: PropertyRequest[];
  processed: PropertyRequest[];
  users: UserProfile[];
  /** Only super admins get the approve and reject buttons. */
  canReview: boolean;
  loading: boolean;
  onDecide: (
    id: string,
    decision: "approved" | "rejected",
    reason?: string,
  ) => Promise<void>;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  pending: "bg-amber-50 text-amber-700",
};

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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
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
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${decision === "approved" ? "approve" : "reject"}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-zinc-500">Loading requests...</div>
      )}

      {/* Awaiting a decision */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          Awaiting Review ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="bg-white rounded-xl px-4 py-8 text-center text-zinc-400 text-sm">
            No pending requests
          </div>
        ) : (
          <div className="bg-white rounded-xl divide-y divide-zinc-100">
            {pending.map((request) => (
              <div key={request.id} className="p-4 flex flex-col gap-3">
                <div>
                  <div className="font-medium text-zinc-900 break-words">
                    📍 {titleFor(request)}
                  </div>
                  <div className="text-sm text-zinc-500">
                    Requested by {nameFor(request.requested_by)} •{" "}
                    {new Date(request.created_at).toLocaleDateString()}
                  </div>
                  {request.note && (
                    <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap">
                      {request.note}
                    </p>
                  )}
                  {request.property_url && (
                    <a
                      href={request.property_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 mt-2"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View listing
                    </a>
                  )}
                </div>

                {canReview && rejectingId === request.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason for rejection..."
                      className="w-full h-20 px-3 py-2 text-sm border border-zinc-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => decide(request.id, "rejected", rejectReason.trim())}
                        disabled={!rejectReason.trim() || busyId === request.id}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                      >
                        Confirm Reject
                      </Button>
                      <Button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  canReview && (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={() => decide(request.id, "approved")}
                        disabled={busyId === request.id}
                        className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white h-12"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {busyId === request.id ? "Working..." : "Approve"}
                      </Button>
                      <Button
                        onClick={() => setRejectingId(request.id)}
                        variant="outline"
                        className="flex-1 border-red-300 text-red-600 hover:bg-red-50 h-12"
                      >
                        <X className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Already decided */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          Processed ({processed.length})
        </h2>
        {processed.length === 0 ? (
          <div className="bg-white rounded-xl px-4 py-8 text-center text-zinc-400 text-sm">
            No processed requests yet
          </div>
        ) : (
          <div className="bg-white rounded-xl divide-y divide-zinc-100">
            {processed.map((request) => (
              <div key={request.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-900 break-words">
                      {titleFor(request)}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {nameFor(request.requested_by)} •{" "}
                      {request.decided_at
                        ? new Date(request.decided_at).toLocaleDateString()
                        : ""}
                      {request.decided_by ? ` • by ${nameFor(request.decided_by)}` : ""}
                    </div>
                    {request.decision_reason && (
                      <p className="text-sm text-zinc-600 mt-1 whitespace-pre-wrap">
                        {request.decision_reason}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                      STATUS_STYLES[request.status] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {request.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
