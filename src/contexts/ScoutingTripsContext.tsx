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
  generateTripId,
  createEmptyTrip,
  createDefaultChecklist,
} from '@/types/scouting';
import { apiFetch } from '@/lib/api-client';
import { getCurrentUserId } from '@/lib/browser-session';
import { computeTripAssessment } from '@/lib/trip-scoring';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fetch ALL trip data from the server API route.
 */
async function fetchTripsFromApi(): Promise<ScoutingTrip[]> {
  try {
    const data = await apiFetch<Array<Record<string, unknown>>>('/api/db/pitches?mode=user');

    // Map every snake_case column back to the camelCase ScoutingTrip shape.
    return (data || []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      cityId: (row.city_id as string) || 'madrid',
      createdBy: (row.created_by as string) || '',
      authorName: (row.author_name as string) || 'Scout',
      tripType: ((row.trip_type as string) || 'form') as ScoutingTripType,
      status: (row.status as ScoutingTripStatus) || 'draft',
      name: (row.trip_name as string) || '',

      // Structured JSONB fields
      property: (row.property as LinkedItem | null) ?? null,
      relatedPlaces: (row.related_places as LinkedItem[]) ?? [],
      checklist: (row.checklist as ChecklistItem[]) ?? createDefaultChecklist(),
      attachments: [] as Attachment[], // Attachments are stored by path, not inline
      uploadedDocument: (row.uploaded_document as UploadedDocument | undefined) ?? undefined,

      // Location
      address: (row.address as string) || '',
      areaSqm: (row.area_sqm as number) ?? undefined,
      storageSqm: (row.storage_sqm as number) ?? undefined,
      propertyType: (row.property_type as string) ?? undefined,
      footfallEstimate: (row.footfall_estimate as number) ?? undefined,
      neighbourhoodProfile: (row.neighbourhood_profile as string) ?? undefined,
      nearbyCompetitors: (row.nearby_competitors as string) ?? undefined,

      // Financial
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

      // Operational
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

      // Other
      risks: Array.isArray(row.risks) && (row.risks as string[]).length > 0
        ? (row.risks as string[])[0]
        : (row.risks as string) ?? undefined,
      photos: [] as ScoutingPhoto[],

      // Review / rejection
      rejectionNotes: (row.rejection_notes as string) ?? undefined,
      reviewedBy: (row.reviewed_by as string) ?? undefined,
      reviewedAt: (row.final_reviewed_at as string) ?? undefined,
      submittedAt: (row.submitted_at as string) ?? undefined,

      // Timestamps
      createdAt: (row.created_at as string) || new Date().toISOString(),
      updatedAt: (row.created_at as string) || new Date().toISOString(),
    } as ScoutingTrip));
  } catch (error) {
    console.error('Error fetching pitches from API:', error);
    return [];
  }
}

/**
 * Build the snake_case row object for upsert (create or update).
 */
function buildPitchRow(trip: ScoutingTrip) {
  return {
    // Identity
    id: trip.id,
    city_id: trip.cityId,
    created_by: trip.createdBy,
    created_at: trip.createdAt,

    // Status
    status: trip.status,
    submitted_at: trip.submittedAt,

    // Basic info
    trip_name: trip.name,
    trip_type: trip.tripType || 'form',
    author_name: trip.authorName,
    address: trip.address || trip.property?.address,
    condition_notes: trip.notes,

    // Structured JSONB fields
    property: trip.property ?? null,
    related_places: trip.relatedPlaces ?? [],
    uploaded_document: trip.uploadedDocument ?? null,

    // Location fields
    area_sqm: trip.areaSqm,
    storage_sqm: trip.storageSqm,
    property_type: trip.propertyType,
    footfall_estimate: trip.footfallEstimate,
    neighbourhood_profile: trip.neighbourhoodProfile,
    nearby_competitors: trip.nearbyCompetitors,

    // Financial fields
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

    // Operational fields
    ventilation: trip.ventilation,
    water_waste: trip.waterWaste,
    power_capacity: trip.powerCapacity,
    visibility: trip.visibility,
    delivery_access: trip.deliveryAccess,
    seating_capacity: trip.seatingCapacity,
    outdoor_seating: trip.outdoorSeating,
    flat_surface: trip.flatSurface,

    // Other
    risks: trip.risks ? [trip.risks] : null,
    checklist: trip.checklist,
    attachment_paths: trip.attachments?.map(a => a.storagePath).filter(Boolean) || [],

    // Review info
    rejection_notes: trip.rejectionNotes,
    reviewed_by: trip.reviewedBy,
    final_reviewed_at: trip.reviewedAt,
  };
}

/**
 * Sync trip create/update to the server API (fire-and-forget).
 */
async function syncTripToApi(trip: ScoutingTrip): Promise<void> {
  try {
    await apiFetch('/api/db/pitches', {
      method: 'POST',
      body: JSON.stringify(buildPitchRow(trip)),
    });
  } catch (error) {
    console.error('Error syncing trip to API:', error);
  }
}

/**
 * Sync trip delete to the server API (fire-and-forget).
 */
async function syncDeleteToApi(tripId: string): Promise<void> {
  try {
    await apiFetch(`/api/db/pitches?id=${encodeURIComponent(tripId)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Error deleting trip from API:', error);
  }
}

// Context value type
interface ScoutingTripsContextValue {
  isLoaded: boolean;
  // Read operations
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
  // Create operations
  createTrip: (cityId: string) => ScoutingTrip;
  createUploadTrip: (cityId: string, name: string, document: UploadedDocument) => ScoutingTrip;
  // Current user display name (for callers that need it, e.g. attachment uploads)
  currentAuthorName: string;
  // Update operations
  updateTrip: (tripId: string, updates: Partial<ScoutingTrip>) => void;
  submitTrip: (tripId: string) => void;
  approveTrip: (tripId: string, reviewerName?: string) => void;
  rejectTrip: (tripId: string, rejectionNotes: string, reviewerName?: string) => void;
  // Delete operations
  deleteTrip: (tripId: string) => void;
  // Property & Related Places (new structure)
  setProperty: (tripId: string, property: LinkedItem) => void;
  addRelatedPlace: (tripId: string, item: LinkedItem) => void;
  removeRelatedPlace: (tripId: string, itemId: string) => void;
  // Legacy linked items (for backwards compatibility during transition)
  addLinkedItem: (tripId: string, item: LinkedItem) => void;
  removeLinkedItem: (tripId: string, itemId: string) => void;
  // Checklist
  updateChecklist: (tripId: string, checklist: ChecklistItem[]) => void;
  // Attachments
  addAttachment: (tripId: string, attachment: Attachment) => void;
  removeAttachment: (tripId: string, attachmentId: string) => void;
  // Photos (legacy)
  addPhoto: (tripId: string, photo: ScoutingPhoto) => void;
  removePhoto: (tripId: string, photoId: string) => void;
  // Trip assessment scoring
  getTripAssessment: (tripId: string) => TripAssessment | undefined;
}

const ScoutingTripsContext = createContext<ScoutingTripsContextValue | undefined>(undefined);

export function ScoutingTripsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScoutingTripsState>({ version: SCOUTING_TRIPS_VERSION, trips: [] });
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const [tripAssessments, setTripAssessments] = useState<Map<string, TripAssessment>>(new Map());

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

  // Load from API on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadTrips() {
      const apiTrips = await fetchTripsFromApi();

      setState({
        version: SCOUTING_TRIPS_VERSION,
        trips: apiTrips,
      });
      recomputeAssessments(apiTrips);
      setIsLoaded(true);
    }

    loadTrips();
  }, []);

  // Get all trips for a city
  const getTrips = useCallback((cityId?: string): ScoutingTrip[] => {
    if (!cityId) return state.trips;
    return state.trips.filter(t => t.cityId === cityId);
  }, [state.trips]);

  // Get a single trip by ID
  const getTrip = useCallback((tripId: string): ScoutingTrip | undefined => {
    return state.trips.find(t => t.id === tripId);
  }, [state.trips]);

  // Get trips by status
  const getTripsByStatus = useCallback((status: ScoutingTripStatus, cityId?: string): ScoutingTrip[] => {
    return state.trips.filter(t => t.status === status && (!cityId || t.cityId === cityId));
  }, [state.trips]);

  // Create a new trip (returns the created trip)
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

    syncTripToApi(newTrip);

    return newTrip;
  }, [resolvedUserId, resolvedAuthorName]);

  // Create a trip from uploaded document
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

    syncTripToApi(newTrip);

    return newTrip;
  }, [resolvedUserId, resolvedAuthorName]);

  // Update a trip
  const updateTrip = useCallback((tripId: string, updates: Partial<ScoutingTrip>): void => {
    setState(prev => {
      const newTrips = prev.trips.map(t =>
        t.id === tripId
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      );

      // Find updated trip and sync to API
      const updatedTrip = newTrips.find(t => t.id === tripId);
      if (updatedTrip) {
        syncTripToApi(updatedTrip);
        setTripAssessments(prev => {
          const next = new Map(prev);
          next.set(tripId, computeTripAssessment(updatedTrip));
          return next;
        });
      }

      return { ...prev, trips: newTrips };
    });
  }, []);

  // Delete a trip
  const deleteTrip = useCallback((tripId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.filter(t => t.id !== tripId),
    }));

    // Sync to API in background
    syncDeleteToApi(tripId);
  }, []);

  // Submit a trip for review
  const submitTrip = useCallback((tripId: string): void => {
    const now = new Date().toISOString();
    setState(prev => {
      const newTrips = prev.trips.map(t =>
        t.id === tripId
          ? { ...t, status: 'submitted' as ScoutingTripStatus, submittedAt: now, updatedAt: now }
          : t
      );

      const updatedTrip = newTrips.find(t => t.id === tripId);
      if (updatedTrip) {
        syncTripToApi(updatedTrip);
      }

      return { ...prev, trips: newTrips };
    });
  }, []);

  // Approve a trip (admin action)
  const approveTrip = useCallback((tripId: string, reviewerName: string = 'Admin'): void => {
    const now = new Date().toISOString();
    setState(prev => {
      const newTrips = prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              status: 'approved' as ScoutingTripStatus,
              reviewedAt: now,
              reviewedBy: reviewerName,
              updatedAt: now,
            }
          : t
      );

      const updatedTrip = newTrips.find(t => t.id === tripId);
      if (updatedTrip) {
        syncTripToApi(updatedTrip);
      }

      return { ...prev, trips: newTrips };
    });
  }, []);

  // Reject a trip (admin action)
  const rejectTrip = useCallback((tripId: string, rejectionNotes: string, reviewerName: string = 'Admin'): void => {
    const now = new Date().toISOString();
    setState(prev => {
      const newTrips = prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              status: 'rejected' as ScoutingTripStatus,
              rejectionNotes,
              reviewedAt: now,
              reviewedBy: reviewerName,
              updatedAt: now,
            }
          : t
      );

      const updatedTrip = newTrips.find(t => t.id === tripId);
      if (updatedTrip) {
        syncTripToApi(updatedTrip);
      }

      return { ...prev, trips: newTrips };
    });
  }, []);

  // ===== PROPERTY & RELATED PLACES MANAGEMENT =====

  // Set the main property for a trip
  const setProperty = useCallback((tripId: string, property: LinkedItem): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              property,
              // Auto-fill address from property if not set
              address: t.address || property.address,
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // Add a related place to a trip
  const addRelatedPlace = useCallback((tripId: string, item: LinkedItem): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              relatedPlaces: [...t.relatedPlaces, item],
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // Remove a related place from a trip
  const removeRelatedPlace = useCallback((tripId: string, itemId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              relatedPlaces: t.relatedPlaces.filter(i => i.id !== itemId),
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // Legacy: Add a linked item (now adds to relatedPlaces for backwards compatibility)
  const addLinkedItem = useCallback((tripId: string, item: LinkedItem): void => {
    addRelatedPlace(tripId, item);
  }, [addRelatedPlace]);

  // Legacy: Remove a linked item (now removes from relatedPlaces)
  const removeLinkedItem = useCallback((tripId: string, itemId: string): void => {
    removeRelatedPlace(tripId, itemId);
  }, [removeRelatedPlace]);

  // ===== CHECKLIST MANAGEMENT =====

  // Update the entire checklist for a trip
  const updateChecklist = useCallback((tripId: string, checklist: ChecklistItem[]): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              checklist,
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // ===== ATTACHMENT MANAGEMENT =====

  // Add an attachment to a trip
  const addAttachment = useCallback((tripId: string, attachment: Attachment): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              attachments: [...t.attachments, attachment],
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // Remove an attachment from a trip
  const removeAttachment = useCallback((tripId: string, attachmentId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              attachments: t.attachments.filter(a => a.id !== attachmentId),
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // ===== PHOTO MANAGEMENT =====

  // Add a photo to a trip
  const addPhoto = useCallback((tripId: string, photo: ScoutingPhoto): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              photos: [...t.photos, photo],
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // Remove a photo from a trip
  const removePhoto = useCallback((tripId: string, photoId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              photos: t.photos.filter(p => p.id !== photoId),
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // ===== STATISTICS =====

  // Get count of trips by status
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
