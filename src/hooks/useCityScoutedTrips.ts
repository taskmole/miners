"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";

/** One thin row from `GET /api/db/pitches?mode=city`. */
export interface CityScoutedTrip {
  id: string;
  status: string;
  cityId: string;
  createdBy: string;
  authorName: string;
  submittedAt: string | null;
  placeId: string | null;
  placeName: string | null;
  /** Where to fly the map. Null when the trip has no linked place. */
  lat: number | null;
  lon: number | null;
}

interface CityScoutedResponse {
  canSee: boolean;
  trips: CityScoutedTrip[];
}

const POLL_INTERVAL = 60_000;

/**
 * One read of the city's trips. Null means the request failed, which the
 * caller treats as "keep what is on screen" rather than "there is nothing".
 */
async function fetchCityTrips(cityId: string): Promise<CityScoutedResponse | null> {
  try {
    const data = await apiFetch<CityScoutedResponse>(
      `/api/db/pitches?mode=city&city_id=${encodeURIComponent(cityId)}`,
    );
    // A body we cannot read is a failure, not a refusal. Returning
    // {canSee:false} here would tell the user "you can't see other people's
    // trips in this city", which is a different and untrue thing.
    if (!data || !Array.isArray(data.trips)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Every scouting trip in one city, for somebody who approves there.
 *
 * Only fetches while `enabled` is true, which the Scouting panel ties to the
 * "All in city" tab being selected. Nobody pays for this by default, and a
 * signed-out or demo user never reaches it because the switch that turns it on
 * is hidden for them.
 */
export function useCityScoutedTrips(cityId: string | undefined, enabled: boolean) {
  const [trips, setTrips] = useState<CityScoutedTrip[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [canSee, setCanSee] = useState(true);

  useEffect(() => {
    if (!enabled || !cityId) {
      setIsLoaded(false);
      return;
    }

    let cancelled = false;

    // A city switch or a re-open should not show the previous city's rows.
    setTrips([]);
    setIsLoaded(false);

    const refresh = async () => {
      const data = await fetchCityTrips(cityId);
      if (cancelled || !data) return;
      setCanSee(data.canSee);
      setTrips(data.trips);
      setIsLoaded(true);
    };

    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled, cityId]);

  return { trips, isLoaded, canSee };
}
