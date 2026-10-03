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

  const requestGeoData = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const getJson = (url: string) => fetch(url).then(r => {
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return r.json();
    });
    Promise.all([getJson('/api/income'), getJson('/api/population')])
      .then(([income, density]) => {
        setIncomeData(income);
        setDensityData(density);
      })
      .catch((err) => {
        console.error(err);
        // Let the next caller try again rather than staying empty forever.
        started.current = false;
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
