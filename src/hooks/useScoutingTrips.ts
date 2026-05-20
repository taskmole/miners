"use client";

import { useScoutingTripsContext } from '@/contexts/ScoutingTripsContext';

/**
 * Thin wrapper around ScoutingTripsContext for backward compatibility.
 * All state is shared across all components that use this hook.
 */
export function useScoutingTrips() {
  return useScoutingTripsContext();
}
