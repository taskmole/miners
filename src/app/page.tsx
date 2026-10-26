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
import { MapToolRail } from "@/components/MapToolRail";
import { FootfallTimePicker } from "@/components/FootfallTimePicker";
import { FeedbackButton } from "@/components/FeedbackButton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { NewListingsModal, INBOX_READS_SAVED } from "@/components/NewListingsModal";
import { WhatsNewPopup } from "@/components/WhatsNewPopup";
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
import { useWhatsNew } from "@/hooks/useWhatsNew";
import { parseCoordinatesFromPlaceId } from "@/lib/place-id";
import { cityForCoordinates } from "@/lib/notify-routing";
import { clearPendingFocus, pendingPlaceCity, readPendingFocus, savePendingFocus } from "@/lib/share";
import { GO_TO_PLACE_EVENT, type PendingFocus, type PlaceRequest } from "@/lib/go-to-place";
import { ListsProvider } from "@/contexts/ListsContext";
import { HiddenPoisProvider } from "@/contexts/HiddenPoisContext";
import { GeoDataProvider } from "@/contexts/GeoDataContext";
import { LinkingProvider, useLinking } from "@/contexts/LinkingContext";
import { ScoutingTripsProvider } from "@/contexts/ScoutingTripsContext";
import { PointCategoriesProvider } from "@/contexts/PointCategoriesContext";
import { SheetProvider, useSheet } from "@/contexts/SheetContext";
import { WalkingRadiusProvider } from "@/contexts/WalkingRadiusContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cityById } from "@/lib/cities";
import { ShapeDataProvider } from "@/contexts/ShapeDataContext";
import { PitchStatusProvider } from "@/contexts/PitchStatusContext";
import { PropertyAssignmentProvider } from "@/contexts/PropertyAssignmentContext";
import { TeamsProvider } from "@/contexts/TeamsContext";
import { LinkingBanner } from "@/components/LinkingBanner";
import { supabase, signOut } from "@/lib/supabase";
import { apiFetch } from "@/lib/api-client";
import { setAuthUserId } from "@/lib/browser-session";
import { migrateAnonymousData } from "@/lib/supabaseHelpers";
import type { Session, User } from "@supabase/supabase-js";
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

  // No map data is requested until we know which city to load. That is a few
  // milliseconds after the stored session is read, so a Prague user no longer
  // downloads Madrid first and then waits for two account checks to switch.
  const [mapCityReady, setMapCityReady] = useState(false);
  const { cafes, properties, otherPois, counts } = useMapData(mapCityReady ? selectedCity.id : null);

  const { startLinking, isLinking } = useLinking();

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
  const { visibleCities, accessResolved, canApproveIn, canContributeIn } = useUserProfiles();
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
   * retry loop. A shared link can also open the app in its place's city
   * before we know they hold it; then they land on their own saved city, with
   * the "no access" message over it.
   */
  useEffect(() => {
    if (grantedCities.length === 0) return;
    if (grantedCities.some(c => c.id === selectedCity.id)) return;
    const savedId = user && hasStoredDefaultCity(user) ? getStoredDefaultCity(user).id : null;
    const fallback = grantedCities.find(c => c.active && c.id === savedId)
      ?? grantedCities.find(c => c.active)
      ?? grantedCities[0];
    setSelectedCity(fallback);
  }, [grantedCities, selectedCity.id, user]);

  const [authError, setAuthError] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Account active status - null means not yet checked, or checked and failed
  const [isActive, setIsActive] = useState<boolean | null>(null);
  // The check itself failed, twice. Told apart from "switched off" on purpose.
  const [activeCheckFailed, setActiveCheckFailed] = useState(false);

  // New listings modal
  const [isNewListingsOpen, setIsNewListingsOpen] = useState(false);
  const [activityUnreadCount, setActivityUnreadCount] = useState(0);

  // Reopen listings modal when user closes a POI popup after navigating from listings
  useEffect(() => {
    const handleReopen = () => setIsNewListingsOpen(true);
    window.addEventListener("reopen-new-listings", handleReopen);
    return () => window.removeEventListener("reopen-new-listings", handleReopen);
  }, []);
  // The new-listings count with the city it was counted for. Read through
  // newListingsCount below, which is 0 until the selected city's own count
  // has loaded, so a city switch never shows the old city's number.
  const [listingsCount, setListingsCount] = useState<{ cityId: string; count: number } | null>(null);

  // Landing page state - shows on first load (unless already logged in)
  const [showLanding, setShowLanding] = useState(true);

  // Onboarding city picker - shown to new users after Google sign-in
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Shared links (/s/<code> forwards to /?focus=<placeId>).
  const savedCityAppliedFor = useRef<string | null>(null);
  const [savedCityApplied, setSavedCityApplied] = useState(false);
  // Parked until we know who this is; then handed to the map as pendingFocus.
  const [parkedFocus, setParkedFocus] = useState<PlaceRequest | null>(null);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
  const [noAccessCity, setNoAccessCity] = useState<City | null>(null);
  const { showToast } = useToast();

  // "What's new" popup. Held back for anyone who arrived through an email or
  // share link: they came for one thing, so a popup on top would be noise.
  const { unseen: whatsNewUnseen, hasUnread: whatsNewUnread, markSeen: markWhatsNewSeen } = useWhatsNew(user);
  const [arrivedViaLink] = useState(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("focus") || params.has("listings") || readPendingFocus() !== null;
  });
  // Opening the profile menu (same corner) puts it away for this visit,
  // without counting as seen.
  const [whatsNewSnoozed, setWhatsNewSnoozed] = useState(false);
  const dismissWhatsNew = useCallback(() => markWhatsNewSeen(), [markWhatsNewSeen]);
  // Phone sheets (filters, lists, a tapped place...) own the screen: wait.
  const { activeSheet } = useSheet();

  // Counts only once the user's own city is set (and picked, for a new user).
  // Counting the Madrid fallback first would light NEW up for Madrid's
  // listings on a city that might have none.
  useEffect(() => {
    if (!user || !savedCityApplied || showCityPicker) return;
    let cancelled = false;
    const cityId = selectedCity.id;
    async function fetchCount() {
      try {
        const data = await apiFetch<{ count: number }>(`/api/db/inbox?city_id=${cityId}&mode=count`);
        if (cancelled) return;
        const count = data?.count || 0;
        // Same object when unchanged, so the minute re-check does not re-render the map.
        setListingsCount(prev => prev?.cityId === cityId && prev.count === count ? prev : { cityId, count });
      } catch { /* a failed count keeps the last one; never reads as 0 */ }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    // The listings popup saves its last "seen" ticks as it closes. Recount
    // once they land, or the red dot can linger until the next minute.
    window.addEventListener(INBOX_READS_SAVED, fetchCount);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(INBOX_READS_SAVED, fetchCount);
    };
  }, [user, savedCityApplied, showCityPicker, selectedCity.id, isNewListingsOpen]);

  const newListingsCount = listingsCount?.cityId === selectedCity.id ? listingsCount.count : 0;

  // The glow on Activity and NEW: on while anything is unread (until "Mark
  // all read", or until every listing in the latest batch is read), off
  // while its own panel or window is open. The listings count is the unread
  // ones and drops as they are read (recounted as the window closes).
  const activityGlow = activeSheet !== "activity" && activityUnreadCount > 0;
  const newGlow = !isNewListingsOpen && newListingsCount > 0;

  // Park a shared link's destination before anything else runs on mount. The
  // Google sign-in round trip comes back to a bare "/", and the auth-error
  // handler below wipes the query string, so the URL cannot be relied on.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get("focus");
    if (focusId) {
      savePendingFocus(focusId);
      params.delete("focus");
      params.delete("city"); // older email links carried it; the place id decides now
      const rest = params.toString();
      window.history.replaceState({}, "", rest ? `?${rest}` : window.location.pathname);
    }
    const linked = readPendingFocus();
    if (linked) setParkedFocus({ placeId: linked });
  }, []);

  /**
   * Is this account switched on?
   *
   * This used to swallow any failure and set active = true, which meant a
   * switched-off account stayed switched on for anyone whose request happened
   * to fail. That hole is closed in the database now (20260911000010), so this
   * check no longer has to be aggressive: it exists to explain, not to enforce.
   *
   * One retry first, because the common failure here is a token being refreshed
   * mid-flight. Only if that fails too does the screen say so, and it says the
   * check failed, NOT that the account is pending. A single network blip must
   * not tell a legitimate person their account is awaiting approval with no way
   * out of the screen.
   */
  const checkUserActive = useCallback(async (): Promise<boolean> => {
    const read = async () => {
      const data = await apiFetch<{ role: string; is_active: boolean }>(
        '/api/db/user-profiles?mode=current',
      );
      return data?.is_active ?? true;
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const active = await read();
        setActiveCheckFailed(false);
        setIsActive(active);
        return active;
      } catch {
        // fall through to the retry, then to the failure state
      }
    }

    setActiveCheckFailed(true);
    setIsActive(null);
    // The database decides what they can actually reach. Returning true here
    // only means "do not slam a door we are not sure about".
    return true;
  }, []);

  // Check for auth session on mount and listen for changes
  useEffect(() => {
    if (!supabase) {
      setMapCityReady(true);
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
    // Not while a shared place in a live city is waiting: it opens in that
    // city (set below, or by focusPlace), and the saved city would only be
    // downloaded to be left again seconds later.
    //
    // Once per person, not on every SIGNED_IN: Supabase can fire that event
    // again seconds later (tab refocus), which used to be harmless but would
    // now yank someone back out of the city a shared link just opened.
    const applyCityForUser = (u: User) => {
      if (savedCityAppliedFor.current === u.id) return;
      savedCityAppliedFor.current = u.id;
      if (shouldShowOnboardingPicker(u)) {
        setShowCityPicker(true);
      } else if (hasStoredDefaultCity(u) && !pendingPlaceCity()) {
        setSelectedCity(getStoredDefaultCity(u));
      }
      setSavedCityApplied(true);
    };

    // All auth work runs one step at a time on this chain (see the listener
    // below for why). The first load goes on it too, so a sign-out from
    // another tab can never be undone by a slower first load finishing late.
    let authWork = Promise.resolve();
    const enqueue = (label: string, work: () => Promise<void>) => {
      authWork = authWork
        .then(work)
        .catch((err) => console.error('[auth] handling', label, 'failed:', err));
    };
    // Set once a sign-out has been handled: the first load must not then
    // bring back the session it read before it.
    let signedOutSince = false;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      enqueue('initial session', async () => {
        if (session?.user && !signedOutSince) {
          // Start the right city's data now instead of after the two account
          // checks below: a waiting shared place's city (its id says where it
          // is), else the saved city from the stored session (the city half of
          // applyCityForUser, which repeats it later as a no-op).
          const firstCity = pendingPlaceCity()
            ?? (hasStoredDefaultCity(session.user) ? getStoredDefaultCity(session.user) : null);
          if (firstCity) setSelectedCity(firstCity);
          setMapCityReady(true);
          await migrateAnonymousData(session.user.id);
          setUser(session.user);
          setAuthUserId(session.user.id);
          await checkUserActive();
          setShowLanding(false);
          applyCityForUser(session.user);
        }
        setMapCityReady(true);
        setAuthChecked(true);
      });
    });

    // Listen for auth changes.
    //
    // Supabase runs this inside its auth lock, shared by every open tab, and
    // fires SIGNED_IN whenever a tab comes back into view. Awaiting a Supabase
    // call in here waits on that same lock forever, leaving every later tab on
    // "Loading map data". So the work runs on the next tick, after the lock,
    // one event at a time: a sign-out must never finish before an earlier
    // sign-in that is still busy, or the stale sign-in would win.
    const handleAuthEvent = async (event: string, session: Session | null) => {
      const sessionUser = session?.user ?? null;
      const signedIn = event === 'SIGNED_IN' && sessionUser;
      if (signedIn) await migrateAnonymousData(sessionUser.id);
      setUser(sessionUser);
      setAuthUserId(sessionUser?.id ?? null);
      if (signedIn) {
        await checkUserActive();
        setShowLanding(false);
        setAuthError(null);
        applyCityForUser(sessionUser);
      } else if (!sessionUser) {
        signedOutSince = true;
        setIsActive(null);
        // Signing back in later should apply their saved city again.
        savedCityAppliedFor.current = null;
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setTimeout(() => enqueue(event, () => handleAuthEvent(event, session)), 0);
    });

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

  // Auto-enable a POI category filter when the map opens a place's card
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

    // Fired by the map just before it opens a card (placeType in the detail)
    const handleNavigateAndOpenPopup = (e: CustomEvent) => {
      const { placeType } = e.detail;
      if (placeType) enableFilterForType(placeType);
    };

    window.addEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
    return () => window.removeEventListener('navigate-and-open-popup', handleNavigateAndOpenPopup as EventListener);
  }, [activeFilters]);

  /**
   * Switch the map to another city, turning off overlays it has no data for.
   *
   * The picker saves the choice as the person's default. A shared link does
   * not: following a link to Prague should not quietly change where the app
   * opens tomorrow.
   */
  const switchCity = useCallback((city: City, { saveAsDefault }: { saveAsDefault: boolean }) => {
    setSelectedCity(city);
    if (saveAsDefault && user) {
      void saveDefaultCity(user, city.id);
    }
    const cityOverlays = CITY_OVERLAYS[city.id] ?? DEFAULT_OVERLAYS;
    if (!cityOverlays.traffic) { setTrafficEnabled(false); setTrafficValuesEnabled(false); }
    if (!cityOverlays.population) { setPopulationEnabled(false); setPopulationDensityFilter(0); }
    if (!cityOverlays.income) { setIncomeEnabled(false); setIncomeWealthyFilter(0); }
    if (!cityOverlays.locationScore) { setGravityEnabled(false); }
  }, [user]);

  // The map found the place (or not) and is done with it.
  const handlePendingFocusDone = useCallback((found: boolean) => {
    setPendingFocus(null);
    if (!found) showToast("This place is no longer on the map", "error");
  }, [showToast]);

  /**
   * Take the map to a place (shared link, or a click in Activity / Lists /
   * Scouting): find its city, explain if they have no access to it, switch
   * to it without making it their default, and hand it to the map.
   */
  const focusPlace = useCallback((request: PlaceRequest) => {
    // "No cities at all" already has its own full-screen explanation.
    if (grantedCities.length === 0) return;

    const spot = (request.placeId && parseCoordinatesFromPlaceId(request.placeId))
      || (request.lat != null && request.lon != null ? { lat: request.lat, lon: request.lon } : null);
    const city = cityById(spot && cityForCoordinates(spot.lat, spot.lon));
    if (!spot || !city) {
      handlePendingFocusDone(false);
      return;
    }
    if (!grantedCities.some(c => c.id === city.id)) {
      setNoAccessCity(city);
      return;
    }
    if (city.id !== selectedCity.id) switchCity(city, { saveAsDefault: false });
    setPendingFocus({ ...request, ...spot, cityId: city.id });
  }, [grantedCities, selectedCity.id, switchCity, handlePendingFocusDone]);

  /**
   * Act on a parked shared link or click once we know who this is and what they hold.
   * Waits for: signed in, account active, city access loaded, saved city
   * applied, and the first-time city picker out of the way.
   */
  useEffect(() => {
    if (!parkedFocus) return;
    if (!user || isActive !== true || !accessResolved || !savedCityApplied || showCityPicker) return;
    setParkedFocus(null);
    clearPendingFocus();
    focusPlace(parkedFocus);
  }, [parkedFocus, user, isActive, accessResolved, savedCityApplied, showCityPicker, focusPlace]);

  // In-app "go to this place" clicks (Activity, Lists, Scouting). Parked like a
  // shared link, so a click before city access has loaded waits for it.
  useEffect(() => {
    const handleGoToPlace = (e: Event) => setParkedFocus((e as CustomEvent<PlaceRequest>).detail);
    window.addEventListener(GO_TO_PLACE_EVENT, handleGoToPlace);
    return () => window.removeEventListener(GO_TO_PLACE_EVENT, handleGoToPlace);
  }, []);

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

  // Only once they are fully in and nothing else is asking for attention.
  const whatsNewCanShow =
    isActive === true && !showLanding && savedCityApplied && !showCityPicker &&
    !hasNoCities && !isNewListingsOpen && !arrivedViaLink && !whatsNewSnoozed &&
    !parkedFocus && !pendingFocus && !noAccessCity &&
    !isScoutingFormOpen && !isScoutingUploadOpen && !isScoutingDetailOpen && !activeSheet;

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
          selectedCity={selectedCity}
          cityReady={mapCityReady}
          isLinkingMode={isLinking}
          showHiddenPois={showHiddenPois}
          gravityEnabled={gravityEnabled}
          propertyPostedFilter={propertyPostedFilter}
          propertyTransferFilter={propertyTransferFilter}
          propertyPriceChangeFilter={propertyPriceChangeFilter}
          propertyPitchStatusFilter={propertyPitchStatusFilter}
          demoMode={demoMode}
          pendingFocus={pendingFocus}
          onPendingFocusDone={handlePendingFocusDone}
        />
      </div>

      {/* UI Overlays - hide when in linking mode */}
      {!isLinking && (
        <>
          {/* City and search: one tray, like the tool bar. */}
          <div className="mt-tray fixed left-4 sm:left-6 z-50 flex items-center gap-0.5 sm:gap-1.5" style={{ top: "calc(24px + env(safe-area-inset-top, 0px))" }}>
            <CitySelector
              selectedCity={selectedCity}
              available={grantedCities}
              onCityChange={(city) => switchCity(city, { saveAsDefault: true })}
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
          <ActivityLog
            onUnreadCountChange={setActivityUnreadCount}
            onOpenTrip={(tripId) => {
              setSelectedTripId(tripId);
              setIsScoutingDetailOpen(true);
            }}
          />
          <ListsPanel
            cityId={selectedCity.id}
            onCreateTripFromList={(trip) => {
              setSelectedTrip(trip);
              setIsScoutingFormOpen(true);
            }}
          />
          <ScoutingPanel
            cityId={selectedCity.id}
            /* Gated on accessResolved too, so the switch appears once rather
               than flickering in after the permission lookup lands. */
            canSeeAll={accessResolved && canApproveIn(selectedCity.id)}
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
          {/* Map tools bar and NEW button - desktop only */}
          <MapToolRail
            activityGlow={activityGlow}
            activityCount={activityUnreadCount}
            newGlow={newGlow}
            newCount={newListingsCount}
            onNewListingsOpen={() => setIsNewListingsOpen(true)}
            isNewListingsOpen={isNewListingsOpen}
          />
          <NewListingsModal
            isOpen={isNewListingsOpen}
            onClose={() => setIsNewListingsOpen(false)}
            cityId={selectedCity.id}
          />
          <MobileBottomNav
            onNewListingsOpen={() => setIsNewListingsOpen(true)}
            activityGlow={activityGlow}
            activityCount={activityUnreadCount}
            newGlow={newGlow}
            newCount={newListingsCount}
          />
          <FeedbackButton selectedCity={selectedCity} onExposeOpen={handleExposeOpen} />
          <ProfileMenu
            onFeedbackOpen={() => feedbackOpenRef.current?.()}
            onOpen={() => setWhatsNewSnoozed(true)}
            whatsNewUnread={whatsNewUnread}
          />
          <WhatsNewPopup
            entries={whatsNewUnseen}
            canShow={whatsNewCanShow}
            onDismiss={dismissWhatsNew}
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
          // View-only in the trip's city: no editing. Hidden until access loads.
          canEdit={(t) => canContributeIn(t.cityId)}
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

      {/* Could not check the account. Deliberately not the Account Pending
          screen: that one accuses somebody of not being approved, and a failed
          request is not evidence of that. */}
      {user && activeCheckFailed && (
        <div className="fixed inset-0 z-[175] bg-black flex flex-col items-center justify-center px-6">
          <div className="flex flex-col items-center gap-6 max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white">Could not check your account</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              We could not reach the server to see whether your account is active.
              Nothing has changed about your access.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { void checkUserActive(); }}
                className="px-6 py-3 bg-white text-zinc-800 rounded-lg hover:bg-zinc-100 transition-colors font-medium"
              >
                Try again
              </button>
              <button
                onClick={() => signOut()}
                className="px-6 py-3 text-zinc-400 hover:text-white transition-colors font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A shared link or a click pointed at a city this person cannot view */}
      <Dialog open={!!noAccessCity} onOpenChange={(open) => { if (!open) setNoAccessCity(null); }}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>You don&apos;t have access to {noAccessCity?.name} yet</DialogTitle>
            <DialogDescription>
              That place is in {noAccessCity?.name}. Ask your admin to add you to that city, then try again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNoAccessCity(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* City Picker - shown to new users after sign-in */}
      <CityPicker
        isVisible={showCityPicker && !hasNoCities}
        user={user}
        available={grantedCities}
        onComplete={(city) => {
          setSelectedCity(city);
          setShowCityPicker(false);
          // A brand-new account: nothing is "new" to them yet.
          markWhatsNewSeen(true);
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
