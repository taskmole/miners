"use client";

import React, { useMemo, useState } from "react";
import {
  Route,
  Plus,
  Upload,
  ChevronRight,
  FileText,
  MapPin,
  MapPinned,
  Clock,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useCityScoutedTrips } from "@/hooks/useCityScoutedTrips";
import { useSheetState } from "@/contexts/SheetContext";
import { MobilePanel } from "@/components/ui/mobile-panel";
import { SegmentedFilterRow } from "@/components/ui/segmented-filter";
import { useMobile } from "@/hooks/useMobile";
import { Button } from "@/components/ui/button";
import { navigateAndOpenPopup } from "@/components/ListsPanel";
import type { ScoutingTrip, ScoutingTripStatus } from "@/types/scouting";
import { statusLabels, statusColors } from "@/types/scouting";

// Props for the panel
interface ScoutingPanelProps {
  cityId?: string;
  onCreateNew?: () => void;
  onUpload?: () => void;
  onSelectTrip?: (trip: ScoutingTrip) => void;
  /**
   * True only for someone who approves in the selected city. Passed down
   * rather than looked up here, because every useUserProfiles() instance
   * fires two uncached requests and there are already plenty.
   */
  canSeeAll?: boolean;
}

type ScopeTab = "mine" | "all";

/**
 * What a row needs to draw itself, whichever list it came from.
 *
 * Foreign trips arrive as a thin server row with no checklist, no financials
 * and no property object. They are deliberately NOT reshaped into a
 * ScoutingTrip: the rest of the app would then be free to trust fields that
 * were never fetched.
 */
interface TripRow {
  id: string;
  title: string;
  subtitle: string;
  status: ScoutingTripStatus;
  /** Pre-formatted, because the two sources carry different date fields. */
  date: string | null;
  authorName: string | null;
  isUpload: boolean;
  reasonText?: string;
  /** False for a foreign trip with no linked place: nothing to jump to. */
  canOpen: boolean;
}

// Format date for display
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// The reviewer's note on a trip that came back, if it came back at all.
function reasonFor(trip: ScoutingTrip): string | undefined {
  switch (trip.status) {
    case 'rejected':
      return trip.rejectionNotes;
    case 'returned':
      return trip.returnNotes;
    default:
      return undefined;
  }
}

// Trip card component
function TripCard({
  row,
  onClick,
}: {
  row: TripRow;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!row.canOpen}
      className={cn(
        "w-full text-left px-4 py-3 transition-colors border-b border-white/10 last:border-0",
        row.canOpen ? "hover:bg-white/30" : "cursor-default"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          {row.isUpload ? (
            <FileText className="w-4 h-4 text-zinc-500" />
          ) : (
            <MapPin className="w-4 h-4 text-zinc-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-zinc-900 truncate">
              {row.title}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0",
                statusColors[row.status]
              )}
            >
              {statusLabels[row.status]}
            </span>
          </div>
          {row.reasonText && (
            <p className={cn(
              "text-[11px] mt-1 leading-snug",
              row.status === 'rejected' ? 'text-red-600' : 'text-amber-600'
            )}>
              {row.reasonText}
            </p>
          )}

          {/* Address or property name */}
          {row.subtitle && (
            <div className="text-xs text-zinc-500 truncate mt-0.5">
              {row.subtitle}
            </div>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
            {row.date && (
              <>
                <Clock className="w-3 h-3" />
                <span>{row.date}</span>
              </>
            )}
            {row.authorName && (
              <>
                {row.date && <span className="text-zinc-300">•</span>}
                <span className="truncate">{row.authorName}</span>
              </>
            )}
            {row.isUpload && (
              <>
                <span className="text-zinc-300">•</span>
                <span>Uploaded</span>
              </>
            )}
          </div>
        </div>

        {/* Arrow. Absent when there is nowhere to go, so a dead row never
            looks tappable. */}
        {row.canOpen && (
          <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-2" />
        )}
      </div>
    </button>
  );
}

const SCOPE_OPTIONS: { value: ScopeTab; label: string }[] = [
  { value: "mine", label: "Mine & team" },
  { value: "all", label: "All in city" },
];

export function ScoutingPanel({
  cityId = 'madrid',
  onCreateNew,
  onUpload,
  onSelectTrip,
  canSeeAll = false,
}: ScoutingPanelProps) {
  const { getTrips, getTripCounts, isLoaded } = useScoutingTrips();
  const { isOpen: isExpanded, open, close } = useSheetState("scouting");
  const isMobile = useMobile();
  const [scope, setScope] = useState<ScopeTab>("mine");

  // Losing the permission (a city switch, a role change) must not strand the
  // panel on a tab whose switch is no longer on screen.
  const activeScope: ScopeTab = canSeeAll ? scope : "mine";
  const showingAll = activeScope === "all";

  const trips = getTrips(cityId);
  const counts = getTripCounts(cityId);

  // Only fetched while the panel is open AND the "All in city" tab is showing,
  // so nobody pays for it by default. isExpanded matters: this component is
  // mounted for the whole session and only its sheet closes, so without it one
  // tap on "All in city" left a 60s poll running for the rest of the session.
  const {
    trips: cityTrips,
    isLoaded: cityLoaded,
    canSee: canSeeCity,
  } = useCityScoutedTrips(cityId, isExpanded && showingAll);

  const ownRows: TripRow[] = useMemo(
    () =>
      trips.map((trip) => ({
        id: trip.id,
        title: trip.name || 'Untitled Trip',
        subtitle: trip.address || trip.property?.name || 'No location',
        status: trip.status,
        date: formatDate(trip.updatedAt),
        authorName: null,
        isUpload: trip.tripType === 'upload',
        canOpen: true,
        reasonText: reasonFor(trip),
      })),
    [trips],
  );

  const allRows: TripRow[] = useMemo(
    () =>
      cityTrips.map((trip) => ({
        id: trip.id,
        title: trip.placeName || 'Untitled Trip',
        subtitle: trip.placeName ? '' : 'No location',
        status: (trip.status as ScoutingTripStatus) || 'draft',
        date: trip.submittedAt ? formatDate(trip.submittedAt) : null,
        authorName: trip.authorName,
        isUpload: false,
        // A foreign trip is read-only and opens the map, so it needs a place
        // and its coordinates to go anywhere.
        canOpen: !!trip.placeId && trip.lat != null && trip.lon != null,
      })),
    [cityTrips],
  );

  const rows = showingAll ? allRows : ownRows;
  const listLoaded = showingAll ? cityLoaded : isLoaded;

  // "You may not see this" and "nothing here" must not read as the same thing,
  // even though the switch is hidden from anyone who cannot look. The create
  // hint only makes sense in the two cases where there really is nothing yet.
  let emptyMessage: string;
  if (!showingAll) {
    emptyMessage = "No scouting trips yet";
  } else if (canSeeCity) {
    emptyMessage = "No scouting trips in this city";
  } else {
    emptyMessage = "You can't see other people's trips in this city";
  }
  const showCreateHint = !showingAll || canSeeCity;

  // The counts strip follows whichever set is on screen.
  const shownCounts = useMemo(() => {
    if (!showingAll) return counts;
    const tally: Record<ScoutingTripStatus, number> = {
      draft: 0, submitted: 0, approved: 0, rejected: 0, returned: 0,
    };
    for (const row of allRows) {
      if (tally[row.status] === undefined) continue;
      tally[row.status] += 1;
    }
    return { total: allRows.length, ...tally };
  }, [showingAll, counts, allRows]);

  // Handle create new click
  const handleCreateNew = () => {
    if (onCreateNew) {
      onCreateNew();
      close();
    }
  };

  // Handle upload click
  const handleUpload = () => {
    if (onUpload) {
      onUpload();
      close();
    }
  };

  // Handle trip selection
  const handleSelectTrip = (trip: ScoutingTrip) => {
    if (onSelectTrip) {
      onSelectTrip(trip);
      close();
    }
  };

  /**
   * Somebody else's trip is read-only: it is not in ScoutingTripsContext, so
   * the trip editor has nothing to open. Jump the map to the property instead.
   * The reviewer who wants the full pitch still has the admin Pitches tab.
   */
  const handleSelectForeignTrip = (tripId: string) => {
    const trip = cityTrips.find((t) => t.id === tripId);
    if (!trip || !trip.placeId || trip.lat == null || trip.lon == null) return;
    close();
    navigateAndOpenPopup(trip.lat, trip.lon, trip.placeId, "property");
  };

  const handleRowClick = (rowId: string) => {
    if (showingAll) {
      handleSelectForeignTrip(rowId);
      return;
    }
    const trip = trips.find((t) => t.id === rowId);
    if (trip) handleSelectTrip(trip);
  };

  // Collapsed button
  const collapsedButton = (
    <button
      onClick={open}
      className="glass w-9 h-9 rounded-lg border border-white/40 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-all duration-200 relative"
      title="Scouting Trips"
    >
      <MapPinned className="w-[18px] h-[18px] text-zinc-500" />
    </button>
  );

  return (
    <MobilePanel
      isOpen={isExpanded}
      onClose={close}
      desktopPosition={{ top: "112px", right: "24px" }}
      title="Scouting Trips"
      collapsedButton={collapsedButton}
      snapPoint="partial"
    >
      {/* Header - only on desktop */}
      {!isMobile && (
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-zinc-900">Scouting Trips</span>
            <button
              onClick={close}
              className="w-7 h-7 rounded-md text-zinc-400 flex items-center justify-center hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Desktop action buttons in header */}
          <div className="flex gap-2">
            <Button
              onClick={handleCreateNew}
              className="flex-1 h-9 text-xs gap-1.5"
              size="sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Create New
            </Button>
            <Button
              onClick={handleUpload}
              variant="outline"
              className="flex-1 h-9 text-xs gap-1.5"
              size="sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </Button>
          </div>
        </div>
      )}

      {/* Mobile action buttons */}
      {isMobile && (
        <div className="p-4">
          <div className="flex gap-2">
            <Button
              onClick={handleCreateNew}
              className="flex-1 h-11 text-sm gap-2"
            >
              <Plus className="w-4 h-4" />
              Create New
            </Button>
            <Button
              onClick={handleUpload}
              variant="outline"
              className="flex-1 h-11 text-sm gap-2"
            >
              <Upload className="w-4 h-4" />
              Upload
            </Button>
          </div>
        </div>
      )}

      {/* Scope switch. Hidden, not greyed out, for anyone who does not approve
          in this city, so their panel looks exactly as it does today. */}
      {canSeeAll && (
        <div className="px-4 pb-3">
          <SegmentedFilterRow<ScopeTab>
            label="Showing"
            options={SCOPE_OPTIONS}
            value={activeScope}
            onChange={setScope}
          />
        </div>
      )}

      {/* Status summary */}
      {shownCounts.total > 0 && (
        <div className="px-4 py-2 bg-zinc-50/50 border-b border-white/10 flex gap-3 text-[10px]">
          {shownCounts.draft > 0 && (
            <span className="text-zinc-500">
              <span className="font-medium text-zinc-700">{shownCounts.draft}</span> draft
            </span>
          )}
          {shownCounts.submitted > 0 && (
            <span className="text-blue-500">
              <span className="font-medium">{shownCounts.submitted}</span> submitted
            </span>
          )}
          {shownCounts.approved > 0 && (
            <span className="text-green-500">
              <span className="font-medium">{shownCounts.approved}</span> approved
            </span>
          )}
          {shownCounts.rejected > 0 && (
            <span className="text-red-500">
              <span className="font-medium">{shownCounts.rejected}</span> rejected
            </span>
          )}
          {shownCounts.returned > 0 && (
            <span className="text-amber-500">
              <span className="font-medium">{shownCounts.returned}</span> returned
            </span>
          )}
        </div>
      )}

      {/* Trips list. "All in city" makes this much longer, so on mobile it
          grows with the sheet instead of floating in a 350px box. */}
      <div className={cn("overflow-y-auto", isMobile ? "flex-1" : "max-h-[350px]")}>
        {!listLoaded ? (
          <div className="p-4 text-center text-zinc-500 text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center">
            <Route className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">{emptyMessage}</p>
            {showCreateHint && (
              <p className="text-xs text-zinc-400 mt-1">
                Create a new trip or upload a document
              </p>
            )}
          </div>
        ) : (
          rows.map(row => (
            <TripCard
              key={row.id}
              row={row}
              onClick={() => handleRowClick(row.id)}
            />
          ))
        )}
      </div>
    </MobilePanel>
  );
}
