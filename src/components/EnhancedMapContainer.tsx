"use client";

import React, { useMemo, useState, useEffect } from "react";
import MapLibreGL from "maplibre-gl";
import {
    Map,
    MapControls,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    MapPopup,
    MapClusterLayer,
    useMap,
} from "@/components/ui/map";
import { MapDraw } from "@/components/ui/map-draw";
import { DrawToolbar } from "@/components/DrawToolbar";
import { ShapeComments } from "@/components/ShapeComments";
import { ShapeHoverTooltip } from "@/components/ShapeHoverTooltip";
import { DrawingIndicator } from "@/components/DrawingIndicator";
import { MapStyleSwitcher } from "@/components/MapStyleSwitcher";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { useLinking } from "@/contexts/LinkingContext";
import type { City } from "@/components/CitySelector";
import { AddToListButton } from "@/components/AddToListButton";
import { CreateTripButton } from "@/components/CreateTripButton";
import { HideButton } from "@/components/HideButton";
import { useHiddenPoisContext } from "@/contexts/HiddenPoisContext";
import type { PlaceInfo } from "@/types/lists";
import type { EuctFilter } from "@/types/filters";
import { TrafficValueCard } from "@/components/TrafficValueCard";
import { isRecentlyAdded } from "@/lib/dateUtils";
import { useMapData, CafeData, PropertyData, OtherPoiData, LocationData } from "@/hooks/useMapData";
import { useOverlayData } from "@/hooks/useOverlayData";
import { useAttachments } from "@/hooks/useAttachments";
import { AttachmentGallery } from "@/components/attachments";
import { PopupCommentsSection } from "@/components/PopupCommentsSection";
import { DisambiguationPopup } from "@/components/DisambiguationPopup";
import { useMobile } from "@/hooks/useMobile";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useSheetState } from "@/contexts/SheetContext";
import {
    Coffee,
    Building2,
    Train,
    TrainFront,
    ShoppingBag,
    Users,
    GraduationCap,
    Home,
    ExternalLink,
    MapPin,
    Star,
    Snowflake,
    Flame,
    Sparkles,
    Instagram,
    Facebook,
    Globe,
    LayoutGrid,
    ChevronDown,
    X,
    MessageSquare,
    Paperclip,
    Dumbbell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactNumber } from "@/lib/format-numbers";

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

// Helper function to generate unique placeId
// Format: {type}-{lat}-{lon} (coordinates with 5 decimal places = ~1m precision)
function generatePlaceId(type: string, lat: number, lon: number): string {
    return `${type}-${lat.toFixed(5)}-${lon.toFixed(5)}`;
}

// Adaptive popup container - renders MapPopup on desktop, BottomSheet on mobile
interface AdaptivePopupProps {
    coordinates: [number, number];
    onClose: () => void;
    children: React.ReactNode;
    isMobile: boolean;
}

function AdaptivePopup({ coordinates, onClose, children, isMobile }: AdaptivePopupProps) {
    if (isMobile) {
        return (
            <BottomSheet isOpen={true} onClose={onClose} snapPoint="partial">
                <div className="p-4">{children}</div>
            </BottomSheet>
        );
    }

    return (
        <MapPopup
            longitude={coordinates[0]}
            latitude={coordinates[1]}
            onClose={onClose}
            closeButton
            anchor="top"
            className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
        >
            {children}
        </MapPopup>
    );
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
        const ratingMatch = !ratingFilter || (cafe.rating && cafe.rating >= ratingFilter);
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
        small: "w-7 h-7",
        default: "w-9 h-9",
        large: "w-11 h-11"
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
                    // State-based styling
                    state === "default" && "hover:scale-125 hover:shadow-xl hover:z-50",
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

// Reusable attachments section for POI popups (collapsible) - memoized to prevent re-renders
const PopupAttachmentsSection = React.memo(function PopupAttachmentsSection({ placeId }: { placeId: string }) {
    const { getPoiAttachments, addPoiAttachment, removePoiAttachment } = useAttachments();
    const { showToast } = useToast();
    const [isExpanded, setIsExpanded] = useState(false);
    const attachments = getPoiAttachments(placeId);

    const handleUpload = async (file: File) => {
        const result = await addPoiAttachment(placeId, file);
        if (result.success) {
            showToast('Saved');
        } else {
            showToast(result.error || 'Upload failed', 'error');
        }
        return result;
    };

    const handleRemove = (attachmentId: string) => {
        removePoiAttachment(placeId, attachmentId);
        showToast('Deleted');
    };

    return (
        <div
            className="popup-attachments group/section hover:bg-zinc-100 transition-colors duration-150 cursor-pointer rounded-md -mx-2 px-2"
            style={{ padding: '12px 22px' }}
            onClick={() => setIsExpanded(!isExpanded)}
        >
            {/* Header row */}
            <div className="flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Attachments</span>
                <span className="w-4 h-4 flex items-center justify-center bg-zinc-100 group-hover/section:bg-zinc-200 text-zinc-500 text-[9px] font-medium rounded-full transition-colors duration-150">
                    {attachments.length}
                </span>
                <ChevronDown
                    className={`w-3.5 h-3.5 text-zinc-300 ml-auto opacity-0 group-hover/section:opacity-100 transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </div>
            {isExpanded && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                    <AttachmentGallery
                        attachments={attachments}
                        onUpload={handleUpload}
                        onRemove={handleRemove}
                    />
                </div>
            )}
        </div>
    );
});

// EU Coffee Trip Popup - Uses universal popup base classes - memoized to prevent re-renders
const EuCoffeeTripPopup = React.memo(function EuCoffeeTripPopup({ cafe }: { cafe: CafeData }) {
    const mapsUrl = cafe.googleMapsUrl || `https://www.google.com/maps?q=${cafe.lat},${cafe.lon}`;
    const recentlyAdded = isRecentlyAdded(cafe.datePublished);
    const commentCount = 0; // TODO: Get from data when available
    const placeId = `cafe-${cafe.lat.toFixed(5)}-${cafe.lon.toFixed(5)}`;

    return (
        <div className="popup-base">
            {/* Hide button - positioned next to close button */}
            <HideButton placeId={placeId} className="absolute top-2.5 right-12 z-20" />

            {/* Image with overlays */}
            {cafe.image && (
                <div className="popup-image tall">
                    <img src={cafe.image} alt={cafe.name} />

                    {/* New ribbon */}
                    {recentlyAdded && (
                        <div className="popup-new-ribbon">Added in the last 3 months</div>
                    )}

                    {/* Chips on image */}
                    {cafe.premium && (
                        <div className="popup-overlay-chips">
                            <span className="popup-chip premium">
                                <Star size={12} /> Premium
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Header */}
            <div className="popup-header">
                <span className="popup-name">{cafe.name}</span>
            </div>

            {/* Address */}
            <div className="popup-address">{cafe.address}</div>

            {/* Body - Rating row with comments on right */}
            <div className="popup-body">
                <div className="popup-rating-row">
                    <div className="popup-rating">
                        {cafe.rating && (
                            <>
                                <Star size={14} fill="#FFD700" color="#FFD700" />
                                <span className="value">{cafe.rating.toFixed(1)}</span>
                                {cafe.reviewCount && <span className="reviews">({cafe.reviewCount})</span>}
                                <span className="separator">·</span>
                            </>
                        )}
                        <span className="price">€1-10</span>
                        <span className="separator">·</span>
                        <span className="status-open">Open</span>
                    </div>

                    {/* Comments bubble - right aligned */}
                    {commentCount > 0 && (
                        <button className="popup-comments">
                            <MessageSquare size={14} />
                            {commentCount}
                        </button>
                    )}
                </div>
            </div>

            {/* Attachments section */}
            <PopupAttachmentsSection placeId={placeId} />

            {/* Comments section */}
            <PopupCommentsSection placeId={placeId} />

            {/* Footer */}
            <div className="popup-footer">
                <div className="popup-buttons">
                    {cafe.link && (
                        <a href={cafe.link} target="_blank" rel="noopener noreferrer" className="popup-btn-icon">
                            <img src="/assets/eu_coffee_trip_logo.png" alt="EU Coffee Trip" />
                        </a>
                    )}
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="popup-btn-icon has-bg">
                        <img src="/assets/google-maps-logo-bare.png" alt="Maps" style={{ width: 19, height: 19, objectFit: 'contain' }} />
                    </a>
                    {cafe.instagram && (
                        <a href={cafe.instagram} target="_blank" rel="noopener noreferrer" className="popup-btn-icon social">
                            <Instagram />
                        </a>
                    )}
                    {cafe.facebook && (
                        <a href={cafe.facebook} target="_blank" rel="noopener noreferrer" className="popup-btn-icon social">
                            <Facebook />
                        </a>
                    )}
                    {cafe.website && (
                        <a href={cafe.website} target="_blank" rel="noopener noreferrer" className="popup-btn-icon social">
                            <Globe />
                        </a>
                    )}
                </div>
                {/* Hide "Add to list" for Miners' own cafes */}
                {!cafe.franchisePartner && (
                    <AddToListButton place={{
                        placeId: `cafe-${cafe.lat}-${cafe.lon}`,
                        placeType: 'eu_coffee_trip',
                        placeName: cafe.name,
                        placeAddress: cafe.address,
                        lat: cafe.lat,
                        lon: cafe.lon,
                    }} />
                )}
            </div>
        </div>
    );
});

// Regular Cafe popup content (non-EU Coffee Trip) - Uses universal popup base - memoized
const RegularCafePopup = React.memo(function RegularCafePopup({ cafe }: { cafe: CafeData }) {
    const mapsUrl = cafe.googleMapsUrl || `https://www.google.com/maps?q=${cafe.lat},${cafe.lon}`;
    const commentCount = 0; // TODO: Get from data when available
    const placeId = `cafe-${cafe.lat.toFixed(5)}-${cafe.lon.toFixed(5)}`;

    return (
        <div className="popup-base">
            {/* Hide button - positioned next to close button */}
            <HideButton placeId={placeId} className="absolute top-2.5 right-12 z-20" />

            {/* Header */}
            <div className="popup-header">
                <span className="popup-name">{cafe.name}</span>
            </div>

            {/* Address */}
            <div className="popup-address">{cafe.address}</div>

            {/* Body - Rating row with comments on right */}
            <div className="popup-body">
                <div className="popup-rating-row">
                    <div className="popup-rating">
                        {cafe.rating && (
                            <>
                                <Star size={14} fill="#FFD700" color="#FFD700" />
                                <span className="value">{cafe.rating.toFixed(1)}</span>
                                {cafe.reviewCount && <span className="reviews">({cafe.reviewCount})</span>}
                                <span className="separator">·</span>
                            </>
                        )}
                        <span className="price">€1-10</span>
                        <span className="separator">·</span>
                        <span className="status-open">Open</span>
                    </div>

                    {/* Comments bubble - right aligned */}
                    {commentCount > 0 && (
                        <button className="popup-comments">
                            <MessageSquare size={14} />
                            {commentCount}
                        </button>
                    )}
                </div>
            </div>

            {/* Attachments section */}
            <PopupAttachmentsSection placeId={placeId} />

            {/* Comments section */}
            <PopupCommentsSection placeId={placeId} />

            {/* Footer */}
            <div className="popup-footer">
                <div className="popup-buttons">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="popup-btn-icon has-bg">
                        <img src="/assets/google-maps-logo-bare.png" alt="Maps" style={{ width: 19, height: 19, objectFit: 'contain' }} />
                    </a>
                </div>
                {/* Hide "Add to list" for Miners' own cafes */}
                {!cafe.franchisePartner && (
                    <AddToListButton place={{
                        placeId: placeId,
                        placeType: 'regular_cafe',
                        placeName: cafe.name,
                        placeAddress: cafe.address,
                        lat: cafe.lat,
                        lon: cafe.lon,
                    }} />
                )}
            </div>
        </div>
    );
});

// Cafe popup dispatcher - renders appropriate popup based on cafe type
function CafePopupContent({ cafe }: { cafe: CafeData }) {
    const isEuCoffeeTrip = cafe.link?.includes("europeancoffeetrip");

    if (isEuCoffeeTrip) {
        return <EuCoffeeTripPopup cafe={cafe} />;
    }

    return <RegularCafePopup cafe={cafe} />;
}

// Helper to capitalize first letter of address
function capitalizeFirst(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Property popup content - Uses universal popup base - memoized
const PropertyPopupContent = React.memo(function PropertyPopupContent({ property, cityId, onClose }: { property: PropertyData; cityId: string; onClose?: () => void }) {
    const mapsUrl = `https://www.google.com/maps?q=${property.latitude},${property.longitude}`;
    const placeId = `property-${property.latitude.toFixed(5)}-${property.longitude.toFixed(5)}`;

    // Build features array
    const features: string[] = [];
    if (property.hasAirConditioning) features.push('A/C');
    if (property.hasBathroom) features.push('Bathroom');
    if (property.hasStorefront) features.push('Storefront');

    return (
        <div className="popup-base">
            {/* Hide button - positioned next to close button */}
            <HideButton placeId={placeId} className="absolute top-2.5 right-12 z-20" />

            {/* Header - Title */}
            <div className="popup-header">
                <span className="popup-name">{capitalizeFirst(property.title)}</span>
            </div>

            {/* Address */}
            <div className="popup-address">{capitalizeFirst(property.address)}</div>

            {/* Price section with accent bar */}
            <div className="popup-price-accent">
                <div className="popup-price-main">
                    €{property.price.toLocaleString()}/month
                </div>
                <div className="popup-price-secondary">
                    {property.priceByArea > 0 && (
                        <span>€{property.priceByArea.toLocaleString()}/m²</span>
                    )}
                    {property.priceByArea > 0 && property.size > 0 && (
                        <span className="separator">·</span>
                    )}
                    <span>{property.size} m²</span>
                </div>
            </div>

            {/* Transfer chip - standalone if present */}
            {property.transfer && (
                <div className="popup-transfer-row">
                    <span className="popup-price-transfer">
                        Transfer: €{property.transfer.toLocaleString()}
                    </span>
                </div>
            )}

            {/* Features row */}
            {features.length > 0 && (
                <div className="popup-details-row">
                    {features.map((feature, i) => (
                        <span key={feature}>
                            {i > 0 && <span className="separator">·</span>}
                            {feature}
                        </span>
                    ))}
                </div>
            )}

            {/* Attachments section */}
            <PopupAttachmentsSection placeId={placeId} />

            {/* Comments section */}
            <PopupCommentsSection placeId={placeId} />

            {/* Footer */}
            <div className="popup-footer">
                <div className="popup-buttons">
                    <a href={property.url} target="_blank" rel="noopener noreferrer" className="popup-btn-icon">
                        <img src="/assets/idealista-logo.png" alt="Idealista" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                    </a>
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="popup-btn-icon has-bg">
                        <img src="/assets/google-maps-logo-bare.png" alt="Maps" style={{ width: 19, height: 19, objectFit: 'contain' }} />
                    </a>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                    <CreateTripButton
                        property={{
                            id: `property-${property.latitude}-${property.longitude}`,
                            name: property.title,
                            address: property.address,
                            type: 'place',
                            data: property,
                        }}
                        cityId={cityId}
                        onClose={onClose}
                    />
                    <AddToListButton place={{
                        placeId: `property-${property.latitude}-${property.longitude}`,
                        placeType: 'property',
                        placeName: property.title,
                        placeAddress: property.address,
                        lat: property.latitude,
                        lon: property.longitude,
                    }} />
                </div>
            </div>
        </div>
    );
});

// Other POI popup content - Uses universal popup base - memoized
const OtherPoiPopupContent = React.memo(function OtherPoiPopupContent({ poi }: { poi: OtherPoiData }) {
    const mapsUrl = poi.mapsUrl || `https://www.google.com/maps?q=${poi.lat},${poi.lon}`;
    const commentCount = 0; // TODO: Get from data when available
    const placeId = `${poi.type}-${poi.lat.toFixed(5)}-${poi.lon.toFixed(5)}`;

    return (
        <div className="popup-base">
            {/* Hide button - positioned next to close button */}
            <HideButton placeId={placeId} className="absolute top-2.5 right-12 z-20" />

            {/* Header with name, type chip, and comment bubble */}
            <div className="popup-header">
                <span className="popup-name">{poi.name}</span>
                <span className="popup-chip type">{poi.category}</span>
                {commentCount > 0 && (
                    <button className="popup-comments">
                        <MessageSquare size={14} />
                        {commentCount}
                    </button>
                )}
            </div>

            {/* Address */}
            <div className="popup-address">{poi.address}</div>

            {/* Attachments section */}
            <PopupAttachmentsSection placeId={placeId} />

            {/* Comments section */}
            <PopupCommentsSection placeId={placeId} />

            {/* Footer */}
            <div className="popup-footer">
                <div className="popup-buttons">
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="popup-btn-icon has-bg">
                        <img src="/assets/google-maps-logo-bare.png" alt="Maps" style={{ width: 19, height: 19, objectFit: 'contain' }} />
                    </a>
                    {poi.website && (
                        <a href={poi.website} target="_blank" rel="noopener noreferrer" className="popup-btn-icon social">
                            <Globe />
                        </a>
                    )}
                </div>
                <AddToListButton place={{
                    placeId: placeId,
                    placeType: poi.type as PlaceInfo['placeType'],
                    placeName: poi.name,
                    placeAddress: poi.address,
                    lat: poi.lat,
                    lon: poi.lon,
                }} />
            </div>
        </div>
    );
});

// Internal component that manages overlay layers (must be inside Map component)
function OverlayLayerManager({
    trafficEnabled,
    populationEnabled,
    populationDensityFilter,
    incomeEnabled,
    incomeWealthyFilter,
    trafficData,
    populationData,
    incomeData,
    styleKey,
}: {
    trafficEnabled: boolean;
    populationEnabled: boolean;
    populationDensityFilter: number;
    incomeEnabled: boolean;
    incomeWealthyFilter: number;
    trafficData: any;
    populationData: any;
    incomeData: any;
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

        return () => {
            removeTrafficLayers(map);
            removePopulationLayers(map);
            removeIncomeLayers(map);
        };
    }, [map, isLoaded, trafficEnabled, populationEnabled, populationDensityFilter, incomeEnabled, incomeWealthyFilter, trafficData, populationData, incomeData, styleKey]);

    return null; // This component doesn't render anything
}

// Zoom threshold for switching between clusters and icon markers
const ICON_ZOOM_THRESHOLD = 14;

// Component to listen for navigation events from ActivityLog and ListsPanel
function NavigationEventListener({
    onOpenCafePopup,
    onOpenPropertyPopup,
    onOpenPoiPopup,
    setSelectedCafe,
    setSelectedProperty,
    setSelectedPoi,
}: {
    onOpenCafePopup?: (placeId: string) => void;
    onOpenPropertyPopup?: (placeId: string) => void;
    onOpenPoiPopup?: (placeId: string) => void;
    // Direct setters for when data is available (avoids O(n) search)
    setSelectedCafe?: (value: { cafe: CafeData; coordinates: [number, number] } | null) => void;
    setSelectedProperty?: (value: { property: PropertyData; coordinates: [number, number] } | null) => void;
    setSelectedPoi?: (value: { poi: OtherPoiData; coordinates: [number, number] } | null) => void;
}) {
    const { map, isLoaded } = useMap();

    useEffect(() => {
        if (!map || !isLoaded) return;

        // Simple navigation (just fly to location)
        const handleNavigate = (e: CustomEvent<{ lat: number; lon: number }>) => {
            const { lat, lon } = e.detail;
            map.flyTo({
                center: [lon, lat],
                zoom: 16,
                duration: 1500,
            });
        };

        // Navigation AND open popup (from ListsPanel or ScoutingTripDetail)
        const handleNavigateAndOpenPopup = (e: CustomEvent<{ lat: number; lon: number; placeId: string; placeType?: string; data?: any }>) => {
            const { lat, lon, placeId, data } = e.detail;

            // Fly to location (fast animation)
            map.flyTo({
                center: [lon, lat],
                zoom: 16,
                duration: 600,
            });

            // Parse placeId to determine type (format: "type-lat-lon")
            const parts = placeId.split('-');
            const type = parts[0];

            // Open popup after flight completes
            setTimeout(() => {
                // If POI data was passed, use it directly (O(1) - no search needed)
                if (data) {
                    if (type === 'cafe' || type === 'eu_coffee_trip' || type === 'regular_cafe') {
                        setSelectedCafe?.({ cafe: data, coordinates: [lon, lat] });
                    } else if (type === 'property') {
                        setSelectedProperty?.({ property: data, coordinates: [lon, lat] });
                    } else {
                        setSelectedPoi?.({ poi: data, coordinates: [lon, lat] });
                    }
                } else {
                    // Fallback: search for POI (O(n) - for backward compatibility)
                    if (type === 'cafe' || type === 'eu_coffee_trip' || type === 'regular_cafe') {
                        onOpenCafePopup?.(placeId);
                    } else if (type === 'property') {
                        onOpenPropertyPopup?.(placeId);
                    } else {
                        onOpenPoiPopup?.(placeId);
                    }
                }
            }, 650); // Wait for 600ms animation to complete
        };

        window.addEventListener('navigate-to-location', handleNavigate as EventListener);
        window.addEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);

        return () => {
            window.removeEventListener('navigate-to-location', handleNavigate as EventListener);
            window.removeEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
        };
    }, [map, isLoaded, onOpenCafePopup, onOpenPropertyPopup, onOpenPoiPopup, setSelectedCafe, setSelectedProperty, setSelectedPoi]);

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
            map.off('zoom', handleZoom);
        };
    }, [map, isLoaded, onShowIconsChange]);

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
    poiCount = 1
}: {
    color: string;
    icon: React.ElementType;
    isMiners?: boolean;
    isActive?: boolean;
    isHidden?: boolean;
    poiCount?: number;
}) {
    const showBadge = poiCount > 1;

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
        <div className={cn("relative", isHidden && "marker-hidden")}>
            <div className={cn(
                `${color} rounded-full p-1.5 shadow-lg transition-transform duration-200`,
                isActive ? "scale-125" : "hover:scale-125"
            )}>
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

interface EnhancedMapContainerProps {
    activeFilters: Set<string>;
    ratingFilter?: number;
    euctFilter?: EuctFilter;
    trafficEnabled?: boolean;
    trafficValuesEnabled?: boolean;
    populationEnabled?: boolean;
    populationDensityFilter?: number;
    incomeEnabled?: boolean;
    incomeWealthyFilter?: number;
    trafficHour?: number;
    onDrawnFeaturesChange?: (features: GeoJSON.FeatureCollection) => void;
    selectedCity?: City;
    isLinkingMode?: boolean;
    showHiddenPois?: boolean;
}

export function EnhancedMapContainer({
    activeFilters,
    ratingFilter = 0,
    euctFilter = "all",
    trafficEnabled,
    trafficValuesEnabled,
    populationEnabled,
    populationDensityFilter = 0,
    incomeEnabled,
    incomeWealthyFilter = 0,
    trafficHour,
    onDrawnFeaturesChange,
    selectedCity,
    isLinkingMode = false,
    showHiddenPois = false,
}: EnhancedMapContainerProps) {
    const { cafes, properties, otherPois, isLoading, error } = useMapData();
    const {
        trafficData,
        trafficGroupedData,
        populationData,
        incomeData,
        isLoadingTraffic,
        isLoadingPopulation,
        isLoadingIncome,
        loadTrafficData,
        loadTrafficGroupedData,
        loadPopulationData,
        loadIncomeData,
    } = useOverlayData();

    // Linking context for adding POIs to scouting trips
    const { addItem: addLinkingItem } = useLinking();

    // Hidden POIs context
    const { isHidden } = useHiddenPoisContext();

    // Handler for marker click in linking mode
    const handleLinkingClick = React.useCallback((item: {
        type: 'place' | 'area';
        id: string;
        name: string;
        address?: string;
        data?: any; // Full POI object for fast navigation (avoids O(n) search)
    }) => {
        if (isLinkingMode) {
            addLinkingItem(item);
        }
    }, [isLinkingMode, addLinkingItem]);

    // Miners cafes - ALWAYS visible regardless of filters (filtered by city)
    const minersCafes = useMemo(
        () => cafes.filter(c => c.franchisePartner && c.city === selectedCity?.id),
        [cafes, selectedCity]
    );

    // Filter visible markers based on active filters, rating, and city (excluding Miners cafes)
    // When in linking mode or showHiddenPois mode, show ALL markers
    const visibleCafes = useMemo(
        () => cafes.filter(c => {
            // Skip Miners cafes - they're always shown separately
            if (c.franchisePartner) return false;

            // City filter - only show cafes from selected city
            if (c.city !== selectedCity?.id) return false;

            // In linking mode or showHiddenPois mode, show all cafes (skip category filters)
            if (isLinkingMode || showHiddenPois) return true;

            // Delegate category, EUCT sub-filter, and rating checks to shared helper
            return isPoiFilterActive(c, activeFilters, ratingFilter, euctFilter);
        }),
        [cafes, activeFilters, ratingFilter, euctFilter, selectedCity, isLinkingMode, showHiddenPois]
    );

    const visibleProperties = useMemo(
        () => (isLinkingMode || showHiddenPois || activeFilters.has("property") ? properties : []),
        [properties, activeFilters, isLinkingMode, showHiddenPois]
    );

    const visibleOtherPois = useMemo(
        () => (isLinkingMode || showHiddenPois) ? otherPois : otherPois.filter((poi) => activeFilters.has(poi.type)),
        [otherPois, activeFilters, isLinkingMode, showHiddenPois]
    );

    // Convert cafes to GeoJSON for cluster layers (split by type for different colors)
    // When showHiddenPois is true, only include hidden POIs
    const euCoffeeTripGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
        type: "FeatureCollection",
        features: visibleCafes
            .filter(c => c.link?.includes("europeancoffeetrip"))
            .filter(cafe => {
                if (!showHiddenPois) return true;
                const placeId = generatePlaceId('cafe', cafe.lat, cafe.lon);
                return isHidden(placeId);
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
            .filter(c => !c.link?.includes("europeancoffeetrip"))
            .filter(cafe => {
                if (!showHiddenPois) return true;
                const placeId = generatePlaceId('cafe', cafe.lat, cafe.lon);
                return isHidden(placeId);
            })
            .map(cafe => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [cafe.lon, cafe.lat] },
                properties: { ...cafe }
            }))
    }), [visibleCafes, showHiddenPois, isHidden]);

    // Convert properties to GeoJSON
    // When showHiddenPois is true, only include hidden POIs
    const propertyGeoJSON = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(() => ({
        type: "FeatureCollection",
        features: visibleProperties
            .filter(property => {
                if (!showHiddenPois) return true;
                const placeId = generatePlaceId('property', property.latitude, property.longitude);
                return isHidden(placeId);
            })
            .map(p => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
                properties: { ...p }
            }))
    }), [visibleProperties, showHiddenPois, isHidden]);

    // Convert other POIs to GeoJSON by type
    // When showHiddenPois is true, only include hidden POIs
    const poiGeoJSONByType = useMemo(() => {
        const types = ["transit", "metro", "office", "shopping", "high_street", "dorm", "university", "gym"] as const;
        const byType: Record<string, GeoJSON.FeatureCollection<GeoJSON.Point>> = {};
        types.forEach(type => {
            byType[type] = {
                type: "FeatureCollection",
                features: visibleOtherPois
                    .filter(p => p.type === type)
                    .filter(poi => {
                        if (!showHiddenPois) return true;
                        const placeId = generatePlaceId(poi.type, poi.lat, poi.lon);
                        return isHidden(placeId);
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
            return `property-${prop.latitude.toFixed(5)}-${prop.longitude.toFixed(5)}`;
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
        // Filter out hidden POIs AND POIs whose type filter is not active
        return allPois.filter(poi =>
            !isHidden(getPlaceId(poi)) &&
            isPoiFilterActive(poi, activeFilters, ratingFilter, euctFilter)
        );
    }, [locationIndex, isHidden, getPlaceId, activeFilters, ratingFilter, euctFilter]);

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
    const { openSheet: openPOISheet, closeSheet: closePOISheet, isSheetOpen: isPOISheetOpen } = useSheetState("poi-details");

    // State for disambiguation popup (when multiple POIs share same coordinates)
    const [disambiguationData, setDisambiguationData] = useState<{
        pois: LocationData[];
        coordinates: [number, number];
    } | null>(null);

    // Track whether to show icons (zoomed in) or clusters (zoomed out)
    const [showIcons, setShowIcons] = useState(false);

    // Track which marker has its popup open (to keep icon scaled)
    const [activeMarkerKey, setActiveMarkerKey] = useState<string | null>(null);

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
    }, []);

    // Helper to parse coordinates from placeId (handles negative numbers)
    const parseCoordinatesFromPlaceId = (placeId: string): { lat: number; lon: number } | null => {
        const match = placeId.match(/^[a-z_]+-(-?\d+\.?\d*)-(-?\d+\.?\d*)$/i);
        if (match) {
            return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
        }
        return null;
    };

    // Helper to check if coordinates match within tolerance
    const coordsMatch = (a: number, b: number, tolerance = 0.0001) => Math.abs(a - b) < tolerance;

    // Callbacks for opening popups from ListsPanel navigation
    const handleOpenCafePopup = React.useCallback((placeId: string) => {
        const coords = parseCoordinatesFromPlaceId(placeId);
        if (!coords) return;

        const allCafes = [...minersCafes, ...cafes];
        const matchingCafe = allCafes.find(cafe =>
            coordsMatch(cafe.lat, coords.lat) && coordsMatch(cafe.lon, coords.lon)
        );
        if (matchingCafe) {
            setSelectedCafe({
                cafe: matchingCafe,
                coordinates: [matchingCafe.lon, matchingCafe.lat]
            });
        }
    }, [minersCafes, cafes]);

    const handleOpenPropertyPopup = React.useCallback((placeId: string) => {
        const coords = parseCoordinatesFromPlaceId(placeId);
        if (!coords) return;

        const matchingProperty = properties.find(p =>
            coordsMatch(p.latitude, coords.lat) && coordsMatch(p.longitude, coords.lon)
        );
        if (matchingProperty) {
            setSelectedProperty({
                property: matchingProperty,
                coordinates: [matchingProperty.longitude, matchingProperty.latitude]
            });
        }
    }, [properties]);

    const handleOpenPoiPopup = React.useCallback((placeId: string) => {
        const coords = parseCoordinatesFromPlaceId(placeId);
        if (!coords) return;

        const matchingPoi = otherPois.find(poi =>
            coordsMatch(poi.lat, coords.lat) && coordsMatch(poi.lon, coords.lon)
        );
        if (matchingPoi) {
            setSelectedPoi({
                poi: matchingPoi,
                coordinates: [matchingPoi.lon, matchingPoi.lat]
            });
        }
    }, [otherPois]);

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

    // Load population data when enabled
    useEffect(() => {
        if (populationEnabled) {
            loadPopulationData();
        }
    }, [populationEnabled, loadPopulationData]);

    // Load income data when enabled
    useEffect(() => {
        if (incomeEnabled) {
            loadIncomeData();
        }
    }, [incomeEnabled, loadIncomeData]);

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-100">
                <div className="text-red-500">Error loading data: {error}</div>
            </div>
        );
    }

    return (
        <ToastProvider>
        <div className="w-full h-full relative">
            {/* Toast helper for shape creation */}
            <ShapeCreatedToast onReady={handleShapeCreatedReady} />
            <Map
                center={[-3.7038, 40.4168]}
                zoom={13}
                className="w-full h-full"
            >
                <MapControls position="bottom-right" showZoom showLocate showCompass />
                <MapStyleSwitcher onStyleChange={() => setMapStyleKey(k => k + 1)} />

                {/* Navigation event listener for ActivityLog and ListsPanel clicks */}
                <NavigationEventListener
                    onOpenCafePopup={handleOpenCafePopup}
                    onOpenPropertyPopup={handleOpenPropertyPopup}
                    onOpenPoiPopup={handleOpenPoiPopup}
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
                    trafficData={trafficData}
                    populationData={populationData}
                    incomeData={incomeData}
                    styleKey={mapStyleKey}
                />

                {/* Drawing functionality - DrawToolbar uses portal to escape z-0 stacking context */}
                <MapDraw
                    onFeaturesChange={onDrawnFeaturesChange}
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

                {/* City navigator - flies to selected city */}
                <CityNavigator city={selectedCity} />

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

                {/* MINERS CAFES - Always visible with nice icons */}
                {minersCafes.map((cafe, i) => {
                    const markerKey = `miners-${cafe.lat}-${cafe.lon}-${i}`;
                    const placeId = generatePlaceId('cafe', cafe.lat, cafe.lon, cafe.name);
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
                                console.log('[Miners click] isMobile:', isMobile, 'isLinkingMode:', isLinkingMode, 'hasMultiplePois:', hasMultiplePois);
                                if (isLinkingMode) {
                                    handleLinkingClick({
                                        type: 'place',
                                        id: placeId,
                                        name: cafe.name,
                                        address: cafe.address,
                                        data: cafe,
                                    });
                                } else if (hasMultiplePois) {
                                    // Show disambiguation popup
                                    setDisambiguationData({
                                        pois: colocated,
                                        coordinates: [cafe.lon, cafe.lat]
                                    });
                                } else if (isMobile) {
                                    console.log('[Miners click] Setting selectedCafe for mobile');
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
                                <MarkerPopup closeButton onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                    <CafePopupContent cafe={cafe} />
                                </MarkerPopup>
                            )}
                        </MapMarker>
                    );
                })}

                {/* CAFES - Conditional rendering based on zoom */}
                {showIcons ? (
                    <>
                        {/* Zoomed in: Show icon markers */}
                        {visibleCafes.map((cafe, i) => {
                            const isEuCoffeeTrip = cafe.link?.includes("europeancoffeetrip");
                            const markerKey = `cafe-icon-${cafe.lat}-${cafe.lon}-${i}`;
                            const placeId = generatePlaceId('cafe', cafe.lat, cafe.lon, cafe.name);
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
                                        <MarkerPopup closeButton onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                            <CafePopupContent cafe={cafe} />
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
                                            id: generatePlaceId('cafe', cafe.lat, cafe.lon, cafe.name),
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
                                            id: generatePlaceId('cafe', cafe.lat, cafe.lon, cafe.name),
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
                {showIcons ? (
                    <>
                        {/* Zoomed in: Show icon markers */}
                        {visibleProperties.map((property, i) => {
                            const markerKey = `property-icon-${property.latitude}-${property.longitude}-${i}`;
                            const placeId = generatePlaceId('property', property.latitude, property.longitude, property.title);
                            const hidden = isHidden(placeId);
                            // In "Hidden" mode, only show hidden POIs
                            if (showHiddenPois && !hidden) return null;
                            const colocated = getColocatedPois(property.latitude, property.longitude);
                            // If hidden: show faded if alone, skip if other visible POIs at same spot
                            if (hidden && !showHiddenPois && colocated.length > 0) return null;
                            const hasMultiplePois = colocated.length > 1;
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
                                        <IconMarker color="bg-[#78C500]" icon={Home} isActive={activeMarkerKey === markerKey} isHidden={hidden} poiCount={colocated.length} />
                                    </MarkerContent>
                                    {!isLinkingMode && !hasMultiplePois && !isMobile && (
                                        <MarkerPopup closeButton onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                            <PropertyPopupContent property={property} cityId={selectedCity?.id || ''} />
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
                                    const property = feature.properties as unknown as PropertyData;
                                    if (isLinkingMode) {
                                        handleLinkingClick({
                                            type: 'place',
                                            id: generatePlaceId('property', property.latitude, property.longitude, property.title),
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
                {showIcons ? (
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
                            const placeId = generatePlaceId(poi.type, poi.lat, poi.lon, poi.name);
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
                                        <MarkerPopup closeButton onClose={handlePopupClose} anchor="top" className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                            <OtherPoiPopupContent poi={poi} />
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
                                                id: generatePlaceId(poi.type, poi.lat, poi.lon, poi.name),
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
                        onClose={() => setSelectedCafe(null)}
                        closeButton
                        anchor="top"
                        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                    >
                        <CafePopupContent cafe={selectedCafe.cafe} />
                    </MapPopup>
                )}

                {!isMobile && selectedProperty && (
                    <MapPopup
                        longitude={selectedProperty.coordinates[0]}
                        latitude={selectedProperty.coordinates[1]}
                        onClose={() => setSelectedProperty(null)}
                        closeButton
                        anchor="top"
                        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                    >
                        <PropertyPopupContent property={selectedProperty.property} cityId={selectedCity?.id || ''} onClose={() => setSelectedProperty(null)} />
                    </MapPopup>
                )}

                {!isMobile && selectedPoi && (
                    <MapPopup
                        longitude={selectedPoi.coordinates[0]}
                        latitude={selectedPoi.coordinates[1]}
                        onClose={() => setSelectedPoi(null)}
                        closeButton
                        anchor="top"
                        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200"
                    >
                        <OtherPoiPopupContent poi={selectedPoi.poi} />
                    </MapPopup>
                )}

            </Map>

            {/* Mobile POI Popups - BottomSheet must be outside Map */}
            {isMobile && selectedCafe && (
                <BottomSheet isOpen={true} onClose={() => setSelectedCafe(null)} snapPoint="partial">
                    <div className="p-4"><CafePopupContent cafe={selectedCafe.cafe} /></div>
                </BottomSheet>
            )}

            {isMobile && selectedProperty && (
                <BottomSheet isOpen={true} onClose={() => setSelectedProperty(null)} snapPoint="partial">
                    <div className="p-4"><PropertyPopupContent property={selectedProperty.property} cityId={selectedCity?.id || ''} onClose={() => setSelectedProperty(null)} /></div>
                </BottomSheet>
            )}

            {isMobile && selectedPoi && (
                <BottomSheet isOpen={true} onClose={() => setSelectedPoi(null)} snapPoint="partial">
                    <div className="p-4"><OtherPoiPopupContent poi={selectedPoi.poi} /></div>
                </BottomSheet>
            )}

            {/* Disambiguation Popup - floating overlay when multiple POIs share same coordinates */}
            {disambiguationData && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center"
                    onClick={(e) => {
                        // Close when clicking the backdrop
                        if (e.target === e.currentTarget) {
                            setDisambiguationData(null);
                        }
                    }}
                >
                    {/* Semi-transparent backdrop */}
                    <div className="absolute inset-0 bg-black/20" />

                    {/* Popup card */}
                    <div className="relative animate-in fade-in-0 zoom-in-95 duration-200">
                        <DisambiguationPopup
                            pois={disambiguationData.pois}
                            onSelect={handleDisambiguationSelect}
                        />
                        {/* Close button */}
                        <button
                            onClick={() => setDisambiguationData(null)}
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
                        <div className="w-8 h-8 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin" />
                        <span className="text-sm text-zinc-600">Loading map data...</span>
                    </div>
                </div>
            )}
        </div>
        </ToastProvider>
    );
}
