"use client";

import React, { useMemo, useState } from "react";
import {
  Route,
  Plus,
  Upload,
  ChevronRight,
  FileText,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useCityScoutedTrips } from "@/hooks/useCityScoutedTrips";
import { useSheetState } from "@/contexts/SheetContext";
import { MobilePanel, MobilePanelHeader, PanelEmpty } from "@/components/ui/mobile-panel";
import { SegmentedFilterRow } from "@/components/ui/segmented-filter";
import { goToPlace } from "@/lib/go-to-place";
import type { ScoutingTrip, ScoutingTripStatus } from "@/types/scouting";
import { statusLabels, statusColors } from "@/types/scouting";
import { LoadingOrb } from "@/components/LoadingOrb";

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
      type="button"
      onClick={onClick}
      disabled={!row.canOpen}
      className={cn("mt-row is-top", row.canOpen ? "is-link" : "cursor-default")}
    >
      <span className="mt-tile" aria-hidden>
        {row.isUpload ? <FileText /> : <MapPin />}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="mt-t1 truncate">{row.title}</span>
          <span
            className={cn(
              "inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold flex-shrink-0",
              statusColors[row.status]
            )}
          >
            {statusLabels[row.status]}
          </span>
        </div>
        {row.reasonText && (
          <p className={cn(
            "text-[12.5px] mt-1 leading-snug",
            row.status === 'rejected' ? 'text-red-600' : 'text-amber-700'
          )}>
            {row.reasonText}
          </p>
        )}

        {/* Address or property name */}
        {row.subtitle && <div className="mt-t2 truncate">{row.subtitle}</div>}

        {/* Meta info */}
        {(row.date || row.authorName || row.isUpload) && (
          <div className="mt-t2 flex items-center gap-1.5">
            {[row.date, row.authorName, row.isUpload ? "Uploaded" : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
      </div>

      {/* Arrow. Absent when there is nowhere to go, so a dead row never
          looks tappable. */}
      {row.canOpen && (
        <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0 self-center" aria-hidden />
      )}
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
  const { isOpen: isExpanded, close } = useSheetState("scouting");
  const [scope, setScope] = useState<ScopeTab>("mine");

  const trips = getTrips(cityId);
  const counts = getTripCounts(cityId);

  // Fetched only for someone who approves here, and only while the panel is
  // open: the switch shows only when the city actually has trips, so it has
  // to know first. isExpanded matters: this component is mounted for the
  // whole session and only its sheet closes, so without it the 60s poll
  // would run for the rest of the session.
  const {
    trips: cityTrips,
    isLoaded: cityLoaded,
    canSee: canSeeCity,
  } = useCityScoutedTrips(cityId, isExpanded && canSeeAll);

  // No switch when "All in city" would show nothing: two empty tabs are
  // noise. Losing the switch (a city switch, a role change, an empty city)
  // must not strand the panel on a tab that is no longer on screen.
  const showScope = canSeeAll && cityLoaded && canSeeCity && cityTrips.length > 0;
  const activeScope: ScopeTab = showScope ? scope : "mine";
  const showingAll = activeScope === "all";

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
    goToPlace({ placeId: trip.placeId, lat: trip.lat, lon: trip.lon });
  };

  const handleRowClick = (rowId: string) => {
    if (showingAll) {
      handleSelectForeignTrip(rowId);
      return;
    }
    const trip = trips.find((t) => t.id === rowId);
    if (trip) handleSelectTrip(trip);
  };

  return (
    <MobilePanel
      isOpen={isExpanded}
      onClose={close}
      title="Scouting trips"
      snapPoint="partial"
    >
      <MobilePanelHeader title="Scouting trips" onClose={close} />

      <div className="flex flex-none gap-2 px-4 pb-4">
        <button type="button" onClick={handleCreateNew} className="mt-btn mt-btn-dark flex-1">
          <Plus aria-hidden />
          Create new
        </button>
        <button type="button" onClick={handleUpload} className="mt-btn mt-btn-grey flex-1">
          <Upload aria-hidden />
          Upload
        </button>
      </div>

      {/* Scope switch. Hidden, not greyed out, for anyone who does not approve
          in this city, and while the city has no trips at all. */}
      {showScope && (
        <div className="flex-none px-4 pb-4">
          <SegmentedFilterRow<ScopeTab>
            label="Scouting trips to show"
            hideLabel
            options={SCOPE_OPTIONS}
            value={activeScope}
            onChange={setScope}
          />
        </div>
      )}

      {/* Status summary */}
      {shownCounts.total > 0 && (
        <div className="flex flex-none flex-wrap gap-x-3 gap-y-1 px-4 pb-3 text-[12px] text-zinc-500">
          {shownCounts.draft > 0 && (
            <span><span className="font-semibold text-zinc-800">{shownCounts.draft}</span> draft</span>
          )}
          {shownCounts.submitted > 0 && (
            <span className="text-blue-700"><span className="font-semibold">{shownCounts.submitted}</span> submitted</span>
          )}
          {shownCounts.approved > 0 && (
            <span className="text-green-700"><span className="font-semibold">{shownCounts.approved}</span> approved</span>
          )}
          {shownCounts.rejected > 0 && (
            <span className="text-red-600"><span className="font-semibold">{shownCounts.rejected}</span> rejected</span>
          )}
          {shownCounts.returned > 0 && (
            <span className="text-amber-700"><span className="font-semibold">{shownCounts.returned}</span> returned</span>
          )}
        </div>
      )}

      {/* Trips list. "All in city" makes this much longer: on desktop it
          scrolls inside the panel, on phones the sheet scrolls. */}
      <div className="mt-body">
        {!listLoaded ? (
          <div className="p-4 flex justify-center"><LoadingOrb label="Loading scouting trips" /></div>
        ) : rows.length === 0 ? (
          <PanelEmpty
            icon={Route}
            title={emptyMessage}
            hint={showCreateHint ? "Create a new trip or upload a document" : undefined}
          />
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
