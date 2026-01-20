"use client";

import React, { useState, useEffect, useCallback } from "react";
import { CitySelector, cities, type City } from "@/components/CitySelector";
import { Sidebar } from "@/components/Sidebar";
import { ActivityLog } from "@/components/ActivityLog";
import { ListsPanel } from "@/components/ListsPanel";
import { ScoutingPanel } from "@/components/ScoutingPanel";
import { ScoutingTripForm } from "@/components/ScoutingTripForm";
import { ScoutingTripUpload } from "@/components/ScoutingTripUpload";
import { ScoutingTripDetail } from "@/components/ScoutingTripDetail";
import { EnhancedMapContainer } from "@/components/EnhancedMapContainer";
import { useMapData } from "@/hooks/useMapData";
import { ListsProvider } from "@/contexts/ListsContext";
import { GeoDataProvider } from "@/contexts/GeoDataContext";
import { LinkingProvider, useLinking } from "@/contexts/LinkingContext";
import { LinkingBanner } from "@/components/LinkingBanner";
import type { ScoutingTrip, LinkedItem } from "@/types/scouting";

// Default active filters - empty (Miners cafes are always shown separately)
const DEFAULT_FILTERS = new Set<string>([]);

// Inner component that uses the linking context
function HomeContent() {
  const { counts } = useMapData();
  const { startLinking, isLinking } = useLinking();

  const [activeFilters, setActiveFilters] = useState<Set<string>>(DEFAULT_FILTERS);
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [trafficValuesEnabled, setTrafficValuesEnabled] = useState(false);
  const [populationEnabled, setPopulationEnabled] = useState(false);
  const [populationDensityFilter, setPopulationDensityFilter] = useState(0);
  const [incomeEnabled, setIncomeEnabled] = useState(false);
  const [incomeWealthyFilter, setIncomeWealthyFilter] = useState(0);
  const [trafficHour, setTrafficHour] = useState(12);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [drawnFeatures, setDrawnFeatures] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });
  const [selectedCity, setSelectedCity] = useState<City>(cities[0]);

  // Scouting trip modal states
  const [isScoutingFormOpen, setIsScoutingFormOpen] = useState(false);
  const [isScoutingUploadOpen, setIsScoutingUploadOpen] = useState(false);
  const [isScoutingDetailOpen, setIsScoutingDetailOpen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<ScoutingTrip | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Store pending linked items that will be added when linking completes
  const [pendingLinkedItems, setPendingLinkedItems] = useState<LinkedItem[]>([]);
  const [linkingSource, setLinkingSource] = useState<'form' | 'upload' | null>(null);

  const handleFilterChange = (filters: Set<string>) => {
    setActiveFilters(filters);
  };

  const handleDrawnFeaturesChange = (features: GeoJSON.FeatureCollection) => {
    setDrawnFeatures(features);
  };

  // Handle starting linking mode from form or upload
  const handleStartLinking = useCallback((source: 'form' | 'upload') => {
    setLinkingSource(source);
    // Close the modal temporarily
    if (source === 'form') {
      setIsScoutingFormOpen(false);
    } else {
      setIsScoutingUploadOpen(false);
    }

    // Start linking mode with callback
    startLinking((items) => {
      setPendingLinkedItems(items);
      // Reopen the modal
      if (source === 'form') {
        setIsScoutingFormOpen(true);
      } else {
        setIsScoutingUploadOpen(true);
      }
      setLinkingSource(null);
    });
  }, [startLinking]);

  // Listen for navigate-and-open-popup events from ListsPanel
  useEffect(() => {
    const handleNavigateAndOpenPopup = (e: CustomEvent) => {
      const { placeType } = e.detail;
      if (!placeType) return;

      if (!activeFilters.has(placeType)) {
        setActiveFilters(prev => {
          const newFilters = new Set(prev);
          newFilters.add(placeType);
          return newFilters;
        });
      }
    };

    window.addEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
    return () => {
      window.removeEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
    };
  }, [activeFilters]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-100">
      {/* Linking mode banner */}
      <LinkingBanner />

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <EnhancedMapContainer
          activeFilters={activeFilters}
          ratingFilter={ratingFilter}
          trafficEnabled={trafficEnabled}
          trafficValuesEnabled={trafficValuesEnabled}
          populationEnabled={populationEnabled}
          populationDensityFilter={populationDensityFilter}
          incomeEnabled={incomeEnabled}
          incomeWealthyFilter={incomeWealthyFilter}
          trafficHour={trafficHour}
          onDrawnFeaturesChange={handleDrawnFeaturesChange}
          selectedCity={selectedCity}
          isLinkingMode={isLinking}
        />
      </div>

      {/* UI Overlays - hide when in linking mode */}
      {!isLinking && (
        <>
          <CitySelector onCityChange={setSelectedCity} />
          <Sidebar
            counts={counts}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            ratingFilter={ratingFilter}
            onRatingChange={setRatingFilter}
            trafficEnabled={trafficEnabled}
            onTrafficToggle={setTrafficEnabled}
            trafficValuesEnabled={trafficValuesEnabled}
            onTrafficValuesToggle={setTrafficValuesEnabled}
            populationEnabled={populationEnabled}
            onPopulationToggle={setPopulationEnabled}
            populationDensityFilter={populationDensityFilter}
            onPopulationDensityFilterChange={setPopulationDensityFilter}
            incomeEnabled={incomeEnabled}
            onIncomeToggle={setIncomeEnabled}
            incomeWealthyFilter={incomeWealthyFilter}
            onIncomeWealthyFilterChange={setIncomeWealthyFilter}
            trafficHour={trafficHour}
            onTrafficHourChange={setTrafficHour}
          />
          <ActivityLog />
          <ListsPanel />
          <ScoutingPanel
            cityId={selectedCity.id}
            onCreateNew={() => setIsScoutingFormOpen(true)}
            onUpload={() => setIsScoutingUploadOpen(true)}
            onSelectTrip={(trip) => {
              setSelectedTripId(trip.id);
              setIsScoutingDetailOpen(true);
            }}
          />
        </>
      )}

      {/* Top edge gradient for depth */}
      <div className="absolute top-0 left-0 right-0 h-24 pointer-events-none bg-gradient-to-b from-white/20 to-transparent z-[5]" />

      {/* Scouting Trip Form Modal */}
      <ScoutingTripForm
        isOpen={isScoutingFormOpen && !isLinking}
        onClose={() => {
          setIsScoutingFormOpen(false);
          setSelectedTrip(null);
          setPendingLinkedItems([]);
        }}
        cityId={selectedCity.id}
        existingTrip={selectedTrip}
        pendingLinkedItems={pendingLinkedItems}
        onStartLinking={() => handleStartLinking('form')}
      />

      {/* Scouting Trip Upload Modal */}
      <ScoutingTripUpload
        isOpen={isScoutingUploadOpen && !isLinking}
        onClose={() => {
          setIsScoutingUploadOpen(false);
          setPendingLinkedItems([]);
        }}
        cityId={selectedCity.id}
        pendingLinkedItems={pendingLinkedItems}
        onStartLinking={() => handleStartLinking('upload')}
      />

      {/* Scouting Trip Detail Modal */}
      {isScoutingDetailOpen && selectedTripId && (
        <ScoutingTripDetail
          tripId={selectedTripId}
          onClose={() => {
            setIsScoutingDetailOpen(false);
            setSelectedTripId(null);
          }}
          onEdit={(trip) => {
            setIsScoutingDetailOpen(false);
            setSelectedTrip(trip);
            setIsScoutingFormOpen(true);
          }}
        />
      )}
    </main>
  );
}

// Main component with providers
export default function Home() {
  return (
    <GeoDataProvider>
      <ListsProvider>
        <LinkingProvider>
          <HomeContent />
        </LinkingProvider>
      </ListsProvider>
    </GeoDataProvider>
  );
}
