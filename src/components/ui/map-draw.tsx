"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type mapboxgl from 'mapbox-gl';
import { useMap } from './map';
import { safeMapCleanup } from '@/lib/safe-map-cleanup';
import { convertToMapboxDrawStyles } from '@/lib/draw-styles';
import type { DrawMode } from '@/types/draw';
import { getCurrentUserId, canEditShape } from '@/lib/browser-session';
import { logActivity, getAnonymousUserId } from '@/lib/supabaseHelpers';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useWalkingRadius } from '@/contexts/WalkingRadiusContext';
import { useMobile } from '@/hooks/useMobile';

// Ownership map: shape ID -> created_by user ID. Populated from Supabase on load.
const shapeOwnership = new Map<string, string>();

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

  const syncAndPersist = useCallback((allFeatures: GeoJSON.FeatureCollection) => {
    const points = allFeatures.features
      .filter(f => f.geometry.type === 'Point')
      .map(f => ({
        id: f.id as string,
        center: (f.geometry as GeoJSON.Point).coordinates as [number, number]
      }));
    setDrawnPoints(points);

    // Sync geometry to Supabase (async, non-blocking)
    // Only sends geometry fields. Metadata (name, color, tags) is owned by ShapeComments via RPC.
    if (isSupabaseConfigured() && supabase) {
      const userId = getCurrentUserId();

      const rows = allFeatures.features.map(f => ({
        id: f.id as string,
        user_id: userId,
        geojson: f as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }));

      // Upsert first, then clean up deleted features (sequential to avoid race)
      (async () => {
        try {
          if (rows.length > 0) {
            const { error } = await supabase.from('drawn_features')
              .upsert(rows, { onConflict: 'id' });
            if (error) {
              console.error('Error syncing features to Supabase:', error);
              return;
            }
          }

          // Only after upsert succeeds, remove features the user deleted
          const currentIds = allFeatures.features.map(f => f.id as string);
          if (currentIds.length > 0) {
            const { error } = await supabase.from('drawn_features')
              .delete()
              .eq('user_id', userId)
              .not('id', 'in', `(${currentIds.join(',')})`)
            if (error) console.error('Error cleaning deleted features from Supabase:', error);
          } else {
            // All shapes were deleted, clean up everything for this user
            const { error } = await supabase.from('drawn_features')
              .delete()
              .eq('user_id', userId);
            if (error) console.error('Error deleting all features from Supabase:', error);
          }
        } catch (error) {
          console.error('Error in Supabase sync:', error);
        }
      })();
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

    // Helper to apply loaded features to the draw instance
    const applyFeatures = (fc: GeoJSON.FeatureCollection) => {
      drawInstance.set(fc);
      setFeatures(fc);
      // Sync points to context for mobile (don't re-persist, just sync)
      const points = fc.features
        .filter((f: GeoJSON.Feature) => f.geometry.type === 'Point')
        .map((f: GeoJSON.Feature) => ({
          id: f.id as string,
          center: (f.geometry as GeoJSON.Point).coordinates as [number, number]
        }));
      setDrawnPoints(points);
    };

    // Load features from Supabase
    const loadFeatures = async () => {
      if (isSupabaseConfigured() && supabase) {
        try {
          const userId = getCurrentUserId();
          const anonId = getAnonymousUserId();

          const userIds = Array.from(new Set([userId, anonId]));
          const { data, error } = await supabase
            .from('drawn_features')
            .select('id, geojson, created_by')
            .in('user_id', userIds);

          if (!error && data && data.length > 0) {
            // Populate ownership map for edit permission checks
            for (const row of data) {
              if (row.created_by) {
                shapeOwnership.set(row.id, row.created_by);
              }
            }

            const supabaseFeatures: GeoJSON.FeatureCollection = {
              type: 'FeatureCollection',
              features: data
                .filter(row => row.geojson)
                .map(row => row.geojson as unknown as GeoJSON.Feature),
            };

            if (supabaseFeatures.features.length > 0) {
              applyFeatures(supabaseFeatures);
            }
          }
        } catch (error) {
          console.error('Error loading features from Supabase:', error);
        }
      }
    };

    loadFeatures();

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

      const newest = allFeatures.features[allFeatures.features.length - 1];
      if (newest?.id) {
        shapeOwnership.set(newest.id as string, getCurrentUserId());
      }
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

      const oldFeatureMap = new Map(features.features.map(f => [f.id, f]));

      let unauthorizedEdit = false;
      for (const feature of allFeatures.features) {
        const oldFeature = oldFeatureMap.get(feature.id);
        if (oldFeature) {
          const oldCoords = JSON.stringify(oldFeature.geometry.coordinates);
          const newCoords = JSON.stringify(feature.geometry.coordinates);
          if (oldCoords !== newCoords) {
            const createdBy = shapeOwnership.get(feature.id as string);
            if (!canEditShape(createdBy)) {
              unauthorizedEdit = true;
              break;
            }
          }
        }
      }

      if (unauthorizedEdit) {
        // Revert from React state (the last-known-good geometry)
        draw.set(features);
        setFeatures(features);
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
