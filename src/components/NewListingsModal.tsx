"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ArrowUpDown,
  Check,
  CheckCheck,
  ExternalLink,
  X,
  Loader2,
  Route,
  ListPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListsContext } from "@/contexts/ListsContext";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useToast } from "@/contexts/ToastContext";
import { useMobile } from "@/hooks/useMobile";
import { apiFetch } from "@/lib/api-client";
import type { PlaceInfo } from "@/types/lists";
import type { LinkedItem } from "@/types/scouting";

interface InboxProperty {
  id: string;
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: string;
  price: number;
  size: number;
  priceByArea: number;
  district: string;
  hasAirConditioning: boolean;
  url: string;
  transfer?: number;
  hasBathroom: boolean;
  hasStorefront: boolean;
  image_url?: string;
  photos?: string[];
  score?: number;
  createdAt?: string;
}

type SortKey = "age" | "rent" | "size" | "district";
const SORT_CYCLE: SortKey[] = ["age", "rent", "size", "district"];

function formatAge(createdAt?: string): string {
  if (!createdAt) return "";
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return "Listed today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return `${Math.floor(days / 7)} weeks ago`;
}

// Currency by source: Prague (sreality) = CZK, Madrid (idealista) = EUR.
// Matches the map popup convention in EnhancedMapContainer.
function formatPrice(amount: number, source: string): string {
  // Round to whole units (scraped values can be fractional, e.g. 26866.667)
  // and pin the locale so grouping is identical on every device.
  const rounded = Math.round(amount).toLocaleString("en-US");
  return source === "sreality" ? `${rounded} Kč` : `€${rounded}`;
}

function sortProperties(
  properties: InboxProperty[],
  key: SortKey,
): InboxProperty[] {
  return [...properties].sort((a, b) => {
    switch (key) {
      case "age":
        return (
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        );
      case "rent": {
        const aVal = a.transfer || a.price;
        const bVal = b.transfer || b.price;
        return bVal - aVal;
      }
      case "size":
        return (b.size || 0) - (a.size || 0);
      case "district":
        return (a.district || "").localeCompare(b.district || "");
      default:
        return 0;
    }
  });
}

function ActionsDropdown({
  property,
  cityId,
  onActioned,
}: {
  property: InboxProperty;
  cityId: string;
  onActioned: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [subMenu, setSubMenu] = useState<"addToList" | null>(null);
  const [newListName, setNewListName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const { lists, toggleInList, isPlaceInList, createList } = useListsContext();
  const { createTrip, updateTrip } = useScoutingTrips();
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSubMenu(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const placeInfo: PlaceInfo = {
    placeId: property.placeId,
    placeType: "property",
    placeName: property.name || property.address,
    placeAddress: property.address,
    lat: property.latitude,
    lon: property.longitude,
  };

  const handleCreateTrip = () => {
    const tripName = property.name || property.address;
    const trip = createTrip(cityId);
    const linkedItem: LinkedItem = {
      type: "place",
      id: property.placeId,
      name: tripName,
      address: property.address,
      data: property,
    };
    updateTrip(trip.id, { name: tripName, property: linkedItem });
    window.dispatchEvent(
      new CustomEvent("create-trip-from-property", {
        detail: { trip: { ...trip, name: tripName, property: linkedItem } },
      }),
    );
    setOpen(false);
    onActioned(property.id);
  };

  const handleToggleList = (e: React.MouseEvent, listId: string) => {
    e.stopPropagation();
    toggleInList(listId, placeInfo);
    showToast("Added to list");
    setOpen(false);
    onActioned(property.id);
  };

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const list = createList(newListName.trim());
    toggleInList(list.id, placeInfo);
    showToast("Added to new list");
    setNewListName("");
    setSubMenu(null);
    setOpen(false);
    onActioned(property.id);
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); setSubMenu(null); }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 h-8 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Actions
      </button>
      {open && !subMenu && (
        <div className="actions-dropdown" style={{ right: 0, left: "auto", bottom: "auto", top: "100%", marginTop: 4, marginBottom: 0, zIndex: 50 }} onClick={(e) => e.stopPropagation()}>
          <button className="actions-item" onClick={(e) => { e.stopPropagation(); handleCreateTrip(); }}>
            <Route size={14} />
            <span>Create trip</span>
          </button>
          <button className="actions-item" onClick={(e) => { e.stopPropagation(); setSubMenu("addToList"); }}>
            <ListPlus size={14} />
            <span>Add to list</span>
          </button>
        </div>
      )}
      {open && subMenu === "addToList" && (
        <div className="actions-dropdown" style={{ right: 0, left: "auto", bottom: "auto", top: "100%", marginTop: 4, marginBottom: 0, zIndex: 50 }} onClick={(e) => e.stopPropagation()}>
          <div className="actions-header">
            <button className="actions-back" onClick={() => setSubMenu(null)}>&larr;</button>
            Add to list
          </div>
          {lists.map((list) => (
            <button
              key={list.id}
              className="actions-item"
              onClick={(e) => handleToggleList(e, list.id)}
            >
              <span>{list.name}</span>
              {isPlaceInList(property.placeId, list.id) && (
                <Check size={14} style={{ marginLeft: "auto", color: "#10b981" }} />
              )}
            </button>
          ))}
          <div style={{ borderTop: "1px solid #e5e7eb", padding: "8px 12px" }}>
            <input
              type="text"
              placeholder="New list name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
              className="w-full text-xs border border-zinc-200 rounded px-2 py-1.5 bg-transparent"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyCard({
  property,
  onMarkRead,
  onNavigate,
  cityId,
}: {
  property: InboxProperty;
  onMarkRead: (id: string) => void;
  onNavigate: (property: InboxProperty) => void;
  cityId: string;
}) {
  const rentLabel = property.price
    ? `${formatPrice(property.price, property.source)}/mo`
    : null;
  const transferLabel = property.transfer
    ? `${formatPrice(property.transfer, property.source)} transfer`
    : null;

  return (
    <div
      className="cursor-pointer hover:bg-zinc-50/80 active:bg-zinc-100/80 transition-colors relative rounded-xl border border-zinc-200/60"
      onClick={() => onNavigate(property)}
      style={{ overflow: "visible" }}
    >
      {/* Top: photo + info */}
      <div className="flex gap-3 p-3 pb-0">
        {property.image_url && (
          <img
            src={property.image_url}
            alt=""
            className="w-14 h-14 rounded-lg object-cover shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-zinc-900 leading-snug line-clamp-2">
            {property.name || property.address}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
            {property.district}
            {property.size ? ` · ${property.size} m²` : ""}
            {` · ${formatAge(property.createdAt)}`}
          </p>
        </div>
      </div>
      {/* Bottom: price left, actions right */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {rentLabel && (
            <span className="text-[13px] font-bold text-zinc-900 whitespace-nowrap">{rentLabel}</span>
          )}
          {transferLabel && (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md whitespace-nowrap">{transferLabel}</span>
          )}
          {!rentLabel && !transferLabel && (
            <span className="text-[12px] text-zinc-400">Price on request</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <ActionsDropdown property={property} cityId={cityId} onActioned={onMarkRead} />
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(property.id); }}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
            title="Mark as read"
          >
            <Check className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const [properties, setProperties] = useState<InboxProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [navigatedAway, setNavigatedAway] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await apiFetch<InboxProperty[]>(
          `/api/db/inbox?city_id=${cityId}`,
        );
        if (!cancelled) setProperties(data || []);
      } catch (err) {
        console.error("Failed to load listings:", err);
        if (!cancelled) setProperties([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, cityId]);

  const visibleProperties = useMemo(() => {
    return sortProperties(properties, sortKey);
  }, [properties, sortKey]);

  const handleMarkRead = useCallback(
    async (placeId: string) => {
      const removed = properties.find((p) => p.id === placeId);
      setProperties((prev) => prev.filter((p) => p.id !== placeId));
      try {
        await apiFetch("/api/db/inbox", {
          method: "POST",
          body: JSON.stringify({
            action: "mark_read",
            place_ids: [placeId],
            city_id: cityId,
          }),
        });
      } catch (err) {
        console.error("Failed to mark as read:", err);
        // Restore the card so the UI matches reality.
        if (removed) setProperties((prev) => [...prev, removed]);
        showToast("Couldn't save, please try again", "error");
      }
    },
    [properties, cityId, showToast],
  );

  const handleMarkAllRead = useCallback(async () => {
    const removed = [...visibleProperties];
    const ids = removed.map((p) => p.id);
    if (ids.length === 0) return;

    // Optimistically clear UI, then persist immediately so it's remembered.
    setProperties((prev) => prev.filter((p) => !ids.includes(p.id)));

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
      // Restore the cards so the UI matches reality.
      setProperties((prev) => [...removed, ...prev]);
      showToast("Couldn't save, please try again", "error");
    }
  }, [visibleProperties, cityId, showToast]);

  const handleNavigate = useCallback(
    (property: InboxProperty) => {
      setNavigatedAway(true);
      onClose();
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("navigate-and-open-popup", {
            detail: {
              lat: property.latitude,
              lon: property.longitude,
              placeId: property.placeId,
              placeType: "property",
              data: property,
            },
          }),
        );
      }, 100);
    },
    [onClose],
  );

  // When user closes the POI popup on the map after navigating from listings, reopen
  useEffect(() => {
    if (!navigatedAway) return;
    const handlePopupClosed = () => {
      setNavigatedAway(false);
      // Small delay to let popup close animation finish
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("reopen-new-listings"));
      }, 150);
    };
    window.addEventListener("closePopup", handlePopupClosed);
    window.addEventListener("popup-closed", handlePopupClosed);
    return () => {
      window.removeEventListener("closePopup", handlePopupClosed);
      window.removeEventListener("popup-closed", handlePopupClosed);
    };
  }, [navigatedAway]);

  useEffect(() => {
    const handleTripCreated = () => {
      showToast("Trip created");
    };
    window.addEventListener("create-trip-from-property", handleTripCreated);
    return () => {
      window.removeEventListener("create-trip-from-property", handleTripCreated);
    };
  }, [showToast]);

  const cycleSortKey = () => {
    setSortKey((prev) => {
      const idx = SORT_CYCLE.indexOf(prev);
      return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`relative flex flex-col ${
          isMobile
            ? "w-full h-full"
            : "max-w-lg w-full max-h-[80vh] rounded-2xl"
        }`}
        style={{
          background: isMobile ? "#ffffff" : "rgba(255, 255, 255, 0.92)",
          backdropFilter: isMobile ? undefined : "blur(16px) saturate(180%)",
          boxShadow: isMobile ? undefined : "0 0 0 1px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.12)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0"
          style={isMobile ? { paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" } : undefined}
        >
          <h2 className="font-outfit text-lg font-semibold text-zinc-900">
            New Listings
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Toolbar */}
        {!loading && visibleProperties.length > 0 && (
          <div className="flex items-center justify-between px-4 pb-2 shrink-0">
            <span className="text-xs text-zinc-400">
              {visibleProperties.length}{" "}
              {visibleProperties.length === 1 ? "property" : "properties"}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={cycleSortKey}>
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="text-xs font-medium capitalize ml-1">
                  {sortKey}
                </span>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleMarkAllRead}>
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="text-xs ml-1">Mark all as read</span>
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-48">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
            </div>
          ) : visibleProperties.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <Check className="w-6 h-6 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-zinc-900">
                All caught up
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                No new properties to review.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleProperties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onMarkRead={handleMarkRead}
                  onNavigate={handleNavigate}
                  cityId={cityId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
