"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';

async function syncToApi(placeId: string, isHidden: boolean): Promise<void> {
  try {
    if (isHidden) {
      await apiFetch('/api/db/hidden-pois', {
        method: 'POST',
        body: JSON.stringify({ place_id: placeId }),
      });
    } else {
      await apiFetch(`/api/db/hidden-pois?place_id=${encodeURIComponent(placeId)}`, {
        method: 'DELETE',
      });
    }
  } catch (error) {
    console.error('Error syncing hidden POI:', error);
  }
}

async function fetchHiddenPois(): Promise<string[]> {
  try {
    const data = await apiFetch<Array<{ place_id: string }>>('/api/db/hidden-pois');
    return data?.map((row) => row.place_id) || [];
  } catch (error) {
    console.error('Error fetching hidden POIs:', error);
    return [];
  }
}

export function useHiddenPois() {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadHiddenPois() {
      const ids = await fetchHiddenPois();
      setHiddenIds(new Set(ids));
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

      syncToApi(placeId, !wasHidden);

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

    syncToApi(placeId, true);
  }, []);

  const unhidePlace = useCallback((placeId: string): void => {
    setHiddenIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(placeId);
      return newSet;
    });

    syncToApi(placeId, false);
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
