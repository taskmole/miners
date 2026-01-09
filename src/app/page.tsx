"use client";

import React, { useState } from "react";
import { CitySelector } from "@/components/CitySelector";
import { Sidebar } from "@/components/Sidebar";
import { ActivityLog } from "@/components/ActivityLog";
import { EnhancedMapContainer } from "@/components/EnhancedMapContainer";
import { useMapData } from "@/hooks/useMapData";
import Image from "next/image";

// Default active filters - all categories enabled
const DEFAULT_FILTERS = new Set([
  "cafe",
  "eu_coffee_trip",
  "regular_cafe",
  "property",
  "transit",
  "office",
  "shopping",
  "high_street",
  "dorm",
  "university",
]);

export default function Home() {
  const { counts, isLoading, error } = useMapData();
  const [activeFilters, setActiveFilters] = useState<Set<string>>(DEFAULT_FILTERS);
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [populationEnabled, setPopulationEnabled] = useState(false);
  const [trafficHour, setTrafficHour] = useState(12);
  const [drawnFeatures, setDrawnFeatures] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });

  const handleFilterChange = (filters: Set<string>) => {
    setActiveFilters(filters);
  };

  const handleDrawnFeaturesChange = (features: GeoJSON.FeatureCollection) => {
    setDrawnFeatures(features);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-100">
      {/* Subtle branding watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1] opacity-[0.03] pointer-events-none">
        <Image
          src="/logo-black.png"
          alt="Miners Logo"
          width={600}
          height={180}
          priority
        />
      </div>

      {/* Map Layer - receives activeFilters */}
      <div className="absolute inset-0 z-0">
        <EnhancedMapContainer
          activeFilters={activeFilters}
          trafficEnabled={trafficEnabled}
          populationEnabled={populationEnabled}
          trafficHour={trafficHour}
          onDrawnFeaturesChange={handleDrawnFeaturesChange}
        />
      </div>

      {/* UI Overlays */}
      <CitySelector />
      <Sidebar
        counts={counts}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        trafficEnabled={trafficEnabled}
        onTrafficToggle={setTrafficEnabled}
        populationEnabled={populationEnabled}
        onPopulationToggle={setPopulationEnabled}
        trafficHour={trafficHour}
        onTrafficHourChange={setTrafficHour}
      />
      <ActivityLog />

      {/* Top edge gradient for depth */}
      <div className="absolute top-0 left-0 right-0 h-24 pointer-events-none bg-gradient-to-b from-white/20 to-transparent z-[5]" />
    </main>
  );
}
