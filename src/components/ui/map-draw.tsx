"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { useMap } from './map';
import { convertToMapboxDrawStyles } from '@/lib/draw-styles';
import type { DrawMode } from '@/types/draw';

// Context for drawing state
type MapDrawContextValue = {
  draw: MapboxDraw | null;
  mode: DrawMode;
  features: GeoJSON.FeatureCollection;
  selectedFeatureIds: string[];
};

const MapDrawContext = createContext<MapDrawContextValue | null>(null);

export function useMapDraw() {
  const context = useContext(MapDrawContext);
  if (!context) {
    throw new Error('useMapDraw must be used within MapDraw component');
  }
  return context;
}

type MapDrawProps = {
  children?: ReactNode;
  onFeaturesChange?: (features: GeoJSON.FeatureCollection) => void;
};

export function MapDraw({ children, onFeaturesChange }: MapDrawProps) {
  const { map, isLoaded } = useMap();
  const [draw, setDraw] = useState<MapboxDraw | null>(null);
  const [mode, setMode] = useState<DrawMode>('simple_select');
  const [features, setFeatures] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);

  // Initialize MapboxDraw control
  useEffect(() => {
    if (!map || !isLoaded) return;

    const drawInstance = new MapboxDraw({
      displayControlsDefault: false,
      styles: convertToMapboxDrawStyles(),
      defaultMode: 'simple_select',
    });

    map.addControl(drawInstance);
    setDraw(drawInstance);

    // Load features from localStorage
    try {
      const saved = localStorage.getItem('miners-drawn-features');
      if (saved) {
        const savedFeatures = JSON.parse(saved);
        drawInstance.set(savedFeatures);
        setFeatures(savedFeatures);
      }
    } catch (error) {
      console.error('Error loading saved features:', error);
    }

    return () => {
      map.removeControl(drawInstance);
      setDraw(null);
    };
  }, [map, isLoaded]);

  // Handle draw events
  useEffect(() => {
    if (!map || !draw) return;

    const handleCreate = () => {
      const allFeatures = draw.getAll();
      setFeatures(allFeatures);
      onFeaturesChange?.(allFeatures);

      // Save to localStorage
      try {
        localStorage.setItem('miners-drawn-features', JSON.stringify(allFeatures));
      } catch (error) {
        console.error('Error saving features:', error);
      }
    };

    const handleUpdate = () => {
      const allFeatures = draw.getAll();
      setFeatures(allFeatures);
      onFeaturesChange?.(allFeatures);

      // Save to localStorage
      try {
        localStorage.setItem('miners-drawn-features', JSON.stringify(allFeatures));
      } catch (error) {
        console.error('Error saving features:', error);
      }
    };

    const handleDelete = () => {
      const allFeatures = draw.getAll();
      setFeatures(allFeatures);
      onFeaturesChange?.(allFeatures);

      // Save to localStorage
      try {
        localStorage.setItem('miners-drawn-features', JSON.stringify(allFeatures));
      } catch (error) {
        console.error('Error saving features:', error);
      }
    };

    const handleSelectionChange = (e: any) => {
      const selectedIds = e.features.map((f: any) => f.id);
      setSelectedFeatureIds(selectedIds);
    };

    const handleModeChange = (e: any) => {
      setMode(e.mode as DrawMode);
    };

    map.on('draw.create', handleCreate);
    map.on('draw.update', handleUpdate);
    map.on('draw.delete', handleDelete);
    map.on('draw.selectionchange', handleSelectionChange);
    map.on('draw.modechange', handleModeChange);

    return () => {
      map.off('draw.create', handleCreate);
      map.off('draw.update', handleUpdate);
      map.off('draw.delete', handleDelete);
      map.off('draw.selectionchange', handleSelectionChange);
      map.off('draw.modechange', handleModeChange);
    };
  }, [map, draw, onFeaturesChange]);

  const contextValue = useMemo(
    () => ({
      draw,
      mode,
      features,
      selectedFeatureIds,
    }),
    [draw, mode, features, selectedFeatureIds]
  );

  return (
    <MapDrawContext.Provider value={contextValue}>
      {children}
    </MapDrawContext.Provider>
  );
}
