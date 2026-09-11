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
import { NewListingsModal } from "@/components/NewListingsModal";
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
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { useMobile } from "@/hooks/useMobile";
import { generatePropertyPlaceId } from "@/lib/place-id";
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
import { PitchStatusProvider } from "@/contexts/PitchStatusContext";
import { PropertyAssignmentProvider } from "@/contexts/PropertyAssignmentContext";
import { TeamsProvider } from "@/contexts/TeamsContext";
import { LinkingBanner } from "@/components/LinkingBanner";
import { supabase, signOut } from "@/lib/supabase";
import { apiFetch } from "@/lib/api-client";
import { setAuthUserId } from "@/lib/browser-session";
import { migrateAnonymousData } from "@/lib/supabaseHelpers";
import type { User } from "@supabase/supabase-js";
import type { ScoutingTrip, LinkedItem } from "@/types/scouting";
import { usePathname } from "next/navigation";
import type { EuctFilter, PropertyPostedFilter, PropertyTransferFilter, PropertyPriceChangeFilter, PropertyPitchStatusFilter } from "@/types/filters";

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
  const isMobile = useMobile();

  // Auth state
  const [user, setUser] = useState<User | null>(null);

  /**
   * Which cities this person may actually open.
   *
   * Until the per-city permissions work, everybody could open everything, so
   * the picker simply listed every live city. Now the map data itself is
   * restricted, and offering a city somebody has no grant in produces a blank
   * map with no explanation, which reads as a broken product rather than as a
   * permission.
   *
   * Signed out, and while access is still resolving, the full list stands:
   * there is a landing page over the top at that point, and narrowing a list
   * we do not yet know the answer for would flicker.
   *
   * /demo is NOT exempt, even though it is a demo. It re-exports this same
   * page and sits behind the same landing page, so its visitors are signed-in
   * colleagues. Exempting it would offer cities whose data the database then
   * refuses to hand over, which is a blank map rather than a demo.
   */
  const { visibleCities, accessResolved } = useUserProfiles();
  const grantedCities = React.useMemo(() => {
    if (!user || !accessResolved) return cities;
    return cities.filter(c => visibleCities.includes(c.id));
  }, [user, accessResolved, visibleCities]);

  const hasNoCities = !!user && accessResolved && grantedCities.length === 0;

  /**
   * Keep the selected city inside what they hold.
   *
   * Two ways it can drift out. The saved default city lives in auth metadata
   * and survives being narrowed, so somebody moved out of Madrid would keep
   * asking for Madrid forever. And useMapData falls back to "madrid" for an
   * empty city id, which would request a city they cannot have and sit on a
   * retry loop.
   */
  useEffect(() => {
    if (grantedCities.length === 0) return;
    if (grantedCities.some(c => c.id === selectedCity.id)) return;
    const fallback = grantedCities.find(c => c.active) ?? grantedCities[0];
    setSelectedCity(fallback);
  }, [grantedCities, selectedCity.id]);

  const [authError, setAuthError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Account active status - null means not yet checked
  const [isActive, setIsActive] = useState<boolean | null>(null);

  // New listings modal
  const [isNewListingsOpen, setIsNewListingsOpen] = useState(false);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);

  // Reopen listings modal when user closes a POI popup after navigating from listings
  useEffect(() => {
    const handleReopen = () => setIsNewListingsOpen(true);
    window.addEventListener("reopen-new-listings", handleReopen);
    return () => window.removeEventListener("reopen-new-listings", handleReopen);
  }, []);
  const [newListingsCount, setNewListingsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function fetchCount() {
      try {
        const data = await apiFetch<{ count: number }>(`/api/db/inbox?city_id=${selectedCity.id}&mode=count`);
        if (!cancelled) setNewListingsCount(data?.count || 0);
      } catch { /* ignore */ }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, selectedCity.id, isNewListingsOpen]);

  // Landing page state - shows on first load (unless already logged in)
  const [showLanding, setShowLanding] = useState(true);

  // Onboarding city picker - shown to new users after Google sign-in
  const [showCityPicker, setShowCityPicker] = useState(false);

  const checkUserActive = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiFetch<{ role: string; is_active: boolean }>('/api/db/user-profiles?mode=current');
      const active = data?.is_active ?? true;
      setIsActive(active);
      return active;
    } catch {
      setIsActive(true);
      return true;
    }
  }, []);

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
        await migrateAnonymousData(session.user.id);
        setUser(session.user);
        setAuthUserId(session.user.id);
        await checkUserActive();
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
        if (event === 'SIGNED_IN' && session?.user) {
          await checkUserActive();
          setShowLanding(false);
          setAuthError(null);
          applyCityForUser(session.user);
        } else if (!session?.user) {
          setIsActive(null);
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
  const [propertyPitchStatusFilter, setPropertyPitchStatusFilter] = useState<PropertyPitchStatusFilter>("all");
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

  // Deep-link: open a property popup when navigating from /inbox with ?focus=placeId
  useEffect(() => {
    if (!properties.length) return;
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get("focus");
    if (!focusId) return;

    // Clean up URL immediately to prevent re-triggering
    params.delete("focus");
    params.delete("city");
    const clean = params.toString();
    window.history.replaceState({}, "", clean ? `?${clean}` : window.location.pathname);

    // Find matching property and navigate
    const match = properties.find(
      (p: any) => generatePropertyPlaceId(p) === focusId,
    );
    if (match) {
      // Ensure the property filter is active
      if (!activeFilters.has("property")) {
        setActiveFilters((prev) => {
          const next = new Set(prev);
          next.add("property");
          return next;
        });
      }
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("navigate-and-open-popup", {
            detail: {
              lat: (match as any).latitude,
              lon: (match as any).longitude,
              placeId: focusId,
              placeType: "property",
              data: match,
            },
          }),
        );
      }, 300);
    }
  }, [properties, activeFilters]);

  // Deep-link: open new listings modal from email CTA (?listings=open)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("listings") === "open") {
      params.delete("listings");
      const clean = params.toString();
      window.history.replaceState({}, "", clean ? `?${clean}` : window.location.pathname);
      setIsNewListingsOpen(true);
    }
  }, [user]);

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
          propertyPitchStatusFilter={propertyPitchStatusFilter}
          demoMode={demoMode}
        />
      </div>

      {/* UI Overlays - hide when in linking mode */}
      {!isLinking && (
        <>
          <div className="fixed left-6 z-50 flex items-center gap-2" style={{ top: "calc(24px + env(safe-area-inset-top, 0px))" }}>
            <CitySelector
              selectedCity={selectedCity}
              available={grantedCities}
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
            properties={properties}
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
            propertyPitchStatusFilter={propertyPitchStatusFilter}
            onPropertyPitchStatusFilterChange={setPropertyPitchStatusFilter}
          />
          <ActivityLog onUnreadCountChange={setActivityUnreadCount} />
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
          {/* New listings button - desktop only */}
          {!isMobile && (
            <button
              onClick={() => setIsNewListingsOpen(true)}
              className="w-9 h-9 rounded-lg items-center justify-center bg-zinc-900 hover:bg-zinc-800 active:scale-95 transition-all duration-200 relative"
              style={{ position: "fixed", top: "244px", right: "24px", zIndex: 30, display: "flex", boxShadow: "0 4px 20px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.15)" }}
              aria-label="New listings"
            >
              <span className="text-[10px] font-extrabold text-white tracking-tight leading-none">NEW</span>
              {newListingsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full" />
              )}
            </button>
          )}
          <NewListingsModal
            isOpen={isNewListingsOpen}
            onClose={() => setIsNewListingsOpen(false)}
            cityId={selectedCity.id}
          />
          <MobileBottomNav onNewListingsOpen={() => setIsNewListingsOpen(true)} newListingsCount={newListingsCount} activityCount={activityUnreadCount} />
          <FeedbackButton selectedCity={selectedCity} user={user} onExposeOpen={handleExposeOpen} />
          <ProfileMenu onFeedbackOpen={() => feedbackOpenRef.current?.()} />
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

      {/* Account Pending - shown to inactive users */}
      {user && isActive === false && (
        <div className="fixed inset-0 z-[175] bg-black flex flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-6 max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white">Account Pending</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Your account is waiting for approval. Contact your team lead if you need immediate access.
            </p>
            <button
              onClick={() => signOut()}
              className="px-6 py-3 bg-white text-zinc-800 rounded-lg hover:bg-zinc-100 transition-colors font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* City Picker - shown to new users after sign-in */}
      <CityPicker
        isVisible={showCityPicker && !hasNoCities}
        user={user}
        available={grantedCities}
        onComplete={(city) => {
          setSelectedCity(city);
          setShowCityPicker(false);
        }}
      />

      {/* Somebody with no cities at all: a freshly invited person who has not
          been let into one yet, or anyone narrowed to zero by mistake. They
          get a sentence rather than an empty map, because an empty map looks
          exactly like a broken one. */}
      {hasNoCities && (
        <div className="fixed inset-0 z-[60] bg-zinc-50 flex items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-bold text-zinc-900 mb-2">
              No cities assigned yet
            </h2>
            <p className="text-sm text-zinc-600">
              Your account is set up, but nobody has given you access to a city
              yet. Ask your manager to add one and then reload this page.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

// Main component with providers
export default function Home() {
  return (
    <WalkingRadiusProvider>
      <GeoDataProvider>
        <PointCategoriesProvider>
          <TeamsProvider>
          <ListsProvider>
            <HiddenPoisProvider>
              <ScoutingTripsProvider>
                <PitchStatusProvider>
                <PropertyAssignmentProvider>
                <LinkingProvider>
                  <SheetProvider>
                    <ToastProvider>
                      <ShapeDataProvider>
                        <HomeContent />
                      </ShapeDataProvider>
                    </ToastProvider>
                  </SheetProvider>
                </LinkingProvider>
                </PropertyAssignmentProvider>
                </PitchStatusProvider>
              </ScoutingTripsProvider>
            </HiddenPoisProvider>
          </ListsProvider>
          </TeamsProvider>
        </PointCategoriesProvider>
      </GeoDataProvider>
    </WalkingRadiusProvider>
  );
}
