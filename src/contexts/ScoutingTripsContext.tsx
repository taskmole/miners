"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  ScoutingTrip,
  ScoutingTripsState,
  ScoutingTripStatus,
  LinkedItem,
  ScoutingPhoto,
  UploadedDocument,
} from '@/types/scouting';
import {
  SCOUTING_TRIPS_STORAGE_KEY,
  SCOUTING_TRIPS_VERSION,
  generateTripId,
  createEmptyTrip,
} from '@/types/scouting';

/**
 * Get initial state from localStorage
 */
function getInitialState(): ScoutingTripsState {
  if (typeof window === 'undefined') {
    return { version: SCOUTING_TRIPS_VERSION, trips: [] };
  }

  try {
    const saved = localStorage.getItem(SCOUTING_TRIPS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ScoutingTripsState;
      return {
        version: parsed.version || SCOUTING_TRIPS_VERSION,
        trips: parsed.trips || [],
      };
    }
  } catch (error) {
    console.error('Error loading scouting trips from localStorage:', error);
  }

  return { version: SCOUTING_TRIPS_VERSION, trips: [] };
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
  // Linked items
  addLinkedItem: (tripId: string, item: LinkedItem) => void;
  removeLinkedItem: (tripId: string, itemId: string) => void;
  // Photos
  addPhoto: (tripId: string, photo: ScoutingPhoto) => void;
  removePhoto: (tripId: string, photoId: string) => void;
}

const ScoutingTripsContext = createContext<ScoutingTripsContextValue | undefined>(undefined);

export function ScoutingTripsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ScoutingTripsState>({ version: SCOUTING_TRIPS_VERSION, trips: [] });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const initialState = getInitialState();
    setState(initialState);
    setIsLoaded(true);
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

    return newTrip;
  }, []);

  // Update a trip
  const updateTrip = useCallback((tripId: string, updates: Partial<ScoutingTrip>): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? { ...t, ...updates, updatedAt: new Date().toISOString() }
          : t
      ),
    }));
  }, []);

  // Delete a trip
  const deleteTrip = useCallback((tripId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.filter(t => t.id !== tripId),
    }));
  }, []);

  // Submit a trip for review
  const submitTrip = useCallback((tripId: string): void => {
    const now = new Date().toISOString();
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? { ...t, status: 'submitted' as ScoutingTripStatus, submittedAt: now, updatedAt: now }
          : t
      ),
    }));
  }, []);

  // Approve a trip (admin action)
  const approveTrip = useCallback((tripId: string, reviewerName: string = 'Admin'): void => {
    const now = new Date().toISOString();
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              status: 'approved' as ScoutingTripStatus,
              reviewedAt: now,
              reviewedBy: reviewerName,
              updatedAt: now,
            }
          : t
      ),
    }));
  }, []);

  // Reject a trip (admin action)
  const rejectTrip = useCallback((tripId: string, rejectionNotes: string, reviewerName: string = 'Admin'): void => {
    const now = new Date().toISOString();
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
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
      ),
    }));
  }, []);

  // ===== LINKED ITEMS MANAGEMENT =====

  // Add a linked item to a trip
  const addLinkedItem = useCallback((tripId: string, item: LinkedItem): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              linkedItems: [...t.linkedItems, item],
              // Auto-fill address from first linked POI if not set
              address: t.address || (item.type === 'place' && item.address ? item.address : t.address),
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
    }));
  }, []);

  // Remove a linked item from a trip
  const removeLinkedItem = useCallback((tripId: string, itemId: string): void => {
    setState(prev => ({
      ...prev,
      trips: prev.trips.map(t =>
        t.id === tripId
          ? {
              ...t,
              linkedItems: t.linkedItems.filter(i => i.id !== itemId),
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
        addLinkedItem,
        removeLinkedItem,
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
