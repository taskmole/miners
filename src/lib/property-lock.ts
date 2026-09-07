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

/**
 * Whether the current user may start a scouting trip on a property.
 *
 * Stricter than evaluatePropertyLock. A franchisee must have the property
 * assigned to them first, which happens either because an admin assigned it
 * directly or because their request for it was approved. Without this, anyone
 * could scout any unclaimed property and the request queue would be pointless.
 *
 * Admins are unaffected: they scout whatever evaluatePropertyLock allows.
 *
 * Deliberately separate from evaluatePropertyLock, which still governs the
 * lighter actions (adding to a personal list). Bookmarking a property you have
 * not been given is harmless; scouting it is not.
 */
export function evaluateTripLock({ isAdmin, isAssignedToMe, hasPendingRequest, canPitch, pitchStatus }: {
  isAdmin: boolean;
  isAssignedToMe: boolean;
  hasPendingRequest: boolean;
  canPitch: PropertyLock;
  pitchStatus: ScoutingTripStatus | null;
}): PropertyLock {

  const base = evaluatePropertyLock({ isAdmin, canPitch, pitchStatus });
  if (isAdmin || !base.allowed) return base;

  if (!isAssignedToMe) {
    return {
      allowed: false,
      reason: hasPendingRequest
        ? "Waiting for your request to be approved"
        : "Request this property first",
    };
  }

  return { allowed: true, reason: null };
}
