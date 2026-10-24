"use client";

/**
 * A listing's bottom row, shared by the map card and the New listings window
 * so the two can never offer different things: the main slot (a status, or
 * Assign / Plan trip / Request) and the ⋯ items. Each screen passes its own
 * handlers; which of them show comes from evaluatePropertyActions.
 */
import React from "react";
import { Ban, Route, Undo2, UserMinus } from "lucide-react";
import type { PropertyActionState } from "@/lib/property-actions";
import { MainButton, Tip, type MoreItem, type PoiCardApi } from "./PoiCard";
import type { StatusPill } from "./card-format";

interface ListingHandlers {
  onAssign: () => void;
  onPlanTrip: (card: PoiCardApi) => void;
  onRequest: () => void;
  onPreReject: () => void;
  onRemoveAssignment: () => void;
  onUndoPreReject: () => void;
}

/** The main slot: a status, a button, or a grey placeholder while loading. */
export function listingMainSlot(
  actions: PropertyActionState,
  pill: StatusPill | null,
  busy: boolean,
  h: Pick<ListingHandlers, "onAssign" | "onPlanTrip" | "onRequest">,
): React.ReactNode {
  if (actions.stage === "loading") return <span className="poi-main-slot" aria-hidden />;
  if (pill) {
    return (
      <Tip text={pill.detail} className={`poi-pill is-${pill.tone}`} place="above">
        <span className="poi-pill-text">{pill.label}</span>
      </Tip>
    );
  }
  if (actions.showAssign) return <MainButton label="Assign" onPress={h.onAssign} />;
  if (actions.showCreateTrip) return <MainButton label="Plan trip" onPress={h.onPlanTrip} />;
  if (actions.showRequest) return <MainButton label="Request" onPress={h.onRequest} disabled={busy} />;
  return <span className="poi-main-slot" aria-hidden />;
}

/** The ⋯ items: the place items every card has, then the listing's own. */
export function listingMoreItems(
  actions: PropertyActionState,
  place: { share: MoreItem; save: MoreItem; notes: MoreItem; hide: MoreItem },
  h: Omit<ListingHandlers, "onAssign" | "onRequest">,
): MoreItem[] {
  const items: MoreItem[] = [place.share, place.save, place.notes];
  // Admins on a free listing: Assign is the button, so Plan trip lives here.
  if (actions.showCreateTrip && actions.showAssign) {
    items.push({ key: "trip", label: "Plan trip", icon: <Route aria-hidden />, onSelect: h.onPlanTrip });
  }
  items.push(place.hide);
  if (actions.showRemoveAssignment) {
    items.push({ key: "remove", label: "Remove assignment", icon: <UserMinus aria-hidden />, tone: "danger", onSelect: h.onRemoveAssignment });
  }
  if (actions.showUndoPreReject) {
    items.push({ key: "undo", label: "Undo pre-reject", icon: <Undo2 aria-hidden />, tone: "danger", onSelect: h.onUndoPreReject });
  }
  if (actions.showPreReject) {
    items.push({ key: "prereject", label: "Pre-reject…", icon: <Ban aria-hidden />, tone: "danger", opensStep: true, onSelect: h.onPreReject });
  }
  return items;
}
