"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Check, ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useMobile, useWideScreen } from "@/hooks/useMobile";
import { apiFetch } from "@/lib/api-client";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { usePitchStatusContext } from "@/contexts/PitchStatusContext";
import { evaluatePropertyActions, pendingPropertyActions } from "@/lib/property-actions";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { usePropertyRequests } from "@/hooks/usePropertyRequests";
import { logActivity } from "@/lib/supabaseHelpers";
import { notifyTeam } from "@/lib/notify-team";
import { FocusTriageCard, StepSheet } from "@/components/focus-triage";
import { AssignList } from "@/components/AssignList";
import { PoiCardScope, MoreMenu } from "@/components/poi-card/PoiCard";
import { listingMainSlot, listingMoreItems } from "@/components/poi-card/listing-actions";
import { useExclusive } from "@/hooks/useExclusive";
import { usePlaceCard, PreRejectForm } from "@/components/poi-card/CardSteps";
import { statusPill, type StatusPill } from "@/components/poi-card/card-format";
import type { PropertyActionState } from "@/lib/property-actions";
import { BreatheGlow } from "@/components/BeamGlow";
import { nextUnseenIndex } from "@/lib/triage-deck";
import { formatPrice } from "@/types/inbox";
import type { InboxProperty } from "@/types/inbox";
import type { LinkedItem } from "@/types/scouting";

interface NewListingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
}

/**
 * How long "Undo" stays up after "Skip". The server is only told once
 * this runs out, so undoing never needs an "unread" call of its own.
 */
const UNDO_MS = 4000;

/** Fired on window once flushed reads reach the server. page.tsx recounts. */
export const INBOX_READS_SAVED = "inbox-reads-saved";

/** The property details every inbox activity-log entry carries. */
function propertyMetaOf(p: InboxProperty) {
  return {
    placeName: p.name || p.address,
    placeAddress: p.address,
    placeId: p.placeId,
    lat: p.latitude,
    lon: p.longitude,
  };
}

export function NewListingsModal({
  isOpen,
  onClose,
  cityId,
}: NewListingsModalProps) {
  const isMobile = useMobile();
  const isWide = useWideScreen();
  const { showToast } = useToast();
  const {
    assignProperty,
    preRejectProperty,
    removeAssignment,
    assignments,
    getAssignment,
    isAssignedToMe,
  } = usePropertyAssignmentContext();
  const { getPitchStatus, getPitchDate, getPitchRejectionReason, getPitchReturnReason } =
    usePitchStatusContext();
  const { canAccessDashboard, accessResolved } = useUserProfiles();
  const { hasPendingRequest, wasRejectedForMe, requestProperty } = usePropertyRequests();
  const { createTrip, updateTrip } = useScoutingTrips();

  // Data state
  const [properties, setProperties] = useState<InboxProperty[]>([]);
  const [loading, setLoading] = useState(true);
  // A failed load used to fall through to "All caught up", so a network
  // error looked exactly like an empty inbox. Bumping reloadKey retries.
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Triage state
  //
  // Seen listings stay in the deck for the rest of the session, ticked off,
  // so the arrows can always go back to one. They only drop out on the next
  // open, because the server now has them as read.
  const [seenIds, setSeenIds] = useState<Set<string>>(() => new Set());
  // Where we are, by id. An index alone would jump to a different listing
  // whenever the deck changes under it (a pre-reject hides a listing from
  // non-admins). The index is the fallback for when the id has gone.
  const [cursor, setCursor] = useState<{ id: string; index: number } | null>(null);
  // "All caught up" after the last new listing is ticked off. The arrows
  // leave it to look back through the seen ones.
  const [doneView, setDoneView] = useState(false);
  // The listing the Undo pill would bring back, while it is showing.
  const [undoId, setUndoId] = useState<string | null>(null);
  // Seen listings the server has not been told about yet, each with the
  // timer that will tell it. Undo cancels the timer.
  const pendingReads = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Which side the next card slides in from: right going forward, left going
  // back. Null on open, so the first card just appears.
  const [enterFrom, setEnterFrom] = useState<"left" | "right" | null>(null);
  const [activeSheet, setActiveSheet] = useState<TriageStep | null>(null);
  const [busy, runExclusive] = useExclusive();
  // When Skip last moved on, so a double click cannot skip two listings.
  const lastSkipAt = useRef(0);
  // Plays the "All caught up" glow. Bumped only when the scout's own action
  // empties the deck, and reset on every load and close, so an inbox that was
  // already empty shows the tick without a glow.
  const [caughtUpGlow, setCaughtUpGlow] = useState(0);

  // Score-sorted deck, filtered for non-admin users
  const deck = useMemo(() => {
    let filtered = [...properties];

    if (!canAccessDashboard) {
      const rejectedPlaceIds = new Set(
        assignments
          .filter((a) => a.status === "pre_rejected")
          .map((a) => a.property_place_id),
      );
      filtered = filtered.filter((p) => !rejectedPlaceIds.has(p.placeId));
    }

    return filtered.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1));
  }, [properties, canAccessDashboard, assignments]);

  const currentIndex = useMemo(() => {
    if (!cursor || deck.length === 0) return 0;
    const found = deck.findIndex((p) => p.id === cursor.id);
    return found >= 0 ? found : Math.min(cursor.index, deck.length - 1);
  }, [cursor, deck]);

  // A step belongs to the listing it was opened on, so moving closes it.
  const goTo = useCallback(
    (index: number) => {
      const p = deck[index];
      if (!p) return;
      setCursor({ id: p.id, index });
      setActiveSheet(null);
    },
    [deck],
  );

  const unseenCount = useMemo(
    () => deck.filter((p) => !seenIds.has(p.id)).length,
    [deck, seenIds],
  );

  const currentProperty: InboxProperty | undefined = deck[currentIndex];

  // Trainers get the tall window, for the "Why" panel. Decided per batch, not
  // per listing, so the window keeps one height while you go through it.
  const isTall = useMemo(() => deck.some((p) => p.aiBreakdown), [deck]);

  // One decision for the whole sheet, shared with the map popup. This sheet
  // used to hardcode "Create trip", so a franchisee could start a trip on a
  // property nobody had given them. See src/lib/property-actions.ts.
  const actions = useMemo(() => {
    if (!accessResolved) return pendingPropertyActions();

    const placeId = currentProperty?.placeId ?? "";
    const assignment = placeId ? getAssignment(placeId) : null;
    const preRejected = assignment?.status === "pre_rejected";

    return evaluatePropertyActions({
      isAdmin: canAccessDashboard,
      isPreRejected: preRejected,
      rejectionReason: assignment?.rejection_reason ?? null,
      hasAssignment: !!assignment && !preRejected,
      isAssignedToMe: placeId ? isAssignedToMe(placeId) : false,
      // Never a name in this window: "Assigned" is enough.
      assigneeLabel: null,
      pitchStatus: placeId ? getPitchStatus(placeId) : null,
      hasPendingRequest: placeId ? hasPendingRequest(placeId) : false,
      wasRejectedForMe: placeId ? wasRejectedForMe(placeId) : false,
    });
  }, [
    accessResolved,
    currentProperty,
    getAssignment,
    canAccessDashboard,
    isAssignedToMe,
    getPitchStatus,
    hasPendingRequest,
    wasRejectedForMe,
  ]);

  // The status that takes the main button's place, worded as on the map card
  // and with no name in it, not even in its tooltip.
  const pill = useMemo(() => {
    const placeId = currentProperty?.placeId;
    if (!placeId) return null;
    const assignment = getAssignment(placeId);
    const pitchStatus = getPitchStatus(placeId);
    return statusPill({
      stage: actions.stage,
      isAssignedToMe: isAssignedToMe(placeId),
      assigneeLabel: null,
      preRejectReason: assignment?.rejection_reason ?? null,
      pitchStatus,
      pitchDate: getPitchDate(placeId),
      pitchReason:
        pitchStatus === "rejected" ? getPitchRejectionReason(placeId)
          : pitchStatus === "returned" ? getPitchReturnReason(placeId)
            : null,
    });
  }, [
    actions.stage,
    currentProperty,
    getAssignment,
    getPitchStatus,
    isAssignedToMe,
    getPitchDate,
    getPitchRejectionReason,
    getPitchReturnReason,
  ]);

  // Someone else may claim or pre-reject the listing while Assign or
  // Pre-reject is open (assignments refresh in the background): step back.
  const stepGone =
    (activeSheet === "assign" && !actions.showAssign) ||
    (activeSheet === "prereject" && !actions.showPreReject);
  useEffect(() => {
    if (stepGone && actions.stage !== "loading") setActiveSheet(null);
  }, [stepGone, actions.stage]);

  // Load listings
  useEffect(() => {
    setCaughtUpGlow(0);
    if (!isOpen) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadFailed(false);
      try {
        const data = await apiFetch<InboxProperty[]>(
          `/api/db/inbox?city_id=${cityId}`,
        );
        if (!cancelled) {
          setProperties(data || []);
          setCursor(null);
          setSeenIds(new Set());
          setDoneView(false);
          setUndoId(null);
          setEnterFrom(null);
          setActiveSheet(null);
        }
      } catch (err) {
        console.error("Failed to load listings:", err);
        if (!cancelled) {
          setProperties([]);
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isOpen, cityId, reloadKey]);

  // Tell the server these were read. Same call as always; nothing new.
  const sendMarkRead = useCallback(
    (ids: string[], { keepalive = false, all = false } = {}) =>
      apiFetch("/api/db/inbox", {
        method: "POST",
        keepalive,
        body: JSON.stringify({
          action: all ? "mark_all_read" : "mark_read",
          place_ids: ids,
          city_id: cityId,
        }),
      }),
    [cityId],
  );

  // Stop every waiting timer and hand back the ids they were holding.
  const cancelPendingReads = useCallback(() => {
    const ids = [...pendingReads.current.keys()];
    pendingReads.current.forEach((timer) => clearTimeout(timer));
    pendingReads.current.clear();
    return ids;
  }, []);

  // The server refused: put the tick back so the listing reads as new.
  const unsee = useCallback((ids: string[]) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    setCaughtUpGlow(0); // something is back, so nothing to celebrate
    setDoneView(false); // and "All caught up" is no longer true
  }, []);

  // Tick a listing off. With `undoable` (the "Seen, next" button) the server
  // hears about it after UNDO_MS, giving Undo a window. After a real action
  // (assign, request, pre-reject) it is told straight away; there is no Undo.
  const markSeen = useCallback(
    (id: string, undoable: boolean) => {
      setSeenIds((prev) => new Set(prev).add(id));

      const send = () =>
        sendMarkRead([id]).catch((err) => {
          console.error("Failed to mark as read:", err);
          unsee([id]);
          showToast("Couldn't save, please try again", "error");
        });

      if (!undoable) {
        send();
        return;
      }
      // One clock for both: when the window closes, the read is sent and
      // the Undo pill (if it is still this listing's) goes away.
      const timer = setTimeout(() => {
        pendingReads.current.delete(id);
        setUndoId((current) => (current === id ? null : current));
        send();
      }, UNDO_MS);
      pendingReads.current.set(id, timer);
      setUndoId(id);
    },
    [sendMarkRead, unsee, showToast],
  );

  // Send everything still waiting out its Undo window, now. Runs when the
  // modal closes, the city changes, or the tab goes away. keepalive lets the
  // request outlive the page.
  const flushPendingReads = useCallback(() => {
    const ids = cancelPendingReads();
    if (ids.length > 0) {
      sendMarkRead(ids, { keepalive: true })
        // The page recounts the NEW dot when the modal closes, which can beat
        // this save to the server. Ask it to count again once it has landed.
        .then(() => window.dispatchEvent(new Event(INBOX_READS_SAVED)))
        .catch((err) => console.error("Failed to mark as read:", err));
    }
  }, [cancelPendingReads, sendMarkRead]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("pagehide", flushPendingReads);
    return () => {
      window.removeEventListener("pagehide", flushPendingReads);
      flushPendingReads();
      setUndoId(null); // already sent, so there is nothing left to undo
    };
  }, [isOpen, flushPendingReads]);

  // Undo: cancel the pending server call, untick, and show it again.
  const handleUndo = useCallback(() => {
    if (!undoId) return;
    const timer = pendingReads.current.get(undoId);
    setUndoId(null);
    // Already sent (the tab was hidden and came back): too late to undo.
    if (!timer) return;
    clearTimeout(timer);
    pendingReads.current.delete(undoId);
    unsee([undoId]);
    const index = deck.findIndex((p) => p.id === undoId);
    if (index >= 0) {
      setEnterFrom("left");
      goTo(index);
    }
    setDoneView(false);
  }, [undoId, deck, unsee, goTo]);

  // Mark all as seen. Immediate, no Undo, as before.
  const handleMarkAllRead = useCallback(async () => {
    const ids = deck.map((p) => p.id);
    if (ids.length === 0) return;
    const newCount = unseenCount;
    setCaughtUpGlow((n) => n + 1);

    // These are all in the batch below, so their own timers can go.
    const waiting = cancelPendingReads();
    setUndoId(null);

    const removed = [...properties];
    setProperties([]);

    try {
      await sendMarkRead(ids, { all: true });
      showToast(newCount > 0 ? `Marked ${newCount} as seen` : "All marked as seen");
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      setProperties(removed);
      setCaughtUpGlow(0);
      showToast("Couldn't save, please try again", "error");
      // The batch took the waiting single reads with it. Send those again,
      // or untick them so they don't look saved when they are not.
      if (waiting.length > 0) {
        sendMarkRead(waiting).catch(() => unsee(waiting));
      }
    }
  }, [deck, unseenCount, cancelPendingReads, properties, sendMarkRead, showToast, unsee]);

  // Move on to the next new listing, which slides in from the right.
  // `markRead` ticks the current one off first; `undoable` is only for Skip.
  const handleAdvance = useCallback(
    (markRead = true, undoable = false) => {
      if (!currentProperty) return;

      const id = currentProperty.id;
      const seenNow = new Set(seenIds);
      const isNew = markRead && !seenIds.has(id);
      if (isNew) {
        markSeen(id, undoable);
        seenNow.add(id);
      }

      const next = nextUnseenIndex(deck, currentIndex, seenNow);
      if (next === -1) {
        // Nothing new left. Glow only if this press is what finished it.
        if (isNew) setCaughtUpGlow((n) => n + 1);
        setDoneView(true);
        return;
      }

      setEnterFrom("right");
      goTo(next);
    },
    [currentProperty, seenIds, markSeen, deck, currentIndex, goTo],
  );

  // The newest handleAdvance and the listing on screen, for code that runs
  // after an await or a timer and would otherwise act on a stale copy.
  const latest = useRef({ handleAdvance, currentId: currentProperty?.id });
  useEffect(() => {
    latest.current = { handleAdvance, currentId: deck[currentIndex]?.id };
  });

  // After an action (assign, request, pre-reject) on `id`: tick it off for
  // good, then move on, but only if the person has not moved on already
  // while the action was saving.
  const finishAction = useCallback(
    (id: string) => {
      markSeen(id, false);
      setUndoId(null); // the pill would undo a different listing now
      setTimeout(() => {
        const { handleAdvance: advance, currentId } = latest.current;
        if (currentId === id) advance(false);
      }, 200);
    },
    [markSeen],
  );

  // Skip: tick off and move on, with Undo. A second press within a quarter
  // second is a double click, not a second skip.
  const handleSkip = useCallback(() => {
    const now = Date.now();
    if (now - lastSkipAt.current < 250) return;
    lastSkipAt.current = now;
    handleAdvance(true, true);
  }, [handleAdvance]);

  // Top row arrows and the arrow keys: browse everything, seen or not,
  // without ticking anything. From "All caught up" they first bring back the
  // last card shown.
  const handleBrowse = useCallback(
    (step: -1 | 1) => {
      if (doneView) {
        setDoneView(false);
        return;
      }
      const index = Math.min(deck.length - 1, Math.max(0, currentIndex + step));
      if (index === currentIndex) return;
      setEnterFrom(step > 0 ? "right" : "left");
      goTo(index);
    },
    [doneView, deck.length, currentIndex, goTo],
  );

  // Assign handler
  const handleAssign = useCallback(
    (targetId: string, targetName: string, type: "team" | "user") => runExclusive(async () => {
      if (!currentProperty) return;

      const propertyMeta = propertyMetaOf(currentProperty);

      setActiveSheet(null);

      try {
        if (type === "team") {
          await assignProperty(currentProperty.placeId, null, {
            teamId: targetId,
            placeUuid: currentProperty.id,
          });
          logActivity("assigned_property", {
            ...propertyMeta,
            team_id: targetId,
            teamName: targetName,
          });
          notifyTeam({
            teamId: targetId,
            kind: "assigned",
            placeId: currentProperty.placeId,
            placeName: currentProperty.name || currentProperty.address,
            placeAddress: currentProperty.address,
          });
        } else {
          await assignProperty(currentProperty.placeId, targetId, {
            placeUuid: currentProperty.id,
          });
          logActivity("assigned_property", {
            ...propertyMeta,
            assigned_to: targetId,
            assigneeName: targetName,
          });
          // Same as the team branch above: tell the person they were given it.
          notifyTeam({
            userId: targetId,
            kind: "assigned",
            placeId: currentProperty.placeId,
            placeName: currentProperty.name || currentProperty.address,
            placeAddress: currentProperty.address,
          });
        }
      } catch {
        showToast("Failed to assign", "error");
        return;
      }

      showToast(`Assigned to ${targetName}`);
      finishAction(currentProperty.id);
    }),
    [currentProperty, assignProperty, showToast, finishAction, runExclusive],
  );

  // Plan trip: the trip form opens on the page, behind this window, so the
  // window closes, as the map card does.
  const handleCreateTrip = useCallback(() => {
    if (!currentProperty) return;
    const tripName = currentProperty.name || currentProperty.address;
    const trip = createTrip(cityId);
    const linkedItem: LinkedItem = {
      type: "place",
      id: currentProperty.placeId,
      name: tripName,
      address: currentProperty.address,
      data: currentProperty,
    };
    updateTrip(trip.id, { name: tripName, property: linkedItem });
    window.dispatchEvent(
      new CustomEvent("create-trip-from-property", {
        detail: { trip: { ...trip, name: tripName, property: linkedItem } },
      }),
    );
    onClose();
  }, [currentProperty, cityId, createTrip, updateTrip, onClose]);

  // Undo pre-reject. Pre-rejected properties are filtered out of a
  // franchisee's deck entirely, so only a reviewer ever reaches this.
  const handleUndoPreReject = useCallback(() => runExclusive(async () => {
    if (!currentProperty) return;
    try {
      await removeAssignment(currentProperty.placeId);
      showToast("Pre-rejection removed");
    } catch {
      showToast("Failed to undo pre-rejection", "error");
    }
  }), [currentProperty, removeAssignment, showToast, runExclusive]);

  // Free an assigned property so it can be reassigned or pre-rejected.
  const handleRemoveAssignment = useCallback(() => runExclusive(async () => {
    if (!currentProperty) return;
    try {
      await removeAssignment(currentProperty.placeId);
      showToast("Assignment removed");
    } catch {
      showToast("Failed to remove assignment", "error");
    }
  }), [currentProperty, removeAssignment, showToast, runExclusive]);

  // Pre-reject handler
  const handlePreReject = useCallback(
    (reason: string) => runExclusive(async () => {
      if (!currentProperty) return;

      setActiveSheet(null);

      try {
        await preRejectProperty(
          currentProperty.placeId,
          reason,
          undefined,
          currentProperty.id,
        );
        logActivity("pre_rejected_property", {
          ...propertyMetaOf(currentProperty),
          rejectionReason: reason,
        });
        showToast("Pre-rejected");
        finishAction(currentProperty.id);
      } catch {
        showToast("Failed to pre-reject", "error");
      }
    }),
    [currentProperty, preRejectProperty, showToast, finishAction, runExclusive],
  );

  // Request handler (franchisees). Copies the listing details onto the request
  // so the review queue still reads correctly after the listing is re-scraped.
  const handleRequest = useCallback(() => runExclusive(async () => {
    if (!currentProperty) return;

    try {
      await requestProperty(currentProperty.placeId, {
        property_name: currentProperty.name || null,
        property_address: currentProperty.address || null,
        property_url: currentProperty.url || null,
        place_uuid: currentProperty.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send request";
      showToast(message, "error");
      return;
    }

    // Same entry the map's Request button writes, so the activity feed shows
    // inbox requests too.
    logActivity("requested_property", propertyMetaOf(currentProperty));

    showToast("Request sent");
    finishAction(currentProperty.id);
  }), [currentProperty, requestProperty, showToast, finishAction, runExclusive]);

  // Backing out of a sheet must not throw you out of the whole screen. Each
  // sheet's own backdrop only covers the card, so a click on the margin around
  // the card on desktop lands here instead: close the sheet if one is open,
  // otherwise close the modal.
  const handleDismiss = useCallback(() => {
    if (activeSheet) {
      setActiveSheet(null);
      return;
    }
    onClose();
  }, [activeSheet, onClose]);

  // Escape follows the same rule. This modal is a hand-rolled overlay rather
  // than a BottomSheet, so it has no Escape handling of its own. An open ⋯
  // menu or step handles Escape itself (and marks it used), so that closes
  // first and the window stays.
  // The left and right arrow keys browse, like the arrows in the top row,
  // unless a step is open or the key is meant for a field or the menu.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        handleDismiss();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || activeSheet || loading) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='menu']")) return;
      e.preventDefault();
      handleBrowse(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleDismiss, handleBrowse, activeSheet, loading]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Narrow windows get the classic 512px card. Wide screens (lg) get a
          wide window for the side-by-side layout, kept clear of the screen
          edges so it fits a short laptop screen. Its height is set in
          globals.css (.triage-win): tall for trainers, else just the photo. */}
      <div
        className={`triage-win relative flex flex-col overflow-hidden ${isTall ? "is-tall" : ""} ${
          isMobile
            ? "w-full h-full"
            : "max-w-lg w-full max-h-[80vh] rounded-2xl lg:max-w-[1120px] lg:w-[calc(100vw-48px)] lg:max-h-none"
        }`}
        style={{
          background: isMobile ? "#ffffff" : "rgba(255, 255, 255, 0.92)",
          backdropFilter: isMobile ? undefined : "blur(16px) saturate(180%)",
          boxShadow: isMobile
            ? undefined
            : "0 0 0 1px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.12)",
        }}
      >
        {/* Top row: where you are, how many are left, Mark all seen, close.
            It belongs to the window, not the card, so close and the arrows
            stay on the loading, error and "All caught up" screens. On wide
            screens it sits over the details column, and the photo runs to
            the top of the window. */}
        <div
          className="flex items-center gap-1 px-2 h-12 shrink-0 lg:absolute lg:top-0 lg:right-0 lg:z-10 lg:w-[56%] lg:pl-4 lg:pr-3"
          style={
            isMobile
              ? { height: "auto", paddingTop: "calc(4px + env(safe-area-inset-top, 0px))", paddingBottom: 4 }
              : undefined
          }
        >
          <button
            onClick={() => handleBrowse(-1)}
            disabled={deck.length === 0 || (currentIndex === 0 && !doneView)}
            aria-label="Previous listing"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <span
            className="text-sm font-medium text-zinc-600 whitespace-nowrap"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {deck.length > 0 ? (
              <>
                <Roll value={currentIndex + 1} /> / {deck.length}
              </>
            ) : (
              "0 / 0"
            )}
          </span>
          <button
            onClick={() => handleBrowse(1)}
            disabled={deck.length === 0 || (currentIndex >= deck.length - 1 && !doneView)}
            aria-label="Next listing"
            className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronRight className="w-5 h-5 text-zinc-600" />
          </button>
          {deck.length > 0 && (
            <span
              className="ml-1 text-xs text-zinc-400 whitespace-nowrap"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              <Roll value={unseenCount} /> left
            </span>
          )}
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {unseenCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors px-2 py-2 whitespace-nowrap"
              >
                Mark all seen
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        ) : loadFailed ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <p className="text-sm font-medium text-zinc-900">Couldn&apos;t load new listings</p>
            <p className="text-xs text-zinc-400 mt-1">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="mt-4 px-5 py-2.5 rounded-full bg-zinc-900 text-sm font-medium text-white"
            >
              Retry
            </button>
          </div>
        ) : deck.length === 0 || doneView ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <BreatheGlow
              playKey={caughtUpGlow}
              borderRadius={24}
              className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3"
            >
              <Check className="w-6 h-6 text-emerald-600" />
            </BreatheGlow>
            <p className="text-sm font-medium text-zinc-900">All caught up</p>
            <p className="text-xs text-zinc-400 mt-1">
              No new properties to review.
            </p>
          </div>
        ) : currentProperty ? (
          <PoiCardScope close={onClose}>
            <TriageListing
              key={currentProperty.id}
              property={currentProperty}
              isMobile={isMobile}
              isWide={isWide}
              enterFrom={enterFrom}
              actions={actions}
              pill={pill}
              busy={busy}
              step={activeSheet}
              onStep={setActiveSheet}
              onSkip={handleSkip}
              onAssign={handleAssign}
              onRequest={handleRequest}
              onPlanTrip={handleCreateTrip}
              onPreReject={handlePreReject}
              onRemoveAssignment={handleRemoveAssignment}
              onUndoPreReject={handleUndoPreReject}
            />
          </PoiCardScope>
        ) : null}

        {/* Undo for the last Skip, just above the bottom row (centred on the
            details column on wide screens). Below the steps (z-40/50) so an
            open step covers it. */}
        {/* Always mounted, so screen readers announce the text when it
            appears (a live region that arrives with its text is often
            skipped). */}
        <p role="status" className="sr-only">
          {undoId ? "Skipped. Undo is available for a few seconds." : ""}
        </p>
        {undoId && (
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-28 lg:left-[72%] lg:bottom-[92px] z-30 flex items-center gap-3 rounded-full bg-zinc-900 text-white text-[13px] pl-4 pr-1.5 py-1.5 shadow-lg whitespace-nowrap"
          >
            Skipped
            <button
              type="button"
              onClick={handleUndo}
              className="rounded-full bg-white/15 hover:bg-white/25 px-3.5 py-1.5 font-medium transition-colors"
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The window's second steps, opened from the bottom row or the ⋯ menu. */
type TriageStep = "assign" | "prereject" | "notes" | "saved";

/** A number that rolls up into place when it changes ("5 / 36", "32 left"). */
function Roll({ value }: { value: number }) {
  return (
    <span className="triage-roll">
      <span key={value}>{value}</span>
    </span>
  );
}

interface TriageListingProps {
  property: InboxProperty;
  isMobile: boolean;
  isWide: boolean;
  enterFrom: "left" | "right" | null;
  actions: PropertyActionState;
  pill: StatusPill | null;
  busy: boolean;
  step: TriageStep | null;
  onStep: (step: TriageStep | null) => void;
  onSkip: () => void;
  onAssign: (targetId: string, targetName: string, type: "team" | "user") => void;
  onRequest: () => void;
  onPlanTrip: () => void;
  onPreReject: (reason: string) => void;
  onRemoveAssignment: () => void;
  onUndoPreReject: () => void;
}

/**
 * One listing: the card, its bottom row, and its second steps. Keyed by the
 * listing, so notes, the pre-reject reason and the slide-in start fresh for
 * each one. The bottom row is the map card's, piece for piece: the main
 * button (or the status that replaces it), then Skip, then the same ⋯ menu,
 * all decided by evaluatePropertyActions.
 */
function TriageListing({
  property,
  isMobile,
  isWide,
  enterFrom,
  actions,
  pill,
  busy,
  step,
  onStep,
  onSkip,
  onAssign,
  onRequest,
  onPlanTrip,
  onPreReject,
  onRemoveAssignment,
  onUndoPreReject,
}: TriageListingProps) {
  const [reasonDraft, setReasonDraft] = useState("");
  const title = property.name || property.address;
  const price = property.price > 0 ? `${formatPrice(property.price, property.source)}/mo` : null;
  const subtitle = [price, property.district].filter(Boolean).join(" · ");

  // Share, Save, Notes & files and Hide, exactly as on the map card. Save and
  // Notes open their step in this window instead of inside a map card.
  const card = usePlaceCard({
    place: {
      placeId: property.placeId,
      placeType: "property",
      placeName: title,
      placeAddress: property.address,
      lat: property.latitude,
      lon: property.longitude,
    },
    notesType: "property",
    share: {
      placeId: property.placeId,
      placeType: "property",
      // "€2,400/mo · 95 m²", as the map card shares it.
      title: [price ?? "On request", property.size > 0 ? `${property.size} m²` : null].filter(Boolean).join(" · "),
      address: property.address,
      photoUrl: property.photos?.[0] ?? property.image_url ?? null,
      listingUrl: property.url || undefined,
    },
    subtitle,
  });

  // Same main slot and ⋯ items as the map card, from the same helpers.
  // Save and Notes open their step in this window instead of a map card.
  const main = listingMainSlot(actions, pill, busy, {
    onAssign: () => onStep("assign"),
    onPlanTrip,
    onRequest,
  });
  const moreItems = listingMoreItems(
    actions,
    {
      ...card.items,
      save: { ...card.items.save, onSelect: () => onStep("saved") },
      notes: { ...card.items.notes, onSelect: () => onStep("notes") },
    },
    {
      onPlanTrip,
      onPreReject: () => onStep("prereject"),
      onRemoveAssignment,
      onUndoPreReject,
    },
  );

  const closeStep = useCallback(() => onStep(null), [onStep]);
  const placeStep = step === "notes" || step === "saved" ? card.steps[step] : null;

  return (
    <>
      <div
        className={`flex-1 min-h-0 overflow-y-auto flex flex-col lg:flex-row lg:overflow-hidden ${
          enterFrom ? `triage-enter-${enterFrom}` : ""
        }`}
      >
        <FocusTriageCard
          property={property}
          isDesktop={!isMobile}
          isWide={isWide}
          actions={
            <>
              {main}
              <button type="button" className="triage-skip" onClick={onSkip}>
                Skip
              </button>
              <MoreMenu items={moreItems} deferSteps />
            </>
          }
        />
      </div>

      {step === "assign" && (
        <StepSheet title="Assign" subtitle={subtitle} onClose={closeStep}>
          <div className="poi-pad">
            <AssignList onAssign={onAssign} disabled={busy} />
          </div>
        </StepSheet>
      )}
      {step === "prereject" && (
        <StepSheet title="Pre-reject" subtitle={subtitle} onClose={closeStep}>
          <PreRejectForm reason={reasonDraft} setReason={setReasonDraft} busy={busy} onConfirm={onPreReject} />
        </StepSheet>
      )}
      {placeStep && (
        <StepSheet title={placeStep.title} subtitle={subtitle} footer={placeStep.footer} onClose={closeStep}>
          {placeStep.body}
        </StepSheet>
      )}
    </>
  );
}
