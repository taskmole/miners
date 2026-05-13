"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface CafeProfile {
  placeId: string;
  name: string;
  address: string;
  cityId: string;
  sourceId: string;
  latitude: number;
  longitude: number;
  profileId?: string;
  category?: 'to_go_mini' | 'core' | 'flagship';
  interiorSeats?: number;
  exteriorSeats?: number;
  areaSqm?: number;
  monthlyRevenue?: number;
  hasKitchen?: boolean;
  notes?: string;
  updatedAt?: string;
}

export type CafeCategory = 'to_go_mini' | 'core' | 'flagship';

export const CATEGORY_LABELS: Record<CafeCategory, string> = {
  to_go_mini: 'To-Go / Mini',
  core: 'Core',
  flagship: 'Flagship',
};

export function useCafeProfiles(autoFetch = false) {
  const [cafes, setCafes] = useState<CafeProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchAttempted = useRef(false);

  const fetchCafes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch<CafeProfile[]>('/api/db/cafe-profiles');
      setCafes(data || []);
    } catch (err: unknown) {
      console.error('[useCafeProfiles] Error:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('401') || msg.includes('auth')) {
        setError('Authentication error, please sign in again');
      } else {
        setError(`Failed to load cafe profiles: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Profiles keyed by place_id for quick lookup
  const profilesByPlaceId: Record<string, CafeProfile> = {};
  for (const cafe of cafes) {
    profilesByPlaceId[cafe.placeId] = cafe;
  }

  // Profiles keyed by cafe name (case-insensitive) for map popup matching
  const profilesByName: Record<string, CafeProfile> = {};
  for (const cafe of cafes) {
    profilesByName[cafe.name.toLowerCase()] = cafe;
  }

  const saveProfile = useCallback(async (data: {
    placeId: string;
    category: CafeCategory;
    interiorSeats?: number;
    exteriorSeats?: number;
    areaSqm?: number;
    monthlyRevenue?: number;
    hasKitchen?: boolean;
    notes?: string;
  }) => {
    const result = await apiFetch('/api/db/cafe-profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    await fetchCafes();
    return result;
  }, [fetchCafes]);

  const deleteProfile = useCallback(async (profileId: string) => {
    await apiFetch(`/api/db/cafe-profiles?id=${profileId}`, {
      method: 'DELETE',
    });
    await fetchCafes();
  }, [fetchCafes]);

  useEffect(() => {
    if (!autoFetch || fetchAttempted.current) return;
    fetchAttempted.current = true;
    fetchCafes();
  }, [autoFetch, fetchCafes]);

  return {
    cafes,
    profilesByPlaceId,
    profilesByName,
    loading,
    error,
    refetch: fetchCafes,
    saveProfile,
    deleteProfile,
  };
}
