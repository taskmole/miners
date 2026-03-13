"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  ScoutingTrip,
  ScoutingTripsState,
  ScoutingTripStatus,
  LinkedItem,
  ScoutingPhoto,
  UploadedDocument,
  ChecklistItem,
} from '@/types/scouting';
import type { Attachment } from '@/types/attachments';
import {
  SCOUTING_TRIPS_STORAGE_KEY,
  SCOUTING_TRIPS_VERSION,
  generateTripId,
  createEmptyTrip,
  migrateTrip,
} from '@/types/scouting';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAnonymousUserId, withSupabase } from '@/lib/supabaseHelpers';

/**
 * Get initial state from localStorage with migration for old trips
 */
function getInitialState(): ScoutingTripsState {
  if (typeof window === 'undefined') {
    return { version: SCOUTING_TRIPS_VERSION, trips: [] };
  }

  try {
    const saved = localStorage.getItem(SCOUTING_TRIPS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ScoutingTripsState;
      // Migrate all trips to new format (property + relatedPlaces + checklist + attachments)
      const migratedTrips = (parsed.trips || []).map(migrateTrip);
      return {
        version: SCOUTING_TRIPS_VERSION,
        trips: migratedTrips,
      };
    }
  } catch (error) {
    console.error('Error loading scouting trips from localStorage:', error);
  }

  return { version: SCOUTING_TRIPS_VERSION, trips: [] };
}

/**
 * Fetch trip metadata from Supabase
 */
async function fetchTripsFromSupabase(): Promise<Partial<ScoutingTrip>[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const userId = getAnonymousUserId();

  const { data, error } = await supabase
    .from('pitches')
    .select('id, city_id, status, address, condition_notes, created_at')
    .eq('created_by', userId);

  if (error) {
    console.error('Error fetching pitches from Supabase:', error);
    return [];
  }

  return data?.map((row) => ({
    id: row.id,
    cityId: row.city_id || 'madrid',
    status: row.status as ScoutingTripStatus,
    address: row.address || '',
    notes: row.condition_notes || '',
    createdAt: row.created_at,
  })) || [];
}

/**
 * Sync trip create to Supabase
 */
async function syncCreateToSupabase(trip: ScoutingTrip): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getAnonymousUserId();

  try {
    await supabase.from('pitches').upsert({
      id: trip.id,
      city_id: trip.cityId,
      created_by: userId,
      status: trip.status,
      address: trip.address || trip.property?.address,
      condition_notes: trip.notes,
      created_at: trip.createdAt,
    }, { onConflict: 'id' });
  } catch (error) {
    console.error('Error syncing trip to Supabase:', error);
  }
}

/**
 * Sync trip update to Supabase
 */
async function syncUpdateToSupabase(trip: ScoutingTrip): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('pitches')
      .update({
        status: trip.status,
        address: trip.address || trip.property?.address,
        condition_notes: trip.notes,
      })
      .eq('id', trip.id);
  } catch (error) {
    console.error('Error updating trip in Supabase:', error);
  }
}

/**
 * Sync trip delete to Supabase
 */
async function syncDeleteToSupabase(tripId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('pitches')
      .delete()
      .eq('id', tripId);
  } catch (error) {
    console.error('Error deleting trip from Supabase:', error);
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
  createTrip: (cityId: string, authorName?: string) => ScoutingTrip;
  createUploadTrip: (cityId: string, name: string, document: UploadedDocument, authorName?: string) => ScoutingTrip;
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
}

const ScoutingTripsContext = createContext<ScoutingTripsContextValue | undefined>(undefined);

export function ScoutingTripsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScoutingTripsState>({ version: SCOUTING_TRIPS_VERSION, trips: [] });
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load from Supabase + localStorage on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadTrips() {
      // Start with localStorage (has full data)
      const localState = getInitialState();
      const localTrips = localState.trips;

      // Fetch trip metadata from Supabase
      const supabaseTrips = await withSupabase(
        () => fetchTripsFromSupabase(),
        [],
        'fetch trips'
      );

      // Merge: localStorage has full data, Supabase has metadata
      const localTripIds = new Set(localTrips.map(t => t.id));

      // Trips that exist in Supabase but not localStorage (create stubs)
      const supabaseOnlyTrips: ScoutingTrip[] = supabaseTrips
        .filter(st => !localTripIds.has(st.id!))
        .map(st => ({
          ...createEmptyTrip(st.cityId || 'madrid', 'Guest'),
          id: st.id!,
          status: st.status || 'draft',
          address: st.address || '',
          notes: st.notes || '',
          createdAt: st.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

      const mergedTrips = [...localTrips, ...supabaseOnlyTrips];

      setState({
        version: SCOUTING_TRIPS_VERSION,
        trips: mergedTrips,
      });
      setIsLoaded(true);

      // Save merged state back to localStorage
      try {
        localStorage.setItem(SCOUTING_TRIPS_STORAGE_KEY, JSON.stringify({
          version: SCOUTING_TRIPS_VERSION,
          trips: mergedTrips,
        }));
      } catch (error) {
        console.error('Error saving merged trips to localStorage:', error);
      }
    }

    loadTrips();
  }, []);

  // Save to localStorage whenever state changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(SCOUTING_TRIPS_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving scouting trips to localStorage:', error);
    }
  }, [state, isLoaded]);

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
  const createTrip = useCallback((cityId: string, authorName: string = 'Guest'): ScoutingTrip => {
    const now = new Date().toISOString();
    const newTrip: ScoutingTrip = {
      ...createEmptyTrip(cityId, authorName),
      id: generateTripId(),
      createdAt: now,
      updatedAt: now,
    };

    setState(prev => ({
      ...prev,
      trips: [newTrip, ...prev.trips],
    }));

    // Sync to Supabase in background
    syncCreateToSupabase(newTrip);

    return newTrip;
  }, []);

  // Create a trip from uploaded document
  const createUploadTrip = useCallback((
    cityId: string,
    name: string,
    document: UploadedDocument,
    authorName: string = 'Guest'
  ): ScoutingTrip => {
    const now = new Date().toISOString();
    const newTrip: ScoutingTrip = {
      ...createEmptyTrip(cityId, authorName),
      id: generateTripId(),
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

    // Sync to Supabase in background
    syncCreateToSupabase(newTrip);

    return newTrip;
  }, []);

  // Update a trip
  const updateTrip = useCallback((tripId: string, updates: Partial<ScoutingTrip>): void => {
    setState(prev => {
      const newTrips = prev.trips.map(t =>
        t.id === tripId
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      );

      // Find updated trip and sync to Supabase
      const updatedTrip = newTrips.find(t => t.id === tripId);
      if (updatedTrip) {
        syncUpdateToSupabase(updatedTrip);
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

    // Sync to Supabase in background
    syncDeleteToSupabase(tripId);
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
        syncUpdateToSupabase(updatedTrip);
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
        syncUpdateToSupabase(updatedTrip);
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
        syncUpdateToSupabase(updatedTrip);
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
