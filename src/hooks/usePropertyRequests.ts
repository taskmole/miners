"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";

export interface PropertyRequest {
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

/** The listing details copied onto a request when it is made. */
export interface RequestSnapshot {
  property_name?: string | null;
  property_address?: string | null;
  property_url?: string | null;
  note?: string | null;
}

/**
 * apiFetch throws `API 409: {"error":"..."}`. Pull the readable sentence out so
 * toasts and the admin screen show the server's message, not raw JSON.
 */
function readableError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (typeof parsed?.error === "string") return new Error(parsed.error);
    } catch {
      // Not JSON after all; fall through to the raw message.
    }
  }
  return new Error(raw);
}

async function fetchRequests(): Promise<PropertyRequest[]> {
  try {
    const data = await apiFetch<PropertyRequest[]>("/api/db/property-requests");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Property requests: a franchisee asks for a property, a reviewer approves or
 * rejects it.
 *
 * The API returns only what the caller may see (their own requests, or all of
 * them for dashboard roles), so this hook does not filter by role itself.
 */
export function usePropertyRequests(enabled = true) {
  const { userId } = useAuth();
  const [requests, setRequests] = useState<PropertyRequest[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!enabled || initialLoadDone.current) return;
    initialLoadDone.current = true;

    fetchRequests().then((data) => {
      setRequests(data);
      setIsLoaded(true);
    });
  }, [enabled]);

  // Same 60s refresh as property assignments, so a reviewer's decision shows
  // up for the requester without a reload.
  useEffect(() => {
    if (!enabled || !isLoaded) return;
    const interval = setInterval(async () => {
      setRequests(await fetchRequests());
    }, 60_000);
    return () => clearInterval(interval);
  }, [enabled, isLoaded]);

  const refresh = useCallback(async () => {
    setRequests(await fetchRequests());
  }, []);

  /** Place ids the current user already has a pending request for. */
  const myPendingPlaceIds = useMemo(() => {
    if (!userId) return new Set<string>();
    return new Set(
      requests
        .filter((r) => r.status === "pending" && r.requested_by === userId)
        .map((r) => r.property_place_id),
    );
  }, [requests, userId]);

  const hasPendingRequest = useCallback(
    (placeId: string) => myPendingPlaceIds.has(placeId),
    [myPendingPlaceIds],
  );

  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );

  const processed = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  );

  /** Ask for a property. Throws with a readable message on failure. */
  const requestProperty = useCallback(
    async (placeId: string, snapshot: RequestSnapshot = {}) => {
      setError(null);
      let result: PropertyRequest;
      try {
        result = await apiFetch<PropertyRequest>("/api/db/property-requests", {
          method: "POST",
          body: JSON.stringify({ property_place_id: placeId, ...snapshot }),
        });
      } catch (err) {
        throw readableError(err);
      }
      setRequests((prev) => [result, ...prev]);
      return result;
    },
    [],
  );

  /** Approve or reject a request. Rejecting always needs a reason. */
  const decideRequest = useCallback(
    async (id: string, decision: "approved" | "rejected", reason?: string) => {
      setError(null);
      let result: PropertyRequest;
      try {
        result = await apiFetch<PropertyRequest>("/api/db/property-requests", {
          method: "PATCH",
          body: JSON.stringify({ id, decision, reason: reason ?? null }),
        });
      } catch (err) {
        throw readableError(err);
      }
      // Approving auto-rejects the other requests for the same property, so
      // refetch rather than patching just this row into local state.
      await refresh();
      return result;
    },
    [refresh],
  );

  return {
    isLoaded,
    error,
    setError,
    requests,
    pending,
    processed,
    hasPendingRequest,
    requestProperty,
    decideRequest,
    refresh,
  };
}
