"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
    Map,
    MapControls,
    MapMarker,
    MarkerContent,
    MarkerPopup,
    useMap,
} from "@/components/ui/map";
import MapLibreGL from "maplibre-gl";
import { useMapData, CafeData, PropertyData, OtherPoiData } from "@/hooks/useMapData";
import {
    ExternalLink,
    MapPin,
    Star,
} from "lucide-react";
import { cn } from "@/lib/utils";


// Category configuration with PNG icon paths
const CATEGORY_CONFIG: Record<string, { icon: string; size: number }> = {
    eu_coffee_trip: { icon: "/assets/icon-cafe-eu.png", size: 40 },
    regular_cafe: { icon: "/assets/icon-cafe.png", size: 40 },
    property: { icon: "/assets/icon-office.png", size: 40 }, // Using office icon for properties
    transit: { icon: "/assets/icon-metro.png", size: 40 },
    office: { icon: "/assets/icon-office.png", size: 40 },
    shopping: { icon: "/assets/icon-cart.png", size: 40 },
    high_street: { icon: "/assets/icon-crowd.png", size: 40 },
    dorm: { icon: "/assets/icon-bed.png", size: 40 },
    university: { icon: "/assets/icon-university.png", size: 40 },
    train: { icon: "/assets/icon-train.png", size: 40 },
};

const CLUSTER_MAX_ZOOM = 13.5; // Switch point
const CLUSTER_RADIUS = 60;

// Cluster colors - matching the pin icon colors
const CLUSTER_COLORS = {
    cafe: ["#3b5dc9", "#2541b2", "#1a237e"], // Blue matching cafe pins
    property: ["#f57c00", "#e65100", "#bf360c"], // Orange matching office/property pins
    other: ["#7c3aed", "#6d28d9", "#5b21b6"], // Purple for other POIs
};

interface MapContainerProps {
    activeFilters: Set<string>;
}

// Marker Icon Component - using PNG images
function MarkerIcon({ type, isMiners = false }: { type: string; isMiners?: boolean }) {
    const config = CATEGORY_CONFIG[type] || CATEGORY_CONFIG.regular_cafe;

    return (
        <div className="relative transition-transform hover:scale-110 cursor-pointer">
            <img
                src={config.icon}
                alt={type}
                width={config.size}
                height={config.size}
                className="drop-shadow-lg"
                style={{
                    filter: isMiners ? "hue-rotate(180deg) saturate(0) brightness(0.2)" : undefined
                }}
            />
            {isMiners && (
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-black rounded-full border-2 border-white flex items-center justify-center">
                    <span className="text-white text-[8px] font-bold">M</span>
                </div>
            )}
        </div>
    );
}

// Marker offset to position pin tip at the location (icon is 40x40, tip is at bottom center)
const MARKER_OFFSET: [number, number] = [0, -20];

// Sub-component to handle GL layers for clustering
function ClusteringManager({
    cafeData,
    propertyData,
    otherData,
}: {
    cafeData: GeoJSON.FeatureCollection;
    propertyData: GeoJSON.FeatureCollection;
    otherData: GeoJSON.FeatureCollection;
}) {
    const { map, isLoaded } = useMap();
    const sourceIds = useRef(["cafes-cluster", "properties-cluster", "other-cluster"]);

    useEffect(() => {
        if (!isLoaded || !map) return;

        // Helper to setup source and layer
        const setupClusterLayer = (
            id: string,
            data: GeoJSON.FeatureCollection,
            colors: string[]
        ) => {
            const sourceId = id;
            const clusterLayerId = `${id}-layer`;
            const countLayerId = `${id}-count`;

            // Add source if not exists
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: "geojson",
                    data,
                    cluster: true,
                    clusterMaxZoom: 13, // Stop clustering at zoom 14
                    clusterRadius: CLUSTER_RADIUS,
                });
            } else {
                (map.getSource(sourceId) as MapLibreGL.GeoJSONSource).setData(data);
            }

            // Cluster circle layer
            if (!map.getLayer(clusterLayerId)) {
                map.addLayer({
                    id: clusterLayerId,
                    type: "circle",
                    source: sourceId,
                    filter: ["has", "point_count"],
                    paint: {
                        "circle-color": [
                            "step",
                            ["get", "point_count"],
                            colors[0],
                            10,
                            colors[1],
                            50,
                            colors[2],
                        ],
                        "circle-radius": [
                            "step",
                            ["get", "point_count"],
                            22,
                            10,
                            28,
                            50,
                            35,
                        ],
                        "circle-stroke-width": 3,
                        "circle-stroke-color": "#ffffff",
                        "circle-blur": 0.15,
                    },
                });

                // Click to zoom
                map.on("click", clusterLayerId, async (e) => {
                    const features = map.queryRenderedFeatures(e.point, { layers: [clusterLayerId] });
                    const clusterId = features[0].properties?.cluster_id;
                    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
                    const zoom = await source.getClusterExpansionZoom(clusterId);
                    map.easeTo({
                        center: (features[0].geometry as any).coordinates,
                        zoom,
                    });
                });

                map.on("mouseenter", clusterLayerId, () => {
                    map.getCanvas().style.cursor = "pointer";
                });
                map.on("mouseleave", clusterLayerId, () => {
                    map.getCanvas().style.cursor = "";
                });
            }

            // Count text layer
            if (!map.getLayer(countLayerId)) {
                map.addLayer({
                    id: countLayerId,
                    type: "symbol",
                    source: sourceId,
                    filter: ["has", "point_count"],
                    layout: {
                        "text-field": "{point_count_abbreviated}",
                        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
                        "text-size": [
                            "step",
                            ["get", "point_count"],
                            13,
                            10,
                            14,
                            50,
                            16,
                        ],
                    },
                    paint: {
                        "text-color": "#ffffff",
                        "text-halo-color": "rgba(0,0,0,0.3)",
                        "text-halo-width": 1,
                    },
                });
            }
        };

        setupClusterLayer("cafes-cluster", cafeData, CLUSTER_COLORS.cafe);
        setupClusterLayer("properties-cluster", propertyData, CLUSTER_COLORS.property);
        setupClusterLayer("other-cluster", otherData, CLUSTER_COLORS.other);

    }, [isLoaded, map, cafeData, propertyData, otherData]);

    return null;
}

export function MapContainer({ activeFilters }: MapContainerProps) {
    const { cafes, properties, otherPois, isLoading, error } = useMapData();
    const [zoom, setZoom] = useState(13);

    // Zoom listener
    const handleZoom = (map: MapLibreGL.Map) => {
        setZoom(map.getZoom());
    };

    // Filter Logic & GeoJSON Prep
    const { cafeGeoJson, propertyGeoJson, otherGeoJson, filteredEuCafes, filteredRegularCafes, filteredProperties, filteredOtherPois } = useMemo(() => {
        // Cafes
        const eu = (activeFilters.has("eu_coffee_trip") || activeFilters.has("cafe"))
            ? cafes.filter(c => c.link?.includes("europeancoffeetrip") && c.lat && c.lon)
            : [];
        const reg = (activeFilters.has("regular_cafe") || activeFilters.has("cafe"))
            ? cafes.filter(c => !c.link?.includes("europeancoffeetrip") && c.lat && c.lon)
            : [];

        const cafeFeatures = [...eu, ...reg].map(c => ({
            type: "Feature" as const,
            properties: { ...c },
            geometry: { type: "Point" as const, coordinates: [c.lon, c.lat] }
        }));

        // Properties
        const props = activeFilters.has("property")
            ? properties.filter(p => p.latitude && p.longitude)
            : [];
        const propFeatures = props.map(p => ({
            type: "Feature" as const,
            properties: { ...p },
            geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] }
        }));

        // Other
        const other = otherPois.filter(p => activeFilters.has(p.type) && p.lat && p.lon);
        const otherFeatures = other.map(p => ({
            type: "Feature" as const,
            properties: { ...p },
            geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] }
        }));

        return {
            cafeGeoJson: { type: "FeatureCollection" as const, features: cafeFeatures },
            propertyGeoJson: { type: "FeatureCollection" as const, features: propFeatures },
            otherGeoJson: { type: "FeatureCollection" as const, features: otherFeatures },
            filteredEuCafes: eu,
            filteredRegularCafes: reg,
            filteredProperties: props,
            filteredOtherPois: other
        };
    }, [cafes, properties, otherPois, activeFilters]);




    // Zoom listener component
    function ZoomListener({ onZoom }: { onZoom: (zoom: number) => void }) {
        const { map } = useMap();

        useEffect(() => {
            if (!map) return;

            const handleMapZoom = () => {
                onZoom(map.getZoom());
            };

            map.on("zoom", handleMapZoom);
            // Sync initial zoom
            onZoom(map.getZoom());

            return () => {
                map.off("zoom", handleMapZoom);
            };
        }, [map, onZoom]);

        return null;
    }

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-100">
                <div className="text-red-500">Error loading data: {error}</div>
            </div>
        );
    }

    // Determine when to show individual markers
    const showMarkers = zoom > CLUSTER_MAX_ZOOM;

    return (
        <div className="w-full h-full relative">
            <Map
                center={[-3.7038, 40.4168]}
                zoom={13}
                className="w-full h-full"
            >
                <MapControls position="bottom-right" showZoom showLocate showCompass />


                <ZoomListener onZoom={setZoom} />

                <ClusteringManager
                    cafeData={cafeGeoJson}
                    propertyData={propertyGeoJson}
                    otherData={otherGeoJson}
                />

                {/* Individual Markers - Only rendered when zoomed in */}
                {showMarkers && (
                    <>
                        {/* EU Coffee Trip Cafes */}
                        {filteredEuCafes.map((cafe, i) => (
                            <MapMarker key={`eu-${i}`} latitude={cafe.lat} longitude={cafe.lon} offset={MARKER_OFFSET}>
                                <MarkerContent>
                                    <MarkerIcon type="eu_coffee_trip" isMiners={cafe.franchisePartner} />
                                </MarkerContent>
                                <MarkerPopup closeButton className="p-0 overflow-hidden max-w-[350px]">
                                    <CafePopupContent cafe={cafe} isEu={true} />
                                </MarkerPopup>
                            </MapMarker>
                        ))}

                        {/* Regular Cafes */}
                        {filteredRegularCafes.map((cafe, i) => (
                            <MapMarker key={`reg-${i}`} latitude={cafe.lat} longitude={cafe.lon} offset={MARKER_OFFSET}>
                                <MarkerContent>
                                    <MarkerIcon type="regular_cafe" isMiners={cafe.franchisePartner} />
                                </MarkerContent>
                                <MarkerPopup closeButton className="p-0 overflow-hidden max-w-[350px]">
                                    <CafePopupContent cafe={cafe} isEu={false} />
                                </MarkerPopup>
                            </MapMarker>
                        ))}

                        {/* Properties */}
                        {filteredProperties.map((prop, i) => (
                            <MapMarker key={`prop-${i}`} latitude={prop.latitude} longitude={prop.longitude} offset={MARKER_OFFSET}>
                                <MarkerContent>
                                    <MarkerIcon type="property" />
                                </MarkerContent>
                                <MarkerPopup closeButton className="p-0 overflow-hidden max-w-[350px]">
                                    <PropertyPopupContent property={prop} />
                                </MarkerPopup>
                            </MapMarker>
                        ))}

                        {/* Other POIs */}
                        {filteredOtherPois.map((poi, i) => (
                            <MapMarker key={`other-${i}`} latitude={poi.lat} longitude={poi.lon} offset={MARKER_OFFSET}>
                                <MarkerContent>
                                    <MarkerIcon type={poi.type} />
                                </MarkerContent>
                                <MarkerPopup closeButton>
                                    <OtherPoiPopupContent poi={poi} />
                                </MarkerPopup>
                            </MapMarker>
                        ))}
                    </>
                )}
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

// Popup Contents - Rich mapcn style (Airbnb-like)
function CafePopupContent({ cafe, isEu }: { cafe: CafeData; isEu: boolean }) {
    return (
        <div className="min-w-[320px] max-w-[340px]">
            {/* Hero Image */}
            {cafe.image ? (
                <div className="relative h-48 w-full bg-muted group">
                    <img
                        src={cafe.image}
                        alt={cafe.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />

                    {/* Floating Badge on Image */}
                    <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/90 text-black backdrop-blur-sm shadow-sm">
                            {cafe.categoryName}
                        </span>
                        {isEu && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600/90 text-white backdrop-blur-sm shadow-sm">
                                EU Coffee Trip
                            </span>
                        )}
                    </div>
                </div>
            ) : (
                <div className="h-1.5 bg-gradient-to-r from-orange-400 to-orange-200 w-full" />
            )}

            <div className="p-4 ">
                {/* Header (if no image, show badges here) */}
                {!cafe.image && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-700">
                            {cafe.categoryName}
                        </span>
                        {isEu && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                                EU Coffee Trip
                            </span>
                        )}
                        {cafe.franchisePartner && (
                            <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-white">
                                PARTNER
                            </span>
                        )}
                    </div>
                )}

                <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-lg text-foreground leading-tight">{cafe.name}</h3>
                    {cafe.franchisePartner && cafe.image && (
                        <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-900 text-white">
                            PARTNER
                        </span>
                    )}
                </div>

                {/* Rating & Address */}
                <div className="flex items-center gap-2 mb-3 text-sm">
                    {cafe.rating && (
                        <div className="flex items-center gap-1 font-semibold text-foreground">
                            <Star className="w-4 h-4 text-orange-500 fill-orange-500" />
                            <span>{Number(cafe.rating).toFixed(1)}</span>
                            <span className="text-muted-foreground font-normal">({cafe.reviewCount})</span>
                        </div>
                    )}
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground truncate max-w-[160px]">{cafe.address}</span>
                </div>

                {/* Socials Row */}
                <div className="flex items-center gap-2 mb-4">
                    {cafe.instagram && (
                        <a href={cafe.instagram} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-pink-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>
                        </a>
                    )}
                    {cafe.facebook && (
                        <a href={cafe.facebook} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-blue-600 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>
                        </a>
                    )}
                    {cafe.link && (
                        <a href={cafe.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs font-medium bg-secondary px-2 py-1 rounded-md">
                            <ExternalLink className="w-3.5 h-3.5" />
                            Visit
                        </a>
                    )}
                </div>

                {/* Opening Hours */}
                {cafe.openingHours && (
                    <div className="text-xs text-muted-foreground mb-4 bg-muted/40 p-2 rounded border border-border/50">
                        <span className="font-semibold block mb-0.5 text-foreground">Open today:</span>
                        {cafe.openingHours}
                    </div>
                )}

                {/* Main Action */}
                <button className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow transition-colors mb-2">
                    <MapPin className="w-4 h-4" />
                    Add to Scouting List
                </button>

                {/* Secondary Actions */}
                <div className="grid grid-cols-2 gap-2">
                    <button className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border border-border bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors">
                        <span className="w-3.5 h-3.5">📝</span> Report
                    </button>
                    <button className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium border border-border bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors">
                        <span className="w-3.5 h-3.5">📊</span> Metrics
                    </button>
                </div>
            </div>
        </div>
    );
}

function PropertyPopupContent({ property }: { property: PropertyData }) {
    return (
        <div className="min-w-[320px] max-w-[340px]">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 w-full" />

            <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                                Commercial
                            </span>
                            {property.district && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border border-border text-muted-foreground">
                                    {property.district}
                                </span>
                            )}
                        </div>
                        <h3 className="font-bold text-base text-foreground leading-tight line-clamp-2">{property.title || "Commercial Property"}</h3>
                    </div>
                </div>

                <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-2xl font-extrabold text-foreground">€{Number(property.price).toLocaleString()}</span>
                    <span className="text-sm font-medium text-muted-foreground">/mo</span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-muted/30 p-2.5 rounded-lg border border-border/50">
                        <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wide mb-0.5">Size</div>
                        <div className="text-base font-semibold text-foreground">{property.size} m²</div>
                    </div>
                    <div className="bg-muted/30 p-2.5 rounded-lg border border-border/50">
                        <div className="text-[10px] uppercase text-muted-foreground font-bold tracking-wide mb-0.5">Price/m²</div>
                        <div className="text-base font-semibold text-foreground">€{property.priceByArea}</div>
                    </div>
                </div>

                {property.address && <div className="text-xs text-muted-foreground mb-4 truncate flex items-center gap-1"><MapPin className="w-3 h-3" /> {property.address}</div>}

                {/* Actions */}
                <div className="space-y-2">
                    <button className="w-full flex items-center justify-center gap-2 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm transition-colors">
                        <MapPin className="w-4 h-4" />
                        Add to Scouting List
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <a
                            href={property.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors border border-transparent"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Idealista
                        </a>
                        <button className="flex items-center justify-center gap-2 py-2 text-xs font-medium border border-border bg-background hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors">
                            <span className="w-3.5 h-3.5">💼</span> Pitch
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function OtherPoiPopupContent({ poi }: { poi: OtherPoiData }) {
    return (
        <div className="min-w-[280px] max-w-[300px] p-1">
            <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                    <h3 className="font-bold text-sm text-foreground">{poi.name}</h3>
                    <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground uppercase tracking-wide">
                        {poi.category}
                    </span>
                </div>
            </div>

            <div className="text-xs text-muted-foreground mb-3">{poi.address}</div>

            {poi.mapsUrl && (
                <div className="pt-3 border-t border-border">
                    <a
                        href={poi.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Google Maps
                    </a>
                </div>
            )}
        </div>
    );
}
