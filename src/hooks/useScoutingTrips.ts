"use client";

import { useScoutingTripsContext } from '@/contexts/ScoutingTripsContext';

/**
 * Hook for managing scouting trips with localStorage persistence
 *
 * This is now a thin wrapper around ScoutingTripsContext for backward compatibility.
 * All state is shared across all components that use this hook.
 *
 * Supabase migration:
 * - Replace localStorage with supabase.from('pitches')
 * - getTrips: .select().eq('city_id', cityId)
 * - createTrip: .insert({ ... })
 * - updateTrip: .update({ ... }).eq('id', tripId)
 * - deleteTrip: .delete().eq('id', tripId)
 * - Linked items: use scouting_trip_links junction table
 */
export function useScoutingTrips() {
  return useScoutingTripsContext();
}
