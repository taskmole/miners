"use client";

/**
 * The map card for a property listing.
 *
 * Photo first: price and address on the photo, one line of facts, then one
 * bottom row: the main button (or the status that replaces it), More, and
 * the listing's own links. Which button or status shows comes from
 * evaluatePropertyActions, the same rules the New listings deck uses.
 */
import React from "react";
import {
  Ban, Route, TrendingDown, TrendingUp, Undo2, UserMinus,
} from "lucide-react";
import type { PropertyData } from "@/hooks/useMapData";
import type { RequestSnapshot } from "@/hooks/usePropertyRequests";
import { usePitchStatusContext } from "@/contexts/PitchStatusContext";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { useTeamsContext } from "@/contexts/TeamsContext";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useToast } from "@/contexts/ToastContext";
import { evaluatePropertyActions, pendingPropertyActions } from "@/lib/property-actions";
import { logActivity } from "@/lib/supabaseHelpers";
import { notifyTeam } from "@/lib/notify-team";
import { capitalizeFirst } from "@/lib/text";
import { AssignList } from "@/components/AssignList";
import type { PlaceInfo } from "@/types/lists";
import { cn } from "@/lib/utils";
import { PoiCard, MoreMenu, MainButton, LinkTile, MapsTile, Tip, type MoreItem, type PoiCardApi } from "./PoiCard";
import { usePlaceCard, PreRejectForm, FactList, AgeChip, NotesCount } from "./CardSteps";
import {
  formatPrice, isShown, listingFacts, listingPhotos, listingShareTitle,
  priceChange, priceLabel, shortAddress, statusPill,
} from "./card-format";

/** Request state comes from the popup wrapper: one fetch per opened pin, kept across re-renders. */
export interface ListingRequests {
  isLoaded: boolean;
  hasPendingRequest: (placeId: string) => boolean;
  wasRejectedForMe: (placeId: string) => boolean;
  approvalNoteFor: (placeId: string) => string | null;
  requestProperty: (placeId: string, snapshot?: RequestSnapshot) => Promise<unknown>;
}

interface ListingCardProps {
  property: PropertyData;
  placeId: string;
  mapsUrl: string;
  cityId: string;
  onClose?: () => void;
  requests: ListingRequests;
  /** Admin (assigns) or franchisee (requests); from the wrapper, so switching pins doesn't refetch it. */
  isAdmin: boolean;
  accessResolved: boolean;
}

export function ListingCard({ property, placeId, mapsUrl, cityId, onClose, requests, isAdmin, accessResolved }: ListingCardProps) {
  const { getPitchStatus, getPitchDate, getPitchRejectionReason, getPitchReturnReason } = usePitchStatusContext();
  const {
    isLoaded: assignmentsLoaded, getAssignment, isAssignedToMe, users, assignProperty, preRejectProperty, removeAssignment,
  } = usePropertyAssignmentContext();
  const { teams } = useTeamsContext();
  const { createTrip, updateTrip } = useScoutingTrips();
  const { showToast } = useToast();
  const [reasonDraft, setReasonDraft] = React.useState("");

  // One server action at a time. Without this a double tap on Request sent
  // two requests: "Request sent", then an error toast for the duplicate.
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const runExclusive = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const photos = listingPhotos(property);
  const where = shortAddress(property.address);
  const place: PlaceInfo = {
    placeId, placeType: "property", placeName: property.title, placeAddress: property.address,
    lat: property.latitude, lon: property.longitude,
  };
  const card = usePlaceCard({
    place,
    notesType: "property",
    share: {
      placeId, placeType: "property", title: listingShareTitle(property), address: capitalizeFirst(property.address),
      photoUrl: property.image_url ?? photos[0], listingUrl: property.url,
    },
    subtitle: [priceLabel(property), where].filter(Boolean).join(" · "),
  });
  const { step, setStep, notes, hidden } = card;

  // ── State ───────────────────────────────────────────────────────────
  const assignment = getAssignment(placeId);
  const preRejected = assignment?.status === "pre_rejected";
  const mine = isAssignedToMe(placeId);
  const pitchStatus = getPitchStatus(placeId);
  // "Team Norte" or "Ana"; null when the name can't be looked up.
  const assigneeLabel = (() => {
    if (assignment?.assigned_to_team) return teams.find((t) => t.id === assignment.assigned_to_team)?.name ?? null;
    const user = users.find((u) => u.id === assignment?.assigned_to);
    return user?.display_name || user?.email || null;
  })();
  const pitchReason = (() => {
    if (pitchStatus === "rejected") return getPitchRejectionReason(placeId);
    if (pitchStatus === "returned") return getPitchReturnReason(placeId);
    return null;
  })();

  // Wait for everything the decision reads, or the button flips a moment
  // later (Request, then Requested). Admins never load requests.
  const ready = accessResolved && assignmentsLoaded && (isAdmin || requests.isLoaded);
  const actions = ready
    ? evaluatePropertyActions({
        isAdmin,
        isPreRejected: preRejected,
        rejectionReason: assignment?.rejection_reason ?? null,
        hasAssignment: !!assignment && !preRejected,
        isAssignedToMe: mine,
        assigneeLabel,
        pitchStatus,
        hasPendingRequest: requests.hasPendingRequest(placeId),
        wasRejectedForMe: requests.wasRejectedForMe(placeId),
      })
    : pendingPropertyActions();

  // Someone else may claim or pre-reject it while Assign or Pre-reject is
  // open (the list refreshes in the background): step back to the card.
  const stepGone = (step === "assign" && !actions.showAssign) || (step === "prereject" && !actions.showPreReject);
  React.useEffect(() => {
    if (stepGone && ready) setStep(null);
  }, [stepGone, ready, setStep]);

  const pill = statusPill({
    stage: actions.stage,
    isAssignedToMe: mine,
    assigneeLabel,
    preRejectReason: assignment?.rejection_reason ?? null,
    pitchStatus,
    pitchDate: getPitchDate(placeId),
    pitchReason,
  });

  // Only the person it was approved for, and only while it is still theirs.
  const approvalNote = mine ? requests.approvalNoteFor(placeId) : null;

  // ── Actions ─────────────────────────────────────────────────────────
  const { placeType: _type, ...propertyMeta } = place;

  const handleRequest = () => runExclusive(async () => {
    try {
      await requests.requestProperty(placeId, {
        property_name: property.title,
        property_address: property.address,
        property_url: property.url,
      });
      showToast("Request sent");
      logActivity("requested_property", propertyMeta);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not send request", "error");
    }
  });

  const handlePlanTrip = (card: PoiCardApi) => {
    if (!actions.showCreateTrip) {
      showToast(actions.caption || "You can't scout this property", "error");
      return;
    }
    card.close();
    const trip = createTrip(cityId);
    const linkedItem = { type: "place" as const, id: placeId, name: property.title, address: property.address, data: property };
    updateTrip(trip.id, { name: property.title, property: linkedItem });
    window.dispatchEvent(new CustomEvent("create-trip-from-property", { detail: { trip: { ...trip, name: property.title, property: linkedItem } } }));
  };

  const handleAssign = (targetId: string, targetName: string, type: "team" | "user") => runExclusive(async () => {
    try {
      if (type === "team") {
        await assignProperty(placeId, null, { teamId: targetId });
        // Tag with team_id so every member sees it in their activity feed.
        logActivity("assigned_property", { ...propertyMeta, team_id: targetId, teamName: targetName });
        // Email the team (skips the actor). Never blocks the assignment.
        notifyTeam({ teamId: targetId, placeId, kind: "assigned", placeName: property.title, placeAddress: property.address });
      } else {
        await assignProperty(placeId, targetId);
        logActivity("assigned_property", { ...propertyMeta, assigned_to: targetId, assigneeName: targetName });
        notifyTeam({ userId: targetId, kind: "assigned", placeId, placeName: property.title, placeAddress: property.address });
      }
      showToast(`Assigned to ${targetName}`);
      setStep(null);
    } catch {
      showToast(type === "team" ? "Failed to assign to team" : "Failed to assign", "error");
    }
  });

  const handlePreReject = (reason: string) => runExclusive(async () => {
    try {
      await preRejectProperty(placeId, reason);
      showToast("Pre-rejected");
      logActivity("pre_rejected_property", { ...propertyMeta, rejectionReason: reason });
      setReasonDraft("");
      setStep(null);
    } catch {
      showToast("Failed to pre-reject", "error");
    }
  });

  // Removing an assignment and undoing a pre-reject are the same delete.
  const handleRemove = (undo: boolean) => runExclusive(async () => {
    try {
      await removeAssignment(placeId);
      showToast(undo ? "Pre-rejection removed" : "Assignment removed");
      logActivity("removed_assignment", propertyMeta);
    } catch {
      showToast("Failed to remove", "error");
    }
  });

  // ── Pieces ──────────────────────────────────────────────────────────
  const price = formatPrice(property.price, property.source);
  const change = priceChange(property);
  const facts = listingFacts(property);
  const score = isShown(property.score) ? Math.round(property.score) : null;

  const chips = <AgeChip date={property.updatedAt} hidden={hidden} score={score} />;

  const headline = (
    <>
      <div className="poi-priceline">
        {price ? (
          <span className="poi-price">{price}<small>/mo</small></span>
        ) : (
          <span className="poi-price is-request">On request</span>
        )}
        {change && (
          <span className={cn("poi-change", `is-${change.direction}`)} title="Price changed since last data refresh">
            {change.direction === "down" ? <TrendingDown aria-hidden /> : <TrendingUp aria-hidden />}
            {change.text}
          </span>
        )}
      </div>
      {where && <div className="poi-where">{where}</div>}
    </>
  );


  const body = (
    <>
      {(facts.length > 0 || notes.count > 0) && (
        <div className="poi-factrow">
          <FactList facts={facts} />
          <NotesCount notes={notes} onOpen={() => setStep("notes")} />
        </div>
      )}
      {approvalNote && <div className="poi-approval">Approved · {approvalNote}</div>}
    </>
  );

  // The main slot: a status, a button, or a grey placeholder while loading.
  let main: React.ReactNode = <span className="poi-main-slot" aria-hidden />;
  if (actions.stage !== "loading") {
    if (pill) {
      main = (
        <Tip text={pill.detail} className={cn("poi-pill", `is-${pill.tone}`)} place="above">
          <span className="poi-pill-text">{pill.label}</span>
        </Tip>
      );
    } else if (actions.showAssign) {
      main = <MainButton label="Assign" onPress={() => setStep("assign")} />;
    } else if (actions.showCreateTrip) {
      main = <MainButton label="Plan trip" onPress={handlePlanTrip} />;
    } else if (actions.showRequest) {
      main = <MainButton label="Request" onPress={handleRequest} disabled={busy} />;
    }
  }

  const moreItems: MoreItem[] = [card.items.share, card.items.save, card.items.notes];
  // Admins on a free listing: Assign is the button, so Plan trip lives here.
  if (actions.showCreateTrip && actions.showAssign) {
    moreItems.push({ key: "trip", label: "Plan trip", icon: <Route aria-hidden />, onSelect: handlePlanTrip });
  }
  moreItems.push(card.items.hide);
  if (actions.showRemoveAssignment) {
    moreItems.push({ key: "remove", label: "Remove assignment", icon: <UserMinus aria-hidden />, tone: "danger", onSelect: () => handleRemove(false) });
  }
  if (actions.showUndoPreReject) {
    moreItems.push({ key: "undo", label: "Undo pre-reject", icon: <Undo2 aria-hidden />, tone: "danger", onSelect: () => handleRemove(true) });
  }
  if (actions.showPreReject) {
    moreItems.push({ key: "prereject", label: "Pre-reject…", icon: <Ban aria-hidden />, tone: "danger", opensStep: true, onSelect: () => setStep("prereject") });
  }

  const sreality = property.source === "sreality";
  const actionsRow = (
    <>
      {main}
      <MoreMenu items={moreItems} />
      <LinkTile href={property.url} label={sreality ? "Open on Sreality" : "Open on Idealista"} kind="fill">
        <img src={sreality ? "/assets/sreality-logo.png" : "/assets/idealista-logo.png"} alt="" />
      </LinkTile>
      <MapsTile href={mapsUrl} />
    </>
  );

  return (
    <PoiCard
      onClose={onClose}
      photos={photos}
      photoAlt={where || "Listing photo"}
      placeholder
      chips={chips}
      headline={headline}
      body={body}
      actions={actionsRow}
      step={step}
      onStepChange={setStep}
      steps={{
        ...card.steps,
        assign: {
          title: "Assign",
          subtitle: card.steps.notes.subtitle,
          body: <div className="poi-pad"><AssignList onAssign={handleAssign} disabled={busy} /></div>,
        },
        prereject: {
          title: "Pre-reject",
          subtitle: card.steps.notes.subtitle,
          body: <PreRejectForm reason={reasonDraft} setReason={setReasonDraft} busy={busy} onConfirm={handlePreReject} />,
        },
      }}
    />
  );
}
