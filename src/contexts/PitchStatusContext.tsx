"use client";

import React, { createContext, useContext, type ReactNode } from 'react';
import { usePitchStatuses } from '@/hooks/usePitchStatuses';
import type { ScoutingTripStatus } from '@/types/scouting';

interface PitchStatusContextValue {
  isLoaded: boolean;
  getPitchStatus: (placeId: string) => ScoutingTripStatus | null;
  getPitchDate: (placeId: string) => string | null;
  scoutedCount: number;
  rejectedCount: number;
}

const PitchStatusContext = createContext<PitchStatusContextValue | null>(null);

export function PitchStatusProvider({ children }: { children: ReactNode }) {
  const hook = usePitchStatuses();

  return (
    <PitchStatusContext.Provider value={hook}>
      {children}
    </PitchStatusContext.Provider>
  );
}

export function usePitchStatusContext(): PitchStatusContextValue {
  const context = useContext(PitchStatusContext);
  if (!context) {
    throw new Error('usePitchStatusContext must be used within a PitchStatusProvider');
  }
  return context;
}
