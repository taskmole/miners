"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { Feature, Polygon } from 'geojson';
import { generateWalkingCircle } from '@/lib/area-calculations';

// Walking speed: 80 meters per minute (standard pedestrian pace)
const WALKING_SPEED_M_PER_MIN = 80;

type WalkingRadiusContextType = {
  // State
  activePointId: string | null;
  radiusPolygon: Feature<Polygon> | null;
  walkingMinutes: number;
  radiusEnabled: boolean;
  isPopupOpen: boolean;

  // Actions
  activateRadius: (pointId: string, center: [number, number]) => void;
  deactivateRadius: () => void;
  setWalkingMinutes: (minutes: number) => void;
  toggleRadiusEnabled: () => void;
  openPopup: () => void;
  closePopup: () => void;

  // Computed
  radiusMeters: number;
};

const WalkingRadiusContext = createContext<WalkingRadiusContextType | null>(null);

export function WalkingRadiusProvider({ children }: { children: ReactNode }) {
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [activeCenter, setActiveCenter] = useState<[number, number] | null>(null);
  const [walkingMinutes, setWalkingMinutesState] = useState(5);
  const [radiusEnabled, setRadiusEnabled] = useState(true);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // Convert walking minutes to meters
  const radiusMeters = useMemo(() => {
    return walkingMinutes * WALKING_SPEED_M_PER_MIN;
  }, [walkingMinutes]);

  // Generate circle polygon when center or radius changes
  const radiusPolygon = useMemo(() => {
    if (!activeCenter || !radiusEnabled) return null;
    return generateWalkingCircle(activeCenter, radiusMeters);
  }, [activeCenter, radiusMeters, radiusEnabled]);

  // Activate radius for a point
  const activateRadius = useCallback((pointId: string, center: [number, number]) => {
    // Validate coordinates
    if (!center || center.length !== 2 ||
        !Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
      console.warn('[WalkingRadius] Invalid center coordinates:', center);
      return;
    }

    setActivePointId(pointId);
    setActiveCenter(center);
    setIsPopupOpen(false);
  }, []);

  // Deactivate radius
  const deactivateRadius = useCallback(() => {
    setActivePointId(null);
    setActiveCenter(null);
    setIsPopupOpen(false);
  }, []);

  // Update walking minutes (clamped to 1-15)
  const setWalkingMinutes = useCallback((minutes: number) => {
    const clamped = Math.max(1, Math.min(15, minutes));
    setWalkingMinutesState(clamped);
  }, []);

  // Toggle radius feature on/off
  const toggleRadiusEnabled = useCallback(() => {
    setRadiusEnabled(prev => !prev);
  }, []);

  // Open/close popup (for 2nd click behavior)
  const openPopup = useCallback(() => {
    setIsPopupOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
  }, []);

  const value = useMemo(() => ({
    activePointId,
    radiusPolygon,
    walkingMinutes,
    radiusEnabled,
    isPopupOpen,
    activateRadius,
    deactivateRadius,
    setWalkingMinutes,
    toggleRadiusEnabled,
    openPopup,
    closePopup,
    radiusMeters,
  }), [
    activePointId,
    radiusPolygon,
    walkingMinutes,
    radiusEnabled,
    isPopupOpen,
    activateRadius,
    deactivateRadius,
    setWalkingMinutes,
    toggleRadiusEnabled,
    openPopup,
    closePopup,
    radiusMeters,
  ]);

  return (
    <WalkingRadiusContext.Provider value={value}>
      {children}
    </WalkingRadiusContext.Provider>
  );
}

export function useWalkingRadius() {
  const context = useContext(WalkingRadiusContext);
  if (!context) {
    throw new Error('useWalkingRadius must be used within WalkingRadiusProvider');
  }
  return context;
}
