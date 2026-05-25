"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { ScoutingTripStatus } from '@/types/scouting';

interface PitchStatusEntry {
  status: ScoutingTripStatus;
  date: string | null;
  rejectionReason: string | null;
  returnReason: string | null;
}

type StatusMapResponse = Record<string, PitchStatusEntry>;

async function fetchPitchStatusMap(): Promise<StatusMapResponse> {
  try {
    const data = await apiFetch<StatusMapResponse>('/api/db/pitches?mode=status-map');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function usePitchStatuses() {
  const [statusMap, setStatusMap] = useState<StatusMapResponse>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function load() {
      const map = await fetchPitchStatusMap();
      setStatusMap(map);
      setIsLoaded(true);
    }

    load();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(async () => {
      const map = await fetchPitchStatusMap();
      setStatusMap(map);
    }, 60_000);
    return () => clearInterval(interval);
  }, [isLoaded]);

  const getPitchStatus = useCallback((placeId: string): ScoutingTripStatus | null => {
    return statusMap[placeId]?.status ?? null;
  }, [statusMap]);

  const getPitchDate = useCallback((placeId: string): string | null => {
    return statusMap[placeId]?.date ?? null;
  }, [statusMap]);

  const getPitchRejectionReason = useCallback((placeId: string): string | null => {
    return statusMap[placeId]?.rejectionReason ?? null;
  }, [statusMap]);

  const getPitchReturnReason = useCallback((placeId: string): string | null => {
    return statusMap[placeId]?.returnReason ?? null;
  }, [statusMap]);

  const { scoutedCount, rejectedCount } = useMemo(() => {
    let rejected = 0;
    const entries = Object.values(statusMap);
    for (const e of entries) {
      if (e.status === 'rejected') rejected++;
    }
    return { scoutedCount: entries.length, rejectedCount: rejected };
  }, [statusMap]);

  return {
    isLoaded,
    getPitchStatus,
    getPitchDate,
    getPitchRejectionReason,
    getPitchReturnReason,
    scoutedCount,
    rejectedCount,
  };
}
