import { useState, useCallback, useRef } from "react";
import type { FeatureCollection } from "geojson";

export function useOverlayData() {
  const [trafficData, setTrafficData] = useState<FeatureCollection | null>(null);
  const [populationData, setPopulationData] = useState<FeatureCollection | null>(null);
  const [isLoadingTraffic, setIsLoadingTraffic] = useState(false);
  const [isLoadingPopulation, setIsLoadingPopulation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache to avoid redundant fetches
  const trafficCacheRef = useRef<Record<number, FeatureCollection>>({});
  const populationCacheRef = useRef<FeatureCollection | null>(null);

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

  return {
    trafficData,
    populationData,
    isLoadingTraffic,
    isLoadingPopulation,
    error,
    loadTrafficData,
    loadPopulationData,
  };
}
