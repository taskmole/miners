"use client";

import React, { useEffect } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useSheetState } from "@/contexts/SheetContext";
import { useMobile } from "@/hooks/useMobile";

// POI types - imported from existing types
import type { CafeData, PropertyData, OtherPoiData } from "@/types/data";

interface POIBottomSheetProps {
  // The type of POI being displayed
  type: "cafe" | "property" | "other";
  // The POI data (one of the three types)
  cafe?: CafeData | null;
  property?: PropertyData | null;
  poi?: OtherPoiData | null;
  // Coordinates for map panning
  coordinates?: [number, number] | null;
  // Called when the sheet is closed
  onClose: () => void;
  // The popup content component to render
  children: React.ReactNode;
}

// Generate a unique sheet ID for each POI
function getPOISheetId(
  type: string,
  coordinates?: [number, number] | null
): string {
  if (!coordinates) return `poi-${type}`;
  return `poi-${type}-${coordinates[0].toFixed(4)}-${coordinates[1].toFixed(4)}`;
}

export function POIBottomSheet({
  type,
  cafe,
  property,
  poi,
  coordinates,
  onClose,
  children,
}: POIBottomSheetProps) {
  const isMobile = useMobile();
  const sheetId = getPOISheetId(type, coordinates);
  const { openSheet, closeSheet, isSheetOpen } = useSheetState(sheetId);

  // Determine if we have valid POI data
  const hasData = cafe || property || poi;
  const isOpen = hasData && isSheetOpen;

  // Open the sheet when POI data is set
  useEffect(() => {
    if (hasData && isMobile) {
      openSheet(sheetId);
    }
  }, [hasData, isMobile, sheetId, openSheet]);

  // Handle close
  const handleClose = () => {
    closeSheet();
    onClose();
  };

  // On desktop, don't render (use MapPopup instead)
  if (!isMobile) {
    return null;
  }

  // Get title based on POI type
  const getTitle = () => {
    if (cafe) return cafe.name || "Cafe";
    if (property) return property.title || "Property";
    if (poi) return poi.name || "Location";
    return "Details";
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={getTitle()}
      snapPoint="partial"
    >
      {/* POI content - same as popup but in bottom sheet */}
      <div className="poi-bottom-sheet-content">
        {children}
      </div>
    </BottomSheet>
  );
}

// Hook to manage POI selection for bottom sheet
export function usePOIBottomSheet() {
  const isMobile = useMobile();
  const { closeSheet } = useSheetState("poi");

  // Pan map to show POI at top when on mobile
  const panMapForPOI = (
    map: maplibregl.Map | null,
    coordinates: [number, number]
  ) => {
    if (!map || !isMobile) return;

    // Get the map container height
    const container = map.getContainer();
    const height = container.clientHeight;

    // We want the POI to be in the top 30% of the visible area
    // The bottom sheet takes about 65% of the screen
    // So we need to offset the center point
    const offsetY = height * 0.25; // Offset to put POI in top portion

    map.easeTo({
      center: coordinates,
      offset: [0, -offsetY],
      duration: 300,
    });
  };

  return {
    isMobile,
    panMapForPOI,
    closeSheet,
  };
}
