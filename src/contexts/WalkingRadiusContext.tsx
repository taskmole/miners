"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { Feature, Polygon } from 'geojson';
import { generateWalkingCircle } from '@/lib/area-calculations';

// Walking speed: 80 meters per minute (standard pedestrian pace)
const WALKING_SPEED_M_PER_MIN = 80;

// Point data for tracking all drawn points
type DrawnPoint = {
  id: string;
  center: [number, number];
};

type WalkingRadiusContextType = {
  // Hover state (desktop only)
  hoveredPointId: string | null;
  setHoveredPoint: (pointId: string, center: [number, number]) => void;
  clearHoveredPoint: () => void;

  // All drawn points (for mobile to render all circles)
  drawnPoints: DrawnPoint[];
  setDrawnPoints: (points: DrawnPoint[]) => void;

  // Single circle for hovered point (desktop)
  radiusPolygon: Feature<Polygon> | null;

  // All circles for all points (mobile)
  allPointsCircles: Feature<Polygon>[];

  // Settings
  walkingMinutes: number;
  setWalkingMinutes: (minutes: number) => void;
  radiusEnabled: boolean;
  toggleRadiusEnabled: () => void;
  radiusMeters: number;
};

const WalkingRadiusContext = createContext<WalkingRadiusContextType | null>(null);

export function WalkingRadiusProvider({ children }: { children: ReactNode }) {
  // Hover state (for desktop)
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [hoveredCenter, setHoveredCenter] = useState<[number, number] | null>(null);

  // All drawn points (for mobile)
  const [drawnPoints, setDrawnPointsState] = useState<DrawnPoint[]>([]);

  // Settings
  const [walkingMinutes, setWalkingMinutesState] = useState(5);
  const [radiusEnabled, setRadiusEnabled] = useState(true);

  // Convert walking minutes to meters
  const radiusMeters = walkingMinutes * WALKING_SPEED_M_PER_MIN;

  // Generate single circle for hovered point (desktop)
  const radiusPolygon = useMemo(() => {
    if (!hoveredCenter || !radiusEnabled) return null;
    return generateWalkingCircle(hoveredCenter, radiusMeters);
  }, [hoveredCenter, radiusMeters, radiusEnabled]);

  // Generate circles for ALL points (mobile)
  const allPointsCircles = useMemo(() => {
    if (!radiusEnabled || drawnPoints.length === 0) return [];

    return drawnPoints
      .map(point => {
        const circle = generateWalkingCircle(point.center, radiusMeters);
        if (circle) circle.properties = { pointId: point.id };
        return circle;
      })
      .filter((c): c is Feature<Polygon> => c !== null);
  }, [drawnPoints, radiusMeters, radiusEnabled]);

  // Set hovered point (desktop hover)
  const setHoveredPoint = useCallback((pointId: string, center: [number, number]) => {
    // Validate coordinates are finite numbers
    if (!center?.every(Number.isFinite)) {
      console.warn('[WalkingRadius] Invalid center coordinates:', center);
      return;
    }
    setHoveredPointId(pointId);
    setHoveredCenter(center);
  }, []);

  // Clear hovered point
  const clearHoveredPoint = useCallback(() => {
    setHoveredPointId(null);
    setHoveredCenter(null);
  }, []);

  // Set all drawn points (for mobile) - direct setter, no wrapper needed
  const setDrawnPoints = setDrawnPointsState;

  // Update walking minutes (clamped to 1-15)
  const setWalkingMinutes = useCallback((minutes: number) => {
    const clamped = Math.max(1, Math.min(15, minutes));
    setWalkingMinutesState(clamped);
  }, []);

  // Toggle radius feature on/off
  const toggleRadiusEnabled = useCallback(() => {
    setRadiusEnabled(prev => !prev);
  }, []);

  const value = useMemo(() => ({
    // Hover state
    hoveredPointId,
    setHoveredPoint,
    clearHoveredPoint,

    // All points (for mobile)
    drawnPoints,
    setDrawnPoints,

    // Circles
    radiusPolygon,
    allPointsCircles,

    // Settings
    walkingMinutes,
    setWalkingMinutes,
    radiusEnabled,
    toggleRadiusEnabled,
    radiusMeters,
  }), [
    hoveredPointId,
    setHoveredPoint,
    clearHoveredPoint,
    drawnPoints,
    setDrawnPoints,
    radiusPolygon,
    allPointsCircles,
    walkingMinutes,
    setWalkingMinutes,
    radiusEnabled,
    toggleRadiusEnabled,
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
