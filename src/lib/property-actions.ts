import type { ScoutingTripStatus } from "@/types/scouting";

/**
 * Which entries the property "Actions" menu should offer, and why.
 *
 * One function rather than a condition per button, because the bugs here were
 * all disagreements between separate conditions: a pre-rejected property
 * offered "Pre-reject" and "Undo pre-reject" side by side, and offered admins
 * "Create trip" on a property they had just declared off-limits.
 *
 * Blocked entries are hidden, not greyed out, so the menu shape tells you the
 * state. `caption` carries the explanation that hiding would otherwise lose.
 */
export interface PropertyActionState {
  showRequest: boolean;
  showCreateTrip: boolean;
  showAssign: boolean;
  showPreReject: boolean;
  showRemoveAssignment: boolean;
  showUndoPreReject: boolean;
  /** Short reason shown at the top of the menu when entries are missing. */
  caption: string | null;
}

export interface PropertyActionInput {
  isAdmin: boolean;
  /** Head office has declared this property off-limits. */
  isPreRejected: boolean;
  rejectionReason: string | null;
  /** An assignment row exists (assigned, not pre-rejected). */
  hasAssignment: boolean;
  isAssignedToMe: boolean;
  /** Display name of whoever holds it, for the caption. */
  assigneeLabel: string | null;
  pitchStatus: ScoutingTripStatus | null;
  hasPendingRequest: boolean;
  /** This user has already been turned down for this property. */
  wasRejectedForMe: boolean;
}

const NOTHING: Omit<PropertyActionState, "caption"> = {
  showRequest: false,
  showCreateTrip: false,
  showAssign: false,
  showPreReject: false,
  showRemoveAssignment: false,
  showUndoPreReject: false,
};

function pitchCaption(status: ScoutingTripStatus): string {
  switch (status) {
    case "approved": return "Already approved";
    case "rejected": return "Pitch was rejected";
    default:         return "Already scouted";
  }
}

/**
 * Note what is NOT here: "Add to list". Bookmarking is private, has no side
 * effects on the property, and is offered in every state to everyone. Trip
 * creation from a list is gated separately, so an open bookmark is not a way
 * around these rules.
 */
export function evaluatePropertyActions(input: PropertyActionInput): PropertyActionState {
  const {
    isAdmin, isPreRejected, rejectionReason, hasAssignment,
    isAssignedToMe, assigneeLabel, pitchStatus, hasPendingRequest,
    wasRejectedForMe,
  } = input;

  // 1. Pre-rejected beats everything, including for the admin who set it.
  //    Pre-reject means "nobody scouts this"; letting its author skip straight
  //    past it is how the property ends up assigned and banned at once. Undo
  //    first, then act. That costs one extra tap and keeps the state honest.
  if (isPreRejected) {
    return {
      ...NOTHING,
      showUndoPreReject: isAdmin,
      caption: rejectionReason ? `Pre-rejected: ${rejectionReason}` : "Pre-rejected",
    };
  }

  // 2. A pitch already exists, so the property is spoken for. Nobody starts a
  //    second trip on it, admins included. Pre-rejecting stays available only
  //    once the pitch has been rejected, where recording a reason still means
  //    something.
  if (pitchStatus) {
    return {
      ...NOTHING,
      showPreReject: isAdmin && pitchStatus === "rejected",
      showRemoveAssignment: isAdmin && hasAssignment,
      caption: pitchCaption(pitchStatus),
    };
  }

  // 3. Free property.
  if (isAdmin) {
    return {
      ...NOTHING,
      showCreateTrip: true,
      showAssign: true,
      showPreReject: true,
      showRemoveAssignment: hasAssignment,
      caption: null,
    };
  }

  // Franchisee: scouting requires the property to be theirs first, which
  // happens either because an admin assigned it or a request was approved.
  if (isAssignedToMe) {
    return { ...NOTHING, showCreateTrip: true, caption: null };
  }

  if (hasAssignment) {
    return {
      ...NOTHING,
      caption: assigneeLabel ? `Assigned to ${assigneeLabel}` : "Assigned to someone else",
    };
  }

  // A rejection is final for this person, so do not offer the button again.
  if (wasRejectedForMe) {
    return { ...NOTHING, caption: "Your request for this property was declined" };
  }

  return {
    ...NOTHING,
    showRequest: true,
    caption: hasPendingRequest ? "Waiting for a reviewer" : null,
  };
}
