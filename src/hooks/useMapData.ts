"use client";

import { useState, useEffect, useMemo } from "react";

// Types for all POI categories
export interface CafeData {
    type: "cafe";
    name: string;
    link?: string;
    address: string;
    lat: number;
    lon: number;
    categoryName: string;
    rating?: number;
    reviewCount?: number;
    franchisePartner?: boolean;
    openingHours?: string;
    image?: string;
    instagram?: string;
    facebook?: string;
}

export interface PropertyData {
    type: "property";
    address: string;
    latitude: number;
    longitude: number;
    price: number;
    size: number;
    priceByArea: number;
    district: string;
    hasAirConditioning: boolean;
    url: string;
    title: string;
}

export interface OtherPoiData {
    type: "transit" | "office" | "shopping" | "high_street" | "dorm" | "university";
    category: string;
    name: string;
    lat: number;
    lon: number;
    address: string;
    mapsUrl: string;
}

export type LocationData = CafeData | PropertyData | OtherPoiData;

// Category mapping for other.csv
const categoryMap: Record<string, OtherPoiData["type"]> = {
    "Train Station": "transit",
    "Office Center": "office",
    "Shopping Center": "shopping",
    "High Street": "high_street",
    "Student Dormitory": "dorm",
    "University": "university",
};

// Module-level cache to prevent duplicate fetches across components
let globalCache: {
    cafes: CafeData[];
    properties: PropertyData[];
    otherPois: OtherPoiData[];
} | null = null;
let activePromise: Promise<typeof globalCache> | null = null;

export function useMapData() {
    const [cafes, setCafes] = useState<CafeData[]>(globalCache?.cafes || []);
    const [properties, setProperties] = useState<PropertyData[]>(globalCache?.properties || []);
    const [otherPois, setOtherPois] = useState<OtherPoiData[]>(globalCache?.otherPois || []);
    const [isLoading, setIsLoading] = useState(!globalCache);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            // Return immediately if supported by cache
            if (globalCache) {
                setCafes(globalCache.cafes);
                setProperties(globalCache.properties);
                setOtherPois(globalCache.otherPois);
                setIsLoading(false);
                return;
            }

            try {
                // Join active fetch if one exists
                if (activePromise) {
                    const data = await activePromise;
                    if (data) {
                        setCafes(data.cafes);
                        setProperties(data.properties);
                        setOtherPois(data.otherPois);
                    }
                    setIsLoading(false);
                    return;
                }

                setIsLoading(true);

                // Start new fetch
                activePromise = (async () => {
                    // Fetch all data sources in parallel
                    const [cafesRes, cafeInfoRes, propsRes, otherRes] = await Promise.all([
                        fetch("/api/data?type=data"),
                        fetch("/api/data?type=cafes"), // Fetch enriched info (images)
                        fetch("/api/data?type=properties"),
                        fetch("/api/data?type=other")
                    ]);

                    // Process Cafe Info (for images/socials)
                    const cafeInfoRaw = await cafeInfoRes.json();
                    const cafeInfoMap = new Map<string, any>();
                    cafeInfoRaw.forEach((info: any) => {
                        if (info.link) cafeInfoMap.set(info.link, info);
                    });

                    // Process Cafes
                    const cafesRaw = await cafesRes.json();
                    const parsedCafes: CafeData[] = cafesRaw
                        .filter((c: any) => c.lat && c.lon)
                        .map((c: any) => {
                            // Try to find matching info by link
                            const info = c.link ? cafeInfoMap.get(c.link) : null;

                            return {
                                type: "cafe" as const,
                                name: c.name || "Unknown Cafe",
                                link: c.link || undefined,
                                address: c.address || "",
                                lat: parseFloat(c.lat),
                                lon: parseFloat(c.lon),
                                categoryName: c.categoryName || "Café",
                                rating: c.rating ? parseFloat(c.rating) : undefined,
                                reviewCount: c.reviewCount ? parseInt(c.reviewCount) : undefined,
                                franchisePartner: c.franchisePartner === "TRUE",
                                openingHours: c["openingHours/0/hours"] || undefined,
                                // Enriched fields
                                image: info?.featured_photo || undefined,
                                instagram: info?.instagram || undefined,
                                facebook: info?.facebook || undefined,
                            };
                        });

                    // Process Properties
                    const propsRaw = await propsRes.json();
                    const parsedProps: PropertyData[] = propsRaw
                        .filter((p: any) => p.latitude && p.longitude)
                        .map((p: any) => ({
                            type: "property" as const,
                            address: p.address || "",
                            latitude: parseFloat(p.latitude),
                            longitude: parseFloat(p.longitude),
                            price: parseInt(p.price) || 0,
                            size: parseInt(p.size) || 0,
                            priceByArea: parseInt(p.priceByArea) || 0,
                            district: p.district || "",
                            hasAirConditioning: p["features/hasAirConditioning"] === "TRUE",
                            url: p.url || "",
                            title: p["suggestedTexts/title"] || "Property",
                        }));

                    // Process Other POIs
                    const otherRaw = await otherRes.json();
                    const parsedOther: OtherPoiData[] = otherRaw
                        .filter((o: any) => o.Lat && o.Lon)
                        .map((o: any) => ({
                            type: categoryMap[o.Category] || "office",
                            category: o.Category || "",
                            name: o.Name || "",
                            lat: parseFloat(o.Lat),
                            lon: parseFloat(o.Lon),
                            address: o.Address || "",
                            mapsUrl: o.MapsURL || "",
                        }));

                    return { cafes: parsedCafes, properties: parsedProps, otherPois: parsedOther };
                })();

                const result = await activePromise;
                globalCache = result;

                if (result) {
                    setCafes(result.cafes);
                    setProperties(result.properties);
                    setOtherPois(result.otherPois);
                }
                setIsLoading(false);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load data");
                setIsLoading(false);
                activePromise = null; // Reset promise on error so we can retry
            }
        };

        loadData();
    }, []);

    // Compute counts per category with detailed breakdown
    const counts = useMemo(() => {
        const euCoffeeTripCount = cafes.filter(c => c.link?.includes("europeancoffeetrip")).length;
        const regularCafeCount = cafes.filter(c => !c.link?.includes("europeancoffeetrip")).length;

        return {
            cafe: cafes.length,
            euCoffeeTrip: euCoffeeTripCount,
            regularCafe: regularCafeCount,
            property: properties.length,
            transit: otherPois.filter((p) => p.type === "transit").length,
            office: otherPois.filter((p) => p.type === "office").length,
            shopping: otherPois.filter((p) => p.type === "shopping").length,
            high_street: otherPois.filter((p) => p.type === "high_street").length,
            dorm: otherPois.filter((p) => p.type === "dorm").length,
            university: otherPois.filter((p) => p.type === "university").length,
        };
    }, [cafes, properties, otherPois]);

    return {
        cafes,
        properties,
        otherPois,
        counts,
        isLoading,
        error,
    };
}
