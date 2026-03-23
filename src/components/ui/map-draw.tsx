"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type mapboxgl from 'mapbox-gl';
import { useMap } from './map';
import { safeMapCleanup } from '@/lib/safe-map-cleanup';
import { convertToMapboxDrawStyles } from '@/lib/draw-styles';
import type { DrawMode, ShapeMetadata } from '@/types/draw';
import { canEditShape } from '@/lib/browser-session';
import { logActivity } from '@/lib/supabaseHelpers';
import { useWalkingRadius } from '@/contexts/WalkingRadiusContext';
import { useMobile } from '@/hooks/useMobile';

// Load shape metadata from localStorage
function loadMetadata(): Record<string, ShapeMetadata> {
  try {
    const saved = localStorage.getItem('miners-shape-metadata');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

// Context for drawing state
type MapDrawContextValue = {
  draw: MapboxDraw | null;
  mode: DrawMode;
  features: GeoJSON.FeatureCollection;
  selectedFeatureIds: string[];
  deleteFeature: (featureId: string) => void;
  clearSelection: () => void;
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
  onShapeCreated?: () => void;
  onShapeUpdated?: () => void;
};

export function MapDraw({ children, onFeaturesChange, onShapeCreated, onShapeUpdated }: MapDrawProps) {
  const { map, isLoaded } = useMap();
  const [draw, setDraw] = useState<MapboxDraw | null>(null);
  const [mode, setMode] = useState<DrawMode>('simple_select');
  const [features, setFeatures] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);

  // Walking radius context for hover behavior
  const { setHoveredPoint, clearHoveredPoint, setDrawnPoints } = useWalkingRadius();
  const isMobile = useMobile();

  // Helper to sync points and persist features (used by create, update, delete handlers)
  const syncAndPersist = useCallback((allFeatures: GeoJSON.FeatureCollection) => {
    // Sync points to context for mobile multi-circle rendering
    const points = allFeatures.features
      .filter(f => f.geometry.type === 'Point')
      .map(f => ({
        id: f.id as string,
        center: (f.geometry as GeoJSON.Point).coordinates as [number, number]
      }));
    setDrawnPoints(points);

    // Save to localStorage
    try {
      localStorage.setItem('miners-drawn-features', JSON.stringify(allFeatures));
    } catch (error) {
      console.error('Error saving features:', error);
    }
  }, [setDrawnPoints]);

  // Initialize MapboxDraw control
  useEffect(() => {
    if (!map || !isLoaded) return;

    const drawInstance = new MapboxDraw({
      displayControlsDefault: false,
      defaultMode: 'simple_select',
      styles: convertToMapboxDrawStyles(),
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
        // Sync points to context for mobile (don't re-persist, just sync)
        const points = savedFeatures.features
          .filter((f: GeoJSON.Feature) => f.geometry.type === 'Point')
          .map((f: GeoJSON.Feature) => ({
            id: f.id as string,
            center: (f.geometry as GeoJSON.Point).coordinates as [number, number]
          }));
        setDrawnPoints(points);
      }
    } catch (error) {
      console.error('Error loading saved features:', error);
    }

    return () => {
      safeMapCleanup(map, (m) => {
        m.removeControl(drawInstance);
      });
      setDraw(null);
    };
  }, [map, isLoaded, setDrawnPoints]);

  // Handle draw events
  useEffect(() => {
    if (!map || !draw) return;

    const handleCreate = () => {
      const allFeatures = draw.getAll();
      setFeatures(allFeatures);
      onFeaturesChange?.(allFeatures);
      onShapeCreated?.();
      syncAndPersist(allFeatures);

      // Log shape creation to activity feed
      const newest = allFeatures.features[allFeatures.features.length - 1];
      if (newest?.geometry) {
        const geom = newest.geometry;
        let lat = 0, lon = 0;
        if (geom.type === 'Point') {
          [lon, lat] = geom.coordinates as [number, number];
        } else if (geom.type === 'Polygon' && (geom.coordinates as number[][][]).length > 0) {
          // Use first vertex as approximate location
          const ring = (geom.coordinates as number[][][])[0];
          if (ring.length > 0) { [lon, lat] = ring[0]; }
        } else if (geom.type === 'LineString' && (geom.coordinates as number[][]).length > 0) {
          [lon, lat] = (geom.coordinates as number[][])[0];
        }
        const actionType = geom.type === 'Point' ? 'created_point' : 'created_area';
        logActivity(actionType, { name: geom.type === 'Point' ? 'New point' : 'New area', lat, lon });
      }
    };

    const handleUpdate = () => {
      const allFeatures = draw.getAll();

      // Check ownership: find which features were updated and verify the user can edit them
      const metadata = loadMetadata();
      const oldFeatureMap = new Map(features.features.map(f => [f.id, f]));

      let unauthorizedEdit = false;
      for (const feature of allFeatures.features) {
        const oldFeature = oldFeatureMap.get(feature.id);
        if (oldFeature) {
          // Check if geometry changed
          const oldCoords = JSON.stringify(oldFeature.geometry.coordinates);
          const newCoords = JSON.stringify(feature.geometry.coordinates);
          if (oldCoords !== newCoords) {
            // Geometry changed - check if user can edit this shape
            const shapeMetadata = metadata[feature.id as string];
            if (!canEditShape(shapeMetadata?.createdBy)) {
              unauthorizedEdit = true;
              break;
            }
          }
        }
      }

      if (unauthorizedEdit) {
        // Revert: restore features from localStorage
        try {
          const saved = localStorage.getItem('miners-drawn-features');
          if (saved) {
            const savedFeatures = JSON.parse(saved);
            draw.set(savedFeatures);
            setFeatures(savedFeatures);
          }
        } catch (error) {
          console.error('Error reverting features:', error);
        }

        // Dispatch event so toast can be shown
        window.dispatchEvent(new CustomEvent('unauthorized-shape-edit'));
        return;
      }

      setFeatures(allFeatures);
      onFeaturesChange?.(allFeatures);
      onShapeUpdated?.();
      syncAndPersist(allFeatures);
    };

    const handleDelete = () => {
      const allFeatures = draw.getAll();
      setFeatures(allFeatures);
      setSelectedFeatureIds([]); // Clear selection after delete
      syncAndPersist(allFeatures);
    };

    const handleSelectionChange = (e: { features: GeoJSON.Feature[] }) => {
      const selectedIds = e.features.map((f) => f.id as string);
      setSelectedFeatureIds(selectedIds);

      // When a single Point is selected, set it as the active point for radius display
      // This ensures the circle shows when clicking (not just hovering)
      if (e.features.length === 1 && e.features[0].geometry.type === 'Point') {
        const feature = e.features[0];
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        setHoveredPoint(feature.id as string, coords);
      } else if (e.features.length === 0) {
        // Nothing selected - clear the hover
        clearHoveredPoint();
      }
      // For multiple selections or non-point selections, keep existing hover state
    };

    const handleModeChange = (e: { mode: string }) => {
      setMode(e.mode as DrawMode);
    };

    map.on('draw.create', handleCreate);
    map.on('draw.update', handleUpdate);
    map.on('draw.delete', handleDelete);
    map.on('draw.selectionchange', handleSelectionChange);
    map.on('draw.modechange', handleModeChange);

    return () => {
      safeMapCleanup(map, (m) => {
        m.off('draw.create', handleCreate);
        m.off('draw.update', handleUpdate);
        m.off('draw.delete', handleDelete);
        m.off('draw.selectionchange', handleSelectionChange);
        m.off('draw.modechange', handleModeChange);
      });
    };
  }, [map, draw, features, onFeaturesChange, onShapeCreated, onShapeUpdated, syncAndPersist, clearHoveredPoint, setHoveredPoint]);

  // Desktop hover listeners for walking radius circle
  useEffect(() => {
    if (!map || !draw || isMobile) return;

    // Handler for mouse entering a draw point
    const handleMouseEnter = (e: mapboxgl.MapMouseEvent & { features?: GeoJSON.Feature[] }) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;

      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      const featureId = feature.id as string;

      // Don't show hover circle if this point is already selected (popup is open)
      const selectedIds = draw.getSelectedIds();
      if (selectedIds.includes(featureId)) return;

      setHoveredPoint(featureId, coords);
    };

    // Handler for mouse leaving a draw point
    const handleMouseLeave = () => {
      // Don't clear if a point is selected (keep circle visible while popup is open)
      const selectedIds = draw.getSelectedIds();
      if (selectedIds.length > 0) return;
      clearHoveredPoint();
    };

    // Listen on multiple draw point layers (including glow and static layers)
    const pointLayers = [
      'gl-draw-point-inactive',
      'gl-draw-point-active',
      'gl-draw-point-point-stroke-inactive',
      'gl-draw-point-glow-outer-inactive',
      'gl-draw-point-glow-inner-inactive',
      'gl-draw-point-glow-outer-active',
      'gl-draw-point-glow-inner-active',
      'gl-draw-point-static',
      'gl-draw-point-glow-outer-static',
      'gl-draw-point-glow-inner-static',
    ];

    for (const layer of pointLayers) {
      try {
        map.on('mouseenter', layer, handleMouseEnter);
        map.on('mouseleave', layer, handleMouseLeave);
      } catch {
        // Layer might not exist yet
      }
    }

    return () => {
      safeMapCleanup(map, (m) => {
        for (const layer of pointLayers) {
          try {
            m.off('mouseenter', layer, handleMouseEnter);
            m.off('mouseleave', layer, handleMouseLeave);
          } catch {
            // Layer might not exist
          }
        }
      });
    };
  }, [map, draw, isMobile, setHoveredPoint, clearHoveredPoint]);

  // Delete feature programmatically (MapboxDraw doesn't fire events for programmatic deletions)
  const deleteFeature = useCallback((featureId: string) => {
    if (!draw || !featureId) return;
    try {
      draw.delete(featureId);
      const allFeatures = draw.getAll();
      setFeatures(allFeatures);
      setSelectedFeatureIds([]);
      syncAndPersist(allFeatures);
    } catch (error) {
      console.error('Error deleting feature:', error);
    }
  }, [draw, syncAndPersist]);

  // Clear selection (allows hover tooltip to show again)
  const clearSelection = useCallback(() => {
    // First deselect in MapboxDraw (this fires selectionchange with empty array)
    if (draw) {
      try {
        draw.changeMode('simple_select');
      } catch (error) {
        console.error('Error clearing MapboxDraw selection:', error);
      }
    }
    // Then explicitly clear our state (in case the event doesn't fire)
    setSelectedFeatureIds([]);
  }, [draw]);

  const contextValue = useMemo(
    () => ({
      draw,
      mode,
      features,
      selectedFeatureIds,
      deleteFeature,
      clearSelection,
    }),
    [draw, mode, features, selectedFeatureIds, deleteFeature, clearSelection]
  );

  return (
    <MapDrawContext.Provider value={contextValue}>
      {children}
    </MapDrawContext.Provider>
  );
}
