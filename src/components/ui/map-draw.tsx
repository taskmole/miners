"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import type mapboxgl from 'mapbox-gl';
import { useMap } from './map';
import { safeMapCleanup } from '@/lib/safe-map-cleanup';
import { convertToMapboxDrawStyles } from '@/lib/draw-styles';
import type { DrawMode } from '@/types/draw';
import { useAuth } from '@/contexts/AuthContext';
import { logActivity } from '@/lib/supabaseHelpers';
import { apiFetch } from '@/lib/api-client';
import { useWalkingRadius } from '@/contexts/WalkingRadiusContext';
import { useMobile } from '@/hooks/useMobile';

// Ownership map: shape ID -> owning user ID. Populated from the API on load.
// Keyed on user_id, the column that actually decides who owns a shape, not on
// created_by, which is only the author stamp.
const shapeOwnership = new Map<string, string>();

/**
 * Whether this person may reshape a shape.
 *
 * verifiedUserId is the id the server confirmed, handed back with the shapes.
 * It used to be read from local storage, where a value left over from a
 * previous session would hide the edit button on a person's own shapes.
 * A shape with no recorded owner is legacy and stays editable.
 */
function canEditShape(ownerId: string | undefined, verifiedUserId: string | null): boolean {
  if (!ownerId) return true;
  return Boolean(verifiedUserId) && ownerId === verifiedUserId;
}

// The drawn points, for the walking-radius circles.
function toPoints(fc: GeoJSON.FeatureCollection) {
  return fc.features
    .filter(f => f.geometry.type === 'Point')
    .map(f => ({
      id: f.id as string,
      center: (f.geometry as GeoJSON.Point).coordinates as [number, number]
    }));
}

/*
 * Saving shapes. Each draw event saves only the shapes it touched. This used
 * to save every shape on screen and then delete every saved shape that was
 * not on screen, so a tab that had not loaded, or was out of date, wiped the
 * person's other shapes the next time they drew.
 *
 * Writes go out one at a time, in order, so a quick draw-then-delete cannot
 * land the delete before the save and bring the shape back on reload.
 */
let shapeWrites: Promise<unknown> = Promise.resolve();

function queueShapeWrite(url: string, init: RequestInit) {
  shapeWrites = shapeWrites
    .then(() => apiFetch(url, init))
    .catch((error) => console.error('Error saving shapes:', error));
}

// Only geometry is sent. Metadata (name, color, tags) is owned by
// ShapeComments via RPC, and the server stamps the owner from the session.
function saveShapes(shapes: GeoJSON.Feature[]) {
  if (shapes.length === 0) return;
  const rows = shapes.map(f => ({
    id: f.id as string,
    geojson: f as unknown as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  }));
  queueShapeWrite('/api/db/drawn-features', {
    method: 'POST',
    body: JSON.stringify({ action: 'upsert_geometry', rows }),
  });
}

function removeShapes(ids: string[]) {
  if (ids.length === 0) return;
  queueShapeWrite(`/api/db/drawn-features?ids=${encodeURIComponent(ids.join(','))}`, { method: 'DELETE' });
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
  onShapeCreated?: () => void;
  onShapeUpdated?: () => void;
};

export function MapDraw({ children, onShapeCreated, onShapeUpdated }: MapDrawProps) {
  const { map, isLoaded } = useMap();
  const { userId: sessionUserId, isReady: authReady } = useAuth();
  const [draw, setDraw] = useState<MapboxDraw | null>(null);

  // The id the server confirmed, not the browser's copy. Held in a ref so the
  // draw event handlers, which are registered once, always read the current
  // value.
  const verifiedUserIdRef = useRef<string | null>(null);
  const [mode, setMode] = useState<DrawMode>('simple_select');
  const [features, setFeatures] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<string[]>([]);

  // Walking radius context for hover behavior
  const { hoveredPointId, setHoveredPoint, clearHoveredPoint, setDrawnPoints } = useWalkingRadius();
  const isMobile = useMobile();

  // Ref so event handlers can read current hoveredPointId without re-registering listeners
  const hoveredPointIdRef = useRef(hoveredPointId);
  hoveredPointIdRef.current = hoveredPointId;

  // Keep the walking-radius points in step with whatever is on the map.
  useEffect(() => {
    setDrawnPoints(toPoints(features));
  }, [features, setDrawnPoints]);

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
    };

    // Load features from API
    const loadFeatures = async () => {
      try {
        const response = await apiFetch<{
          userId: string;
          features: Array<{ id: string; geojson: unknown; user_id: string | null }>;
        }>('/api/db/drawn-features');

        const data = response?.features || [];
        verifiedUserIdRef.current = response?.userId || null;

        if (data.length > 0) {
          // Populate ownership map for edit permission checks
          for (const row of data) {
            if (row.user_id) {
              shapeOwnership.set(row.id, row.user_id);
            }
          }

          const apiFeatures: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: data
              .filter(row => row.geojson)
              .map(row => row.geojson as unknown as GeoJSON.Feature),
          };

          if (apiFeatures.features.length > 0) {
            applyFeatures(apiFeatures);
          }
        }
      } catch (error) {
        console.error('Error loading features from API:', error);
      }
    };

    // Loaded again whenever the session changes. The map is mounted underneath
    // the landing screen before sign-in has resolved, and this effect used to
    // run exactly once, on mount. That first attempt is made without a token,
    // is refused, and never retried, so without this the shapes would stay
    // missing until the page was reloaded.
    loadFeatures();

    return () => {
      safeMapCleanup(map, (m) => {
        m.removeControl(drawInstance);
      });
      setDraw(null);
    };
  }, [map, isLoaded, authReady, sessionUserId]);

  // Handle draw events
  useEffect(() => {
    if (!map || !draw) return;

    const handleCreate = (e: { features: GeoJSON.Feature[] }) => {
      setFeatures(draw.getAll());
      onShapeCreated?.();
      saveShapes(e.features);

      const newest = e.features[0];
      if (newest?.id) {
        // Only if the server has confirmed who this is. Recording a guess here
        // would let a stale local id decide the edit button on a brand new
        // shape.
        if (verifiedUserIdRef.current) {
          shapeOwnership.set(newest.id as string, verifiedUserIdRef.current);
        }
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
        logActivity(actionType, { name: geom.type === 'Point' ? 'New point' : 'New area', lat, lon, shapeId: newest.id });
      }
    };

    const handleUpdate = (e: { features: GeoJSON.Feature[] }) => {
      const allFeatures = draw.getAll();

      // The event carries only the shapes that were moved or reshaped.
      const unauthorizedEdit = e.features.some(
        f => !canEditShape(shapeOwnership.get(f.id as string), verifiedUserIdRef.current)
      );

      if (unauthorizedEdit) {
        // Revert from React state (the last-known-good geometry)
        draw.set(features);
        setFeatures(features);
        window.dispatchEvent(new CustomEvent('unauthorized-shape-edit'));
        return;
      }

      setFeatures(allFeatures);
      onShapeUpdated?.();
      saveShapes(e.features);
    };

    const handleDelete = (e: { features: GeoJSON.Feature[] }) => {
      setFeatures(draw.getAll());
      setSelectedFeatureIds([]);
      // Clear walk circle if the deleted features include the currently-hovered point
      if (hoveredPointIdRef.current && e.features.some(f => f.id === hoveredPointIdRef.current)) {
        clearHoveredPoint();
      }
      removeShapes(e.features.map(f => f.id as string));
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
  }, [map, draw, features, onShapeCreated, onShapeUpdated, clearHoveredPoint, setHoveredPoint]);

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
      setFeatures(draw.getAll());
      setSelectedFeatureIds([]);
      // Clear walk circle if the deleted feature is the currently-hovered point
      if (hoveredPointIdRef.current === featureId) {
        clearHoveredPoint();
      }
      removeShapes([featureId]);
    } catch (error) {
      console.error('Error deleting feature:', error);
    }
  }, [draw, clearHoveredPoint]);

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
