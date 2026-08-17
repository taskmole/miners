"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ArrowUpDown,
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  ExternalLink,
  MapPin,
  X,
  Loader2,
  Route,
  ListPlus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useListsContext } from "@/contexts/ListsContext";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useToast } from "@/contexts/ToastContext";
import { useMobile } from "@/hooks/useMobile";
import { apiFetch } from "@/lib/api-client";
import { predictRevenue, getMarketDefaults } from "@/lib/revenue-model";
import { scoreTier, SCORE_TIER_COLORS, SCORE_TIER_LABELS } from "@/lib/gravity-lookup";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { useTeamsContext } from "@/contexts/TeamsContext";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { logActivity } from "@/lib/supabaseHelpers";
import { notifyTeam } from "@/lib/notify-team";
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
  aiScore?: number;
  aiReason?: string;
  createdAt?: string;
}

const AI_SCORE_THRESHOLD = 30;

type SortKey = "score" | "age" | "rent" | "size" | "district";
const SORT_CYCLE: SortKey[] = ["score", "age", "rent", "size", "district"];

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

// Scraped titles repeat the size we already show in the meta line below
// (e.g. "Pronájem obchodního prostoru 77 m²"). Strip the trailing "NN m²"
// so it's shown once. Portal-agnostic regex, no per-language parsing.
function dedupTitle(name: string): string {
  return name.replace(/\s*\d+([.,]\d+)?\s*m[²2]\s*$/i, "").trim();
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
      case "score":
        return (b.aiScore ?? -1) - (a.aiScore ?? -1);
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

// Uses the same tier system as map pins/popups (src/lib/gravity-lookup.ts)
// so a listing's badge color means the same thing everywhere in the app.
function scoreColor(score: number): string {
  return SCORE_TIER_COLORS[scoreTier(score)];
}

function RevenueSimulator({ property }: { property: InboxProperty }) {
  const currency = property.source === "sreality" ? "CZK" : "EUR";
  const defaults = getMarketDefaults(currency);

  const [traffic, setTraffic] = useState(3000);
  const [captureRate, setCaptureRate] = useState(defaults.captureRate * 100);
  const [avgTicket, setAvgTicket] = useState(defaults.avgTicket);

  const rent = property.price || 0;
  const size = property.size || 0;

  if (!rent || !size) {
    return (
      <div className="px-3 py-4 text-xs text-zinc-400 text-center">
        Enter rent to simulate
      </div>
    );
  }

  const result = predictRevenue(
    traffic,
    rent,
    size,
    { ...defaults, captureRate: captureRate / 100, avgTicket },
  );

  const currencySymbol = currency === "CZK" ? "Kč" : "€";
  const ticketRange = currency === "CZK" ? { min: 80, max: 200, step: 5 } : { min: 3, max: 10, step: 0.5 };

  return (
    <div className="px-3 pb-3 pt-1 space-y-3" onClick={(e) => e.stopPropagation()}>
      <div className="space-y-2">
        <label className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Daily traffic</span>
          <span className="font-medium text-zinc-700">{traffic.toLocaleString("en-US")}</span>
        </label>
        <Slider
          value={[traffic]}
          onValueChange={([v]) => setTraffic(v)}
          min={500} max={20000} step={500}
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Capture rate</span>
          <span className="font-medium text-zinc-700">{captureRate.toFixed(1)}%</span>
        </label>
        <Slider
          value={[captureRate]}
          onValueChange={([v]) => setCaptureRate(v)}
          min={0.5} max={5} step={0.25}
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Avg ticket</span>
          <span className="font-medium text-zinc-700">{currencySymbol}{avgTicket.toFixed(currency === "CZK" ? 0 : 1)}</span>
        </label>
        <Slider
          value={[avgTicket]}
          onValueChange={([v]) => setAvgTicket(v)}
          min={ticketRange.min} max={ticketRange.max} step={ticketRange.step}
        />
      </div>

      {result && (
        <div className="flex items-center gap-3 pt-1 border-t border-zinc-100">
          <div className="flex-1">
            <p className="text-[10px] text-zinc-400">Monthly EBITDA</p>
            <p className={`text-sm font-bold ${result.monthlyEbitda >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {currencySymbol}{Math.abs(result.monthlyEbitda).toLocaleString("en-US")}
              {result.monthlyEbitda < 0 && " loss"}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-zinc-400">Payback</p>
            <p className="text-sm font-bold text-zinc-900">
              {result.paybackMonths ? `~${result.paybackMonths}mo` : "N/A"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
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
  const [subMenu, setSubMenu] = useState<"addToList" | "assign" | "reject" | null>(null);
  const [newListName, setNewListName] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const { lists, toggleInList, isPlaceInList, createList } = useListsContext();
  const { createTrip, updateTrip } = useScoutingTrips();
  const { showToast } = useToast();
  const { canAccessDashboard } = useUserProfiles();
  const { teams } = useTeamsContext();
  const {
    getAssignment,
    users: assignableUsers,
    assignProperty,
    preRejectProperty,
    removeAssignment,
  } = usePropertyAssignmentContext();
  const assignment = getAssignment(property.placeId);
  const franchisees = assignableUsers.filter((u) => u.role === "franchisee");

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

  // Shared metadata for activity log entries (mirrors EnhancedMapContainer's
  // property popup, which exposes the same assign/reject actions on the map).
  const propertyMeta = {
    placeName: property.name || property.address,
    placeAddress: property.address,
    placeId: property.placeId,
    lat: property.latitude,
    lon: property.longitude,
  };

  const handleAssign = async (userId: string) => {
    try {
      await assignProperty(property.placeId, userId);
      const user = assignableUsers.find((u) => u.id === userId);
      showToast(`Assigned to ${user?.display_name || user?.email || "user"}`);
      logActivity("assigned_property", {
        ...propertyMeta,
        assigned_to: userId,
        assigneeName: user?.display_name || user?.email || null,
      });
    } catch {
      showToast("Failed to assign", "error");
    }
    setSubMenu(null);
    setOpen(false);
  };

  const handleAssignToTeam = async (teamId: string) => {
    try {
      await assignProperty(property.placeId, null, { teamId });
      const team = teams.find((t) => t.id === teamId);
      showToast(`Assigned to ${team?.name || "team"}`);
      logActivity("assigned_property", {
        ...propertyMeta,
        team_id: teamId,
        teamName: team?.name || null,
      });
      notifyTeam({
        teamId,
        kind: "assigned",
        placeName: property.name || property.address,
        placeAddress: property.address,
      });
    } catch {
      showToast("Failed to assign to team", "error");
    }
    setSubMenu(null);
    setOpen(false);
  };

  const handlePreReject = async () => {
    if (!rejectReason.trim()) {
      showToast("Enter a reason", "error");
      return;
    }
    try {
      await preRejectProperty(property.placeId, rejectReason.trim());
      showToast("Pre-rejected");
      logActivity("pre_rejected_property", {
        ...propertyMeta,
        rejectionReason: rejectReason.trim(),
      });
    } catch {
      showToast("Failed to pre-reject", "error");
    }
    setRejectReason("");
    setSubMenu(null);
    setOpen(false);
  };

  const handleRemoveAssignment = async () => {
    try {
      await removeAssignment(property.placeId);
      showToast("Assignment removed");
      logActivity("removed_assignment", propertyMeta);
    } catch {
      showToast("Failed to remove", "error");
    }
    setOpen(false);
  };

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); setSubMenu(null); }}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
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
          {canAccessDashboard && (
            <>
              <button className="actions-item" onClick={(e) => { e.stopPropagation(); setSubMenu("assign"); }}>
                <UserPlus size={14} />
                <span>Assign to...</span>
              </button>
              <button className="actions-item actions-danger" onClick={(e) => { e.stopPropagation(); setSubMenu("reject"); }}>
                <Ban size={14} />
                <span>Pre-reject</span>
              </button>
              {assignment && (
                <button className="actions-item actions-danger" onClick={(e) => { e.stopPropagation(); handleRemoveAssignment(); }}>
                  <Trash2 size={14} />
                  <span>{assignment.status === "pre_rejected" ? "Undo pre-reject" : "Remove assignment"}</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
      {open && subMenu === "assign" && (
        <div className="actions-dropdown" style={{ right: 0, left: "auto", bottom: "auto", top: "100%", marginTop: 4, marginBottom: 0, zIndex: 50, maxHeight: "300px", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div className="actions-header">
            <button className="actions-back" onClick={() => setSubMenu(null)}>&larr;</button>
            Assign to
          </div>
          {teams.length > 0 && (
            <>
              <div style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "#71717a", textTransform: "uppercase" }}>Teams</div>
              {teams.map((t) => (
                <button key={t.id} className="actions-item" onClick={() => handleAssignToTeam(t.id)}>
                  <span>{t.name}</span>
                  <span style={{ fontSize: "11px", color: "#a1a1aa", marginLeft: "auto" }}>{t.team_members.length} members</span>
                </button>
              ))}
              <div style={{ padding: "4px 12px", fontSize: "11px", fontWeight: 600, color: "#71717a", textTransform: "uppercase" }}>People</div>
            </>
          )}
          {franchisees.length === 0 && teams.length === 0 && (
            <div className="actions-empty">No franchisees or teams found</div>
          )}
          {franchisees.map((u) => (
            <button key={u.id} className="actions-item" onClick={() => handleAssign(u.id)}>
              <span>{u.display_name || u.email || u.id.slice(0, 8)}</span>
            </button>
          ))}
        </div>
      )}
      {open && subMenu === "reject" && (
        <div className="actions-dropdown" style={{ right: 0, left: "auto", bottom: "auto", top: "100%", marginTop: 4, marginBottom: 0, zIndex: 50 }} onClick={(e) => e.stopPropagation()}>
          <div className="actions-header">
            <button className="actions-back" onClick={() => setSubMenu(null)}>&larr;</button>
            Pre-reject
          </div>
          <div style={{ padding: "8px 12px" }}>
            <input
              type="text"
              placeholder="Reason for rejection"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handlePreReject(); }}
              className="actions-input"
              autoFocus
            />
            <button
              className="actions-submit"
              onClick={handlePreReject}
              disabled={!rejectReason.trim()}
            >
              Confirm
            </button>
          </div>
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
  isExpanded,
  onToggleExpand,
}: {
  property: InboxProperty;
  onMarkRead: (id: string) => void;
  onNavigate: (property: InboxProperty) => void;
  cityId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rentLabel = property.price
    ? `${formatPrice(property.price, property.source)}/mo`
    : null;
  const transferLabel = property.transfer
    ? `${formatPrice(property.transfer, property.source)} transfer`
    : null;

  useEffect(() => {
    if (isExpanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isExpanded]);

  // Tier drives three ambient signals (left border, badge fill, asymmetric
  // tint for the top tier only) so 15-20 stacked cards sort by eye before
  // you've read a single word. Unscored listings get no accent at all,
  // distinct from the "moderate" gray tier.
  const tier = property.aiScore != null ? scoreTier(property.aiScore) : null;
  const isPrime = tier === "prime";

  return (
    <div
      ref={cardRef}
      className={`cursor-pointer transition-colors relative rounded-xl border overflow-hidden ${
        isPrime
          ? "bg-green-50/50 border-green-200/60 hover:bg-green-50/80"
          : "border-zinc-200/60 hover:bg-zinc-50/80 active:bg-zinc-100/80"
      }`}
      style={tier ? { borderLeftWidth: 4, borderLeftColor: scoreColor(property.aiScore!) } : undefined}
      onClick={onToggleExpand}
    >
      {/* Top: photo + info + score badge */}
      <div className="flex gap-3.5 p-4 pb-0">
        {property.image_url && (
          <img
            src={property.image_url}
            alt=""
            className="w-[72px] h-[72px] rounded-xl object-cover shrink-0"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <button
              className="text-[13px] font-semibold text-zinc-900 leading-snug line-clamp-2 text-left hover:underline"
              onClick={(e) => { e.stopPropagation(); onNavigate(property); }}
            >
              {dedupTitle(property.name || property.address)}
            </button>
            {property.aiScore != null && (
              <span
                className="shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-white font-extrabold text-lg leading-none"
                style={{ backgroundColor: scoreColor(property.aiScore) }}
                title={SCORE_TIER_LABELS[scoreTier(property.aiScore)]}
              >
                {property.aiScore}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1 truncate">
            {property.district}
            {property.size ? ` · ${property.size} m²` : ""}
            {` · ${formatAge(property.createdAt)}`}
          </p>
          {property.aiReason && (
            <p className="text-[13px] text-zinc-700 mt-1.5 leading-snug line-clamp-2">
              {property.aiReason}
            </p>
          )}
        </div>
      </div>
      {/* Bottom: price left, actions right */}
      <div className="flex items-center justify-between px-4 py-3 mt-1">
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
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(property); }}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-zinc-100 transition-colors"
            title="View on map"
          >
            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          <ActionsDropdown property={property} cityId={cityId} onActioned={onMarkRead} />
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead(property.id); }}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-zinc-100 transition-colors"
            title="Mark as read"
          >
            <Check className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        </div>
      </div>
      {/* Expandable: revenue simulator */}
      {isExpanded && (
        <div className="border-t border-zinc-100">
          <RevenueSimulator property={property} />
        </div>
      )}
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
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [navigatedAway, setNavigatedAway] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showLowScoring, setShowLowScoring] = useState(false);

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

  const { topProperties, restProperties } = useMemo(() => {
    const sorted = sortProperties(properties, sortKey);
    if (sortKey !== "score") {
      return { topProperties: sorted, restProperties: [] };
    }
    const top: InboxProperty[] = [];
    const rest: InboxProperty[] = [];
    for (const p of sorted) {
      if (p.aiScore != null && p.aiScore < AI_SCORE_THRESHOLD) {
        rest.push(p);
      } else {
        top.push(p);
      }
    }
    return { topProperties: top, restProperties: rest };
  }, [properties, sortKey]);

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
              // The map popup (PropertyData) reads `title`, but the inbox uses
              // `name`. Map it across so the popup heading isn't blank, and tag
              // the type the popup expects.
              data: { ...property, title: property.name, type: "property" },
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
          <h2 className="font-heading text-lg font-semibold text-zinc-900">
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
        {!loading && properties.length > 0 && (
          <div className="flex items-center justify-between px-4 pb-2 shrink-0">
            <span className="text-xs text-zinc-400">
              {topProperties.length}{" "}
              {topProperties.length === 1 ? "property" : "properties"}
              {restProperties.length > 0 && !showLowScoring && (
                <span className="text-zinc-300"> + {restProperties.length} more</span>
              )}
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
          ) : properties.length === 0 ? (
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
              {topProperties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onMarkRead={handleMarkRead}
                  onNavigate={handleNavigate}
                  cityId={cityId}
                  isExpanded={expandedId === property.id}
                  onToggleExpand={() => setExpandedId(expandedId === property.id ? null : property.id)}
                />
              ))}
              {restProperties.length > 0 && !showLowScoring && (
                <button
                  onClick={() => setShowLowScoring(true)}
                  className="w-full py-3 text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center justify-center gap-1"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show {restProperties.length} more
                </button>
              )}
              {showLowScoring && restProperties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onMarkRead={handleMarkRead}
                  onNavigate={handleNavigate}
                  cityId={cityId}
                  isExpanded={expandedId === property.id}
                  onToggleExpand={() => setExpandedId(expandedId === property.id ? null : property.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
