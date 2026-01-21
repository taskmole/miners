"use client";

import React, { createContext, useContext, type ReactNode } from 'react';
import { useHiddenPois } from '@/hooks/useHiddenPois';

// Define the context value type based on what useHiddenPois returns
interface HiddenPoisContextValue {
  isLoaded: boolean;
  isHidden: (placeId: string) => boolean;
  toggleHidden: (placeId: string) => boolean;
  hidePlace: (placeId: string) => void;
  unhidePlace: (placeId: string) => void;
  hiddenCount: number;
  getHiddenIds: () => string[];
}

const HiddenPoisContext = createContext<HiddenPoisContextValue | null>(null);

/**
 * Provider component that wraps the app and provides hidden POIs context
 * Use this at the root level alongside ListsProvider
 */
export function HiddenPoisProvider({ children }: { children: ReactNode }) {
  const hiddenPoisHook = useHiddenPois();

  return (
    <HiddenPoisContext.Provider value={hiddenPoisHook}>
      {children}
    </HiddenPoisContext.Provider>
  );
}

/**
 * Hook to access the hidden POIs context from any component
 * Must be used within a HiddenPoisProvider
 */
export function useHiddenPoisContext(): HiddenPoisContextValue {
  const context = useContext(HiddenPoisContext);
  if (!context) {
    throw new Error('useHiddenPoisContext must be used within a HiddenPoisProvider');
  }
  return context;
}
