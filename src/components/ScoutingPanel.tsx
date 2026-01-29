"use client";

import React, { useState } from "react";
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
import { useSheetState } from "@/contexts/SheetContext";
import { MobilePanel } from "@/components/ui/mobile-panel";
import { useMobile } from "@/hooks/useMobile";
import { Button } from "@/components/ui/button";
import type { ScoutingTrip } from "@/types/scouting";
import { statusLabels, statusColors } from "@/types/scouting";

// Props for the panel
interface ScoutingPanelProps {
  cityId?: string;
  onCreateNew?: () => void;
  onUpload?: () => void;
  onSelectTrip?: (trip: ScoutingTrip) => void;
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

// Trip card component
function TripCard({
  trip,
  onClick,
}: {
  trip: ScoutingTrip;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 hover:bg-white/30 transition-colors border-b border-white/10 last:border-0"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          {trip.tripType === 'upload' ? (
            <FileText className="w-4 h-4 text-zinc-500" />
          ) : (
            <MapPin className="w-4 h-4 text-zinc-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-zinc-900 truncate">
              {trip.name || 'Untitled Trip'}
            </span>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0",
              statusColors[trip.status]
            )}>
              {statusLabels[trip.status]}
            </span>
          </div>

          {/* Address or linked items */}
          <div className="text-xs text-zinc-500 truncate mt-0.5">
            {trip.address || (trip.linkedItems.length > 0
              ? `${trip.linkedItems.length} linked location${trip.linkedItems.length > 1 ? 's' : ''}`
              : 'No location')}
          </div>

          {/* Meta info */}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
            <Clock className="w-3 h-3" />
            <span>{formatDate(trip.updatedAt)}</span>
            {trip.tripType === 'upload' && (
              <>
                <span className="text-zinc-300">•</span>
                <span>Uploaded</span>
              </>
            )}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-2" />
      </div>
    </button>
  );
}

export function ScoutingPanel({
  cityId = 'madrid',
  onCreateNew,
  onUpload,
  onSelectTrip,
}: ScoutingPanelProps) {
  const { getTrips, getTripCounts, isLoaded } = useScoutingTrips();
  const { isOpen: isExpanded, open, close } = useSheetState("scouting");
  const isMobile = useMobile();

  const trips = getTrips(cityId);
  const counts = getTripCounts(cityId);

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

  // Collapsed button
  const collapsedButton = (
    <button
      onClick={open}
      className="glass w-11 h-11 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-all duration-200 relative"
      title="Scouting Trips"
    >
      <MapPinned className="w-5 h-5 text-zinc-500" />
    </button>
  );

  return (
    <MobilePanel
      isOpen={isExpanded}
      onClose={close}
      desktopPosition={{ top: "136px", right: "24px" }}
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
        <div className="p-4 border-b border-zinc-100">
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

      {/* Status summary */}
        {counts.total > 0 && (
          <div className="px-4 py-2 bg-zinc-50/50 border-b border-white/10 flex gap-3 text-[10px]">
            {counts.draft > 0 && (
              <span className="text-zinc-500">
                <span className="font-medium text-zinc-700">{counts.draft}</span> draft
              </span>
            )}
            {counts.submitted > 0 && (
              <span className="text-blue-500">
                <span className="font-medium">{counts.submitted}</span> submitted
              </span>
            )}
            {counts.approved > 0 && (
              <span className="text-green-500">
                <span className="font-medium">{counts.approved}</span> approved
              </span>
            )}
            {counts.rejected > 0 && (
              <span className="text-red-500">
                <span className="font-medium">{counts.rejected}</span> rejected
              </span>
            )}
          </div>
        )}

        {/* Trips list */}
        <div className="max-h-[350px] overflow-y-auto">
          {!isLoaded ? (
            <div className="p-4 text-center text-zinc-500 text-sm">Loading...</div>
          ) : trips.length === 0 ? (
            <div className="p-6 text-center">
              <Route className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No scouting trips yet</p>
              <p className="text-xs text-zinc-400 mt-1">
                Create a new trip or upload a document
              </p>
            </div>
          ) : (
            trips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                onClick={() => handleSelectTrip(trip)}
              />
            ))
          )}
        </div>
    </MobilePanel>
  );
}
