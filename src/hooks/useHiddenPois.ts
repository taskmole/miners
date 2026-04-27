"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAnonymousUserId, withSupabase } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

// localStorage key for hidden POIs
const STORAGE_KEY = 'miners-hidden-pois';
const CURRENT_VERSION = 1;

// State structure for localStorage
interface HiddenPoisState {
  version: number;
  hiddenIds: string[];
}

// Get initial state from localStorage
function getInitialState(): HiddenPoisState {
  if (typeof window === 'undefined') {
    return { version: CURRENT_VERSION, hiddenIds: [] };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as HiddenPoisState;
      return {
        version: parsed.version || CURRENT_VERSION,
        hiddenIds: parsed.hiddenIds || [],
      };
    }
  } catch (error) {
    console.error('Error loading hidden POIs from localStorage:', error);
  }

  return { version: CURRENT_VERSION, hiddenIds: [] };
}

/**
 * Sync a hidden POI change to Supabase (background, non-blocking)
 */
async function syncToSupabase(placeId: string, isHidden: boolean): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getCurrentUserId();

  try {
    if (isHidden) {
      // Add to hidden_pois table
      await supabase.from('hidden_pois').upsert(
        { user_id: userId, place_id: placeId },
        { onConflict: 'user_id,place_id' }
      );
    } else {
      // Remove from hidden_pois table
      await supabase
        .from('hidden_pois')
        .delete()
        .eq('user_id', userId)
        .eq('place_id', placeId);
    }
  } catch (error) {
    console.error('Error syncing hidden POI to Supabase:', error);
  }
}

/**
 * Fetch hidden POIs from Supabase
 */
async function fetchFromSupabase(): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const currentId = getCurrentUserId();
  const anonId = getAnonymousUserId();

  const { data, error } = await supabase
    .from('hidden_pois')
    .select('place_id')
    .or(`user_id.eq.${currentId},user_id.eq.${anonId}`);

  if (error) {
    console.error('Error fetching hidden POIs from Supabase:', error);
    return [];
  }

  return data?.map((row) => row.place_id) || [];
}

/**
 * Hook for managing hidden POIs with Supabase + localStorage persistence
 *
 * Dual-write pattern:
 * - On load: Fetch from Supabase, merge with localStorage (Supabase wins)
 * - On change: Write to localStorage first (instant), then Supabase (async)
 *
 * Users can hide POIs they don't want to see on the map.
 * Hidden POIs appear faded (40% opacity) when "Show Hidden" is enabled.
 */
export function useHiddenPois() {
  // Use Set for fast O(1) lookups
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load from Supabase + localStorage on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadHiddenPois() {
      // Start with localStorage (instant)
      const localState = getInitialState();
      const localIds = new Set(localState.hiddenIds);

      // Fetch from Supabase (async)
      const supabaseIds = await withSupabase(
        () => fetchFromSupabase(),
        [],
        'fetch hidden POIs'
      );

      // Merge: Supabase wins (it's the source of truth)
      // But also include any localStorage-only items (sync them up later)
      const mergedIds = new Set([...localIds, ...supabaseIds]);

      setHiddenIds(mergedIds);
      setIsLoaded(true);

      // Save merged state back to localStorage
      try {
        const state: HiddenPoisState = {
          version: CURRENT_VERSION,
          hiddenIds: Array.from(mergedIds),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error('Error saving merged hidden POIs to localStorage:', error);
      }
    }

    loadHiddenPois();
  }, []);

  // Save to localStorage whenever hiddenIds changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      const state: HiddenPoisState = {
        version: CURRENT_VERSION,
        hiddenIds: Array.from(hiddenIds),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving hidden POIs to localStorage:', error);
    }
  }, [hiddenIds, isLoaded]);

  // Check if a POI is hidden
  const isHidden = useCallback((placeId: string): boolean => {
    return hiddenIds.has(placeId);
  }, [hiddenIds]);

  // Toggle a POI's hidden state
  const toggleHidden = useCallback((placeId: string): boolean => {
    let wasHidden = false;

    setHiddenIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(placeId)) {
        // Was hidden, now unhiding
        newSet.delete(placeId);
        wasHidden = true;
      } else {
        // Was visible, now hiding
        newSet.add(placeId);
        wasHidden = false;
      }

      // Sync to Supabase in background (non-blocking)
      syncToSupabase(placeId, !wasHidden);

      return newSet;
    });

    return wasHidden;
  }, []);

  // Hide a POI (add to hidden set)
  const hidePlace = useCallback((placeId: string): void => {
    setHiddenIds(prev => {
      const newSet = new Set(prev);
      newSet.add(placeId);
      return newSet;
    });

    // Sync to Supabase in background
    syncToSupabase(placeId, true);
  }, []);

  // Unhide a POI (remove from hidden set)
  const unhidePlace = useCallback((placeId: string): void => {
    setHiddenIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(placeId);
      return newSet;
    });

    // Sync to Supabase in background
    syncToSupabase(placeId, false);
  }, []);

  // Get count of hidden POIs
  const hiddenCount = hiddenIds.size;

  // Get all hidden IDs as an array (useful for filtering)
  const getHiddenIds = useCallback((): string[] => {
    return Array.from(hiddenIds);
  }, [hiddenIds]);

  return {
    isLoaded,
    isHidden,
    toggleHidden,
    hidePlace,
    unhidePlace,
    hiddenCount,
    getHiddenIds,
  };
}
