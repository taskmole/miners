"use client";

import { useState, useEffect, useMemo } from "react";
import { isRecentlyAdded } from "@/lib/dateUtils";

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
    website?: string;
    googleMapsUrl?: string; // Official Google Maps link from Google Places
    instagram?: string;
    facebook?: string;
    premium?: boolean;
    datePublished?: string;
    city: "madrid" | "barcelona" | "prague"; // Which city this cafe belongs to
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
    // Optional fields for enhanced display
    transfer?: number;          // traspaso amount
    hasBathroom?: boolean;
    hasStorefront?: boolean;
}

export interface OtherPoiData {
    type: "transit" | "office" | "shopping" | "high_street" | "dorm" | "university" | "metro" | "gym";
    category: string;
    name: string;
    lat: number;
    lon: number;
    address: string;
    mapsUrl: string;
    website?: string;
}

export type LocationData = CafeData | PropertyData | OtherPoiData;

// Category mapping for other.csv
const categoryMap: Record<string, OtherPoiData["type"]> = {
    "Train Station": "transit",
    "Metro Station": "transit",
    "Metro": "transit",
    "Office Center": "office",
    "Shopping Center": "shopping",
    "High Street": "high_street",
    "Student Dormitory": "dorm",
    "University": "university",
    "Gym": "gym",
};

// Cache type definition
interface MapDataCache {
    cafes: CafeData[];
    properties: PropertyData[];
    otherPois: OtherPoiData[];
}

// Module-level cache to prevent duplicate fetches across components
let globalCache: MapDataCache | null = null;
let activePromise: Promise<MapDataCache | null> | null = null;

export function useMapData(cityId?: string) {
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
                    // Fetch all data sources in parallel (including Barcelona + Google Places)
                    const [cafesRes, cafeInfoRes, barcelonaCafesRes, propsRes, otherRes, googleMadridRes, googleEnrichmentRes, gymsMadridRes] = await Promise.all([
                        fetch("/api/data?type=data"),
                        fetch("/api/data?type=cafes"), // Fetch enriched info (images)
                        fetch("/api/data?type=barcelona_cafes"), // Barcelona cafe data
                        fetch("/api/data?type=properties"),
                        fetch("/api/data?type=other"),
                        fetch("/api/data?type=google_madrid"), // Google Places regular cafes
                        fetch("/api/data?type=google_enrichment"), // Google Places data for EUCT enrichment
                        fetch("/api/data?type=gyms_madrid"), // Gyms (4+ stars)
                    ]);

                    // Process Cafe Info (for images/socials) - Madrid enriched data
                    const cafeInfoRaw = await cafeInfoRes.json();
                    const cafeInfoMap = new Map<string, any>();
                    cafeInfoRaw.forEach((info: any) => {
                        if (info.link) cafeInfoMap.set(info.link, info);
                    });

                    // Process Madrid Cafes
                    const cafesRaw = await cafesRes.json();
                    const madridCafes: CafeData[] = cafesRaw
                        .filter((c: any) => c.lat && c.lon && c.link?.includes("europeancoffeetrip"))
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
                                // Enriched fields from cafe_info.csv
                                image: info?.featured_photo || undefined,
                                website: info?.website || undefined,
                                instagram: info?.instagram || undefined,
                                facebook: info?.facebook || undefined,
                                premium: info?.premium === 'True' || info?.premium === true,
                                datePublished: info?.date_published || undefined,
                                city: "madrid" as const, // Mark as Madrid cafe
                            };
                        });

                    // Process Barcelona Cafes (all data in one CSV)
                    const barcelonaCafesRaw = await barcelonaCafesRes.json();
                    const barcelonaCafes: CafeData[] = barcelonaCafesRaw
                        .filter((c: any) => c.latitude && c.longitude)
                        .map((c: any) => ({
                            type: "cafe" as const,
                            name: c.name || "Unknown Cafe",
                            link: c.link || undefined,
                            address: c.address || "",
                            lat: parseFloat(c.latitude),
                            lon: parseFloat(c.longitude),
                            categoryName: "EU Coffee Trip", // All Barcelona cafes from ECT
                            rating: undefined,
                            reviewCount: undefined,
                            franchisePartner: c.name?.toLowerCase().includes("miners") || false,
                            openingHours: undefined,
                            image: c.featured_photo || undefined,
                            website: c.website || undefined,
                            instagram: c.instagram || undefined,
                            facebook: c.facebook || undefined,
                            premium: c.premium === 'True' || c.premium === true,
                            datePublished: c.date_published || undefined,
                            city: "barcelona" as const, // Mark as Barcelona cafe
                        }));

                    // Enrich EUCT cafes with Google Places data (rating, hours, website)
                    if (googleEnrichmentRes.ok) {
                        const enrichmentRaw = await googleEnrichmentRes.json();
                        // Build lookup by lat/lon (rounded to 4 decimals for matching)
                        const enrichmentMap = new Map<string, any>();
                        enrichmentRaw.forEach((e: any) => {
                            const key = `${parseFloat(e.euct_lat).toFixed(4)},${parseFloat(e.euct_lon).toFixed(4)}`;
                            enrichmentMap.set(key, e);
                        });

                        // Merge Google Places data into matching EUCT cafes
                        for (const cafe of madridCafes) {
                            const key = `${cafe.lat.toFixed(4)},${cafe.lon.toFixed(4)}`;
                            const enrichment = enrichmentMap.get(key);
                            if (enrichment) {
                                // Always use Google Places website/link
                                if (enrichment.gp_website) cafe.website = enrichment.gp_website;
                                // Always use official Google Maps URL
                                if (enrichment.gp_google_maps_url) cafe.googleMapsUrl = enrichment.gp_google_maps_url;
                                // Use Google Places rating (more up to date)
                                if (enrichment.gp_rating) cafe.rating = parseFloat(enrichment.gp_rating);
                                // Add Google review count
                                if (enrichment.gp_reviewCount) cafe.reviewCount = parseInt(enrichment.gp_reviewCount);
                                // Use Google Places hours (more reliable/current)
                                if (enrichment.gp_openingHours) cafe.openingHours = enrichment.gp_openingHours;
                            }
                        }
                    }

                    // Process Google Places regular cafes (not in EU Coffee Trip)
                    let googleCafes: CafeData[] = [];
                    if (googleMadridRes.ok) {
                        const googleRaw = await googleMadridRes.json();
                        googleCafes = googleRaw
                            .filter((c: any) => c.lat && c.lon)
                            .map((c: any) => ({
                                type: "cafe" as const,
                                name: c.name || "Unknown Cafe",
                                link: undefined, // No EU Coffee Trip link
                                address: c.address || "",
                                lat: parseFloat(c.lat),
                                lon: parseFloat(c.lon),
                                categoryName: "Café", // Regular cafe
                                rating: c.rating ? parseFloat(c.rating) : undefined,
                                reviewCount: c.reviewCount ? parseInt(c.reviewCount) : undefined,
                                franchisePartner: false,
                                openingHours: c.openingHours || undefined,
                                image: undefined,
                                website: c.website || undefined,
                                googleMapsUrl: c.googleMapsUrl || undefined, // Official Google Maps link
                                instagram: undefined,
                                facebook: undefined,
                                premium: false,
                                datePublished: undefined,
                                city: "madrid" as const,
                            }));
                    }

                    // Combine Madrid, Barcelona, and Google Places cafes
                    const parsedCafes: CafeData[] = [...madridCafes, ...barcelonaCafes, ...googleCafes];

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
                            title: p.title || p["suggestedTexts/title"] || "Property",
                            // Optional enhanced fields
                            transfer: p.transfer ? parseInt(p.transfer) : undefined,
                            hasBathroom: p["features/hasBathroom"] === "TRUE" || p.hasBathroom === "TRUE" || (p.bathrooms && parseInt(p.bathrooms) > 0),
                            hasStorefront: p["features/hasStorefront"] === "TRUE" || p.hasStorefront === "TRUE",
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

                    // Process Gyms (4+ stars from Google Places)
                    if (gymsMadridRes.ok) {
                        const gymsRaw = await gymsMadridRes.json();
                        const gyms: OtherPoiData[] = gymsRaw
                            .filter((g: any) => g.lat && g.lon)
                            .map((g: any) => ({
                                type: "gym" as const,
                                category: "Gym",
                                name: g.name || "Gym",
                                lat: parseFloat(g.lat),
                                lon: parseFloat(g.lon),
                                address: g.address || "",
                                mapsUrl: g.googleMapsUrl || "",
                                website: g.website || undefined,
                            }));
                        parsedOther.push(...gyms);
                    }

                    // Fetch metro stations from GeoJSON
                    const metroRes = await fetch("/api/data?type=metro");
                    if (metroRes.ok) {
                        const metroData = await metroRes.json();
                        const metroStations: OtherPoiData[] = metroData.features.map((feature: any) => ({
                            type: "metro" as const,
                            category: "Metro Station",
                            name: feature.properties.name || "Metro Station",
                            lat: feature.geometry.coordinates[1],
                            lon: feature.geometry.coordinates[0],
                            address: "",
                            mapsUrl: "",
                            website: feature.properties.website || "",
                        }));
                        parsedOther.push(...metroStations);
                    }

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

    // Compute counts per category with detailed breakdown (filtered by selected city)
    const counts = useMemo(() => {
        // Filter cafes by selected city so counts match what's visible on the map
        const cityCafes = cityId ? cafes.filter(c => c.city === cityId) : cafes;
        const euctCafes = cityCafes.filter(c => c.link?.includes("europeancoffeetrip"));

        // Count premium and new EUCT cafes in a single pass
        let premiumEuCoffeeTrip = 0;
        let newEuCoffeeTrip = 0;
        for (const c of euctCafes) {
            if (c.premium) premiumEuCoffeeTrip++;
            if (isRecentlyAdded(c.datePublished)) newEuCoffeeTrip++;
        }

        // Count other POI types in a single pass
        const poiCounts: Record<string, number> = {};
        for (const p of otherPois) {
            poiCounts[p.type] = (poiCounts[p.type] || 0) + 1;
        }

        return {
            cafe: cityCafes.length,
            euCoffeeTrip: euctCafes.length,
            regularCafe: cityCafes.length - euctCafes.length,
            premiumEuCoffeeTrip,
            newEuCoffeeTrip,
            property: properties.length,
            transit: poiCounts["transit"] || 0,
            metro: poiCounts["metro"] || 0,
            office: poiCounts["office"] || 0,
            shopping: poiCounts["shopping"] || 0,
            high_street: poiCounts["high_street"] || 0,
            dorm: poiCounts["dorm"] || 0,
            university: poiCounts["university"] || 0,
            gym: poiCounts["gym"] || 0,
        };
    }, [cafes, properties, otherPois, cityId]);

    return {
        cafes,
        properties,
        otherPois,
        counts,
        isLoading,
        error,
    };
}
