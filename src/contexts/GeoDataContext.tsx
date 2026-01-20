"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { FeatureCollection } from 'geojson';

type GeoDataContextType = {
  incomeData: FeatureCollection | null;
  densityData: FeatureCollection | null;
  isLoading: boolean;
};

const GeoDataContext = createContext<GeoDataContextType>({
  incomeData: null,
  densityData: null,
  isLoading: true,
});

export function GeoDataProvider({ children }: { children: ReactNode }) {
  const [incomeData, setIncomeData] = useState<FeatureCollection | null>(null);
  const [densityData, setDensityData] = useState<FeatureCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/income').then(r => r.json()),
      fetch('/api/population').then(r => r.json()),
    ])
      .then(([income, density]) => {
        setIncomeData(income);
        setDensityData(density);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <GeoDataContext.Provider value={{ incomeData, densityData, isLoading }}>
      {children}
    </GeoDataContext.Provider>
  );
}

export const useGeoData = () => useContext(GeoDataContext);
