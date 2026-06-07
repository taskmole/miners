import type { ScoutingTripStatus } from "@/types/scouting";

/**
 * Result of checking whether the current user may start a new trip (pitch) or
 * add a property to a list. `allowed: false` means the property is locked, and
 * `reason` is a short label to show in the UI.
 */
export interface PropertyLock {
  allowed: boolean;
  reason: string | null;
}

// Drafts never appear in the status map, so a private draft does not lock others.
export function evaluatePropertyLock({ isAdmin, canPitch, pitchStatus }: {
  isAdmin: boolean;
  canPitch: PropertyLock;
  pitchStatus: ScoutingTripStatus | null;
}): PropertyLock {

  if (isAdmin) return { allowed: true, reason: null };

  // Assigned to someone else, or the property was pre-rejected.
  if (!canPitch.allowed) {
    return { allowed: false, reason: canPitch.reason || "Not available" };
  }

  // The property already has a pitch, so it is spoken for.
  switch (pitchStatus) {
    case "rejected":
      return { allowed: false, reason: "Pitch was rejected" };
    case "approved":
      return { allowed: false, reason: "Already approved" };
    case "submitted":
    case "returned":
      return { allowed: false, reason: "Already scouted" };
    default:
      return { allowed: true, reason: null };
  }
}
