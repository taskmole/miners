/**
 * Client-side fire-and-forget trigger for team email notifications.
 * Posts to /api/notify-team and ignores the outcome so the calling action
 * (assigning a property, approving a pitch) is never blocked by email.
 */

import { apiFetch } from "@/lib/api-client";

export interface NotifyTeamInput {
  teamId: string;
  kind: "assigned" | "status";
  placeName?: string;
  placeAddress?: string;
  tripName?: string;
  status?: "approved" | "rejected" | "returned";
  reason?: string;
  actorName?: string;
  /** User ids to skip in addition to the caller (e.g. the pitch owner). */
  excludeUserIds?: string[];
}

export function notifyTeam(input: NotifyTeamInput): void {
  apiFetch("/api/notify-team", {
    method: "POST",
    body: JSON.stringify(input),
  }).catch(() => {
    // Best effort only; in-app notifications are the reliable channel.
  });
}
