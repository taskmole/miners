"use client";

import React, { useMemo, useState, useEffect } from "react";
// maplibre-gl 6 dropped its default export, so import the namespace instead.
import * as MapLibreGL from "maplibre-gl";
import {
    Map,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    MapPopup,
    MapClusterLayer,
    useMap,
} from "@/components/ui/map";
import { safeMapCleanup } from "@/lib/safe-map-cleanup";
import { MapDraw } from "@/components/ui/map-draw";
import { DrawToolbar } from "@/components/DrawToolbar";
import { ShapeComments } from "@/components/ShapeComments";
import { ShapeHoverTooltip } from "@/components/ShapeHoverTooltip";
import { DrawingIndicator } from "@/components/DrawingIndicator";
import { MapStyleSwitcher } from "@/components/MapStyleSwitcher";
import { generatePlaceId, generatePropertyPlaceId, parseCoordinatesFromPlaceId } from "@/lib/place-id";
import { evaluatePropertyActions } from "@/lib/property-actions";
import type { PendingFocus } from "@/lib/go-to-place";
import { useToast } from "@/contexts/ToastContext";
import { useLinking } from "@/contexts/LinkingContext";
import type { City } from "@/components/CitySelector";
import { useHiddenPoisContext } from "@/contexts/HiddenPoisContext";
import { usePitchStatusContext } from "@/contexts/PitchStatusContext";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { usePropertyRequests } from "@/hooks/usePropertyRequests";
import type { EuctFilter, PropertyPostedFilter, PropertyTransferFilter, PropertyPriceChangeFilter, PropertyPitchStatusFilter } from "@/types/filters";
import { TrafficValueCard } from "@/components/TrafficValueCard";
import { isRecentlyAdded, isNewPoi } from "@/lib/dateUtils";
import { useMapData, CafeData, PropertyData, OtherPoiData, LocationData, hasChangedPrice } from "@/hooks/useMapData";
import { useCafeProfiles, CafeProfile } from "@/hooks/useCafeProfiles";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { useOverlayData } from "@/hooks/useOverlayData";
import { useWalkingRadius } from "@/contexts/WalkingRadiusContext";
import { DisambiguationPopup } from "@/components/DisambiguationPopup";
import { useMobile } from "@/hooks/useMobile";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useSheetState } from "@/contexts/SheetContext";
import { getAuthToken } from "@/lib/api-client";
import {
    Coffee,
    Building2,
    Train,
    TrainFront,
    ShoppingBag,
    Users,
    GraduationCap,
    Home,
    Star,
    Snowflake,
    Sparkles,
    X,
    Dumbbell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ListingCard } from "@/components/poi-card/ListingCard";
import { CafeCard, PlaceCard } from "@/components/poi-card/PlaceCards";
import { formatCompactNumber } from "@/lib/format-numbers";
import { LoadingOrb } from "@/components/LoadingOrb";

// Context for sharing cafe profile data with popup components
const CafeProfilesContext = React.createContext<{
  profilesByPlaceId: Record<string, CafeProfile>;
  canSeeRevenue: boolean;
}>({ profilesByPlaceId: {}, canSeeRevenue: false });

// Enhanced icon configuration with ring colors
const iconConfig: Record<string, { icon: React.ElementType; color: string; bg: string; ring: string }> = {
    cafe: {
        icon: Coffee,
        color: "text-sky-600",
        bg: "bg-sky-100",
        ring: "ring-sky-300"
    },
    eu_coffee_trip: {
        icon: Coffee,
        color: "text-blue-900",
        bg: "bg-blue-200",
        ring: "ring-blue-400"
    },
    property: {
        icon: Home,
        color: "text-[#78C500]",
        bg: "bg-[#78C500]/20",
        ring: "ring-[#78C500]/50"
    },
    transit: {
        icon: Train,
        color: "text-sky-700",
        bg: "bg-sky-50",
        ring: "ring-sky-300"
    },
    metro: {
        icon: TrainFront,
        color: "text-sky-600",
        bg: "bg-sky-100",
        ring: "ring-sky-200"
    },
    office: {
        icon: Building2,
        color: "text-purple-800",
        bg: "bg-purple-50",
        ring: "ring-purple-300"
    },
    shopping: {
        icon: ShoppingBag,
        color: "text-fuchsia-700",
        bg: "bg-fuchsia-50",
        ring: "ring-fuchsia-300"
    },
    high_street: {
        icon: Users,
        color: "text-orange-700",
        bg: "bg-orange-50",
        ring: "ring-orange-300"
    },
    dorm: {
        icon: GraduationCap,
        color: "text-cyan-700",
        bg: "bg-cyan-50",
        ring: "ring-cyan-300"
    },
    university: {
        icon: GraduationCap,
        color: "text-rose-700",
        bg: "bg-rose-50",
        ring: "ring-rose-300"
    },
    gym: {
        icon: Dumbbell,
        color: "text-red-700",
        bg: "bg-red-50",
        ring: "ring-red-300"
    },
};

// generatePlaceId, generatePropertyPlaceId, parseCoordinatesFromPlaceId imported from @/lib/place-id

function coordsMatch(a: number, b: number, tolerance = 0.0001) {
    return Math.abs(a - b) < tolerance;
}

// Helper function to check if a POI's type filter is currently active
// This matches the visibility logic used in visibleCafes, visibleProperties, visibleOtherPois
function isPoiFilterActive(poi: LocationData, activeFilters: Set<string>, ratingFilter: number, euctFilter: EuctFilter = "all"): boolean {
    if (poi.type === "cafe") {
        const cafe = poi as CafeData;
        const isEuCoffeeTrip = cafe.link?.includes("europeancoffeetrip");
        const categoryMatch = isEuCoffeeTrip
            ? activeFilters.has("eu_coffee_trip") || activeFilters.has("cafe")
            : activeFilters.has("regular_cafe") || activeFilters.has("cafe");
        // Apply EUCT sub-filter (premium/new) only to EUCT cafes
        if (isEuCoffeeTrip && categoryMatch && euctFilter !== "all") {
            if (euctFilter === "premium" && !cafe.premium) return false;
            if (euctFilter === "new" && !isRecentlyAdded(cafe.datePublished)) return false;
        }
        const ratingMatch = ratingFilter === 0 || (cafe.rating !== undefined && cafe.rating >= ratingFilter);
        return categoryMatch && ratingMatch;
    } else if (poi.type === "property") {
        return activeFilters.has("property");
    } else {
        // Other POI types (transit, shopping, high_street, office, dorm, university)
        return activeFilters.has(poi.type);
    }
}

// Layer management helper functions
function getFirstSymbolLayer(map: any): string | undefined {
    const layers = map.getStyle()?.layers;
    if (!layers) return undefined;
    for (const layer of layers) {
        if (layer.type === "symbol") return layer.id;
    }
    return undefined;
}

// Find insertion point AFTER buildings (so population renders on top of them)
function getLayerAfterBuildings(map: any): string | undefined {
    const layers = map.getStyle()?.layers;
    if (!layers) return undefined;

    // Find last building/fill-extrusion layer
    let lastBuildingIndex = -1;
    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (layer.type === "fill-extrusion" || layer.id.includes("building")) {
            lastBuildingIndex = i;
        }
    }

    // Return the layer AFTER buildings (or first symbol if no buildings found)
    if (lastBuildingIndex >= 0 && lastBuildingIndex < layers.length - 1) {
        return layers[lastBuildingIndex + 1].id;
    }
    return getFirstSymbolLayer(map);
}

function addTrafficLayers(map: any, data: any) {
    // Remove first if exists (handles re-add after style change)
    removeTrafficLayers(map);

    map.addSource("traffic-source", {
        type: "geojson",
        data,
    });

    // Insert ABOVE buildings (same as population) so it's visible
    const insertBefore = getLayerAfterBuildings(map);

    map.addLayer({
        id: "traffic-heatmap",
        type: "heatmap",
        source: "traffic-source",
        paint: {
            // Weight based on pedestrian count (avg_count)
            "heatmap-weight": [
                "interpolate", ["linear"],
                ["get", "avg_count"],
                0, 0,
                500, 0.5,
                1500, 1
            ],
            // Intensity increases with zoom (boosted for visibility)
            "heatmap-intensity": [
                "interpolate", ["linear"],
                ["zoom"],
                10, 1.2,
                15, 3
            ],
            // Color ramp: blue → cyan → green → yellow → red
            "heatmap-color": [
                "interpolate", ["linear"],
                ["heatmap-density"],
                0, "rgba(0, 0, 255, 0)",
                0.2, "rgb(0, 200, 255)",
                0.4, "rgb(0, 255, 128)",
                0.6, "rgb(255, 255, 0)",
                0.8, "rgb(255, 128, 0)",
                1, "rgb(255, 0, 0)"
            ],
            // Radius in pixels (increases with zoom)
            "heatmap-radius": [
                "interpolate", ["linear"],
                ["zoom"],
                10, 20,
                15, 40
            ],
            // More visible opacity
            "heatmap-opacity": 0.8
        },
    }, insertBefore);
}

function removeTrafficLayers(map: any) {
    try {
        if (!map || typeof map.getLayer !== 'function') return;
        // Remove heatmap layer
        if (map.getLayer("traffic-heatmap")) {
            map.removeLayer("traffic-heatmap");
        }
        // Backwards compatibility - remove old circle layer if exists
        if (map.getLayer("traffic-circles")) {
            map.off("mouseenter", "traffic-circles");
            map.off("mouseleave", "traffic-circles");
            map.removeLayer("traffic-circles");
        }
        if (map.getSource("traffic-source")) {
            map.removeSource("traffic-source");
        }
    } catch {
        // Map was destroyed during navigation - safe to ignore
    }
}

// Store popup reference for cleanup
let populationPopup: any = null;
let hoveredBarrioId: string | number | null = null;

function addPopulationLayers(map: any, data: any, densityFilter: number = 0) {
    // Remove first if exists (handles re-add after style change)
    removePopulationLayers(map);

    // Add unique IDs to features for hover state
    const dataWithIds = {
        ...data,
        features: data.features.map((f: any, i: number) => ({
            ...f,
            id: i,
        })),
    };

    map.addSource("population-source", {
        type: "geojson",
        data: dataWithIds,
        generateId: false, // We're providing IDs manually on each feature
    });

    // Insert ABOVE buildings so it's visible over them
    const insertBefore = getLayerAfterBuildings(map);

    // Filter expression - only show areas with density >= filter value
    const filterExpression: any = densityFilter > 0
        ? [">=", ["get", "density"], densityFilter]
        : true;

    // Fill layer - clean polygon coloring (darker colors - 50% darker than before)
    map.addLayer({
        id: "population-fill",
        type: "fill",
        source: "population-source",
        filter: filterExpression,
        paint: {
            "fill-color": [
                "interpolate", ["linear"],
                ["get", "density"],
                0, "#d97706",       // amber-600 (was amber-200)
                10000, "#b45309",   // amber-700 (was amber-400)
                20000, "#92400e",   // amber-800 (was amber-500)
                30000, "#78350f",   // amber-900 (was amber-600)
                40000, "#451a03",   // darker brown (was amber-700)
                50000, "#2d1106"    // very dark brown (was amber-800)
            ],
            "fill-opacity": 0.55,
        },
    }, insertBefore);

    // Border layer - neighborhood boundaries (default state)
    map.addLayer({
        id: "population-borders",
        type: "line",
        source: "population-source",
        paint: {
            "line-color": "#374151",
            "line-width": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                3,  // Thick border on hover
                1   // Normal border
            ],
            "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,    // Full opacity on hover
                0.5   // Normal opacity
            ],
        },
    });

    // Create popup for tooltip
    populationPopup = new MapLibreGL.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "population-tooltip",
        offset: 15,
    });

    // Mouse move handler - show tooltip and highlight border
    const handleMouseMove = (e: any) => {
        if (e.features && e.features.length > 0) {
            map.getCanvas().style.cursor = "pointer";

            const feature = e.features[0];
            const featureId = feature.id;
            const name = feature.properties.NOMBRE || "Unknown";
            const density = feature.properties.density || 0;

            // Update hover state - reset previous if exists
            if (hoveredBarrioId !== null && hoveredBarrioId !== undefined) {
                map.setFeatureState(
                    { source: "population-source", id: hoveredBarrioId },
                    { hover: false }
                );
            }

            // Set new hover state if we have a valid ID
            if (featureId !== null && featureId !== undefined) {
                hoveredBarrioId = featureId;
                map.setFeatureState(
                    { source: "population-source", id: featureId },
                    { hover: true }
                );
            }

            // Show tooltip with glass styling
            populationPopup
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="
                        font-family: system-ui, -apple-system, sans-serif;
                        padding: 8px 12px;
                        background: rgba(255, 255, 255, 0.85);
                        backdrop-filter: blur(8px);
                        border-radius: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.6);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    ">
                        <div style="font-weight: 600; font-size: 13px; color: #111;">${name}</div>
                        <div style="font-size: 12px; color: #666; margin-top: 3px;">
                            ${formatCompactNumber(density)}/km²
                        </div>
                    </div>
                `)
                .addTo(map);
        }
    };

    // Mouse leave handler - hide tooltip and reset border
    const handleMouseLeave = () => {
        map.getCanvas().style.cursor = "";

        if (hoveredBarrioId !== null && hoveredBarrioId !== undefined) {
            map.setFeatureState(
                { source: "population-source", id: hoveredBarrioId },
                { hover: false }
            );
        }
        hoveredBarrioId = null;
        populationPopup.remove();
    };

    map.on("mousemove", "population-fill", handleMouseMove);
    map.on("mouseleave", "population-fill", handleMouseLeave);
}

function removePopulationLayers(map: any) {
    try {
        if (!map || typeof map.getLayer !== 'function') return;
        // Remove event handlers
        map.off("mousemove", "population-fill");
        map.off("mouseleave", "population-fill");

        // Remove popup
        if (populationPopup) {
            populationPopup.remove();
            populationPopup = null;
        }
        hoveredBarrioId = null;

        // Remove layers and source
        if (map.getLayer("population-borders")) map.removeLayer("population-borders");
        if (map.getLayer("population-fill")) map.removeLayer("population-fill");
        if (map.getSource("population-source")) map.removeSource("population-source");
    } catch {
        // Map was destroyed during navigation - safe to ignore
    }
}

// Store popup reference for cleanup (income)
let incomePopup: any = null;
let hoveredIncomeId: string | number | null = null;

function addIncomeLayers(map: any, data: any, wealthyFilter: number = 0) {
    // Remove first if exists (handles re-add after style change)
    removeIncomeLayers(map);

    // Add unique IDs to features for hover state
    const dataWithIds = {
        ...data,
        features: data.features.map((f: any, i: number) => ({
            ...f,
            id: i,
        })),
    };

    map.addSource("income-source", {
        type: "geojson",
        data: dataWithIds,
        generateId: false,
    });

    // Insert ABOVE buildings so it's visible over them
    const insertBefore = getLayerAfterBuildings(map);

    // Fill layer - color by average income (cream → amber → red gradient - intuitive: darker = richer)
    // Filter by wealthyPct if filter is set (hide areas below threshold)
    const filterExpression = wealthyFilter > 0
        ? [">=", ["get", "wealthyPct"], wealthyFilter]
        : true;

    map.addLayer({
        id: "income-fill",
        type: "fill",
        source: "income-source",
        filter: filterExpression as any,
        paint: {
            "fill-color": [
                "interpolate", ["linear"],
                ["get", "avgIncome"],
                5000, "#fef3c7",      // amber-100 (lowest income - light cream)
                10000, "#fcd34d",     // amber-300 (low-mid)
                15000, "#f59e0b",     // amber-500 (median ~€15k)
                20000, "#ea580c",     // orange-600 (above median)
                25000, "#dc2626",     // red-600 (high)
                32000, "#7f1d1d"      // red-900 (highest income - dark red)
            ],
            "fill-opacity": 0.55,
        },
    }, insertBefore);

    // Border layer - census section boundaries
    map.addLayer({
        id: "income-borders",
        type: "line",
        source: "income-source",
        filter: filterExpression as any,
        paint: {
            "line-color": "#374151",
            "line-width": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                3,
                0.5  // Thinner default borders (more sections = more lines)
            ],
            "line-opacity": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                1,
                0.3
            ],
        },
    });

    // Create popup for tooltip
    incomePopup = new MapLibreGL.Popup({
        closeButton: false,
        closeOnClick: false,
        className: "income-tooltip",
        offset: 15,
    });

    // Mouse move handler - show tooltip and highlight border
    const handleMouseMove = (e: any) => {
        if (e.features && e.features.length > 0) {
            map.getCanvas().style.cursor = "pointer";

            const feature = e.features[0];
            const featureId = feature.id;
            const municipality = feature.properties.municipality || "Unknown";
            const districtName = feature.properties.districtName;
            const avgIncome = feature.properties.avgIncome || 0;
            const avgHouseholdIncome = feature.properties.avgHouseholdIncome || 0;
            const wealthyPct = feature.properties.wealthyPct;  // Keep null for corrupted data check

            // Use district name for Madrid city, municipality for suburbs
            const areaName = districtName || municipality;

            // Update hover state - reset previous if exists
            if (hoveredIncomeId !== null && hoveredIncomeId !== undefined) {
                map.setFeatureState(
                    { source: "income-source", id: hoveredIncomeId },
                    { hover: false }
                );
            }

            // Set new hover state if we have a valid ID
            if (featureId !== null && featureId !== undefined) {
                hoveredIncomeId = featureId;
                map.setFeatureState(
                    { source: "income-source", id: featureId },
                    { hover: true }
                );
            }

            // Show tooltip with glass styling
            incomePopup
                .setLngLat(e.lngLat)
                .setHTML(`
                    <div style="
                        font-family: system-ui, -apple-system, sans-serif;
                        padding: 8px 12px;
                        background: rgba(255, 255, 255, 0.85);
                        backdrop-filter: blur(8px);
                        border-radius: 8px;
                        border: 1px solid rgba(255, 255, 255, 0.6);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    ">
                        <div style="font-weight: 600; font-size: 13px; color: #111;">${areaName}</div>
                        <div style="font-size: 12px; color: #666; margin-top: 3px;">
                            €${formatCompactNumber(avgIncome)}/person · €${formatCompactNumber(avgHouseholdIncome)}/household
                        </div>
                        <div style="font-size: 11px; color: #888; margin-top: 2px;">
                            ${wealthyPct != null ? `${Math.round(wealthyPct)}% make 2x avg. Spanish salary` : "Data not available"}
                        </div>
                    </div>
                `)
                .addTo(map);
        }
    };

    // Mouse leave handler - hide tooltip and reset border
    const handleMouseLeave = () => {
        map.getCanvas().style.cursor = "";

        if (hoveredIncomeId !== null && hoveredIncomeId !== undefined) {
            map.setFeatureState(
                { source: "income-source", id: hoveredIncomeId },
                { hover: false }
            );
        }
        hoveredIncomeId = null;
        incomePopup.remove();
    };

    map.on("mousemove", "income-fill", handleMouseMove);
    map.on("mouseleave", "income-fill", handleMouseLeave);
}

function removeIncomeLayers(map: any) {
    try {
        if (!map || typeof map.getLayer !== 'function') return;
        // Remove event handlers
        map.off("mousemove", "income-fill");
        map.off("mouseleave", "income-fill");

        // Remove popup
        if (incomePopup) {
            incomePopup.remove();
            incomePopup = null;
        }
        hoveredIncomeId = null;

        // Remove layers and source
        if (map.getLayer("income-borders")) map.removeLayer("income-borders");
        if (map.getLayer("income-fill")) map.removeLayer("income-fill");
        if (map.getSource("income-source")) map.removeSource("income-source");
    } catch {
        // Map was destroyed during navigation - safe to ignore
    }
}

// ===== GRAVITY / LOCATION SCORE LAYER =====
function addGravityLayers(map: any, data: any) {
    // Remove first if exists (handles re-add after style change)
    removeGravityLayers(map);

    map.addSource("gravity-source", {
        type: "geojson",
        data: data,
    });

    // Insert ABOVE buildings so it's visible
    const insertBefore = getLayerAfterBuildings(map);

    // Heatmap layer for location scores
    map.addLayer({
        id: "gravity-heatmap",
        type: "heatmap",
        source: "gravity-source",
        paint: {
            // Weight based on normalizedScore (0-1)
            "heatmap-weight": ["get", "normalizedScore"],
            // Intensity increases with zoom
            "heatmap-intensity": [
                "interpolate", ["linear"], ["zoom"],
                10, 0.5,
                14, 1.5,
            ],
            // Color ramp: blue (low) -> green -> yellow -> red (high)
            "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0, 0, 255, 0)",
                0.1, "rgba(65, 105, 225, 0.4)",   // royalblue
                0.3, "rgba(50, 205, 50, 0.5)",    // limegreen
                0.5, "rgba(255, 215, 0, 0.6)",    // gold
                0.7, "rgba(255, 140, 0, 0.7)",    // darkorange
                1, "rgba(220, 20, 60, 0.8)",      // crimson
            ],
            // Radius - small for district-level granularity
            "heatmap-radius": [
                "interpolate", ["linear"], ["zoom"],
                10, 8,   // City overview - see major hotspots
                12, 12,  // District level - see neighborhood differences
                14, 18,  // Before fade-out
            ],
            // Fade out at street level - heatmap is for neighborhood overview only
            "heatmap-opacity": [
                "interpolate", ["linear"], ["zoom"],
                11, 0.7,   // Full visibility at city level
                13, 0.5,   // Start fading at neighborhood level
                14.5, 0.15, // Nearly gone at street level
                15.5, 0,   // Invisible - rely on POI markers
            ],
        },
    }, insertBefore);
}

function removeGravityLayers(map: any) {
    try {
        if (!map || typeof map.getLayer !== 'function') return;
        if (map.getLayer("gravity-heatmap")) map.removeLayer("gravity-heatmap");
        if (map.getSource("gravity-source")) map.removeSource("gravity-source");
    } catch {
        // Map was destroyed during navigation - safe to ignore
    }
}

// Enhanced marker icon with all features
function EnhancedMarkerIcon({
    type,
    isMiners = false,
    isFeatured = false,
    size = "default",
    badges = [],
    state = "default",
}: {
    type: string;
    isMiners?: boolean;
    isFeatured?: boolean;
    size?: "small" | "default" | "large";
    badges?: ("ac" | "hot" | "new")[];
    state?: "default" | "hovered" | "selected" | "dimmed";
}) {
    const config = iconConfig[type] || iconConfig.cafe;
    const Icon = config.icon;

    const sizeClasses = {
        small: "w-9 h-9 md:w-7 md:h-7",
        default: "w-11 h-11 md:w-9 md:h-9",
        large: "w-12 h-12 md:w-11 md:h-11"
    };

    const iconSizes = {
        small: "w-3.5 h-3.5",
        default: "w-4.5 h-4.5",
        large: "w-6 h-6"
    };

    return (
        <div className="relative group">
            {/* Pulse animation for featured locations */}
            {isFeatured && (
                <div
                    className="absolute inset-0 rounded-full animate-ping opacity-75"
                    style={{ backgroundColor: config.bg }}
                />
            )}

            <div
                className={cn(
                    "relative flex items-center justify-center rounded-full shadow-lg",
                    "border-2 border-white",
                    "transition-all duration-200",
                    sizeClasses[size],
                    // State-based styling (hover only on desktop, active:scale-90 for mobile tap feedback)
                    state === "default" && "md:hover:scale-125 md:hover:shadow-xl md:hover:z-50 active:scale-90",
                    state === "hovered" && "scale-125 shadow-xl z-50",
                    state === "selected" && "ring-4 ring-blue-500 scale-110 shadow-xl",
                    state === "dimmed" && "opacity-30 grayscale",
                    // Hover ring
                    state !== "dimmed" && "group-hover:ring-2",
                    isMiners ? "bg-black ring-yellow-400" : cn(config.bg, config.ring)
                )}
            >
                <Icon
                    className={cn(
                        "transition-transform group-hover:scale-110",
                        iconSizes[size],
                        isMiners ? "text-white" : config.color
                    )}
                />

                {/* Badge for Miners partners */}
                {isMiners && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-yellow-400 rounded-full
                                    border-2 border-white flex items-center justify-center">
                        <Star className="w-2 h-2 fill-black text-black" />
                    </div>
                )}

                {/* A/C Badge */}
                {badges.includes("ac") && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full
                                    border-2 border-white flex items-center justify-center">
                        <Snowflake className="w-2 h-2 text-white" />
                    </div>
                )}

                {/* Hot/Trending Badge */}
                {badges.includes("hot") && (
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full
                                    border-2 border-white animate-pulse" />
                )}

                {/* New Badge */}
                {badges.includes("new") && (
                    <div className="absolute -top-1 -left-1 w-4 h-4 bg-green-500 rounded-full
                                    border-2 border-white flex items-center justify-center">
                        <Sparkles className="w-2 h-2 text-white" />
                    </div>
                )}
            </div>
        </div>
    );
}

// isRecentlyAdded imported from @/lib/dateUtils

// The cafe card. Keyed by place, so tooltips, steps and drafts never carry
// over to the next pin.
function CafePopupContent({ cafe, onClose }: { cafe: CafeData; onClose?: () => void }) {
    const { profilesByPlaceId, canSeeRevenue } = React.useContext(CafeProfilesContext);
    const placeId = `cafe-${cafe.lat.toFixed(5)}-${cafe.lon.toFixed(5)}`;
    const mapsUrl = buildGoogleMapsUrl(cafe.name, cafe.googleMapsUrl, cafe.lat, cafe.lon, cafe.address);
    const profile = cafe.franchisePartner && cafe.placeId ? profilesByPlaceId[cafe.placeId] ?? null : null;
    return (
        <CafeCard
            key={placeId}
            cafe={cafe}
            placeId={placeId}
            mapsUrl={mapsUrl}
            isEuCoffeeTrip={!!cafe.link?.includes("europeancoffeetrip")}
            profile={profile}
            canSeeRevenue={canSeeRevenue}
            onClose={onClose}
        />
    );
}

// Build a Google Maps URL that works reliably on mobile + desktop.
// Stored URLs use `?q=place_id:X` which breaks on mobile Safari — convert to the official Maps URLs API.
function buildGoogleMapsUrl(name: string, storedUrl: string | undefined, lat: number, lon: number, address?: string, preferCoordinates?: boolean): string {
    // Try to extract a Place ID from the stored URL (format: place_id:ChIJ...)
    if (storedUrl) {
        const match = storedUrl.match(/place_id:([A-Za-z0-9_-]+)/);
        if (match) {
            const query = encodeURIComponent(name);
            return `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${match[1]}`;
        }
        return storedUrl;
    }
    // Properties and POIs without address: drop a pin at exact coordinates
    if (preferCoordinates || !address) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    }
    // Named businesses with address: search by name for the full Google business card
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
}

// MapLibre serializes GeoJSON feature properties to flat values when rendering.
// Numbers become strings, booleans become "true"/"false", arrays become JSON strings.
// This restores PropertyData fields after extracting from a cluster layer click.
function rehydratePropertyData(raw: any): PropertyData {
    const p = { ...raw };
    for (const k of ['latitude', 'longitude', 'price', 'size', 'priceByArea', 'transfer', 'score'] as const) {
        if (typeof p[k] === 'string') p[k] = Number(p[k]);
    }
    for (const k of ['hasAirConditioning', 'hasBathroom', 'hasStorefront'] as const) {
        if (typeof p[k] === 'string') p[k] = p[k] === 'true';
    }
    if (typeof p.photos === 'string') {
        try { p.photos = JSON.parse(p.photos); } catch { p.photos = []; }
    }
    if (typeof p.priceHistory === 'string') {
        try { p.priceHistory = JSON.parse(p.priceHistory); } catch { p.priceHistory = []; }
    }
    return p as PropertyData;
}

// Pitch status visuals for the map marker rings and glow
const PITCH_STATUS_STYLES: Record<string, {
    ringClass: string;
    glowStyle: React.CSSProperties;
}> = {
    submitted: {
        ringClass: "ring-2 ring-blue-400",
        glowStyle: { boxShadow: "0 0 14px 6px rgba(96,165,250,0.65)" },
    },
    approved: {
        ringClass: "ring-2 ring-green-500",
        glowStyle: { boxShadow: "0 0 14px 6px rgba(34,197,94,0.65)" },
    },
    rejected: {
        ringClass: "ring-2 ring-red-400",
        glowStyle: { boxShadow: "0 0 14px 6px rgba(248,113,113,0.65)" },
    },
    returned: {
        ringClass: "ring-2 ring-amber-400",
        glowStyle: { boxShadow: "0 0 14px 6px rgba(251,191,36,0.65)" },
    },
};

// The listing card. Access and request state are fetched here, above the key, so they
// survive switching pins; everything else lives in ListingCard, keyed by
// place so tooltips, steps and drafts never carry over to the next pin.
const PropertyPopupContent = React.memo(function PropertyPopupContent({ property, cityId, onClose }: { property: PropertyData; cityId: string; onClose?: () => void }) {
    const placeId = generatePropertyPlaceId(property);
    const mapsUrl = buildGoogleMapsUrl(property.title, undefined, property.latitude, property.longitude, property.address, true);
    const { canAccessDashboard, accessResolved } = useUserProfiles();
    // Admins assign directly and never request, so skip the fetch for them.
    const requests = usePropertyRequests(accessResolved && !canAccessDashboard);
    return (
        <ListingCard
            key={placeId}
            property={property}
            placeId={placeId}
            mapsUrl={mapsUrl}
            cityId={cityId}
            onClose={onClose}
            requests={requests}
            isAdmin={canAccessDashboard}
            accessResolved={accessResolved}
        />
    );
});

// The card for metro stations, gyms, offices and other places.
const OtherPoiPopupContent = React.memo(function OtherPoiPopupContent({ poi, onClose }: { poi: OtherPoiData; onClose?: () => void }) {
    const placeId = `${poi.type}-${poi.lat.toFixed(5)}-${poi.lon.toFixed(5)}`;
    const mapsUrl = buildGoogleMapsUrl(poi.name, poi.mapsUrl || undefined, poi.lat, poi.lon, poi.address);
    return <PlaceCard key={placeId} poi={poi} placeId={placeId} mapsUrl={mapsUrl} onClose={onClose} />;
});

// Internal component that manages overlay layers (must be inside Map component)
function OverlayLayerManager({
    trafficEnabled,
    populationEnabled,
    populationDensityFilter,
    incomeEnabled,
    incomeWealthyFilter,
    gravityEnabled,
    trafficData,
    populationData,
    incomeData,
    gravityData,
    styleKey,
}: {
    trafficEnabled: boolean;
    populationEnabled: boolean;
    populationDensityFilter: number;
    incomeEnabled: boolean;
    incomeWealthyFilter: number;
    gravityEnabled: boolean;
    trafficData: any;
    populationData: any;
    incomeData: any;
    gravityData: any;
    styleKey: number;
}) {
    const { map, isLoaded } = useMap();

    // Add/remove overlay layers when data, toggles, or style changes
    useEffect(() => {
        if (!map || !isLoaded) return;

        // Traffic layers
        if (trafficEnabled && trafficData) {
            addTrafficLayers(map, trafficData);
        } else {
            removeTrafficLayers(map);
        }

        // Population layers
        if (populationEnabled && populationData) {
            addPopulationLayers(map, populationData, populationDensityFilter);
        } else {
            removePopulationLayers(map);
        }

        // Income layers
        if (incomeEnabled && incomeData) {
            addIncomeLayers(map, incomeData, incomeWealthyFilter);
        } else {
            removeIncomeLayers(map);
        }

        // Gravity/Location Score layers
        if (gravityEnabled && gravityData) {
            addGravityLayers(map, gravityData);
        } else {
            removeGravityLayers(map);
        }

        return () => {
            safeMapCleanup(map, () => {
                removeTrafficLayers(map);
                removePopulationLayers(map);
                removeIncomeLayers(map);
                removeGravityLayers(map);
            });
        };
    }, [map, isLoaded, trafficEnabled, populationEnabled, populationDensityFilter, incomeEnabled, incomeWealthyFilter, gravityEnabled, trafficData, populationData, incomeData, gravityData, styleKey]);

    return null; // This component doesn't render anything
}

// Walking radius circle layer component (must be inside Map component)
// Desktop: shows single circle on hover
// Mobile: shows circles around ALL points
function RadiusCircleLayer() {
    const { map, isLoaded } = useMap();
    const { radiusPolygon, allPointsCircles } = useWalkingRadius();
    const isMobile = useMobile();

    useEffect(() => {
        if (!map || !isLoaded) return;

        const sourceId = 'walking-radius-source';
        const fillLayerId = 'walking-radius-fill';
        const strokeLayerId = 'walking-radius-stroke';

        // Helper to remove existing layers/source
        const cleanup = (m: typeof map) => {
            if (m.getLayer(fillLayerId)) m.removeLayer(fillLayerId);
            if (m.getLayer(strokeLayerId)) m.removeLayer(strokeLayerId);
            if (m.getSource(sourceId)) m.removeSource(sourceId);
        };

        // Clean up before re-adding
        cleanup(map);

        // Determine data: mobile shows all circles, desktop shows hovered circle
        // (radiusEnabled check already handled in context - returns null/empty when disabled)
        const sourceData: GeoJSON.Feature | GeoJSON.FeatureCollection | null =
            isMobile && allPointsCircles.length > 0
                ? { type: 'FeatureCollection', features: allPointsCircles }
                : radiusPolygon;

        if (!sourceData) return;

        // Add source and layers
        map.addSource(sourceId, { type: 'geojson', data: sourceData });

        map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.15 }
        });

        map.addLayer({
            id: strokeLayerId,
            type: 'line',
            source: sourceId,
            paint: { 'line-color': '#22c55e', 'line-width': 2, 'line-dasharray': [4, 2] }
        });

        return () => safeMapCleanup(map, cleanup);
    }, [map, isLoaded, radiusPolygon, allPointsCircles, isMobile]);

    return null;
}

// Zoom threshold for switching between clusters and icon markers
const ICON_ZOOM_THRESHOLD = 14;

/**
 * Fly to a place and open its card. Fired with the place's data by
 * PendingFocusOpener and by search (whose results are already loaded); anything
 * else should call goToPlace. page.tsx also hears it to switch the layer on.
 */
function NavigationEventListener({
    setSelectedCafe,
    setSelectedProperty,
    setSelectedPoi,
    clearSavedDisambiguation,
}: {
    clearSavedDisambiguation: () => void;
    setSelectedCafe: (value: { cafe: CafeData; coordinates: [number, number] } | null) => void;
    setSelectedProperty: (value: { property: PropertyData; coordinates: [number, number] } | null) => void;
    setSelectedPoi: (value: { poi: OtherPoiData; coordinates: [number, number] } | null) => void;
}) {
    const { map, isLoaded } = useMap();

    useEffect(() => {
        if (!map || !isLoaded) return;

        const handleNavigateAndOpenPopup = (e: CustomEvent<FocusTarget & { placeId: string }>) => {
            const { lat, lon, placeId } = e.detail;
            const data = e.detail.data as any;
            map.flyTo({ center: [lon, lat], zoom: 16, duration: 600 });

            // Type from the id prefix ("type-lat-lon"); open once the flight lands
            const type = placeId.split('-')[0];
            setTimeout(() => {
                // A card opened from elsewhere must not bring back an old stacked-pin picker
                clearSavedDisambiguation();
                if (type === 'cafe' || type === 'eu_coffee_trip' || type === 'regular_cafe') {
                    setSelectedCafe({ cafe: data, coordinates: [lon, lat] });
                } else if (type === 'property') {
                    setSelectedProperty({ property: rehydratePropertyData(data), coordinates: [lon, lat] });
                } else {
                    setSelectedPoi({ poi: data, coordinates: [lon, lat] });
                }
            }, 650);
        };

        window.addEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
        return () => window.removeEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
    }, [map, isLoaded, setSelectedCafe, setSelectedProperty, setSelectedPoi, clearSavedDisambiguation]);

    return null;
}

// Component to track zoom level - only fires when crossing threshold
function ZoomTracker({ onShowIconsChange }: { onShowIconsChange: (showIcons: boolean) => void }) {
    const { map, isLoaded } = useMap();

    useEffect(() => {
        if (!map || !isLoaded) return;

        // Track previous state to only fire on threshold crossing
        let wasAboveThreshold = map.getZoom() >= ICON_ZOOM_THRESHOLD;

        // Set initial state
        onShowIconsChange(wasAboveThreshold);

        const handleZoom = () => {
            const isAboveThreshold = map.getZoom() >= ICON_ZOOM_THRESHOLD;
            // Only update if we crossed the threshold
            if (isAboveThreshold !== wasAboveThreshold) {
                wasAboveThreshold = isAboveThreshold;
                onShowIconsChange(isAboveThreshold);
            }
        };

        map.on('zoom', handleZoom);
        return () => {
            safeMapCleanup(map, (m) => {
                m.off('zoom', handleZoom);
            });
        };
    }, [map, isLoaded, onShowIconsChange]);

    return null;
}

/** The patch of map that street-level pins are drawn for. */
interface PinArea {
    zoom: number;
    west: number;
    south: number;
    east: number;
    north: number;
}

/**
 * How far past each screen edge pins are drawn, as a share of the screen.
 * Busy areas get a smaller margin: every DOM pin is moved on every frame of a
 * pan, so past about 300 pins per million screen pixels (about 100 on a phone)
 * a slow phone starts dropping frames.
 */
const PIN_AREA_MARGINS = [0.25, 0.1, 0];
const PINS_PER_MEGAPIXEL = 300;

/**
 * Report where street-level pins should be drawn: the screen plus a margin,
 * or null below street level. Pinning every place froze the page for seconds
 * (each DOM pin is repositioned on every frame of a fly-in), and reporting on
 * moveend only means nothing new is drawn mid-flight. A new area is reported
 * only when the old one stops fitting, so small pans don't re-render the map.
 */
function PinAreaTracker({ onChange, countPins }: {
    onChange: (area: PinArea | null) => void;
    /** How many pins an area would draw. */
    countPins: (area: PinArea) => number;
}) {
    const { map, isLoaded } = useMap();
    // A ref, so new data doesn't re-subscribe the listener; it applies on the next move.
    const countPinsRef = React.useRef(countPins);
    useEffect(() => { countPinsRef.current = countPins; }, [countPins]);

    useEffect(() => {
        if (!map || !isLoaded) return;
        let last: PinArea | null = null;

        const report = () => {
            const zoom = map.getZoom();
            if (zoom < ICON_ZOOM_THRESHOLD) {
                if (last) {
                    last = null;
                    onChange(null);
                }
                return;
            }
            const b = map.getBounds();
            const [west, south, east, north] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
            const stillFits = last
                && Math.abs(last.zoom - zoom) < 1
                && west >= last.west && east <= last.east && south >= last.south && north <= last.north;
            if (stillFits) return;
            const canvas = map.getCanvas();
            const budget = PINS_PER_MEGAPIXEL * (canvas.clientWidth * canvas.clientHeight) / 1e6;
            for (const margin of PIN_AREA_MARGINS) {
                const dx = (east - west) * margin;
                const dy = (north - south) * margin;
                last = { zoom, west: west - dx, south: south - dy, east: east + dx, north: north + dy };
                if (countPinsRef.current(last) <= budget) break;
            }
            onChange(last);
        };

        report();
        map.on('moveend', report);
        return () => {
            safeMapCleanup(map, (m) => {
                m.off('moveend', report);
            });
        };
    }, [map, isLoaded, onChange]);

    return null;
}

// Helper component for shape creation toast (must be inside ToastProvider)
function ShapeCreatedToast({ onReady }: { onReady: (callback: () => void) => void }) {
    const { showToast } = useToast();
    React.useEffect(() => {
        onReady(() => showToast('Saved'));
    }, [onReady, showToast]);
    return null;
}

// Component to fly to a city when selected
function CityNavigator({ city }: { city?: City }) {
    const { map, isLoaded } = useMap();
    const prevCityRef = React.useRef<string | undefined>(city?.id);

    useEffect(() => {
        if (!map || !isLoaded || !city) return;

        // Only fly if city actually changed (not on initial load)
        if (prevCityRef.current !== city.id && prevCityRef.current !== undefined) {
            map.flyTo({
                center: city.coordinates,
                zoom: 13,
                duration: 2000,
            });
        }
        prevCityRef.current = city.id;
    }, [map, isLoaded, city]);

    return null;
}

// Simple icon marker component (mapcn style) - memoized to prevent re-renders
const IconMarker = React.memo(function IconMarker({
    color,
    icon: Icon,
    isMiners = false,
    isActive = false,
    isHidden = false,
    poiCount = 1,
    ringClass = "",
    glowStyle,
    statusIndicator,
}: {
    color: string;
    icon: React.ElementType;
    isMiners?: boolean;
    isActive?: boolean;
    isHidden?: boolean;
    poiCount?: number;
    ringClass?: string;
    glowStyle?: React.CSSProperties;
    statusIndicator?: "submitted" | "approved" | "rejected";
}) {
    const showBadge = poiCount > 1;
    const isRejected = statusIndicator === "rejected" && !isHidden;

    if (isMiners) {
        return (
            <div className={cn("relative", isHidden && "marker-hidden")}>
                <div className={cn(
                    "bg-black rounded-full p-1 shadow-lg shadow-black/30 ring-2 ring-yellow-400 transition-transform duration-200",
                    isActive ? "scale-125" : "hover:scale-125"
                )}>
                    <img
                        src="/assets/favicon-dark.png"
                        alt="Miners"
                        className="size-5 object-contain"
                    />
                </div>
                {showBadge && (
                    <div className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-orange-500 rounded-full
                                    flex items-center justify-center text-[10px] font-bold text-white
                                    border-2 border-white shadow-md">
                        {poiCount}
                    </div>
                )}
            </div>
        );
    }
    return (
        <div className={cn("relative", isHidden && "marker-hidden", isRejected && "opacity-60")}>
            <div
                className={cn(
                    `${color} rounded-full p-1.5 shadow-lg transition-transform duration-200`,
                    ringClass,
                    isActive ? "scale-125" : "hover:scale-125"
                )}
                style={glowStyle}
            >
                <Icon className="size-3 text-white" />
            </div>
            {showBadge && (
                <div className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-orange-500 rounded-full
                                flex items-center justify-center text-[10px] font-bold text-white
                                border-2 border-white shadow-md">
                    {poiCount}
                </div>
            )}
        </div>
    );
});

/** What a place request resolved to: the navigate-and-open-popup detail. */
interface FocusTarget {
    lat: number;
    lon: number;
    /** Finer than the place-id prefix, so the right map layer gets switched on. */
    placeType: string;
    data: unknown;
}

/**
 * Open the card a shared link or an in-app click points at, once the map can
 * show it.
 *
 * page.tsx has already checked access and switched to the right city. This
 * waits for the map, then for that city's data (`ready`; useMapData's own
 * timeouts make a failed load "ready" too), finds the place and fires
 * navigate-and-open-popup, which zooms, switches the layer on and opens the
 * card. Its zoom also cancels CityNavigator's fly-over, so the two never
 * fight. A place that is gone, or a bare spot (a drawn shape), still gets a
 * flight to where it is or was. Rendered after NavigationEventListener, whose
 * listener is therefore already attached.
 */
function PendingFocusOpener({
    focus,
    ready,
    find,
    onDone,
}: {
    /** The spot is where it is or was; page.tsx works it out once. */
    focus: PendingFocus;
    ready: boolean;
    find: (placeId: string) => FocusTarget | null;
    /** false when the place id matched nothing loaded. */
    onDone: (found: boolean) => void;
}) {
    const { map, isLoaded } = useMap();

    useEffect(() => {
        if (!map || !isLoaded || !ready) return;
        const { placeId, lat, lon, data, shapeId } = focus;
        // Loaded data first; card data saved elsewhere (a trip's linked place) next
        const target = placeId
            ? find(placeId) ?? (data ? { lat, lon, placeType: placeId.split("-")[0], data } : null)
            : null;
        if (target) {
            window.dispatchEvent(new CustomEvent("navigate-and-open-popup", { detail: { ...target, placeId } }));
        } else {
            map.flyTo({ center: [lon, lat], zoom: 16, duration: 600 });
            if (shapeId) {
                setTimeout(() => window.dispatchEvent(new CustomEvent("select-drawn-shape", { detail: { shapeId } })), 650);
            }
        }
        onDone(!placeId || !!target);
    }, [map, isLoaded, ready, focus, find, onDone]);

    return null;
}

interface EnhancedMapContainerProps {
    activeFilters: Set<string>;
    ratingFilter?: number;
    scoreFilter?: number;
    euctFilter?: EuctFilter;
    trafficEnabled?: boolean;
    trafficValuesEnabled?: boolean;
    populationEnabled?: boolean;
    populationDensityFilter?: number;
    incomeEnabled?: boolean;
    incomeWealthyFilter?: number;
    trafficHour?: number;
    selectedCity?: City;
    /** False while the page is still finding out which city to load; no map data is fetched until then. */
    cityReady?: boolean;
    isLinkingMode?: boolean;
    showHiddenPois?: boolean;
    gravityEnabled?: boolean;
    propertyPostedFilter?: PropertyPostedFilter;
    propertyTransferFilter?: PropertyTransferFilter;
    propertyPriceChangeFilter?: PropertyPriceChangeFilter;
    propertyPitchStatusFilter?: PropertyPitchStatusFilter;
    demoMode?: boolean;
    /** A place (shared link or in-app click) to open once its city's data is in. */
    pendingFocus?: PendingFocus | null;
    onPendingFocusDone?: (found: boolean) => void;
}

export function EnhancedMapContainer({
    activeFilters,
    ratingFilter = 0,
    scoreFilter = 0,
    euctFilter = "all",
    trafficEnabled,
    trafficValuesEnabled,
    populationEnabled,
    populationDensityFilter = 0,
    incomeEnabled,
    incomeWealthyFilter = 0,
    trafficHour,
    selectedCity,
    cityReady,
    isLinkingMode = false,
    showHiddenPois = false,
    gravityEnabled = false,
    propertyPostedFilter = "all",
    propertyTransferFilter = "all",
    propertyPriceChangeFilter = "all",
    propertyPitchStatusFilter = "all",
    demoMode = false,
    pendingFocus = null,
    onPendingFocusDone,
}: EnhancedMapContainerProps) {
    const { cafes, properties, otherPois, isLoading, error, retry } = useMapData(cityReady === false ? null : selectedCity?.id);
    const { cafes: dbCafes, profilesByPlaceId: cafeProfilesByPlaceId } = useCafeProfiles(true);
    const { canSeeRevenue, canAccessDashboard } = useUserProfiles();
    const cafeProfilesCtx = useMemo(() => ({ profilesByPlaceId: cafeProfilesByPlaceId, canSeeRevenue }), [cafeProfilesByPlaceId, canSeeRevenue]);
    const {
        trafficData,
        trafficGroupedData,
        populationData,
        incomeData,
        isLoadingTraffic,
        loadTrafficData,
        loadTrafficGroupedData,
        loadGeoData,
    } = useOverlayData();

    // Gravity/Location Score data state
    const [gravityData, setGravityData] = React.useState<any>(null);
    const [isLoadingGravity, setIsLoadingGravity] = React.useState(false);

    // Load gravity data when enabled
    const loadGravityData = React.useCallback(async () => {
        if (gravityData || isLoadingGravity) return;
        setIsLoadingGravity(true);
        try {
            const cityId = selectedCity?.id || "madrid";
            // Through the authenticated route: the direct /data/ URL is a 404
            // now, so the city check cannot be skipped.
            const token = await getAuthToken();
            const response = await fetch(
                `/api/data?type=gravity&city=${encodeURIComponent(cityId)}`,
                { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : undefined },
            );
            if (response.ok) {
                const data = await response.json();
                setGravityData(data);
            }
        } catch (error) {
            console.error("Failed to load gravity data:", error);
        } finally {
            setIsLoadingGravity(false);
        }
    }, [gravityData, isLoadingGravity, selectedCity?.id]);

    // Linking context for adding POIs to scouting trips
    const { addItem: addLinkingItem } = useLinking();
    const { showToast } = useToast();

    // Hidden POIs context
    const { isHidden } = useHiddenPoisContext();
    // Pitch status context for property markers
    const { getPitchStatus } = usePitchStatusContext();
    // Assignment context for "mine" filter and pitch blocking
    const { isAssignedToMe, getAssignment: getPropertyAssignment, isLoaded: assignmentsLoaded } = usePropertyAssignmentContext();

    // Handler for marker click in linking mode
    const handleLinkingClick = React.useCallback((item: {
        type: 'place' | 'area';
        id: string;
        name: string;
        address?: string;
        data?: any;
    }) => {
        if (isLinkingMode) {
            const a = getPropertyAssignment(item.id);
            const linkActions = evaluatePropertyActions({
                isAdmin: canAccessDashboard,
                isPreRejected: a?.status === "pre_rejected",
                rejectionReason: a?.rejection_reason ?? null,
                hasAssignment: !!a && a.status !== "pre_rejected",
                isAssignedToMe: isAssignedToMe(item.id),
                assigneeLabel: null,
                pitchStatus: getPitchStatus(item.id),
                hasPendingRequest: false,
                wasRejectedForMe: false,
            });
            if (!linkActions.showCreateTrip) {
                showToast(linkActions.caption || "You can't scout this property", 'error');
                return;
            }
            addLinkingItem(item);
        }
    }, [isLinkingMode, addLinkingItem, getPropertyAssignment, getPitchStatus, canAccessDashboard, isAssignedToMe, showToast]);

    // Miners cafes from DB - ALWAYS visible regardless of filters (filtered by city only)
    const minersCafes = useMemo(
        () => isLinkingMode ? [] : dbCafes
            .filter(c => c.cityId === selectedCity?.id)
            .map(c => ({
                type: "cafe" as const,
                name: c.name,
                address: c.address,
                lat: c.latitude,
                lon: c.longitude,
                categoryName: "Miners",
                franchisePartner: true,
                city: c.cityId as CafeData["city"],
                placeId: c.placeId,
                link: c.euctLink,
                website: c.website,
                instagram: c.instagram,
                rating: c.googleRating,
                reviewCount: c.googleReviewCount,
                googleMapsUrl: c.googleMapsUrl,
                openingHours: c.openingHours,
            })),
        [dbCafes, selectedCity, isLinkingMode]
    );

    // Filter visible markers based on active filters, rating, and city
    // In linking mode, hide cafes (only properties shown). In showHiddenPois mode, show all.
    const visibleCafes = useMemo(
        () => {
            if (isLinkingMode) return [];
            return cafes.filter(c => {
                if (c.city !== selectedCity?.id) return false;
                if (showHiddenPois) return true;
                return isPoiFilterActive(c, activeFilters, ratingFilter, euctFilter);
            });
        },
        [cafes, activeFilters, ratingFilter, euctFilter, selectedCity, isLinkingMode, showHiddenPois]
    );

    const visibleProperties = useMemo(() => {
        // In linking mode, show ALL properties (no filters)
        if (isLinkingMode) return properties;
        const base = showHiddenPois || activeFilters.has("property") ? properties : [];
        return base.filter(p => {
            if (scoreFilter > 0 && p.score !== undefined && p.score < scoreFilter) return false;
            if (propertyPostedFilter === "last7days" && !isNewPoi(p.createdAt, 7)) return false;
            if (propertyPostedFilter === "over7days" && isNewPoi(p.createdAt, 7)) return false;
            if (propertyTransferFilter === "yes" && !(p.transfer && p.transfer > 0)) return false;
            if (propertyTransferFilter === "no" && p.transfer && p.transfer > 0) return false;
            if (propertyPriceChangeFilter !== "all") {
                const changed = hasChangedPrice(p);
                if (propertyPriceChangeFilter === "yes" && !changed) return false;
                if (propertyPriceChangeFilter === "no" && changed) return false;
            }
            if (propertyPitchStatusFilter !== "all") {
                const pid = generatePropertyPlaceId(p);
                if (propertyPitchStatusFilter === "mine") {
                    if (assignmentsLoaded && !isAssignedToMe(pid)) return false;
                } else if (propertyPitchStatusFilter === "scouted") {
                    const status = getPitchStatus(pid);
                    if (!status) return false;
                }
            }
            return true;
        });
    }, [properties, activeFilters, isLinkingMode, showHiddenPois, scoreFilter, propertyPostedFilter, propertyTransferFilter, propertyPriceChangeFilter, propertyPitchStatusFilter, getPitchStatus, isAssignedToMe, assignmentsLoaded]);

    const visibleOtherPois = useMemo(
        () => isLinkingMode ? [] : (showHiddenPois ? otherPois : otherPois.filter((poi) => activeFilters.has(poi.type))),
        [otherPois, activeFilters, isLinkingMode, showHiddenPois]
    );

    // Convert cafes to GeoJSON for cluster layers (split by type for different colors)
    // Excludes hidden POIs in normal mode; shows only hidden POIs in hidden mode
    const euCoffeeTripGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
        type: "FeatureCollection",
        features: visibleCafes
            .filter(cafe => {
                if (!cafe.link?.includes("europeancoffeetrip")) return false;
                const hidden = isHidden(generatePlaceId('cafe', cafe.lat, cafe.lon));
                return showHiddenPois ? hidden : !hidden;
            })
            .map(cafe => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [cafe.lon, cafe.lat] },
                properties: { ...cafe }
            }))
    }), [visibleCafes, showHiddenPois, isHidden]);

    const regularCafeGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
        type: "FeatureCollection",
        features: visibleCafes
            .filter(cafe => {
                if (cafe.link?.includes("europeancoffeetrip")) return false;
                const hidden = isHidden(generatePlaceId('cafe', cafe.lat, cafe.lon));
                return showHiddenPois ? hidden : !hidden;
            })
            .map(cafe => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [cafe.lon, cafe.lat] },
                properties: { ...cafe }
            }))
    }), [visibleCafes, showHiddenPois, isHidden]);

    // Convert properties to GeoJSON
    // Excludes hidden POIs in normal mode; shows only hidden POIs in hidden mode
    const propertyGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
        type: "FeatureCollection",
        features: visibleProperties
            .filter(property => {
                const hidden = isHidden(generatePropertyPlaceId(property));
                return showHiddenPois ? hidden : !hidden;
            })
            .map(p => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
                properties: { ...p }
            }))
    }), [visibleProperties, showHiddenPois, isHidden]);

    // Convert other POIs to GeoJSON by type
    // Excludes hidden POIs in normal mode; shows only hidden POIs in hidden mode
    const poiGeoJSONByType = useMemo(() => {
        const types = ["transit", "metro", "office", "shopping", "high_street", "dorm", "university", "gym"] as const;
        const byType: Record<string, GeoJSON.FeatureCollection<GeoJSON.Point>> = {};
        types.forEach(type => {
            byType[type] = {
                type: "FeatureCollection",
                features: visibleOtherPois
                    .filter(poi => {
                        if (poi.type !== type) return false;
                        const hidden = isHidden(generatePlaceId(poi.type, poi.lat, poi.lon));
                        return showHiddenPois ? hidden : !hidden;
                    })
                    .map(poi => ({
                        type: "Feature" as const,
                        geometry: { type: "Point" as const, coordinates: [poi.lon, poi.lat] },
                        properties: { ...poi }
                    }))
            };
        });
        return byType;
    }, [visibleOtherPois, showHiddenPois, isHidden]);

    // Cluster colors by POI type (matching iconConfig)
    const clusterColorsByType: Record<string, [string, string, string]> = {
        transit: ["#0369a1", "#0284c7", "#0ea5e9"],      // sky-700
        metro: ["#0284c7", "#0ea5e9", "#38bdf8"],        // sky-600
        office: ["#6b21a8", "#7c3aed", "#8b5cf6"],       // purple-800
        shopping: ["#a21caf", "#c026d3", "#d946ef"],     // fuchsia-700
        high_street: ["#c2410c", "#ea580c", "#f97316"], // orange-700
        dorm: ["#0e7490", "#0891b2", "#06b6d4"],        // cyan-700
        university: ["#be123c", "#e11d48", "#f43f5e"],  // rose-700
        gym: ["#b91c1c", "#dc2626", "#ef4444"],              // red-700
    };

    const pointColorByType: Record<string, string> = {
        transit: "#0369a1",
        metro: "#0284c7",
        office: "#6b21a8",
        shopping: "#a21caf",
        high_street: "#c2410c",
        dorm: "#0e7490",
        university: "#be123c",
        gym: "#b91c1c",
    };

    // Build location index to detect co-located POIs (same lat/lng)
    // Key format: "lat_lng" rounded to 5 decimals (~1m precision)
    const locationIndex = useMemo(() => {
        const index: Record<string, LocationData[]> = {};

        const makeKey = (lat: number, lon: number) =>
            `${lat.toFixed(5)}_${lon.toFixed(5)}`;

        // Add all cafes (cafes array already includes miners cafes)
        cafes.forEach(cafe => {
            const key = makeKey(cafe.lat, cafe.lon);
            if (!index[key]) index[key] = [];
            index[key].push(cafe);
        });

        // Add properties
        properties.forEach(prop => {
            const key = makeKey(prop.latitude, prop.longitude);
            if (!index[key]) index[key] = [];
            index[key].push(prop);
        });

        // Add other POIs
        otherPois.forEach(poi => {
            const key = makeKey(poi.lat, poi.lon);
            if (!index[key]) index[key] = [];
            index[key].push(poi);
        });

        return index;
    }, [cafes, properties, otherPois]);

    // Helper to get placeId for any POI type (used for hidden check)
    // Uses toFixed(5) to match locationIndex precision for consistent grouping
    const getPlaceId = React.useCallback((poi: LocationData): string => {
        if (poi.type === "cafe") {
            const cafe = poi as CafeData;
            return `cafe-${cafe.lat.toFixed(5)}-${cafe.lon.toFixed(5)}`;
        } else if (poi.type === "property") {
            const prop = poi as PropertyData;
            return generatePropertyPlaceId(prop);
        } else {
            const other = poi as OtherPoiData;
            return `${other.type}-${other.lat.toFixed(5)}-${other.lon.toFixed(5)}`;
        }
    }, []);

    // Helper to get co-located POIs for a given coordinate
    // Filters out hidden POIs so they don't count in aggregations
    const getColocatedPois = React.useCallback((lat: number, lon: number): LocationData[] => {
        const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
        const allPois = locationIndex[key] || [];
        return allPois.filter(poi => {
            const hidden = isHidden(getPlaceId(poi));
            const hiddenMatch = showHiddenPois ? hidden : !hidden;
            return hiddenMatch && (showHiddenPois || isPoiFilterActive(poi, activeFilters, ratingFilter, euctFilter));
        });
    }, [locationIndex, isHidden, getPlaceId, activeFilters, ratingFilter, euctFilter, showHiddenPois]);

    // State for selected popups
    const [selectedCafe, setSelectedCafe] = useState<{
        cafe: CafeData;
        coordinates: [number, number];
    } | null>(null);

    const [selectedProperty, setSelectedProperty] = useState<{
        property: PropertyData;
        coordinates: [number, number];
    } | null>(null);

    const [selectedPoi, setSelectedPoi] = useState<{
        poi: OtherPoiData;
        coordinates: [number, number];
    } | null>(null);

    // Mobile detection for bottom sheet POI display
    const isMobile = useMobile();
    const { open: openPOISheet, close: closePOISheet, isOpen: isPOISheetOpen } = useSheetState("poi-details");

    // State for disambiguation popup (when multiple POIs share same coordinates)
    const [disambiguationData, setDisambiguationData] = useState<{
        pois: LocationData[];
        coordinates: [number, number];
    } | null>(null);

    // Saved coordinates for returning to disambiguation after closing a detail popup
    const [savedDisambiguationCoords, setSavedDisambiguationCoords] = useState<[number, number] | null>(null);

    // Track whether to show icons (zoomed in) or clusters (zoomed out)
    const [showIcons, setShowIcons] = useState(false);

    // Track which marker has its popup open (to keep icon scaled)
    const [activeMarkerKey, setActiveMarkerKey] = useState<string | null>(null);

    // Street-level pins are drawn only inside this area (see PinAreaTracker),
    // plus the pin whose card is open, so panning never closes it.
    const [pinArea, setPinArea] = useState<PinArea | null>(null);
    // Clusters stay up until the pin area is known, so crossing into street
    // level mid-gesture (a pinch, a fly-in) never leaves the map empty.
    const showPins = showIcons && pinArea !== null;
    const countPins = React.useCallback((a: PinArea) => {
        const inside = (lat: number, lon: number) =>
            lat >= a.south && lat <= a.north && lon >= a.west && lon <= a.east;
        return visibleCafes.filter((c) => inside(c.lat, c.lon)).length
            + visibleProperties.filter((p) => inside(p.latitude, p.longitude)).length
            + visibleOtherPois.filter((p) => inside(p.lat, p.lon)).length;
    }, [visibleCafes, visibleProperties, visibleOtherPois]);
    const shouldDrawPin = React.useCallback((markerKey: string, lat: number, lon: number) =>
        markerKey === activeMarkerKey || (!!pinArea
            && lat >= pinArea.south && lat <= pinArea.north
            && lon >= pinArea.west && lon <= pinArea.east),
    [pinArea, activeMarkerKey]);

    // Track style changes to trigger overlay re-add
    const [mapStyleKey, setMapStyleKey] = useState(0);

    // Callback for shape created toast
    const [shapeCreatedCallback, setShapeCreatedCallback] = useState<(() => void) | null>(null);
    const handleShapeCreatedReady = React.useCallback((callback: () => void) => {
        setShapeCreatedCallback(() => callback);
    }, []);

    // Clear active marker when popup closes
    const handlePopupClose = React.useCallback(() => {
        setActiveMarkerKey(null);
    }, []);

    // Callback for when zoom crosses icon threshold
    const handleShowIconsChange = React.useCallback((icons: boolean) => {
        setShowIcons(icons);
    }, []);

    // Handle click on marker - check for co-located POIs first
    const handleMarkerClick = React.useCallback((
        lat: number,
        lon: number,
        poi: LocationData,
        markerKey: string,
        openPopup: () => void
    ) => {
        // Don't show disambiguation in linking mode
        if (isLinkingMode) {
            openPopup();
            return;
        }

        const colocated = getColocatedPois(lat, lon);
        setSavedDisambiguationCoords(null);

        if (colocated.length > 1) {
            // Multiple POIs at this location - show disambiguation
            setDisambiguationData({
                pois: colocated,
                coordinates: [lon, lat]
            });
        } else {
            // Single POI - open directly
            setActiveMarkerKey(markerKey);
            openPopup();
        }
    }, [isLinkingMode, getColocatedPois]);

    // Handle selection from disambiguation popup
    const handleDisambiguationSelect = React.useCallback((poi: LocationData) => {
        // Save coordinates so we can return to disambiguation after detail popup closes
        if (disambiguationData) {
            setSavedDisambiguationCoords(disambiguationData.coordinates);
        }
        // Close disambiguation popup
        setDisambiguationData(null);

        // Open the appropriate popup based on POI type
        if (poi.type === "cafe") {
            const cafe = poi as CafeData;
            setSelectedCafe({
                cafe,
                coordinates: [cafe.lon, cafe.lat]
            });
        } else if (poi.type === "property") {
            const property = poi as PropertyData;
            setSelectedProperty({
                property,
                coordinates: [property.longitude, property.latitude]
            });
        } else {
            const otherPoi = poi as OtherPoiData;
            setSelectedPoi({
                poi: otherPoi,
                coordinates: [otherPoi.lon, otherPoi.lat]
            });
        }
    }, [disambiguationData]);

    // Close detail popup and return to disambiguation menu if opened from one
    const handleDetailPopupClose = React.useCallback(() => {
        setSelectedCafe(null);
        setSelectedProperty(null);
        setSelectedPoi(null);

        if (savedDisambiguationCoords) {
            const [lon, lat] = savedDisambiguationCoords;
            const colocated = getColocatedPois(lat, lon);
            if (colocated.length > 1) {
                setDisambiguationData({ pois: colocated, coordinates: savedDisambiguationCoords });
            }
            setSavedDisambiguationCoords(null);
        }
    }, [savedDisambiguationCoords, getColocatedPois]);

    const clearSavedDisambiguation = React.useCallback(() => setSavedDisambiguationCoords(null), []);

    // Dismiss disambiguation menu and clear saved coordinates
    const handleDisambiguationClose = React.useCallback(() => {
        setDisambiguationData(null);
        setSavedDisambiguationCoords(null);
    }, []);

    /**
     * Resolve a place id (shared link or in-app click) against the loaded data, or null when
     * the place is gone (a listing taken down, a cafe removed).
     */
    const findFocusTarget = React.useCallback((placeId: string): FocusTarget | null => {
        const coords = parseCoordinatesFromPlaceId(placeId);
        if (!coords) return null;
        const type = placeId.split("-")[0];
        const at = (lat: number, lon: number) => coordsMatch(lat, coords.lat) && coordsMatch(lon, coords.lon);

        if (type === "property") {
            // Coordinates alone only for old ids with no URL hash: with one,
            // a near miss would be a different listing in the same building.
            const hasHash = /-[0-9a-f]{8}$/.test(placeId);
            const p = properties.find(p => at(p.latitude, p.longitude) && (!hasHash || generatePropertyPlaceId(p) === placeId));
            return p ? { lat: p.latitude, lon: p.longitude, placeType: "property", data: p } : null;
        }
        if (type === "cafe" || type === "eu_coffee_trip" || type === "regular_cafe") {
            const c = minersCafes.find(c => at(c.lat, c.lon)) ?? cafes.find(c => at(c.lat, c.lon));
            if (!c) return null;
            const placeType = c.link?.includes("europeancoffeetrip") ? "eu_coffee_trip" : "regular_cafe";
            return { lat: c.lat, lon: c.lon, placeType, data: c };
        }
        // Type and spot both: two kinds of place can share a spot (a metro
        // exit inside a shopping centre) and the link was for one of them.
        const poi = otherPois.find(o => o.type === type && at(o.lat, o.lon));
        return poi ? { lat: poi.lat, lon: poi.lon, placeType: poi.type, data: poi } : null;
    }, [properties, minersCafes, cafes, otherPois]);

    // Load traffic data when enabled or hour changes
    useEffect(() => {
        if (trafficEnabled) {
            loadTrafficData(trafficHour ?? 12);
        }
    }, [trafficEnabled, trafficHour, loadTrafficData]);

    // Load grouped traffic data when values toggle is enabled (for sparkline charts)
    useEffect(() => {
        if (trafficEnabled && trafficValuesEnabled) {
            loadTrafficGroupedData();
        }
    }, [trafficEnabled, trafficValuesEnabled, loadTrafficGroupedData]);

    // Population and income load together, the first time either is turned on
    useEffect(() => {
        if (populationEnabled || incomeEnabled) {
            loadGeoData();
        }
    }, [populationEnabled, incomeEnabled, loadGeoData]);

    // Load gravity data when enabled
    useEffect(() => {
        if (gravityEnabled) {
            loadGravityData();
        }
    }, [gravityEnabled, loadGravityData]);

    if (error) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-100 gap-3">
                <div className="text-red-500 text-sm">Error loading data: {error}</div>
                <button
                    onClick={retry}
                    className="px-4 py-2 bg-zinc-900 text-white text-sm rounded-lg hover:bg-zinc-700 transition-colors"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <CafeProfilesContext.Provider value={cafeProfilesCtx}>
        <div className="w-full h-full relative">
            {/* Toast helper for shape creation */}
            <ShapeCreatedToast onReady={handleShapeCreatedReady} />
            <Map
                center={selectedCity?.coordinates ?? [-3.7038, 40.4168]}
                zoom={13}
                className="w-full h-full"
            >
                <MapStyleSwitcher onStyleChange={() => setMapStyleKey(k => k + 1)} />

                {/* Opens the card PendingFocusOpener found */}
                <NavigationEventListener
                    clearSavedDisambiguation={clearSavedDisambiguation}
                    setSelectedCafe={setSelectedCafe}
                    setSelectedProperty={setSelectedProperty}
                    setSelectedPoi={setSelectedPoi}
                />

                {/* Overlay Layers Manager */}
                <OverlayLayerManager
                    trafficEnabled={trafficEnabled ?? false}
                    populationEnabled={populationEnabled ?? false}
                    populationDensityFilter={populationDensityFilter}
                    incomeEnabled={incomeEnabled ?? false}
                    incomeWealthyFilter={incomeWealthyFilter}
                    gravityEnabled={gravityEnabled}
                    trafficData={trafficData}
                    populationData={populationData}
                    incomeData={incomeData}
                    gravityData={gravityData}
                    styleKey={mapStyleKey}
                />

                {/* Walking radius circle layer */}
                <RadiusCircleLayer />

                {/* Drawing functionality - DrawToolbar uses portal to escape z-0 stacking context */}
                <MapDraw
                    onShapeCreated={shapeCreatedCallback ?? undefined}
                    onShapeUpdated={shapeCreatedCallback ?? undefined}
                >
                      <DrawToolbar />
                      <ShapeComments cityId={selectedCity?.id} />
                      <ShapeHoverTooltip />
                      <DrawingIndicator />
                </MapDraw>

                {/* Zoom tracker for hybrid rendering */}
                <ZoomTracker onShowIconsChange={handleShowIconsChange} />
                <PinAreaTracker onChange={setPinArea} countPins={countPins} />

                {/* City navigator - flies to selected city */}
                <CityNavigator city={selectedCity} />

                {/* Shared link or in-app click: open its card once that city's data has loaded */}
                {pendingFocus && onPendingFocusDone && (
                    <PendingFocusOpener
                        focus={pendingFocus}
                        ready={selectedCity?.id === pendingFocus.cityId && !isLoading}
                        find={findFocusTarget}
                        onDone={onPendingFocusDone}
                    />
                )}

                {/* TRAFFIC VALUE CARDS - Show when Values toggle is on */}
                {/* Compact when zoomed out (!showIcons), full when zoomed in (showIcons) */}
                {trafficEnabled && trafficValuesEnabled && trafficGroupedData?.map((location, i) => {
                    // Skip locations with no significant traffic
                    const maxHourly = Math.max(...location.hourly);
                    if (maxHourly < 10) return null;

                    return (
                        <MapMarker
                            key={`traffic-card-${location.lat}-${location.lon}-${i}`}
                            latitude={location.lat}
                            longitude={location.lon}
                            anchor="bottom"
                        >
                            <MarkerContent>
                                <div className="transform -translate-y-2">
                                    <TrafficValueCard
                                        direccion={location.direccion}
                                        currentHour={trafficHour ?? 12}
                                        hourly={location.hourly}
                                        compact={!showIcons}
                                    />
                                </div>
                            </MarkerContent>
                        </MapMarker>
                    );
                })}

                {/* MINERS CAFES - Always visible with nice icons (hidden in demo mode) */}
                {!demoMode && minersCafes.map((cafe, i) => {
                    const markerKey = `miners-${cafe.lat}-${cafe.lon}-${i}`;
                    const placeId = generatePlaceId('cafe', cafe.lat, cafe.lon);
                    const hidden = isHidden(placeId);
                    // In "Hidden" mode, only show hidden POIs
                    if (showHiddenPois && !hidden) return null;
                    const colocated = getColocatedPois(cafe.lat, cafe.lon);
                    // If hidden: show faded if alone, skip if other visible POIs at same spot
                    if (hidden && !showHiddenPois && colocated.length > 0) return null;
                    const hasMultiplePois = colocated.length > 1;
                    return (
                        <MapMarker
                            key={markerKey}
                            latitude={cafe.lat}
                            longitude={cafe.lon}
                            onClick={() => {
                                if (isLinkingMode) {
                                    handleLinkingClick({
                                        type: 'place',
                                        id: placeId,
                                        name: cafe.name,
                                        address: cafe.address,
                                        data: cafe,
                                    });
                                } else if (hasMultiplePois) {
                                    setDisambiguationData({
                                        pois: colocated,
                                        coordinates: [cafe.lon, cafe.lat]
                                    });
                                } else if (isMobile) {
                                    setSelectedCafe({ cafe, coordinates: [cafe.lon, cafe.lat] });
                                } else {
                                    setActiveMarkerKey(markerKey);
                                }
                            }}
                        >
                            <MarkerContent>
                                <IconMarker color="bg-black" icon={Coffee} isMiners isActive={activeMarkerKey === markerKey} isHidden={hidden} poiCount={colocated.length} />
                            </MarkerContent>
                            {!isLinkingMode && !hasMultiplePois && !isMobile && (
                                <MarkerPopup onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                    <CafePopupContent cafe={cafe} onClose={handlePopupClose} />
                                </MarkerPopup>
                            )}
                        </MapMarker>
                    );
                })}

                {/* CAFES - Conditional rendering based on zoom */}
                {showPins ? (
                    <>
                        {/* Zoomed in: Show icon markers */}
                        {visibleCafes.map((cafe, i) => {
                            const isEuCoffeeTrip = cafe.link?.includes("europeancoffeetrip");
                            const markerKey = `cafe-icon-${cafe.lat}-${cafe.lon}-${i}`;
                            if (!shouldDrawPin(markerKey, cafe.lat, cafe.lon)) return null;
                            const placeId = generatePlaceId('cafe', cafe.lat, cafe.lon);
                            const hidden = isHidden(placeId);
                            // In "Hidden" mode, only show hidden POIs
                            if (showHiddenPois && !hidden) return null;
                            const colocated = getColocatedPois(cafe.lat, cafe.lon);
                            // If hidden: show faded if alone, skip if other visible POIs at same spot
                            if (hidden && !showHiddenPois && colocated.length > 0) return null;
                            const hasMultiplePois = colocated.length > 1;
                            return (
                                <MapMarker
                                    key={markerKey}
                                    latitude={cafe.lat}
                                    longitude={cafe.lon}
                                    onClick={() => {
                                        if (isLinkingMode) {
                                            handleLinkingClick({
                                                type: 'place',
                                                id: placeId,
                                                name: cafe.name,
                                                address: cafe.address,
                                                data: cafe,
                                            });
                                        } else if (hasMultiplePois) {
                                            setDisambiguationData({
                                                pois: colocated,
                                                coordinates: [cafe.lon, cafe.lat]
                                            });
                                        } else if (isMobile) {
                                            setSelectedCafe({ cafe, coordinates: [cafe.lon, cafe.lat] });
                                        } else {
                                            setActiveMarkerKey(markerKey);
                                        }
                                    }}
                                >
                                    <MarkerContent>
                                        <IconMarker
                                            color={isEuCoffeeTrip ? "bg-blue-900" : "bg-sky-500"}
                                            icon={Coffee}
                                            isActive={activeMarkerKey === markerKey}
                                            isHidden={hidden}
                                            poiCount={colocated.length}
                                        />
                                    </MarkerContent>
                                    {!isLinkingMode && !hasMultiplePois && !isMobile && (
                                        <MarkerPopup onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                            <CafePopupContent cafe={cafe} onClose={handlePopupClose} />
                                        </MarkerPopup>
                                    )}
                                </MapMarker>
                            );
                        })}
                    </>
                ) : (
                    <>
                        {/* Zoomed out: Show clusters */}
                        {euCoffeeTripGeoJSON.features.length > 0 && (
                            <MapClusterLayer
                                data={euCoffeeTripGeoJSON}
                                clusterRadius={50}
                                clusterMaxZoom={14}
                                clusterColors={["#1e3a8a", "#1e40af", "#172554"]}
                                pointColor="#1e3a8a"
                                styleKey={mapStyleKey}
                                onPointClick={(feature, coordinates) => {
                                    const cafe = feature.properties as unknown as CafeData;
                                    if (isLinkingMode) {
                                        handleLinkingClick({
                                            type: 'place',
                                            id: generatePlaceId('cafe', cafe.lat, cafe.lon),
                                            name: cafe.name,
                                            address: cafe.address,
                                            data: cafe,
                                        });
                                    } else {
                                        setSelectedCafe({ cafe, coordinates });
                                    }
                                }}
                            />
                        )}
                        {regularCafeGeoJSON.features.length > 0 && (
                            <MapClusterLayer
                                data={regularCafeGeoJSON}
                                clusterRadius={50}
                                clusterMaxZoom={14}
                                clusterColors={["#0284c7", "#0369a1", "#075985"]}
                                pointColor="#0284c7"
                                styleKey={mapStyleKey}
                                onPointClick={(feature, coordinates) => {
                                    const cafe = feature.properties as unknown as CafeData;
                                    if (isLinkingMode) {
                                        handleLinkingClick({
                                            type: 'place',
                                            id: generatePlaceId('cafe', cafe.lat, cafe.lon),
                                            name: cafe.name,
                                            address: cafe.address,
                                            data: cafe,
                                        });
                                    } else {
                                        setSelectedCafe({ cafe, coordinates });
                                    }
                                }}
                            />
                        )}
                    </>
                )}

                {/* PROPERTIES - Conditional rendering based on zoom */}
                {showPins ? (
                    <>
                        {/* Zoomed in: Show icon markers */}
                        {visibleProperties.map((property, i) => {
                            const markerKey = `property-icon-${property.latitude}-${property.longitude}-${i}`;
                            if (!shouldDrawPin(markerKey, property.latitude, property.longitude)) return null;
                            const placeId = generatePropertyPlaceId(property);
                            const hidden = isHidden(placeId);
                            // In "Hidden" mode, only show hidden POIs
                            if (showHiddenPois && !hidden) return null;
                            const colocated = getColocatedPois(property.latitude, property.longitude);
                            // If hidden: show faded if alone, skip if other visible POIs at same spot
                            if (hidden && !showHiddenPois && colocated.length > 0) return null;
                            const hasMultiplePois = colocated.length > 1;
                            const pitchStatus = getPitchStatus(placeId);
                            const propertyAssignment = getPropertyAssignment(placeId);
                            const effectiveMarkerStatus = propertyAssignment?.status === "pre_rejected" ? "rejected" : pitchStatus;
                            const pitchVisuals = effectiveMarkerStatus ? PITCH_STATUS_STYLES[effectiveMarkerStatus] : null;
                            return (
                                <MapMarker
                                    key={markerKey}
                                    latitude={property.latitude}
                                    longitude={property.longitude}
                                    onClick={() => {
                                        if (isLinkingMode) {
                                            handleLinkingClick({
                                                type: 'place',
                                                id: placeId,
                                                name: property.title,
                                                address: property.address,
                                                data: property,
                                            });
                                        } else if (hasMultiplePois) {
                                            setDisambiguationData({
                                                pois: colocated,
                                                coordinates: [property.longitude, property.latitude]
                                            });
                                        } else if (isMobile) {
                                            setSelectedProperty({ property, coordinates: [property.longitude, property.latitude] });
                                        } else {
                                            setActiveMarkerKey(markerKey);
                                        }
                                    }}
                                >
                                    <MarkerContent>
                                        <IconMarker color="bg-[#78C500]" icon={Home} isActive={activeMarkerKey === markerKey} isHidden={hidden} poiCount={colocated.length} ringClass={pitchVisuals?.ringClass ?? ""} glowStyle={pitchVisuals?.glowStyle} statusIndicator={effectiveMarkerStatus ?? undefined} />
                                    </MarkerContent>
                                    {!isLinkingMode && !hasMultiplePois && !isMobile && (
                                        <MarkerPopup onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                            <PropertyPopupContent property={property} cityId={selectedCity?.id || ''} onClose={handlePopupClose} />
                                        </MarkerPopup>
                                    )}
                                </MapMarker>
                            );
                        })}
                    </>
                ) : (
                    <>
                        {/* Zoomed out: Show clusters */}
                        {propertyGeoJSON.features.length > 0 && (
                            <MapClusterLayer
                                data={propertyGeoJSON}
                                clusterRadius={50}
                                clusterMaxZoom={14}
                                clusterColors={["#78C500", "#6BB300", "#5EA000"]}
                                pointColor="#78C500"
                                styleKey={mapStyleKey}
                                onPointClick={(feature, coordinates) => {
                                    const property = rehydratePropertyData(feature.properties);
                                    if (isLinkingMode) {
                                        handleLinkingClick({
                                            type: 'place',
                                            id: generatePropertyPlaceId(property),
                                            name: property.title,
                                            address: property.address,
                                            data: property,
                                        });
                                    } else {
                                        setSelectedProperty({ property, coordinates });
                                    }
                                }}
                            />
                        )}
                    </>
                )}

                {/* OTHER POIs - Conditional rendering based on zoom */}
                {showPins ? (
                    <>
                        {/* Zoomed in: Show icon markers */}
                        {visibleOtherPois.map((poi, i) => {
                            const config = iconConfig[poi.type] || iconConfig.cafe;
                            const Icon = config.icon;
                            // Convert Tailwind text color to bg color for IconMarker
                            const bgColorMap: Record<string, string> = {
                                transit: "bg-sky-700",
                                office: "bg-purple-800",
                                shopping: "bg-fuchsia-700",
                                high_street: "bg-orange-700",
                                dorm: "bg-cyan-700",
                                university: "bg-rose-700",
                                gym: "bg-red-700",
                            };
                            const markerKey = `poi-icon-${poi.lat}-${poi.lon}-${i}`;
                            if (!shouldDrawPin(markerKey, poi.lat, poi.lon)) return null;
                            const placeId = generatePlaceId(poi.type, poi.lat, poi.lon);
                            const hidden = isHidden(placeId);
                            // In "Hidden" mode, only show hidden POIs
                            if (showHiddenPois && !hidden) return null;
                            const colocated = getColocatedPois(poi.lat, poi.lon);
                            // If hidden: show faded if alone, skip if other visible POIs at same spot
                            if (hidden && !showHiddenPois && colocated.length > 0) return null;
                            const hasMultiplePois = colocated.length > 1;
                            return (
                                <MapMarker
                                    key={markerKey}
                                    latitude={poi.lat}
                                    longitude={poi.lon}
                                    onClick={() => {
                                        if (isLinkingMode) {
                                            handleLinkingClick({
                                                type: 'place',
                                                id: placeId,
                                                name: poi.name,
                                                address: poi.address,
                                                data: poi,
                                            });
                                        } else if (hasMultiplePois) {
                                            setDisambiguationData({
                                                pois: colocated,
                                                coordinates: [poi.lon, poi.lat]
                                            });
                                        } else if (isMobile) {
                                            setSelectedPoi({ poi, coordinates: [poi.lon, poi.lat] });
                                        } else {
                                            setActiveMarkerKey(markerKey);
                                        }
                                    }}
                                >
                                    <MarkerContent>
                                        <IconMarker color={bgColorMap[poi.type] || "bg-gray-500"} icon={Icon} isActive={activeMarkerKey === markerKey} isHidden={hidden} poiCount={colocated.length} />
                                    </MarkerContent>
                                    {!isLinkingMode && !hasMultiplePois && !isMobile && (
                                        <MarkerPopup onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                            <OtherPoiPopupContent poi={poi} onClose={handlePopupClose} />
                                        </MarkerPopup>
                                    )}
                                </MapMarker>
                            );
                        })}
                    </>
                ) : (
                    <>
                        {/* Zoomed out: Show clusters by type */}
                        {Object.entries(poiGeoJSONByType).map(([type, geoJSON]) => (
                            geoJSON.features.length > 0 && (
                                <MapClusterLayer
                                    key={type}
                                    data={geoJSON}
                                    clusterRadius={50}
                                    clusterMaxZoom={14}
                                    clusterColors={clusterColorsByType[type] || ["#6b7280", "#4b5563", "#374151"]}
                                    pointColor={pointColorByType[type] || "#6b7280"}
                                    styleKey={mapStyleKey}
                                    onPointClick={(feature, coordinates) => {
                                        const poi = feature.properties as unknown as OtherPoiData;
                                        if (isLinkingMode) {
                                            handleLinkingClick({
                                                type: 'place',
                                                id: generatePlaceId(poi.type, poi.lat, poi.lon),
                                                name: poi.name,
                                                address: poi.address,
                                                data: poi,
                                            });
                                        } else {
                                            setSelectedPoi({ poi, coordinates });
                                        }
                                    }}
                                />
                            )
                        ))}
                    </>
                )}

                {/* Desktop POI Popups - must be inside Map for useMap context */}
                {!isMobile && selectedCafe && (
                    <MapPopup
                        longitude={selectedCafe.coordinates[0]}
                        latitude={selectedCafe.coordinates[1]}
                        onClose={handleDetailPopupClose}
                        anchor="top"
                        closeOnClick={false}
                        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                    >
                        <CafePopupContent cafe={selectedCafe.cafe} onClose={handleDetailPopupClose} />
                    </MapPopup>
                )}

                {!isMobile && selectedProperty && (
                    <MapPopup
                        longitude={selectedProperty.coordinates[0]}
                        latitude={selectedProperty.coordinates[1]}
                        onClose={handleDetailPopupClose}
                        anchor="top"
                        closeOnClick={false}
                        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                    >
                        <PropertyPopupContent property={selectedProperty.property} cityId={selectedCity?.id || ''} onClose={handleDetailPopupClose} />
                    </MapPopup>
                )}

                {!isMobile && selectedPoi && (
                    <MapPopup
                        longitude={selectedPoi.coordinates[0]}
                        latitude={selectedPoi.coordinates[1]}
                        onClose={handleDetailPopupClose}
                        anchor="top"
                        closeOnClick={false}
                        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                    >
                        <OtherPoiPopupContent poi={selectedPoi.poi} onClose={handleDetailPopupClose} />
                    </MapPopup>
                )}

            </Map>

            {/* Mobile POI Popups - BottomSheet must be outside Map */}
            {isMobile && selectedCafe && (
                <BottomSheet
                    isOpen={true}
                    onClose={handleDetailPopupClose}
                    snapPoint="partial"
                    showCloseButton={false}
                    bleedTop
                >
                    <CafePopupContent cafe={selectedCafe.cafe} onClose={handleDetailPopupClose} />
                </BottomSheet>
            )}

            {isMobile && selectedProperty && (
                <BottomSheet
                    isOpen={true}
                    onClose={handleDetailPopupClose}
                    snapPoint="partial"
                    showCloseButton={false}
                    bleedTop
                >
                    <PropertyPopupContent property={selectedProperty.property} cityId={selectedCity?.id || ''} onClose={handleDetailPopupClose} />
                </BottomSheet>
            )}

            {isMobile && selectedPoi && (
                <BottomSheet
                    isOpen={true}
                    onClose={handleDetailPopupClose}
                    snapPoint="partial"
                    showCloseButton={false}
                    bleedTop
                >
                    <OtherPoiPopupContent poi={selectedPoi.poi} onClose={handleDetailPopupClose} />
                </BottomSheet>
            )}

            {/* Disambiguation Popup - bottom sheet on mobile, floating overlay on desktop */}
            {isMobile && disambiguationData && (
                <BottomSheet
                    isOpen={true}
                    onClose={handleDisambiguationClose}
                    snapPoint="auto"
                >
                    <DisambiguationPopup
                        pois={disambiguationData.pois}
                        onSelect={handleDisambiguationSelect}
                    />
                </BottomSheet>
            )}

            {!isMobile && disambiguationData && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            handleDisambiguationClose();
                        }
                    }}
                >
                    <div className="absolute inset-0 bg-black/20 pointer-events-none" />
                    <div className="relative animate-in fade-in-0 zoom-in-95 duration-200">
                        <DisambiguationPopup
                            pois={disambiguationData.pois}
                            onSelect={handleDisambiguationSelect}
                        />
                        <button
                            onClick={handleDisambiguationClose}
                            className="absolute -top-2 -right-2 w-7 h-7 bg-white rounded-full shadow-lg
                                       flex items-center justify-center hover:bg-gray-100 transition-colors"
                        >
                            <X className="w-4 h-4 text-zinc-600" />
                        </button>
                    </div>
                </div>
            )}

            {/* Loading overlay */}
            {isLoading && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="flex flex-col items-center gap-2">
                        <LoadingOrb size={64} />
                        <span className="text-sm text-zinc-600">Loading map data...</span>
                    </div>
                </div>
            )}
        </div>
        </CafeProfilesContext.Provider>
    );
}
