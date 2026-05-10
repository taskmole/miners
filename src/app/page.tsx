"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CitySelector, cities, type City } from "@/components/CitySelector";
import { Sidebar, CITY_OVERLAYS, DEFAULT_OVERLAYS } from "@/components/Sidebar";
import { ActivityLog } from "@/components/ActivityLog";
import { ListsPanel } from "@/components/ListsPanel";
import { ScoutingPanel } from "@/components/ScoutingPanel";
import { ScoutingTripForm } from "@/components/ScoutingTripForm";
import { ScoutingTripUpload } from "@/components/ScoutingTripUpload";
import { ScoutingTripDetail } from "@/components/ScoutingTripDetail";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { FootfallTimePicker } from "@/components/FootfallTimePicker";
import { FeedbackButton } from "@/components/FeedbackButton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { LocationSearch } from "@/components/LocationSearch";
import { EnhancedMapContainer } from "@/components/EnhancedMapContainer";
import { LandingPage } from "@/components/LandingPage";
import { CityPicker } from "@/components/CityPicker";
import {
  getStoredDefaultCity,
  hasStoredDefaultCity,
  saveDefaultCity,
  shouldShowOnboardingPicker,
} from "@/lib/userPreferences";
import { useMapData } from "@/hooks/useMapData";
import { ListsProvider } from "@/contexts/ListsContext";
import { HiddenPoisProvider } from "@/contexts/HiddenPoisContext";
import { GeoDataProvider } from "@/contexts/GeoDataContext";
import { LinkingProvider, useLinking } from "@/contexts/LinkingContext";
import { ScoutingTripsProvider } from "@/contexts/ScoutingTripsContext";
import { PointCategoriesProvider } from "@/contexts/PointCategoriesContext";
import { SheetProvider } from "@/contexts/SheetContext";
import { WalkingRadiusProvider } from "@/contexts/WalkingRadiusContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ShapeDataProvider } from "@/contexts/ShapeDataContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { LinkingBanner } from "@/components/LinkingBanner";
import { supabase } from "@/lib/supabase";
import { setAuthUserId } from "@/lib/browser-session";
import { migrateAnonymousData } from "@/lib/supabaseHelpers";
import type { User } from "@supabase/supabase-js";
import type { ScoutingTrip, LinkedItem } from "@/types/scouting";
import { usePathname } from "next/navigation";
import type { EuctFilter, PropertyPostedFilter, PropertyTransferFilter, PropertyPriceChangeFilter } from "@/types/filters";

// Default active filters - empty (Miners cafes are always shown separately)
const DEFAULT_FILTERS = new Set<string>([]);

// Inner component that uses the linking context
function HomeContent() {
  const pathname = usePathname();
  const demoMode = pathname === "/demo";
  const feedbackOpenRef = useRef<(() => void) | null>(null);
  const handleExposeOpen = useCallback((fn: () => void) => { feedbackOpenRef.current = fn; }, []);
  const [selectedCity, setSelectedCity] = useState<City>(
    () => cities.find(c => c.id === "madrid") ?? cities[0]
  );
  const { cafes, properties, otherPois, counts } = useMapData(selectedCity.id);
  const { startLinking, isLinking } = useLinking();

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Landing page state - shows on first load (unless already logged in)
  const [showLanding, setShowLanding] = useState(true);

  // Onboarding city picker - shown to new users after Google sign-in
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Check for auth session on mount and listen for changes
  useEffect(() => {
    if (!supabase) {
      setAuthChecked(true);
      return;
    }

    // Check for auth error in URL params
    const params = new URLSearchParams(window.location.search);
    const error = params.get("auth_error");
    if (error) {
      setAuthError(decodeURIComponent(error));
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Show picker for any signed-in user without a saved city; otherwise apply
    // the saved city. Madrid is the in-memory fallback while the picker renders.
    const applyCityForUser = (u: User) => {
      if (shouldShowOnboardingPicker(u)) {
        setShowCityPicker(true);
        return;
      }
      if (hasStoredDefaultCity(u)) {
        setSelectedCity(getStoredDefaultCity(u));
      }
    };

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // Re-tag anonymous data BEFORE setting auth ID (prevents race condition)
        await migrateAnonymousData(session.user.id);
        setUser(session.user);
        setAuthUserId(session.user.id);
        setShowLanding(false);
        applyCityForUser(session.user);
      }
      setAuthChecked(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await migrateAnonymousData(session.user.id);
        }
        setUser(session?.user ?? null);
        setAuthUserId(session?.user?.id ?? null);
        if (session?.user) {
          setShowLanding(false);
          setAuthError(null);
          applyCityForUser(session.user);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const [activeFilters, setActiveFilters] = useState<Set<string>>(DEFAULT_FILTERS);
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [trafficValuesEnabled, setTrafficValuesEnabled] = useState(false);
  const [populationEnabled, setPopulationEnabled] = useState(false);
  const [populationDensityFilter, setPopulationDensityFilter] = useState(0);
  const [incomeEnabled, setIncomeEnabled] = useState(false);
  const [incomeWealthyFilter, setIncomeWealthyFilter] = useState(0);
  const [trafficHour, setTrafficHour] = useState(12);
  const [ratingFilter, setRatingFilter] = useState(0);
  const [scoreFilter, setScoreFilter] = useState(0);
  const [euctFilter, setEuctFilter] = useState<EuctFilter>("all");
  const [propertyPostedFilter, setPropertyPostedFilter] = useState<PropertyPostedFilter>("all");
  const [propertyTransferFilter, setPropertyTransferFilter] = useState<PropertyTransferFilter>("all");
  const [propertyPriceChangeFilter, setPropertyPriceChangeFilter] = useState<PropertyPriceChangeFilter>("all");
  const [showHiddenPois, setShowHiddenPois] = useState(false);

  // Location Score toggle state
  const [gravityEnabled, setGravityEnabled] = useState(false);

  const [drawnFeatures, setDrawnFeatures] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });

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

  // Auto-enable a POI category filter when navigating to a place
  // Handles events from ListsPanel, Activity Log, and any other navigation source
  useEffect(() => {
    const enableFilterForType = (placeType: string) => {
      if (placeType && !activeFilters.has(placeType)) {
        setActiveFilters(prev => {
          const newFilters = new Set(prev);
          newFilters.add(placeType);
          return newFilters;
        });
      }
    };

    // From ListsPanel & Activity Log (has placeType in event detail)
    const handleNavigateAndOpenPopup = (e: CustomEvent) => {
      const { placeType } = e.detail;
      if (placeType) enableFilterForType(placeType);
    };

    // From Activity Log fallback & comments (has placeId, extract type from prefix)
    const handleOpenPoiPopup = (e: CustomEvent) => {
      const { placeId } = e.detail;
      if (placeId) {
        const placeType = placeId.split('-')[0];
        enableFilterForType(placeType);
      }
    };

    window.addEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
    window.addEventListener('open-poi-popup', handleOpenPoiPopup as EventListener);
    return () => {
      window.removeEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
      window.removeEventListener('open-poi-popup', handleOpenPoiPopup as EventListener);
    };
  }, [activeFilters]);

  // Listen for create-trip-from-property events from CreateTripButton
  useEffect(() => {
    const handleCreateTripFromProperty = (e: CustomEvent) => {
      const { trip } = e.detail;
      if (trip) {
        setSelectedTrip(trip);
        setIsScoutingFormOpen(true);
      }
    };

    window.addEventListener('create-trip-from-property', handleCreateTripFromProperty as EventListener);
    return () => {
      window.removeEventListener('create-trip-from-property', handleCreateTripFromProperty as EventListener);
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-zinc-100">
      {/* Linking mode banner */}
      <LinkingBanner />

      {/* Map Layer */}
      <div className="absolute inset-0 z-0">
        <EnhancedMapContainer
          activeFilters={activeFilters}
          ratingFilter={ratingFilter}
          scoreFilter={scoreFilter}
          euctFilter={euctFilter}
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
          showHiddenPois={showHiddenPois}
          gravityEnabled={gravityEnabled}
          propertyPostedFilter={propertyPostedFilter}
          propertyTransferFilter={propertyTransferFilter}
          propertyPriceChangeFilter={propertyPriceChangeFilter}
          demoMode={demoMode}
        />
      </div>

      {/* UI Overlays - hide when in linking mode */}
      {!isLinking && (
        <>
          <div className="fixed left-6 z-50 flex items-center gap-2" style={{ top: "calc(24px + env(safe-area-inset-top, 0px))" }}>
            <CitySelector
              selectedCity={selectedCity}
              onCityChange={(city) => {
                setSelectedCity(city);
                if (user) {
                  void saveDefaultCity(user, city.id);
                }
                const cityOverlays = CITY_OVERLAYS[city.id] ?? DEFAULT_OVERLAYS;
                if (!cityOverlays.traffic) { setTrafficEnabled(false); setTrafficValuesEnabled(false); }
                if (!cityOverlays.population) { setPopulationEnabled(false); setPopulationDensityFilter(0); }
                if (!cityOverlays.income) { setIncomeEnabled(false); setIncomeWealthyFilter(0); }
                if (!cityOverlays.locationScore) { setGravityEnabled(false); }
              }}
            />
            <LocationSearch
              cafes={cafes}
              properties={properties}
              otherPois={otherPois}
              selectedCity={selectedCity}
            />
          </div>
          <Sidebar
            cityId={selectedCity.id}
            counts={counts}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            ratingFilter={ratingFilter}
            onRatingChange={setRatingFilter}
            scoreFilter={scoreFilter}
            onScoreChange={setScoreFilter}
            euctFilter={euctFilter}
            onEuctFilterChange={setEuctFilter}
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
            showHiddenPois={showHiddenPois}
            onShowHiddenPoisToggle={setShowHiddenPois}
            gravityEnabled={gravityEnabled}
            onGravityToggle={setGravityEnabled}
            propertyPostedFilter={propertyPostedFilter}
            onPropertyPostedFilterChange={setPropertyPostedFilter}
            propertyTransferFilter={propertyTransferFilter}
            onPropertyTransferFilterChange={setPropertyTransferFilter}
            propertyPriceChangeFilter={propertyPriceChangeFilter}
            onPropertyPriceChangeFilterChange={setPropertyPriceChangeFilter}
          />
          <ActivityLog />
          <ListsPanel
            cityId={selectedCity.id}
            onCreateTripFromList={(trip) => {
              setSelectedTrip(trip);
              setIsScoutingFormOpen(true);
            }}
          />
          <ScoutingPanel
            cityId={selectedCity.id}
            onCreateNew={() => setIsScoutingFormOpen(true)}
            onUpload={() => setIsScoutingUploadOpen(true)}
            onSelectTrip={(trip) => {
              setSelectedTripId(trip.id);
              setIsScoutingDetailOpen(true);
            }}
          />
          <FootfallTimePicker
            trafficEnabled={trafficEnabled}
            trafficHour={trafficHour}
            onTrafficHourChange={setTrafficHour}
          />
          <MobileBottomNav onFeedbackOpen={() => feedbackOpenRef.current?.()} />
          <FeedbackButton selectedCity={selectedCity} user={user} onExposeOpen={handleExposeOpen} />
          <ProfileMenu />
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

      {/* Landing Page Overlay */}
      <LandingPage
        isVisible={showLanding && authChecked}
        authError={authError}
      />

      {/* City Picker - shown to new users after sign-in */}
      <CityPicker
        isVisible={showCityPicker}
        user={user}
        onComplete={(city) => {
          setSelectedCity(city);
          setShowCityPicker(false);
        }}
      />
    </main>
  );
}

// Main component with providers
export default function Home() {
  return (
    <AuthProvider>
      <WalkingRadiusProvider>
        <GeoDataProvider>
          <PointCategoriesProvider>
            <ListsProvider>
              <HiddenPoisProvider>
                <ScoutingTripsProvider>
                  <LinkingProvider>
                    <SheetProvider>
                      <ToastProvider>
                        <ShapeDataProvider>
                          <HomeContent />
                        </ShapeDataProvider>
                      </ToastProvider>
                    </SheetProvider>
                  </LinkingProvider>
                </ScoutingTripsProvider>
              </HiddenPoisProvider>
            </ListsProvider>
          </PointCategoriesProvider>
        </GeoDataProvider>
      </WalkingRadiusProvider>
    </AuthProvider>
  );
}
