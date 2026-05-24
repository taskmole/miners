"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  ScoutingTrip,
  ScoutingTripsState,
  ScoutingTripStatus,
  ScoutingTripType,
  LinkedItem,
  ScoutingPhoto,
  UploadedDocument,
  ChecklistItem,
  TripAssessment,
} from '@/types/scouting';
import type { Attachment } from '@/types/attachments';
import {
  SCOUTING_TRIPS_VERSION,
  SCOUTING_TRIPS_STORAGE_KEY,
  generateTripId,
  createEmptyTrip,
  createDefaultChecklist,
} from '@/types/scouting';
import { apiFetch } from '@/lib/api-client';
import { getSignedUrl } from '@/lib/attachment-storage';
import { getCurrentUserId, getAuthUserId } from '@/lib/browser-session';
import { computeTripAssessment } from '@/lib/trip-scoring';
import { useAuth } from '@/contexts/AuthContext';
import { logActivity } from '@/lib/supabaseHelpers';
import {
  enqueue,
  hasPendingUpsert,
  hasPendingDelete,
  initSyncQueue,
  startDraining,
} from '@/lib/trip-sync';

type TripUpdater = (current: ScoutingTrip) => Partial<ScoutingTrip>;

const POLL_INTERVAL = 60_000;

// --- localStorage persistence ---

function persistTripsToLocalStorage(trips: ScoutingTrip[]): void {
  try {
    // Filter out team trips (server-only) and strip attachment binary data (keep metadata)
    const toStore = trips
      .filter(t => !t.teamId)
      .map(t => ({
        ...t,
        attachments: t.attachments
          .filter(a => a.storagePath)
          .map(a => ({ ...a, data: '', thumbnailData: undefined, signedUrl: undefined })),
      }));
    const state: ScoutingTripsState = { version: SCOUTING_TRIPS_VERSION, trips: toStore };
    localStorage.setItem(SCOUTING_TRIPS_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving trips to localStorage:', error);
  }
}

function getInitialTripsFromLocalStorage(): ScoutingTrip[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SCOUTING_TRIPS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ScoutingTripsState;
      return parsed.trips || [];
    }
  } catch (error) {
    console.error('Error loading trips from localStorage:', error);
  }
  return [];
}

// --- Server fetch (returns { ok, trips } so errors don't wipe state) ---

async function fetchTripsFromApi(): Promise<{ ok: boolean; trips: ScoutingTrip[] }> {
  try {
    const data = await apiFetch<Array<Record<string, unknown>>>('/api/db/pitches?mode=user');

    const trips = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      cityId: (row.city_id as string) || 'madrid',
      createdBy: (row.created_by as string) || '',
      authorName: (row.author_name as string) || 'Scout',
      tripType: ((row.trip_type as string) || 'form') as ScoutingTripType,
      status: (row.status as ScoutingTripStatus) || 'draft',
      name: (row.trip_name as string) || '',

      property: (row.property as LinkedItem | null) ?? null,
      relatedPlaces: (row.related_places as LinkedItem[]) ?? [],
      checklist: (row.checklist as ChecklistItem[]) ?? createDefaultChecklist(),
      attachments: ((row.attachment_paths as string[]) || []).map((path: string) => ({
        id: path.split('/').pop()?.replace(/\.[^/.]+$/, '') || crypto.randomUUID(),
        name: path.split('/').pop() || 'attachment',
        type: '',
        data: '',
        storagePath: path,
        size: 0,
        addedAt: '',
        uploadedByName: '',
      } as Attachment)),
      uploadedDocument: (row.uploaded_document as UploadedDocument | undefined) ?? undefined,

      address: (row.address as string) || '',
      areaSqm: (row.area_sqm as number) ?? undefined,
      storageSqm: (row.storage_sqm as number) ?? undefined,
      propertyType: (row.property_type as string) ?? undefined,
      footfallEstimate: (row.footfall_estimate as number) ?? undefined,
      neighbourhoodProfile: (row.neighbourhood_profile as string) ?? undefined,
      nearbyCompetitors: (row.nearby_competitors as string) ?? undefined,

      monthlyRent: (row.monthly_rent as number) ?? undefined,
      serviceFees: (row.service_fees as number) ?? undefined,
      deposit: (row.deposit as number) ?? undefined,
      transferFee: (row.transfer_fee as number) ?? undefined,
      fitoutCost: (row.fitout_cost as number) ?? undefined,
      openingInvestment: (row.opening_investment as number) ?? undefined,
      expectedDailyRevenue: (row.expected_daily_revenue as number) ?? undefined,
      monthlyRevenueRange: (row.monthly_revenue_range as string) ?? undefined,
      paybackMonths: (row.payback_months as number) ?? undefined,
      currencyCode: (row.currency_code as string) ?? undefined,

      ventilation: (row.ventilation as string) ?? undefined,
      waterWaste: (row.water_waste as string) ?? undefined,
      powerCapacity: (row.power_capacity as string) ?? undefined,
      visibility: (row.visibility as string) ?? undefined,
      deliveryAccess: (row.delivery_access as string) ?? undefined,
      seatingCapacity: (row.seating_capacity as number) ?? undefined,
      outdoorSeating: typeof row.outdoor_seating === 'boolean'
        ? (row.outdoor_seating ? 'street' : undefined)
        : (row.outdoor_seating as string) ?? undefined,
      flatSurface: (row.flat_surface as boolean) ?? undefined,

      risks: Array.isArray(row.risks) && (row.risks as string[]).length > 0
        ? (row.risks as string[])[0]
        : (row.risks as string) ?? undefined,
      photos: [] as ScoutingPhoto[],

      teamId: (row.team_id as string) ?? undefined,

      rejectionNotes: (row.rejection_notes as string) ?? undefined,
      reviewedBy: (row.reviewed_by as string) ?? undefined,
      reviewedAt: (row.final_reviewed_at as string) ?? undefined,
      submittedAt: (row.submitted_at as string) ?? undefined,

      createdAt: (row.created_at as string) || new Date().toISOString(),
      updatedAt: (row.updated_at as string) || (row.created_at as string) || new Date().toISOString(),
    } as ScoutingTrip));

    return { ok: true, trips };
  } catch (error) {
    console.error('Error fetching pitches from API:', error);
    return { ok: false, trips: [] };
  }
}

// --- Merge: server is source of truth, but preserve pending local operations ---

function mergeTrips(serverTrips: ScoutingTrip[], localTrips: ScoutingTrip[]): ScoutingTrip[] {
  const serverMap = new Map(serverTrips.map(t => [t.id, t]));
  const localMap = new Map(localTrips.map(t => [t.id, t]));
  const merged: ScoutingTrip[] = [];

  // Server trips: skip if pending delete, use local version if pending upsert
  for (const serverTrip of serverTrips) {
    if (hasPendingDelete(serverTrip.id)) continue;

    if (hasPendingUpsert(serverTrip.id) && localMap.has(serverTrip.id)) {
      merged.push(localMap.get(serverTrip.id)!);
    } else {
      merged.push(serverTrip);
    }
  }

  // Local-only trips: keep if they have a pending upsert (created offline)
  for (const localTrip of localTrips) {
    if (!serverMap.has(localTrip.id) && hasPendingUpsert(localTrip.id)) {
      merged.push(localTrip);
    }
  }

  return merged;
}

/**
 * Build the snake_case row object for upsert (create or update).
 */
function buildPitchRow(trip: ScoutingTrip) {
  return {
    id: trip.id,
    city_id: trip.cityId,
    created_by: trip.createdBy,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,

    status: trip.status,
    submitted_at: trip.submittedAt,

    trip_name: trip.name,
    trip_type: trip.tripType || 'form',
    author_name: trip.authorName,
    address: trip.address || trip.property?.address,
    condition_notes: undefined,

    property: trip.property ?? null,
    related_places: trip.relatedPlaces ?? [],
    uploaded_document: trip.uploadedDocument ?? null,

    area_sqm: trip.areaSqm,
    storage_sqm: trip.storageSqm,
    property_type: trip.propertyType,
    footfall_estimate: trip.footfallEstimate,
    neighbourhood_profile: trip.neighbourhoodProfile,
    nearby_competitors: trip.nearbyCompetitors,

    monthly_rent: trip.monthlyRent,
    service_fees: trip.serviceFees,
    deposit: trip.deposit,
    transfer_fee: trip.transferFee,
    fitout_cost: trip.fitoutCost,
    opening_investment: trip.openingInvestment,
    expected_daily_revenue: trip.expectedDailyRevenue,
    monthly_revenue_range: trip.monthlyRevenueRange,
    payback_months: trip.paybackMonths,
    currency_code: trip.currencyCode,

    ventilation: trip.ventilation,
    water_waste: trip.waterWaste,
    power_capacity: trip.powerCapacity,
    visibility: trip.visibility,
    delivery_access: trip.deliveryAccess,
    seating_capacity: trip.seatingCapacity,
    outdoor_seating: trip.outdoorSeating,
    flat_surface: trip.flatSurface,

    risks: trip.risks ? [trip.risks] : null,
    checklist: trip.checklist,
    attachment_paths: trip.attachments?.map(a => a.storagePath).filter(Boolean) || [],

    team_id: trip.teamId ?? null,

    rejection_notes: trip.rejectionNotes,
    reviewed_by: trip.reviewedBy,
    final_reviewed_at: trip.reviewedAt,
  };
}

// --- Context ---

/**
 * Shared mutation helper: find trip, apply updates, setState, enqueue upsert, recompute assessment.
 * Eliminates the repeated 4-step pattern across all mutation functions.
 */
function applyTripUpdate(
  tripId: string,
  tripsRef: React.MutableRefObject<ScoutingTrip[]>,
  setState: React.Dispatch<React.SetStateAction<ScoutingTripsState>>,
  setTripAssessments: React.Dispatch<React.SetStateAction<Map<string, TripAssessment>>>,
  updater: TripUpdater,
): ScoutingTrip | undefined {
  const current = tripsRef.current.find(t => t.id === tripId);
  if (!current) return undefined;

  const updates = updater(current);
  const updatedTrip = { ...current, ...updates, updatedAt: new Date().toISOString() };

  tripsRef.current = tripsRef.current.map(t => t.id === tripId ? updatedTrip : t);

  setState(prev => ({
    ...prev,
    trips: prev.trips.map(t => t.id === tripId ? updatedTrip : t),
  }));

  enqueue({
    type: 'upsert_trip',
    tripId,
    payload: buildPitchRow(updatedTrip),
  });

  setTripAssessments(prev => {
    const next = new Map(prev);
    next.set(tripId, computeTripAssessment(updatedTrip));
    return next;
  });

  return updatedTrip;
}

interface ScoutingTripsContextValue {
  isLoaded: boolean;
  getTrips: (cityId?: string) => ScoutingTrip[];
  getTrip: (tripId: string) => ScoutingTrip | undefined;
  getTripsByStatus: (status: ScoutingTripStatus, cityId?: string) => ScoutingTrip[];
  getTripCounts: (cityId?: string) => {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
  createTrip: (cityId: string) => ScoutingTrip;
  createUploadTrip: (cityId: string, name: string, document: UploadedDocument) => ScoutingTrip;
  currentAuthorName: string;
  updateTrip: (tripId: string, updates: Partial<ScoutingTrip>) => void;
  submitTrip: (tripId: string) => void;
  approveTrip: (tripId: string, reviewerName?: string) => void;
  rejectTrip: (tripId: string, rejectionNotes: string, reviewerName?: string) => void;
  deleteTrip: (tripId: string) => void;
  setProperty: (tripId: string, property: LinkedItem) => void;
  addRelatedPlace: (tripId: string, item: LinkedItem) => void;
  removeRelatedPlace: (tripId: string, itemId: string) => void;
  addLinkedItem: (tripId: string, item: LinkedItem) => void;
  removeLinkedItem: (tripId: string, itemId: string) => void;
  updateChecklist: (tripId: string, checklist: ChecklistItem[]) => void;
  addAttachment: (tripId: string, attachment: Attachment) => void;
  removeAttachment: (tripId: string, attachmentId: string) => void;
  addPhoto: (tripId: string, photo: ScoutingPhoto) => void;
  removePhoto: (tripId: string, photoId: string) => void;
  getTripAssessment: (tripId: string) => TripAssessment | undefined;
}

const ScoutingTripsContext = createContext<ScoutingTripsContextValue | undefined>(undefined);

export function ScoutingTripsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScoutingTripsState>({ version: SCOUTING_TRIPS_VERSION, trips: [] });
  const [isLoaded, setIsLoaded] = useState(false);
  const [tripAssessments, setTripAssessments] = useState<Map<string, TripAssessment>>(new Map());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref to current trips so mutations read fresh state (avoids React 18 batching bugs)
  const tripsRef = useRef(state.trips);
  tripsRef.current = state.trips;

  const { userId: authUserId } = useAuth();
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null);

  useEffect(() => {
    if (!authUserId) return;
    apiFetch<{ role: string; display_name: string | null }>('/api/db/user-profiles?mode=current')
      .then(data => {
        if (data?.display_name) setCurrentDisplayName(data.display_name);
      })
      .catch(() => {});
  }, [authUserId]);

  const resolvedUserId = useMemo(
    () => authUserId || (typeof window !== 'undefined' ? getCurrentUserId() : ''),
    [authUserId]
  );
  const resolvedAuthorName = currentDisplayName || 'Scout';

  function recomputeAssessments(trips: ScoutingTrip[]) {
    const map = new Map<string, TripAssessment>();
    for (const trip of trips) {
      map.set(trip.id, computeTripAssessment(trip));
    }
    setTripAssessments(map);
  }

  // --- Initial load: localStorage first (instant UI), then server fetch + merge ---
  // Uses cancelled flag (not ref guard) so React 19 Strict Mode double-mount works correctly.
  // A ref guard persists across unmount/remount but state resets, leaving isLoaded=false forever.
  useEffect(() => {
    let cancelled = false;

    initSyncQueue();

    async function loadTrips() {
      const localTrips = getInitialTripsFromLocalStorage();

      if (!cancelled && localTrips.length > 0) {
        setState({ version: SCOUTING_TRIPS_VERSION, trips: localTrips });
        recomputeAssessments(localTrips);
      }
      if (!cancelled) setIsLoaded(true);

      if (!getAuthUserId()) {
        startDraining();
        return;
      }

      const result = await fetchTripsFromApi();
      if (cancelled) return;
      if (!result.ok) {
        startDraining();
        return;
      }

      const merged = mergeTrips(result.trips, localTrips);
      setState({ version: SCOUTING_TRIPS_VERSION, trips: merged });
      persistTripsToLocalStorage(merged);
      recomputeAssessments(merged);

      // Resolve signed URLs for cloud-stored attachments (only trips that need it)
      const needsUrls = merged.filter(
        t => t.attachments.some(a => a.storagePath && !a.signedUrl)
      );
      if (needsUrls.length > 0) {
        const resolvedMap = new Map<string, ScoutingTrip>();
        await Promise.all(
          needsUrls.map(async (trip) => {
            const resolvedAttachments = await Promise.all(
              trip.attachments.map(async (a) => {
                if (a.storagePath && !a.signedUrl) {
                  const url = await getSignedUrl(a.storagePath);
                  return { ...a, signedUrl: url || undefined };
                }
                return a;
              })
            );
            resolvedMap.set(trip.id, { ...trip, attachments: resolvedAttachments });
          })
        );
        if (!cancelled) {
          const final = merged.map(t => resolvedMap.get(t.id) || t);
          setState({ version: SCOUTING_TRIPS_VERSION, trips: final });
        }
      }

      startDraining();
    }

    loadTrips();
    return () => { cancelled = true; };
  }, []);

  // Persist to localStorage on every state change
  useEffect(() => {
    if (!isLoaded) return;
    persistTripsToLocalStorage(state.trips);
  }, [state.trips, isLoaded]);

  // Polling: refetch server state every 60s
  useEffect(() => {
    if (!isLoaded) return;
    if (!getAuthUserId()) return;

    pollRef.current = setInterval(async () => {
      const result = await fetchTripsFromApi();
      if (!result.ok) return;

      const merged = mergeTrips(result.trips, tripsRef.current);
      setState(prev => ({ ...prev, trips: merged }));
      recomputeAssessments(merged);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLoaded]);

  // --- Read operations ---

  const getTrips = useCallback((cityId?: string): ScoutingTrip[] => {
    if (!cityId) return state.trips;
    return state.trips.filter(t => t.cityId === cityId);
  }, [state.trips]);

  const getTrip = useCallback((tripId: string): ScoutingTrip | undefined => {
    return state.trips.find(t => t.id === tripId);
  }, [state.trips]);

  const getTripsByStatus = useCallback((status: ScoutingTripStatus, cityId?: string): ScoutingTrip[] => {
    return state.trips.filter(t => t.status === status && (!cityId || t.cityId === cityId));
  }, [state.trips]);

  const getTripCounts = useCallback((cityId?: string) => {
    const trips = cityId ? state.trips.filter(t => t.cityId === cityId) : state.trips;
    return {
      total: trips.length,
      draft: trips.filter(t => t.status === 'draft').length,
      submitted: trips.filter(t => t.status === 'submitted').length,
      approved: trips.filter(t => t.status === 'approved').length,
      rejected: trips.filter(t => t.status === 'rejected').length,
    };
  }, [state.trips]);

  // --- Activity logging helper ---

  const logTripActivity = (actionType: string, trip: ScoutingTrip) => {
    logActivity(actionType, {
      tripId: trip.id,
      tripName: trip.name || "Untitled trip",
      trip_owner_id: trip.createdBy,
      authorName: trip.authorName || null,
    });
  };

  // --- Create operations ---

  const createTrip = useCallback((cityId: string): ScoutingTrip => {
    const now = new Date().toISOString();
    const newTrip: ScoutingTrip = {
      ...createEmptyTrip(cityId, resolvedAuthorName),
      id: generateTripId(),
      createdBy: resolvedUserId,
      createdAt: now,
      updatedAt: now,
    };

    setState(prev => ({
      ...prev,
      trips: [newTrip, ...prev.trips],
    }));

    tripsRef.current = [newTrip, ...tripsRef.current];

    enqueue({
      type: 'upsert_trip',
      tripId: newTrip.id,
      payload: buildPitchRow(newTrip),
    });
    logTripActivity("created_scouting_trip", newTrip);

    return newTrip;
  }, [resolvedUserId, resolvedAuthorName]);

  const createUploadTrip = useCallback((
    cityId: string,
    name: string,
    document: UploadedDocument,
  ): ScoutingTrip => {
    const now = new Date().toISOString();
    const newTrip: ScoutingTrip = {
      ...createEmptyTrip(cityId, resolvedAuthorName),
      id: generateTripId(),
      createdBy: resolvedUserId,
      tripType: 'upload',
      name,
      uploadedDocument: document,
      createdAt: now,
      updatedAt: now,
    };

    setState(prev => ({
      ...prev,
      trips: [newTrip, ...prev.trips],
    }));

    tripsRef.current = [newTrip, ...tripsRef.current];

    enqueue({
      type: 'upsert_trip',
      tripId: newTrip.id,
      payload: buildPitchRow(newTrip),
    });

    return newTrip;
  }, [resolvedUserId, resolvedAuthorName]);

  // --- Mutation helper (binds refs for all mutation callbacks below) ---

  const mutateTrip = useCallback((tripId: string, updater: TripUpdater): ScoutingTrip | undefined => {
    return applyTripUpdate(tripId, tripsRef, setState, setTripAssessments, updater);
  }, []);

  // --- Update operations ---

  const updateTrip = useCallback((tripId: string, updates: Partial<ScoutingTrip>): void => {
    mutateTrip(tripId, () => updates);
  }, [mutateTrip]);

  const deleteTrip = useCallback((tripId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.filter(t => t.id !== tripId),
    }));

    enqueue({
      type: 'delete_trip',
      tripId,
      payload: { tripId },
    });
  }, []);

  const submitTrip = useCallback((tripId: string): void => {
    const updated = mutateTrip(tripId, () => ({
      status: 'submitted' as ScoutingTripStatus,
      submittedAt: new Date().toISOString(),
    }));
    if (updated) logTripActivity("submitted_scouting_trip", updated);
  }, [mutateTrip]);

  const approveTrip = useCallback((tripId: string, reviewerName: string = 'Admin'): void => {
    mutateTrip(tripId, () => ({
      status: 'approved' as ScoutingTripStatus,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerName,
    }));
  }, [mutateTrip]);

  const rejectTrip = useCallback((tripId: string, rejectionNotes: string, reviewerName: string = 'Admin'): void => {
    mutateTrip(tripId, () => ({
      status: 'rejected' as ScoutingTripStatus,
      rejectionNotes,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerName,
    }));
  }, [mutateTrip]);

  // ===== PROPERTY & RELATED PLACES =====

  const setProperty = useCallback((tripId: string, property: LinkedItem): void => {
    mutateTrip(tripId, (current) => ({
      property,
      address: current.address || property.address,
    }));
  }, [mutateTrip]);

  const addRelatedPlace = useCallback((tripId: string, item: LinkedItem): void => {
    mutateTrip(tripId, (current) => ({
      relatedPlaces: [...current.relatedPlaces, item],
    }));
  }, [mutateTrip]);

  const removeRelatedPlace = useCallback((tripId: string, itemId: string): void => {
    mutateTrip(tripId, (current) => ({
      relatedPlaces: current.relatedPlaces.filter(i => i.id !== itemId),
    }));
  }, [mutateTrip]);

  const addLinkedItem = useCallback((tripId: string, item: LinkedItem): void => {
    addRelatedPlace(tripId, item);
  }, [addRelatedPlace]);

  const removeLinkedItem = useCallback((tripId: string, itemId: string): void => {
    removeRelatedPlace(tripId, itemId);
  }, [removeRelatedPlace]);

  // ===== CHECKLIST =====

  const updateChecklist = useCallback((tripId: string, checklist: ChecklistItem[]): void => {
    mutateTrip(tripId, () => ({ checklist }));
  }, [mutateTrip]);

  // ===== ATTACHMENTS =====

  const addAttachment = useCallback((tripId: string, attachment: Attachment): void => {
    mutateTrip(tripId, (current) => ({
      attachments: [...current.attachments, attachment],
    }));
  }, [mutateTrip]);

  const removeAttachment = useCallback((tripId: string, attachmentId: string): void => {
    mutateTrip(tripId, (current) => ({
      attachments: current.attachments.filter(a => a.id !== attachmentId),
    }));
  }, [mutateTrip]);

  // ===== PHOTOS =====

  const addPhoto = useCallback((tripId: string, photo: ScoutingPhoto): void => {
    mutateTrip(tripId, (current) => ({
      photos: [...current.photos, photo],
    }));
  }, [mutateTrip]);

  const removePhoto = useCallback((tripId: string, photoId: string): void => {
    mutateTrip(tripId, (current) => ({
      photos: current.photos.filter(p => p.id !== photoId),
    }));
  }, [mutateTrip]);

  return (
    <ScoutingTripsContext.Provider
      value={{
        isLoaded,
        currentAuthorName: resolvedAuthorName,
        getTrips,
        getTrip,
        getTripsByStatus,
        getTripCounts,
        createTrip,
        createUploadTrip,
        updateTrip,
        submitTrip,
        approveTrip,
        rejectTrip,
        deleteTrip,
        setProperty,
        addRelatedPlace,
        removeRelatedPlace,
        addLinkedItem,
        removeLinkedItem,
        updateChecklist,
        addAttachment,
        removeAttachment,
        addPhoto,
        removePhoto,
        getTripAssessment: (tripId: string) => tripAssessments.get(tripId),
      }}
    >
      {children}
    </ScoutingTripsContext.Provider>
  );
}

export function useScoutingTripsContext() {
  const context = useContext(ScoutingTripsContext);
  if (!context) {
    throw new Error('useScoutingTripsContext must be used within a ScoutingTripsProvider');
  }
  return context;
}
