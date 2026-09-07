"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { useToast } from "@/contexts/ToastContext";
import { useMobile } from "@/hooks/useMobile";
import { apiFetch } from "@/lib/api-client";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { useListsContext } from "@/contexts/ListsContext";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { usePropertyRequests } from "@/hooks/usePropertyRequests";
import { logActivity } from "@/lib/supabaseHelpers";
import { notifyTeam } from "@/lib/notify-team";
import { FocusTriageCard, AssignSheet, ActionsSheet } from "@/components/focus-triage";
import type { InboxProperty } from "@/types/inbox";
import type { PlaceInfo } from "@/types/lists";
import type { LinkedItem } from "@/types/scouting";

interface NewListingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
}

export function NewListingsModal({
  isOpen,
  onClose,
  cityId,
}: NewListingsModalProps) {
  const isMobile = useMobile();
  const { showToast } = useToast();
  const { assignProperty, preRejectProperty, assignments } = usePropertyAssignmentContext();
  const { canAccessDashboard } = useUserProfiles();
  const { hasPendingRequest, requestProperty } = usePropertyRequests();
  const { lists, toggleInList, createList } = useListsContext();
  const { createTrip, updateTrip } = useScoutingTrips();

  // Data state
  const [properties, setProperties] = useState<InboxProperty[]>([]);
  const [loading, setLoading] = useState(true);

  // Triage state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardAnim, setCardAnim] = useState<"idle" | "exiting" | "entering">("idle");
  const [activeSheet, setActiveSheet] = useState<"assign" | "actions" | null>(null);
  const [snapshotProperty, setSnapshotProperty] = useState<InboxProperty | null>(null);

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

  // Clamp currentIndex when deck shrinks
  useEffect(() => {
    if (deck.length > 0 && currentIndex >= deck.length) {
      setCurrentIndex(deck.length - 1);
    }
  }, [deck.length, currentIndex]);

  // Current property (use snapshot during exit animation)
  const currentProperty = snapshotProperty ?? deck[currentIndex];

  // Load listings
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await apiFetch<InboxProperty[]>(
          `/api/db/inbox?city_id=${cityId}`,
        );
        if (!cancelled) {
          setProperties(data || []);
          setCurrentIndex(0);
        }
      } catch (err) {
        console.error("Failed to load listings:", err);
        if (!cancelled) setProperties([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [isOpen, cityId]);

  // Mark single listing as read (optimistic)
  const handleMarkRead = useCallback(
    async (propertyId: string) => {
      const removed = properties.find((p) => p.id === propertyId);
      setProperties((prev) => prev.filter((p) => p.id !== propertyId));
      try {
        await apiFetch("/api/db/inbox", {
          method: "POST",
          body: JSON.stringify({
            action: "mark_read",
            place_ids: [propertyId],
            city_id: cityId,
          }),
        });
      } catch (err) {
        console.error("Failed to mark as read:", err);
        if (removed) setProperties((prev) => [...prev, removed]);
        showToast("Couldn't save, please try again", "error");
      }
    },
    [properties, cityId, showToast],
  );

  // Mark all as read
  const handleMarkAllRead = useCallback(async () => {
    const ids = deck.map((p) => p.id);
    if (ids.length === 0) return;

    const removed = [...properties];
    setProperties([]);

    try {
      await apiFetch("/api/db/inbox", {
        method: "POST",
        body: JSON.stringify({
          action: "mark_all_read",
          place_ids: ids,
          city_id: cityId,
        }),
      });
      showToast(`Marked ${ids.length} as read`);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
      setProperties(removed);
      showToast("Couldn't save, please try again", "error");
    }
  }, [deck, properties, cityId, showToast]);

  // Advance to next card with animation
  const handleAdvance = useCallback(
    (markRead = true) => {
      if (!currentProperty) return;

      setSnapshotProperty(currentProperty);

      if (markRead) {
        handleMarkRead(currentProperty.id);
      }

      setCardAnim("exiting");

      setTimeout(() => {
        setSnapshotProperty(null);
        setCardAnim("entering");
      }, 350);

      setTimeout(() => {
        setCardAnim("idle");
      }, 600);
    },
    [currentProperty, handleMarkRead],
  );

  // Assign handler
  const handleAssign = useCallback(
    async (targetId: string, targetName: string, type: "team" | "user") => {
      if (!currentProperty) return;

      const propertyMeta = {
        placeName: currentProperty.name || currentProperty.address,
        placeAddress: currentProperty.address,
        placeId: currentProperty.placeId,
        lat: currentProperty.latitude,
        lon: currentProperty.longitude,
      };

      setActiveSheet(null);

      try {
        if (type === "team") {
          await assignProperty(currentProperty.placeId, null, { teamId: targetId });
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
          await assignProperty(currentProperty.placeId, targetId);
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
      setTimeout(() => handleAdvance(true), 200);
    },
    [currentProperty, assignProperty, showToast, handleAdvance],
  );

  // Create trip handler
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
    showToast("Trip created");
  }, [currentProperty, cityId, createTrip, updateTrip, showToast]);

  // Add to list handler (adds to first list, or creates a default one)
  const handleAddToList = useCallback(() => {
    if (!currentProperty) return;
    const placeInfo: PlaceInfo = {
      placeId: currentProperty.placeId,
      placeType: "property",
      placeName: currentProperty.name || currentProperty.address,
      placeAddress: currentProperty.address,
      lat: currentProperty.latitude,
      lon: currentProperty.longitude,
    };
    if (lists.length > 0) {
      toggleInList(lists[0].id, placeInfo);
      showToast(`Added to ${lists[0].name}`);
    } else {
      const list = createList("Saved properties");
      toggleInList(list.id, placeInfo);
      showToast("Added to Saved properties");
    }
  }, [currentProperty, lists, toggleInList, createList, showToast]);

  // Pre-reject handler
  const handlePreReject = useCallback(
    async (reason: string) => {
      if (!currentProperty) return;

      setActiveSheet(null);

      try {
        await preRejectProperty(currentProperty.placeId, reason);
        logActivity("pre_rejected_property", {
          placeName: currentProperty.name || currentProperty.address,
          placeAddress: currentProperty.address,
          placeId: currentProperty.placeId,
          lat: currentProperty.latitude,
          lon: currentProperty.longitude,
          rejectionReason: reason,
        });
        showToast("Pre-rejected");
        setTimeout(() => handleAdvance(true), 200);
      } catch {
        showToast("Failed to pre-reject", "error");
      }
    },
    [currentProperty, preRejectProperty, showToast, handleAdvance],
  );

  // Request handler (franchisees). Copies the listing details onto the request
  // so the review queue still reads correctly after the listing is re-scraped.
  const handleRequest = useCallback(async () => {
    if (!currentProperty) return;

    try {
      await requestProperty(currentProperty.placeId, {
        property_name: currentProperty.name || null,
        property_address: currentProperty.address || null,
        property_url: currentProperty.url || null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send request";
      showToast(message, "error");
      return;
    }

    showToast("Request sent");
    setTimeout(() => handleAdvance(true), 200);
  }, [currentProperty, requestProperty, showToast, handleAdvance]);

  // Card animation styles
  const cardTransform =
    cardAnim === "exiting"
      ? { animation: "triage-card-exit 300ms ease-in forwards" }
      : cardAnim === "entering"
        ? { animation: "triage-card-enter 250ms ease-out forwards" }
        : {};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`relative flex flex-col overflow-hidden ${
          isMobile
            ? "w-full h-full"
            : "max-w-lg w-full max-h-[80vh] rounded-2xl"
        }`}
        style={{
          background: isMobile ? "#ffffff" : "rgba(255, 255, 255, 0.92)",
          backdropFilter: isMobile ? undefined : "blur(16px) saturate(180%)",
          boxShadow: isMobile
            ? undefined
            : "0 0 0 1px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.12)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0"
          style={
            isMobile
              ? { paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }
              : undefined
          }
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0 || deck.length === 0}
              className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5 text-zinc-600" />
            </button>
            <span
              className="text-sm font-medium text-zinc-500"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {deck.length > 0 ? `${currentIndex + 1} / ${deck.length}` : "0 / 0"}
            </span>
            <button
              onClick={() =>
                setCurrentIndex((i) => Math.min(deck.length - 1, i + 1))
              }
              disabled={currentIndex >= deck.length - 1 || deck.length === 0}
              className="w-8 h-8 flex items-center justify-center rounded-full disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5 text-zinc-600" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            {deck.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors px-2 py-1"
              >
                Skip all
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {deck.length > 0 && (
          <div className="w-full h-[3px] bg-zinc-100 shrink-0">
            <div
              className="h-full bg-zinc-900 transition-all duration-300"
              style={{
                width: `${((currentIndex + 1) / deck.length) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
          </div>
        ) : deck.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-zinc-900">All caught up</p>
            <p className="text-xs text-zinc-400 mt-1">
              No new properties to review.
            </p>
          </div>
        ) : currentProperty ? (
          <div
            key={currentProperty.id}
            className="flex-1 overflow-y-auto flex flex-col"
            style={cardTransform}
          >
            <FocusTriageCard
              property={currentProperty}
              isDesktop={!isMobile}
              onActions={() => setActiveSheet("actions")}
              onNext={() => handleAdvance(true)}
            />
          </div>
        ) : null}

        {/* Assign sheet */}
        {activeSheet === "assign" && (
          <AssignSheet
            onAssign={handleAssign}
            onClose={() => setActiveSheet(null)}
          />
        )}

        {/* Actions sheet */}
        {activeSheet === "actions" && currentProperty && (
          <ActionsSheet
            showAssign={canAccessDashboard}
            showRequest={!canAccessDashboard}
            hasRequested={hasPendingRequest(currentProperty.placeId)}
            showPreReject={canAccessDashboard}
            onAssign={() => setActiveSheet("assign")}
            onRequest={handleRequest}
            onCreateTrip={handleCreateTrip}
            onAddToList={handleAddToList}
            onPreReject={handlePreReject}
            onClose={() => setActiveSheet(null)}
          />
        )}
      </div>
    </div>
  );
}
