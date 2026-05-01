"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { withSupabase } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

async function syncToSupabase(placeId: string, isHidden: boolean): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getCurrentUserId();

  try {
    if (isHidden) {
      await supabase.from('hidden_pois').upsert(
        { user_id: userId, place_id: placeId },
        { onConflict: 'user_id,place_id' }
      );
    } else {
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

async function fetchFromSupabase(): Promise<string[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const currentId = getCurrentUserId();

  const { data, error } = await supabase
    .from('hidden_pois')
    .select('place_id')
    .eq('user_id', currentId);

  if (error) {
    console.error('Error fetching hidden POIs from Supabase:', error);
    return [];
  }

  return data?.map((row) => row.place_id) || [];
}

export function useHiddenPois() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadHiddenPois() {
      const supabaseIds = await withSupabase(
        () => fetchFromSupabase(),
        [],
        'fetch hidden POIs'
      );

      setHiddenIds(new Set(supabaseIds));
      setIsLoaded(true);
    }

    loadHiddenPois();
  }, []);

  const isHidden = useCallback((placeId: string): boolean => {
    return hiddenIds.has(placeId);
  }, [hiddenIds]);

  const toggleHidden = useCallback((placeId: string): boolean => {
    let wasHidden = false;

    setHiddenIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(placeId)) {
        newSet.delete(placeId);
        wasHidden = true;
      } else {
        newSet.add(placeId);
        wasHidden = false;
      }

      syncToSupabase(placeId, !wasHidden);

      return newSet;
    });

    return wasHidden;
  }, []);

  const hidePlace = useCallback((placeId: string): void => {
    setHiddenIds(prev => {
      const newSet = new Set(prev);
      newSet.add(placeId);
      return newSet;
    });

    syncToSupabase(placeId, true);
  }, []);

  const unhidePlace = useCallback((placeId: string): void => {
    setHiddenIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(placeId);
      return newSet;
    });

    syncToSupabase(placeId, false);
  }, []);

  const hiddenCount = hiddenIds.size;

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
