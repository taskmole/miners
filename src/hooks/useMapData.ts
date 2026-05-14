"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { isRecentlyAdded, isNewPoi } from "@/lib/dateUtils";
import { preloadGravity, getScoreAt } from "@/lib/gravity-lookup";

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
    googleMapsUrl?: string;
    instagram?: string;
    facebook?: string;
    premium?: boolean;
    datePublished?: string;
    fetchedAt?: string;
    city: "madrid" | "barcelona" | "prague";
    placeId?: string;
}

export interface PropertyData {
    type: "property";
    source: "idealista" | "sreality";
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
    transfer?: number;
    hasBathroom?: boolean;
    hasStorefront?: boolean;
    score?: number;
    image_url?: string;
    priceHistory?: { price: number; date: string }[];
    createdAt?: string;
    updatedAt?: string;
    photos?: string[];
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
    fetchedAt?: string;
}

export type LocationData = CafeData | PropertyData | OtherPoiData;

/** True when the current price differs from the oldest recorded price by at least 0.5% */
export function hasChangedPrice(p: PropertyData): boolean {
    const h = p.priceHistory;
    const oldPrice = h?.[h.length - 1]?.price;
    return oldPrice != null && oldPrice !== p.price && Math.abs((p.price - oldPrice) / oldPrice) >= 0.005;
}

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

const TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

function mapEuctCsvCafes(raw: any[], city: CafeData["city"]): CafeData[] {
    return raw
        .filter((c: any) => c.latitude && c.longitude)
        .map((c: any) => ({
            type: "cafe" as const,
            name: c.name || "Unknown Cafe",
            link: c.link || undefined,
            address: c.address || "",
            lat: parseFloat(c.latitude),
            lon: parseFloat(c.longitude),
            categoryName: "EU Coffee Trip",
            rating: undefined,
            reviewCount: undefined,
            franchisePartner: false,
            openingHours: undefined,
            image: undefined,
            website: c.website || undefined,
            instagram: c.instagram || undefined,
            facebook: c.facebook || undefined,
            premium: c.premium === 'True' || c.premium === true,
            datePublished: c.date_published || undefined,
            fetchedAt: c.date_modified || undefined,
            city,
        }));
}

function mapGooglePlacesCafes(raw: any[], city: CafeData["city"]): CafeData[] {
    return raw
        .filter((c: any) => c.lat && c.lon)
        .map((c: any) => ({
            type: "cafe" as const,
            name: c.name || "Unknown Cafe",
            link: undefined,
            address: c.address || "",
            lat: parseFloat(c.lat),
            lon: parseFloat(c.lon),
            categoryName: "Café",
            rating: c.rating ? parseFloat(c.rating) : undefined,
            reviewCount: c.reviewCount ? parseInt(c.reviewCount) : undefined,
            franchisePartner: false,
            openingHours: c.openingHours || undefined,
            image: undefined,
            website: c.website || undefined,
            googleMapsUrl: c.googleMapsUrl || undefined,
            instagram: undefined,
            facebook: undefined,
            premium: false,
            datePublished: undefined,
            fetchedAt: c.fetchedAt || undefined,
            city,
        }));
}

async function applyGoogleEnrichment(cafes: CafeData[], enrichmentRes: Response): Promise<void> {
    if (!enrichmentRes.ok) return;
    const enrichmentRaw = await enrichmentRes.json();
    const enrichmentMap = new Map<string, any>();
    (enrichmentRaw as any[]).forEach((e: any) => {
        const key = `${parseFloat(e.euct_lat).toFixed(4)},${parseFloat(e.euct_lon).toFixed(4)}`;
        enrichmentMap.set(key, e);
    });
    for (const cafe of cafes) {
        const key = `${cafe.lat.toFixed(4)},${cafe.lon.toFixed(4)}`;
        const enrichment = enrichmentMap.get(key);
        if (enrichment) {
            if (enrichment.gp_website) cafe.website = enrichment.gp_website;
            if (enrichment.gp_google_maps_url) cafe.googleMapsUrl = enrichment.gp_google_maps_url;
            if (enrichment.gp_rating) cafe.rating = parseFloat(enrichment.gp_rating);
            if (enrichment.gp_reviewCount) cafe.reviewCount = parseInt(enrichment.gp_reviewCount);
            if (enrichment.gp_openingHours) cafe.openingHours = enrichment.gp_openingHours;
        }
    }
}

async function loadCafes(cityId: string): Promise<CafeData[]> {
    if (cityId === "madrid") return loadMadridCafes();
    if (cityId === "barcelona") return loadBarcelonaCafes();
    if (cityId === "prague") return loadPragueCafes();
    return [];
}

async function loadMadridCafes(): Promise<CafeData[]> {
    const [cafesRes, cafeInfoRes, googleMadridRes, googleEnrichmentRes] = await Promise.all([
        fetchWithTimeout("/api/data?type=data"),
        fetchWithTimeout("/api/data?type=cafes"),
        fetchWithTimeout("/api/data?type=google_madrid"),
        fetchWithTimeout("/api/data?type=google_enrichment"),
    ]);

    const cafeInfoRaw = await cafeInfoRes.json();
    const cafeInfoMap = new Map<string, any>();
    cafeInfoRaw.forEach((info: any) => {
        if (info.link) cafeInfoMap.set(info.link, info);
    });

    const cafesRaw = await cafesRes.json();
    const madridCafes: CafeData[] = cafesRaw
        .filter((c: any) => c.lat && c.lon && c.link?.includes("europeancoffeetrip"))
        .map((c: any) => {
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
                image: undefined,
                website: info?.website || undefined,
                instagram: info?.instagram || undefined,
                facebook: info?.facebook || undefined,
                premium: info?.premium === 'True' || info?.premium === true,
                datePublished: info?.date_published || undefined,
                fetchedAt: info?.date_modified || undefined,
                city: "madrid" as const,
            };
        });

    await applyGoogleEnrichment(madridCafes, googleEnrichmentRes);

    const googleCafes = googleMadridRes.ok
        ? mapGooglePlacesCafes(await googleMadridRes.json(), "madrid")
        : [];

    return [...madridCafes, ...googleCafes];
}

async function loadBarcelonaCafes(): Promise<CafeData[]> {
    const res = await fetchWithTimeout("/api/data?type=barcelona_cafes");
    if (!res.ok) return [];
    return mapEuctCsvCafes(await res.json(), "barcelona");
}

async function loadPragueCafes(): Promise<CafeData[]> {
    const [euctRes, googleRes, enrichmentRes] = await Promise.all([
        fetchWithTimeout("/api/data?type=prague_cafes"),
        fetchWithTimeout("/api/data?type=google_prague"),
        fetchWithTimeout("/api/data?type=google_enrichment_prague"),
    ]);

    const euctCafes = euctRes.ok
        ? mapEuctCsvCafes(await euctRes.json(), "prague")
        : [];

    await applyGoogleEnrichment(euctCafes, enrichmentRes);

    const googleCafes = googleRes.ok
        ? mapGooglePlacesCafes(await googleRes.json(), "prague")
        : [];

    return [...euctCafes, ...googleCafes];
}

async function loadProperties(cityId: string): Promise<PropertyData[]> {
    await preloadGravity(cityId);

    const res = await fetchWithTimeout(`/api/db/places?city_id=${encodeURIComponent(cityId)}`);
    if (!res.ok) throw new Error(`Places API ${res.status}: ${res.statusText}`);
    const rows: any[] = await res.json();

    return rows.map((p: any) => ({
        type: "property" as const,
        source: p.source === "sreality" ? "sreality" as const : "idealista" as const,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        price: p.price,
        size: p.size,
        priceByArea: p.priceByArea,
        district: p.district,
        hasAirConditioning: p.hasAirConditioning,
        url: p.url,
        title: p.name,
        transfer: p.transfer,
        hasBathroom: p.hasBathroom,
        hasStorefront: p.hasStorefront,
        score: getScoreAt(p.latitude, p.longitude, cityId),
        image_url: p.image_url,
        priceHistory: p.priceHistory,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        photos: p.photos,
    }));
}

async function loadMadridOtherPois(): Promise<OtherPoiData[]> {
    const [otherRaw, gymsRaw, metroData] = await Promise.all([
        fetchWithTimeout("/api/data?type=other").then(r => r.json()).catch(() => []),
        fetchWithTimeout("/api/data?type=gyms_madrid").then(r => r.json()).catch(() => []),
        fetchWithTimeout("/api/data?type=metro").then(r => r.json()).catch(() => ({ features: [] })),
    ]);

    const parsedOther: OtherPoiData[] = (otherRaw as any[])
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

    const gyms: OtherPoiData[] = (gymsRaw as any[])
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

    const metroStations: OtherPoiData[] = ((metroData as any).features || []).map((feature: any) => ({
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

    return parsedOther;
}

async function loadPragueOtherPois(): Promise<OtherPoiData[]> {
    const [osmRaw, gymsRaw, metroData] = await Promise.all([
        fetchWithTimeout("/api/data?type=osm_pois_prague").then(r => r.ok ? r.json() : []).catch(() => []),
        fetchWithTimeout("/api/data?type=gyms_prague").then(r => r.ok ? r.json() : []).catch(() => []),
        fetchWithTimeout("/api/data?type=metro&city=prague").then(r => r.ok ? r.json() : { features: [] }).catch(() => ({ features: [] })),
    ]);

    const parsedOsm: OtherPoiData[] = (osmRaw as any[])
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

    const gyms: OtherPoiData[] = (gymsRaw as any[])
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
    parsedOsm.push(...gyms);

    const metroStations: OtherPoiData[] = ((metroData as any).features || []).map((feature: any) => ({
        type: "metro" as const,
        category: "Metro Station",
        name: feature.properties.name || "Metro Station",
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        address: "",
        mapsUrl: "",
        website: feature.properties.website || "",
    }));
    parsedOsm.push(...metroStations);

    return parsedOsm;
}

async function loadOtherPois(cityId: string): Promise<OtherPoiData[]> {
    if (cityId === "madrid") return loadMadridOtherPois();
    if (cityId === "prague") return loadPragueOtherPois();
    return [];
}

const SWR_OPTIONS = {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 5_000,
    shouldRetryOnError: true,
    errorRetryCount: 2,
    errorRetryInterval: 1_000,
    keepPreviousData: true,
} as const;

export function useMapData(cityId?: string) {
    const effectiveCity = cityId || "madrid";

    const cafesSWR = useSWR(
        ["useMapData/cafes", effectiveCity],
        ([, city]) => loadCafes(city),
        SWR_OPTIONS,
    );
    const propertiesSWR = useSWR(
        ["useMapData/properties", effectiveCity],
        ([, city]) => loadProperties(city),
        SWR_OPTIONS,
    );
    const otherPoisSWR = useSWR(
        ["useMapData/otherPois", effectiveCity],
        ([, city]) => loadOtherPois(city),
        SWR_OPTIONS,
    );

    const cafes = cafesSWR.data ?? [];
    const properties = propertiesSWR.data ?? [];
    const otherPois = otherPoisSWR.data ?? [];

    const isLoading = cafesSWR.isLoading || propertiesSWR.isLoading || otherPoisSWR.isLoading;
    const firstError = cafesSWR.error ?? propertiesSWR.error ?? otherPoisSWR.error;
    const error = firstError instanceof Error ? firstError.message : firstError ? "Failed to load map data" : null;

    const retry = () => {
        cafesSWR.mutate();
        propertiesSWR.mutate();
        otherPoisSWR.mutate();
    };

    const counts = useMemo(() => {
        const cityCafes = cafes.filter(c => c.city === effectiveCity);
        const euctCafes = cityCafes.filter(c => c.link?.includes("europeancoffeetrip"));

        let premiumEuCoffeeTrip = 0;
        let newEuCoffeeTrip = 0;
        let newPoisCount = 0;
        for (const c of euctCafes) {
            if (c.premium) premiumEuCoffeeTrip++;
            if (isRecentlyAdded(c.datePublished)) newEuCoffeeTrip++;
            if (isNewPoi(c.datePublished)) newPoisCount++;
        }

        const regularCafeCount = cityCafes.length - euctCafes.length;
        for (const c of cityCafes) {
            if (!c.link?.includes("europeancoffeetrip") && isNewPoi(c.fetchedAt)) {
                newPoisCount++;
            }
        }

        const poiCounts: Record<string, number> = {};
        for (const p of otherPois) {
            poiCounts[p.type] = (poiCounts[p.type] || 0) + 1;
            if (p.type === "gym" && isNewPoi(p.fetchedAt)) newPoisCount++;
        }

        let propertyLast7d = 0;
        let propertyWithTransfer = 0;
        let propertyPriceChanged = 0;
        for (const prop of properties) {
            if (isNewPoi(prop.createdAt, 7)) propertyLast7d++;
            if (prop.transfer && prop.transfer > 0) propertyWithTransfer++;
            if (hasChangedPrice(prop)) propertyPriceChanged++;
        }

        return {
            cafe: cityCafes.length,
            euCoffeeTrip: euctCafes.length,
            regularCafe: regularCafeCount,
            premiumEuCoffeeTrip,
            newEuCoffeeTrip,
            property: properties.length,
            propertyLast7d,
            propertyWithTransfer,
            propertyPriceChanged,
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
    }, [cafes, properties, otherPois, effectiveCity]);

    return {
        cafes,
        properties,
        otherPois,
        counts,
        isLoading,
        error,
        retry,
    };
}

export const __test = { loadProperties, loadCafes, loadOtherPois };
