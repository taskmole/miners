"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
    Map,
    MapControls,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    MarkerTooltip,
    MarkerLabel,
    useMap,
} from "@/components/ui/map";
import { MapDraw } from "@/components/ui/map-draw";
import { DrawToolbar } from "@/components/DrawToolbar";
import { useMapData, CafeData, PropertyData, OtherPoiData } from "@/hooks/useMapData";
import { useOverlayData } from "@/hooks/useOverlayData";
import {
    Coffee,
    Building2,
    Train,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

// Enhanced icon configuration with ring colors
const iconConfig: Record<string, { icon: React.ElementType; color: string; bg: string; ring: string }> = {
    cafe: {
        icon: Coffee,
        color: "text-amber-800",
        bg: "bg-amber-50",
        ring: "ring-amber-300"
    },
    eu_coffee_trip: {
        icon: Coffee,
        color: "text-blue-800",
        bg: "bg-blue-50",
        ring: "ring-blue-300"
    },
    property: {
        icon: Home,
        color: "text-emerald-800",
        bg: "bg-emerald-50",
        ring: "ring-emerald-300"
    },
    transit: {
        icon: Train,
        color: "text-sky-700",
        bg: "bg-sky-50",
        ring: "ring-sky-300"
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
};

// Layer management helper functions
function getFirstSymbolLayer(map: any): string | undefined {
    const layers = map.getStyle()?.layers;
    if (!layers) return undefined;
    for (const layer of layers) {
        if (layer.type === "symbol") return layer.id;
    }
    return undefined;
}

function addTrafficLayers(map: any, data: any) {
    if (!map.getSource("traffic-source")) {
        map.addSource("traffic-source", {
            type: "geojson",
            data,
        });

        map.addLayer({
            id: "traffic-circles",
            type: "circle",
            source: "traffic-source",
            paint: {
                "circle-radius": [
                    "interpolate", ["linear"],
                    ["get", "avg_count"],
                    0, 4,
                    500, 12,
                    1500, 24
                ],
                "circle-color": [
                    "interpolate", ["linear"],
                    ["get", "avg_count"],
                    0, "#3b82f6",      // blue
                    500, "#f59e0b",    // amber
                    1000, "#ef4444"    // red
                ],
                "circle-opacity": 0.7,
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
            },
        }, getFirstSymbolLayer(map));

        map.on("mouseenter", "traffic-circles", () => {
            map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "traffic-circles", () => {
            map.getCanvas().style.cursor = "";
        });
    } else {
        (map.getSource("traffic-source") as any).setData(data);
    }
}

function removeTrafficLayers(map: any) {
    if (map.getLayer("traffic-circles")) {
        map.off("mouseenter", "traffic-circles");
        map.off("mouseleave", "traffic-circles");
        map.removeLayer("traffic-circles");
    }
    if (map.getSource("traffic-source")) {
        map.removeSource("traffic-source");
    }
}

function addPopulationLayers(map: any, data: any) {
    if (!map.getSource("population-source")) {
        map.addSource("population-source", {
            type: "geojson",
            data,
        });

        map.addLayer({
            id: "population-fill",
            type: "fill",
            source: "population-source",
            paint: {
                "fill-color": [
                    "interpolate", ["linear"],
                    ["get", "density"],
                    0, "#fef3c7",       // light yellow
                    10000, "#fde047",   // yellow
                    20000, "#fb923c",   // orange
                    30000, "#f97316",   // dark orange
                    40000, "#dc2626"    // red
                ],
                "fill-opacity": 0.4,
            },
        }, getFirstSymbolLayer(map));

        map.addLayer({
            id: "population-borders",
            type: "line",
            source: "population-source",
            paint: {
                "line-color": "#ffffff",
                "line-width": 1,
                "line-opacity": 0.5,
            },
        });
    }
}

function removePopulationLayers(map: any) {
    if (map.getLayer("population-borders")) map.removeLayer("population-borders");
    if (map.getLayer("population-fill")) map.removeLayer("population-fill");
    if (map.getSource("population-source")) map.removeSource("population-source");
}

// Enhanced marker icon with all features
function EnhancedMarkerIcon({
    type,
    isMiners = false,
    isFeatured = false,
    size = "default",
    rating,
    badges = [],
    state = "default",
}: {
    type: string;
    isMiners?: boolean;
    isFeatured?: boolean;
    size?: "small" | "default" | "large" | "auto";
    rating?: number;
    badges?: ("ac" | "hot" | "new")[];
    state?: "default" | "hovered" | "selected" | "dimmed";
}) {
    const config = iconConfig[type] || iconConfig.cafe;
    const Icon = config.icon;

    // Auto-size based on rating
    const finalSize = size === "auto" && rating
        ? rating >= 4.5 ? "large" : rating >= 4.0 ? "default" : "small"
        : size;

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
                    sizeClasses[finalSize],
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
                        iconSizes[finalSize],
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

// Cafe popup content with enhanced animations
function CafePopupContent({ cafe }: { cafe: CafeData }) {
    const isEuCoffeeTrip = cafe.link?.includes("europeancoffeetrip");

    return (
        <div className="min-w-[280px] max-w-[320px]">
            <div className="flex items-start justify-between mb-1">
                <div className="font-bold text-sm text-zinc-900 pr-2">{cafe.name}</div>
                {isEuCoffeeTrip && (
                    <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold bg-blue-900 text-white rounded animate-in fade-in duration-300">
                        EU Coffee Trip
                    </span>
                )}
            </div>
            <div className="text-xs text-zinc-500 mb-2">{cafe.address}</div>

            {cafe.rating && (
                <div className="flex items-center gap-2 mb-3 animate-in slide-in-from-left duration-300">
                    <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                        <span className="text-sm font-semibold">{cafe.rating.toFixed(1)}</span>
                    </div>
                    {cafe.reviewCount && (
                        <span className="text-xs text-zinc-400">({cafe.reviewCount} reviews)</span>
                    )}
                </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100 animate-in slide-in-from-bottom duration-300">
                {cafe.link && (
                    <a
                        href={cafe.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" />
                        View Details
                    </a>
                )}
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-black text-white hover:bg-zinc-800 rounded-lg transition-colors">
                    <MapPin className="w-3 h-3" />
                    Add to List
                </button>
            </div>
        </div>
    );
}

// Property popup content with enhanced animations
function PropertyPopupContent({ property }: { property: PropertyData }) {
    return (
        <div className="min-w-[280px] max-w-[320px]">
            <div className="font-bold text-sm text-zinc-900 mb-1">{property.title}</div>
            <div className="text-xs text-zinc-500 mb-2">{property.address}</div>

            <div className="flex items-baseline gap-2 mb-3 animate-in slide-in-from-left duration-300">
                <span className="text-lg font-bold text-emerald-600">€{property.price.toLocaleString()}/month</span>
                <span className="text-xs text-zinc-400">{property.size} m²</span>
            </div>

            {property.hasAirConditioning && (
                <span className="inline-block px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full mb-3 animate-in zoom-in duration-200">
                    A/C
                </span>
            )}

            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-100 animate-in slide-in-from-bottom duration-300">
                <a
                    href={property.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors"
                >
                    <ExternalLink className="w-3 h-3" />
                    Idealista
                </a>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-black text-white hover:bg-zinc-800 rounded-lg transition-colors">
                    <MapPin className="w-3 h-3" />
                    Add to List
                </button>
            </div>
        </div>
    );
}

// Other POI popup content
function OtherPoiPopupContent({ poi }: { poi: OtherPoiData }) {
    return (
        <div className="min-w-[250px] max-w-[300px]">
            <div className="font-bold text-sm text-zinc-900 mb-1">{poi.name}</div>
            <div className="text-xs text-zinc-500 mb-2">{poi.address}</div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-3 animate-in fade-in duration-300">
                {poi.category}
            </div>

            <div className="flex flex-wrap gap-2 pt-3 border-t border-zinc-100 animate-in slide-in-from-bottom duration-300">
                {poi.mapsUrl && (
                    <a
                        href={poi.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Google Maps
                    </a>
                )}
            </div>
        </div>
    );
}

// Internal component that manages overlay layers (must be inside Map component)
function OverlayLayerManager({
    trafficEnabled,
    populationEnabled,
    trafficData,
    populationData,
}: {
    trafficEnabled: boolean;
    populationEnabled: boolean;
    trafficData: any;
    populationData: any;
}) {
    const { map, isLoaded } = useMap();

    // Add/remove overlay layers when data or toggles change
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
            addPopulationLayers(map, populationData);
        } else {
            removePopulationLayers(map);
        }

        return () => {
            removeTrafficLayers(map);
            removePopulationLayers(map);
        };
    }, [map, isLoaded, trafficEnabled, populationEnabled, trafficData, populationData]);

    return null; // This component doesn't render anything
}

interface EnhancedMapContainerProps {
    activeFilters: Set<string>;
    trafficEnabled?: boolean;
    populationEnabled?: boolean;
    trafficHour?: number;
    onDrawnFeaturesChange?: (features: GeoJSON.FeatureCollection) => void;
}

export function EnhancedMapContainer({
    activeFilters,
    trafficEnabled,
    populationEnabled,
    trafficHour,
    onDrawnFeaturesChange
}: EnhancedMapContainerProps) {
    const { cafes, properties, otherPois, isLoading, error } = useMapData();
    const {
        trafficData,
        populationData,
        isLoadingTraffic,
        isLoadingPopulation,
        loadTrafficData,
        loadPopulationData,
    } = useOverlayData();
    const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);

    // Filter visible markers based on active filters
    const visibleCafes = useMemo(
        () => cafes.filter(c => {
            const isEuCoffeeTrip = c.link?.includes("europeancoffeetrip");
            if (isEuCoffeeTrip) {
                return activeFilters.has("eu_coffee_trip") || activeFilters.has("cafe");
            }
            return activeFilters.has("regular_cafe") || activeFilters.has("cafe");
        }),
        [cafes, activeFilters]
    );

    const visibleProperties = useMemo(
        () => (activeFilters.has("property") ? properties : []),
        [properties, activeFilters]
    );

    const visibleOtherPois = useMemo(
        () => otherPois.filter((poi) => activeFilters.has(poi.type)),
        [otherPois, activeFilters]
    );

    // Load traffic data when enabled or hour changes
    useEffect(() => {
        if (trafficEnabled) {
            loadTrafficData(trafficHour ?? 12);
        }
    }, [trafficEnabled, trafficHour, loadTrafficData]);

    // Load population data when enabled
    useEffect(() => {
        if (populationEnabled) {
            loadPopulationData();
        }
    }, [populationEnabled, loadPopulationData]);

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-100">
                <div className="text-red-500">Error loading data: {error}</div>
            </div>
        );
    }

    return (
        <div className="w-full h-full relative">
            <Map
                center={[-3.7038, 40.4168]}
                zoom={13}
                className="w-full h-full"
            >
                <MapControls position="bottom-right" showZoom showLocate showCompass />

                {/* Overlay Layers Manager */}
                <OverlayLayerManager
                    trafficEnabled={trafficEnabled ?? false}
                    populationEnabled={populationEnabled ?? false}
                    trafficData={trafficData}
                    populationData={populationData}
                />

                {/* Drawing functionality */}
                <MapDraw onFeaturesChange={onDrawnFeaturesChange}>
                    <DrawToolbar />
                </MapDraw>

                {/* Cafe Markers */}
                {visibleCafes.map((cafe, i) => {
                    const isEuCoffeeTrip = cafe.link?.includes("europeancoffeetrip");
                    const markerId = `cafe-${i}`;
                    const showLabel = cafe.rating && cafe.rating >= 4.7;

                    return (
                        <MapMarker
                            key={markerId}
                            latitude={cafe.lat}
                            longitude={cafe.lon}
                            onMouseEnter={() => setHoveredMarkerId(markerId)}
                            onMouseLeave={() => setHoveredMarkerId(null)}
                        >
                            <MarkerContent>
                                <EnhancedMarkerIcon
                                    type={isEuCoffeeTrip ? "eu_coffee_trip" : "cafe"}
                                    isMiners={cafe.franchisePartner}
                                    size="auto"
                                    rating={cafe.rating}
                                    isFeatured={cafe.rating && cafe.rating >= 4.8}
                                    state={hoveredMarkerId === markerId ? "hovered" : "default"}
                                />
                                {showLabel && (
                                    <MarkerLabel position="top" className="bg-black/80 text-white px-1.5 py-0.5 rounded text-[10px]">
                                        {cafe.name}
                                    </MarkerLabel>
                                )}
                            </MarkerContent>
                            <MarkerTooltip className="max-w-[180px]">
                                <div className="text-xs font-medium truncate">{cafe.name}</div>
                                {cafe.rating && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                                        <span className="text-[10px]">{cafe.rating.toFixed(1)}</span>
                                    </div>
                                )}
                            </MarkerTooltip>
                            <MarkerPopup closeButton className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                <CafePopupContent cafe={cafe} />
                            </MarkerPopup>
                        </MapMarker>
                    );
                })}

                {/* Property Markers */}
                {visibleProperties.map((property, i) => {
                    const markerId = `property-${i}`;
                    const badges: ("ac" | "hot" | "new")[] = [];

                    if (property.hasAirConditioning) badges.push("ac");
                    // You can add logic for "hot" and "new" based on price, date, etc.

                    return (
                        <MapMarker
                            key={markerId}
                            latitude={property.latitude}
                            longitude={property.longitude}
                            onMouseEnter={() => setHoveredMarkerId(markerId)}
                            onMouseLeave={() => setHoveredMarkerId(null)}
                        >
                            <MarkerContent>
                                <EnhancedMarkerIcon
                                    type="property"
                                    badges={badges}
                                    state={hoveredMarkerId === markerId ? "hovered" : "default"}
                                />
                            </MarkerContent>
                            <MarkerTooltip className="max-w-[180px]">
                                <div className="text-xs font-medium">€{property.price.toLocaleString()}/mo</div>
                                <div className="text-[10px] text-white/80">{property.size} m²</div>
                            </MarkerTooltip>
                            <MarkerPopup closeButton className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                <PropertyPopupContent property={property} />
                            </MarkerPopup>
                        </MapMarker>
                    );
                })}

                {/* Other POI Markers */}
                {visibleOtherPois.map((poi, i) => {
                    const markerId = `poi-${i}`;

                    return (
                        <MapMarker
                            key={markerId}
                            latitude={poi.lat}
                            longitude={poi.lon}
                            onMouseEnter={() => setHoveredMarkerId(markerId)}
                            onMouseLeave={() => setHoveredMarkerId(null)}
                        >
                            <MarkerContent>
                                <EnhancedMarkerIcon
                                    type={poi.type}
                                    state={hoveredMarkerId === markerId ? "hovered" : "default"}
                                />
                            </MarkerContent>
                            <MarkerTooltip className="max-w-[180px]">
                                <div className="text-xs font-medium truncate">{poi.name}</div>
                                <div className="text-[10px] text-white/80 capitalize">{poi.type.replace('_', ' ')}</div>
                            </MarkerTooltip>
                            <MarkerPopup closeButton className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200">
                                <OtherPoiPopupContent poi={poi} />
                            </MarkerPopup>
                        </MapMarker>
                    );
                })}
            </Map>

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
    );
}
