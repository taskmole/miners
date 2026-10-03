"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, ReactNode } from 'react';
import type { FeatureCollection } from 'geojson';

type GeoDataContextType = {
  incomeData: FeatureCollection | null;
  densityData: FeatureCollection | null;
  /** Start loading the data if nobody has yet. Safe to call repeatedly from effects or handlers. */
  requestGeoData: () => void;
};

const GeoDataContext = createContext<GeoDataContextType>({
  incomeData: null,
  densityData: null,
  requestGeoData: () => {},
});

const RETRY_COOLDOWN_MS = 30_000;

/**
 * Income and population polygons, shared by the shape stats, the hover
 * tooltip and the income/population map overlays.
 *
 * Loaded on demand, not on mount. The income file is ~4.7 MB compressed
 * (15 MB of JSON to parse), and it used to download on every page load for
 * every user, including signed-out visitors and people who never draw a
 * shape or open an overlay. Now the first component that actually needs it
 * calls requestGeoData().
 */
export function GeoDataProvider({ children }: { children: ReactNode }) {
  const [incomeData, setIncomeData] = useState<FeatureCollection | null>(null);
  const [densityData, setDensityData] = useState<FeatureCollection | null>(null);
  const started = useRef(false);
  const retryAfter = useRef(0);

  const requestGeoData = useCallback(() => {
    if (started.current || Date.now() < retryAfter.current) return;
    started.current = true;
    // The routes answer an empty collection rather than an error when they
    // fail, so empty counts as failed too. Otherwise shape stats would show
    // (and cache) zero people for the rest of the session.
    const getJson = (url: string) => fetch(url).then(async r => {
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      const data = await r.json() as FeatureCollection;
      if (!data?.features?.length) throw new Error(`${url} returned no data`);
      return data;
    });
    Promise.all([getJson('/api/income'), getJson('/api/population')])
      .then(([income, density]) => {
        setIncomeData(income);
        setDensityData(density);
      })
      .catch((err) => {
        console.error(err);
        // Let a later caller try again rather than staying empty forever, but
        // not straight away: every hover would re-download ~5 MB on a bad line.
        started.current = false;
        retryAfter.current = Date.now() + RETRY_COOLDOWN_MS;
      });
  }, []);

  const value = useMemo(
    () => ({ incomeData, densityData, requestGeoData }),
    [incomeData, densityData, requestGeoData],
  );

  return (
    <GeoDataContext.Provider value={value}>
      {children}
    </GeoDataContext.Provider>
  );
}

export const useGeoData = () => useContext(GeoDataContext);
