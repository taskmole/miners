"use client";

import { useState, useEffect, useMemo } from "react";
import { isRecentlyAdded, isNewPoi } from "@/lib/dateUtils";
import { preloadGravity, getScoreAt } from "@/lib/gravity-lookup";
import { supabase } from "@/lib/supabase";

function parseWkbPoint(hex: string): { lat: number; lon: number } | null {
    if (!hex || hex.length < 50) return null;
    const coordHex = hex.slice(18);
    const bytes = new Uint8Array(coordHex.match(/../g)!.map(h => parseInt(h, 16)));
    const view = new DataView(bytes.buffer);
    return { lon: view.getFloat64(0, true), lat: view.getFloat64(8, true) };
}

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
    fetchedAt?: string; // When the POI was first discovered (Google Places)
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
    // Location score (0-100) derived from the gravity model grid.
    // Undefined for cities without gravity data (e.g. Barcelona, Prague).
    score?: number;
    image_url?: string;
    priceHistory?: { price: number; date: string }[];
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
    fetchedAt?: string; // When the POI was first discovered
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
                    // Fetch all data sources in parallel (including Barcelona + Google Places + metro)
                    const [cafesRes, cafeInfoRes, barcelonaCafesRes, propsResult, otherRes, googleMadridRes, googleEnrichmentRes, gymsMadridRes, metroRes] = await Promise.all([
                        fetch("/api/data?type=data"),
                        fetch("/api/data?type=cafes"),
                        fetch("/api/data?type=barcelona_cafes"),
                        supabase!.from("places").select("name, address, location, metadata, photos").eq("source", "idealista").eq("status", "active"),
                        fetch("/api/data?type=other"),
                        fetch("/api/data?type=google_madrid"),
                        fetch("/api/data?type=google_enrichment"),
                        fetch("/api/data?type=gyms_madrid"),
                        fetch("/api/data?type=metro"),
                    ]);

                    // Start gravity grid load early so it runs in parallel with cafe processing below
                    const gravityReady = preloadGravity("madrid");

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
                                fetchedAt: c.fetchedAt || undefined,
                                city: "madrid" as const,
                            }));
                    }

                    // Combine Madrid, Barcelona, and Google Places cafes
                    const parsedCafes: CafeData[] = [...madridCafes, ...barcelonaCafes, ...googleCafes];

                    // Wait for gravity grid (started above, before cafe processing)
                    await gravityReady;

                    // Process Properties (from Supabase places table)
                    const parsedProps: PropertyData[] = (propsResult.data || [])
                        .map((p: any) => {
                            const coords = parseWkbPoint(p.location);
                            if (!coords) return null;
                            const meta = (p.metadata || {}) as Record<string, any>;
                            return {
                                type: "property" as const,
                                address: p.address || "",
                                latitude: coords.lat,
                                longitude: coords.lon,
                                price: meta.price || 0,
                                size: meta.size || 0,
                                priceByArea: meta.priceByArea || 0,
                                district: meta.district || "",
                                hasAirConditioning: meta.hasAirConditioning === true,
                                url: meta.url || "",
                                title: p.name || "Property",
                                transfer: meta.transfer || undefined,
                                hasBathroom: meta.bathrooms != null && meta.bathrooms > 0,
                                hasStorefront: meta.hasStorefront === true,
                                score: getScoreAt(coords.lat, coords.lon, "madrid"),
                                image_url: p.photos?.[0] || undefined,
                                priceHistory: meta.price_history || undefined,
                            };
                        })
                        .filter(Boolean) as PropertyData[];

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
                                fetchedAt: g.fetchedAt || undefined,
                            }));
                        parsedOther.push(...gyms);
                    }

                    // Process metro stations (already fetched in parallel above)
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

        // Count premium, new EUCT cafes, and new EUCT POIs in a single pass
        let premiumEuCoffeeTrip = 0;
        let newEuCoffeeTrip = 0;
        let newPoisCount = 0;
        for (const c of euctCafes) {
            if (c.premium) premiumEuCoffeeTrip++;
            if (isRecentlyAdded(c.datePublished)) newEuCoffeeTrip++;
            if (isNewPoi(c.datePublished)) newPoisCount++;
        }

        // Count new regular cafes (non-EUCT) in a single pass over the remainder
        const regularCafeCount = cityCafes.length - euctCafes.length;
        for (const c of cityCafes) {
            if (!c.link?.includes("europeancoffeetrip") && isNewPoi(c.fetchedAt)) {
                newPoisCount++;
            }
        }

        // Count other POI types and new gyms in a single pass
        const poiCounts: Record<string, number> = {};
        for (const p of otherPois) {
            poiCounts[p.type] = (poiCounts[p.type] || 0) + 1;
            if (p.type === "gym" && isNewPoi(p.fetchedAt)) newPoisCount++;
        }

        return {
            cafe: cityCafes.length,
            euCoffeeTrip: euctCafes.length,
            regularCafe: regularCafeCount,
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
            newPois: newPoisCount,
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
