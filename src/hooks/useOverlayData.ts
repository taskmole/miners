import { useState, useCallback, useRef } from "react";
import type { FeatureCollection } from "geojson";

// Type for grouped traffic data (all 24 hours per location)
export interface TrafficLocation {
  distrito: string;
  direccion: string;
  lat: number;
  lon: number;
  hourly: number[]; // Array of 24 values (index = hour)
}

export function useOverlayData() {
  const [trafficData, setTrafficData] = useState<FeatureCollection | null>(null);
  const [trafficGroupedData, setTrafficGroupedData] = useState<TrafficLocation[] | null>(null);
  const [populationData, setPopulationData] = useState<FeatureCollection | null>(null);
  const [incomeData, setIncomeData] = useState<FeatureCollection | null>(null);
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);
  const [isLoadingPopulation, setIsLoadingPopulation] = useState(false);
  const [isLoadingIncome, setIsLoadingIncome] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache to avoid redundant fetches
  const trafficCacheRef = useRef<Record<number, FeatureCollection>>({});
  const trafficGroupedCacheRef = useRef<TrafficLocation[] | null>(null);
  const populationCacheRef = useRef<FeatureCollection | null>(null);
  const incomeCacheRef = useRef<FeatureCollection | null>(null);

  const loadTrafficData = useCallback(async (hour: number = 12) => {
    // Check cache first
    if (trafficCacheRef.current[hour]) {
      setTrafficData(trafficCacheRef.current[hour]);
      return;
    }

    setIsLoadingTraffic(true);
    setError(null);

    try {
      const response = await fetch(`/api/traffic?hour=${hour}`);
      if (!response.ok) throw new Error("Failed to load traffic data");

      const data = await response.json();
      trafficCacheRef.current[hour] = data;
      setTrafficData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading traffic data:", err);
    } finally {
      setIsLoadingTraffic(false);
    }
  }, []);

  // Load grouped traffic data (all 24 hours per location) for sparklines
  const loadTrafficGroupedData = useCallback(async () => {
    // Check cache first
    if (trafficGroupedCacheRef.current) {
      setTrafficGroupedData(trafficGroupedCacheRef.current);
      return;
    }

    setIsLoadingTraffic(true);
    setError(null);

    try {
      const response = await fetch("/api/traffic?grouped=true");
      if (!response.ok) throw new Error("Failed to load grouped traffic data");

      const data = await response.json();
      trafficGroupedCacheRef.current = data.locations;
      setTrafficGroupedData(data.locations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading grouped traffic data:", err);
    } finally {
      setIsLoadingTraffic(false);
    }
  }, []);

  const loadPopulationData = useCallback(async () => {
    // Check cache first
    if (populationCacheRef.current) {
      setPopulationData(populationCacheRef.current);
      return;
    }

    setIsLoadingPopulation(true);
    setError(null);

    try {
      const response = await fetch("/api/population");
      if (!response.ok) throw new Error("Failed to load population data");

      const data = await response.json();
      populationCacheRef.current = data;
      setPopulationData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading population data:", err);
    } finally {
      setIsLoadingPopulation(false);
    }
  }, []);

  const loadIncomeData = useCallback(async () => {
    // Check cache first
    if (incomeCacheRef.current) {
      setIncomeData(incomeCacheRef.current);
      return;
    }

    setIsLoadingIncome(true);
    setError(null);

    try {
      // Add cache-busting to ensure fresh data after updates
      const response = await fetch(`/api/income?v=${Date.now()}`);
      if (!response.ok) throw new Error("Failed to load income data");

      const data = await response.json();
      incomeCacheRef.current = data;
      setIncomeData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error loading income data:", err);
    } finally {
      setIsLoadingIncome(false);
    }
  }, []);

  return {
    trafficData,
    trafficGroupedData,
    populationData,
    incomeData,
    isLoadingTraffic,
    isLoadingPopulation,
    isLoadingIncome,
    error,
    loadTrafficData,
    loadTrafficGroupedData,
    loadPopulationData,
    loadIncomeData,
  };
}
