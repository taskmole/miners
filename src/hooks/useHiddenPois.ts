"use client";

import { useState, useEffect, useCallback } from 'react';

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
 * Hook for managing hidden POIs with localStorage persistence
 * Users can hide POIs they don't want to see on the map
 * Hidden POIs appear faded (40% opacity) when "Show Hidden" is enabled
 */
export function useHiddenPois() {
  // Use Set for fast O(1) lookups
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const initialState = getInitialState();
    setHiddenIds(new Set(initialState.hiddenIds));
    setIsLoaded(true);
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
  }, []);

  // Unhide a POI (remove from hidden set)
  const unhidePlace = useCallback((placeId: string): void => {
    setHiddenIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(placeId);
      return newSet;
    });
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
