import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CafeData, PropertyData, OtherPoiData } from "./useMapData";
import { stripDiacritics } from "@/lib/utils";

type PoiData = CafeData | PropertyData | OtherPoiData;

export interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lon: number;
  type: string;
  placeId: string;
  placeType: string;
  data: PoiData;
  score: number;
}

interface SearchIndex {
  name: string;
  nameLower: string;
  address: string;
  addressLower: string;
  lat: number;
  lon: number;
  type: string;
  placeId: string;
  placeType: string;
  data: PoiData;
}

function makePlaceId(type: string, lat: number, lon: number): string {
  return `${type}-${Number(lat).toFixed(5)}-${Number(lon).toFixed(5)}`;
}

function makeEntry(
  name: string,
  address: string,
  lat: number,
  lon: number,
  type: string,
  data: PoiData,
): SearchIndex {
  return {
    name,
    nameLower: stripDiacritics(name.toLowerCase()),
    address,
    addressLower: stripDiacritics(address.toLowerCase()),
    lat,
    lon,
    type,
    placeId: makePlaceId(type, lat, lon),
    placeType: type,
    data,
  };
}

function buildIndex(
  cafes: CafeData[],
  properties: PropertyData[],
  otherPois: OtherPoiData[],
): SearchIndex[] {
  const entries: SearchIndex[] = [];

  for (const c of cafes) {
    if (!c.lat || !c.lon) continue;
    entries.push(makeEntry(c.name || "Unknown Cafe", c.address || "", c.lat, c.lon, "cafe", c));
  }

  for (const p of properties) {
    if (!p.latitude || !p.longitude) continue;
    const name = p.title || p.address || "Property";
    entries.push(makeEntry(name, p.address || "", p.latitude, p.longitude, "property", p));
  }

  for (const o of otherPois) {
    if (!o.lat || !o.lon) continue;
    const name = o.name || o.category || o.type;
    entries.push(makeEntry(name, o.address || "", o.lat, o.lon, o.type, o));
  }

  return entries;
}

function scoreMatch(query: string, entry: SearchIndex): number {
  const q = stripDiacritics(query.toLowerCase());

  let best = 0;

  if (entry.nameLower.startsWith(q)) best = 100;
  else if (entry.nameLower.includes(q)) best = 70;

  if (entry.addressLower.startsWith(q)) best = Math.max(best, 60);
  else if (entry.addressLower.includes(q)) best = Math.max(best, 40);

  // Boost properties since they're the primary search use case
  if (best > 0 && entry.type === "property") best += 5;

  return best;
}

const TYPE_ORDER: Record<string, number> = {
  property: 0,
  cafe: 1,
};

export function useLocationSearch(
  cafes: CafeData[],
  properties: PropertyData[],
  otherPois: OtherPoiData[],
) {
  const index = useMemo(
    () => buildIndex(cafes, properties, otherPois),
    [cafes, properties, otherPois],
  );

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.length < 2) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(() => {
      const scored: SearchResult[] = [];

      for (const entry of index) {
        const score = scoreMatch(query, entry);
        if (score > 0) {
          scored.push({ ...entry, score });
        }
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aOrder = TYPE_ORDER[a.type] ?? 2;
        const bOrder = TYPE_ORDER[b.type] ?? 2;
        return aOrder - bOrder;
      });

      setResults(scored.slice(0, 8));
    }, 200);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, index]);

  const reset = useCallback(() => {
    setQuery("");
    setResults([]);
  }, []);

  return { query, setQuery, results, reset };
}
