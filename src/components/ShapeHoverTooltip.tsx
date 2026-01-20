"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMap } from '@/components/ui/map';
import { useMapDraw } from '@/hooks/useMapDraw';
import { MessageCircle, Scan, Users, Banknote } from 'lucide-react';
import type { Feature, Polygon } from 'geojson';
import { getCachedStats, formatArea, formatPopulation, formatIncome } from '@/lib/area-calculations';
import { useGeoData } from '@/contexts/GeoDataContext';

// Storage keys (same as ShapeComments.tsx)
const COMMENTS_STORAGE_KEY = 'miners-drawn-comments';
const METADATA_STORAGE_KEY = 'miners-shape-metadata';

// Get shape metadata from localStorage
function getShapeMetadata(featureId: string): { name?: string; tags?: string[] } {
  try {
    const saved = localStorage.getItem(METADATA_STORAGE_KEY);
    if (saved) {
      const all = JSON.parse(saved);
      return all[featureId] || {};
    }
  } catch {}
  return {};
}

// Get comment count from localStorage
function getCommentCount(featureId: string): number {
  try {
    const saved = localStorage.getItem(COMMENTS_STORAGE_KEY);
    if (saved) {
      const all = JSON.parse(saved);
      return (all[featureId] || []).length;
    }
  } catch {}
  return 0;
}

type TooltipData = {
  x: number;
  y: number;
  featureId: string;
  name: string;
  area: string;
  population: string;
  income: string;
  tags: string[];
  commentCount: number;
  isPoint: boolean;
};

export function ShapeHoverTooltip() {
  const { map, isLoaded } = useMap();
  const { features, selectedFeatureIds } = useMapDraw();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const { densityData, incomeData } = useGeoData();
  const hoveredFeatureId = useRef<string | null>(null);

  // Use ref for selectedFeatureIds to avoid stale closure in event listeners
  const selectedFeatureIdsRef = useRef(selectedFeatureIds);
  useEffect(() => {
    selectedFeatureIdsRef.current = selectedFeatureIds;
  }, [selectedFeatureIds]);

  // Track previous feature IDs to detect when hovered feature is deleted
  const prevFeatureIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentIds = new Set(features.features.map(f => f.id as string));
    // Only clear hover if the currently hovered feature was deleted
    if (hoveredFeatureId.current && !currentIds.has(hoveredFeatureId.current)) {
      hoveredFeatureId.current = null;
    }
    prevFeatureIdsRef.current = currentIds;
  }, [features]);

  // Handle mouse move to detect hover on draw features
  const handleMouseMove = useCallback((e: maplibregl.MapMouseEvent) => {
    if (!map) return;

    // Query features under cursor from MapboxDraw layers
    // MapboxDraw uses layers with these prefixes
    const drawLayers = map.getStyle()?.layers
      ?.filter(layer => layer.id.startsWith('gl-draw-'))
      .map(layer => layer.id) || [];

    if (drawLayers.length === 0) return;

    const hoveredFeatures = map.queryRenderedFeatures(e.point, {
      layers: drawLayers.filter(id => id.includes('polygon-fill') || id.includes('line') || id.includes('point'))
    });

    if (hoveredFeatures.length > 0) {
      const feature = hoveredFeatures[0];
      const featureId = feature.properties?.id as string;

      if (!featureId) return;

      // Skip tooltip for the shape that has the popup open (is selected)
      // But show tooltip for OTHER shapes even when a popup is open
      if (selectedFeatureIdsRef.current.includes(featureId)) {
        if (tooltip) setTooltip(null);
        hoveredFeatureId.current = null;
        return;
      }

      // Only recalculate if hovering over a new feature
      if (featureId !== hoveredFeatureId.current) {
        hoveredFeatureId.current = featureId;

        // Find the full feature from our features state
        const fullFeature = features.features.find(f => f.id === featureId);
        if (!fullFeature) return;

        const isPolygon = fullFeature.geometry.type === 'Polygon';
        const isPoint = fullFeature.geometry.type === 'Point';
        if (!isPolygon && !isPoint) return;

        // Get metadata
        const metadata = getShapeMetadata(featureId);
        const commentCount = getCommentCount(featureId);

        // Calculate stats using cache (only for polygons)
        const stats = isPolygon
          ? getCachedStats(featureId, fullFeature as Feature<Polygon>, densityData, incomeData)
          : { area: 0, population: 0, income: 0 };

        setTooltip({
          x: e.point.x,
          y: e.point.y,
          featureId,
          name: metadata.name || (isPolygon ? 'Untitled Area' : 'Untitled Point'),
          area: isPolygon ? formatArea(stats.area) : '',
          population: isPolygon ? formatPopulation(stats.population) : '',
          income: isPolygon ? formatIncome(stats.income) : '',
          tags: metadata.tags || [],
          commentCount,
          isPoint,
        });
      } else {
        // Same feature, just update position
        setTooltip(prev => prev ? { ...prev, x: e.point.x, y: e.point.y } : null);
      }

      map.getCanvas().style.cursor = 'pointer';
    } else {
      if (tooltip) {
        setTooltip(null);
        hoveredFeatureId.current = null;
      }
      map.getCanvas().style.cursor = '';
    }
  }, [map, features, tooltip, densityData, incomeData]);

  // Handle mouse leave map
  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    hoveredFeatureId.current = null;
  }, []);

  // Attach/detach event listeners
  useEffect(() => {
    if (!map || !isLoaded) return;

    map.on('mousemove', handleMouseMove);
    map.on('mouseleave', handleMouseLeave);

    return () => {
      map.off('mousemove', handleMouseMove);
      map.off('mouseleave', handleMouseLeave);
    };
  }, [map, isLoaded, handleMouseMove, handleMouseLeave]);

  if (!tooltip) return null;

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: tooltip.x + 12,
        top: tooltip.y - 8,
        transform: 'translateY(-100%)',
      }}
    >
      {/* Tooltip matching popup styling */}
      <div className="bg-white rounded-xl shadow-lg border border-zinc-200/60 px-3.5 py-3 min-w-[180px]">
        {/* Name */}
        <div className="font-semibold text-sm text-zinc-900 truncate max-w-[220px]">
          {tooltip.name}
        </div>

        {/* Area, Population, and Income - only for polygons */}
        {!tooltip.isPoint && (
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <Scan className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-600">{tooltip.area}</span>
            </div>
            <div className="w-px h-3 bg-zinc-200" />
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-600">{tooltip.population}</span>
            </div>
            {tooltip.income && tooltip.income !== '—' && (
              <>
                <div className="w-px h-3 bg-zinc-200" />
                <div className="flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-600">{tooltip.income}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tags + Comments section */}
        {(tooltip.tags.length > 0 || tooltip.commentCount > 0) && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100">
            {/* Comment bubble - LEFT */}
            {tooltip.commentCount > 0 && (
              <div className="flex items-center gap-1 text-zinc-400">
                <MessageCircle className="w-3 h-3" />
                <span className="text-[11px]">{tooltip.commentCount}</span>
              </div>
            )}

            {/* Tags - RIGHT */}
            {tooltip.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap ml-auto">
                {tooltip.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-[#E5E7EB] text-[#374151] text-[11px] font-medium rounded-md">
                    {tag}
                  </span>
                ))}
                {tooltip.tags.length > 3 && (
                  <span className="text-[10px] text-zinc-400">+{tooltip.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
