/**
 * Area and population calculations for drawn shapes
 * Uses Turf.js for geodesic (Earth-curvature-aware) calculations
 */

import turfArea from '@turf/area';
import turfIntersect from '@turf/intersect';
import { polygon as turfPolygon, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, FeatureCollection } from 'geojson';

/**
 * Calculate area of a polygon in km²
 * Uses geodesic calculation (accounts for Earth's curvature)
 */
export function calculateAreaKm2(feature: Feature<Polygon>): number {
  try {
    const areaM2 = turfArea(feature);
    return areaM2 / 1_000_000; // Convert m² to km²
  } catch {
    return 0;
  }
}

/**
 * Estimate population within a drawn polygon
 * Intersects with neighborhood density polygons and sums proportionally
 *
 * @param drawnPolygon - The user-drawn polygon
 * @param densityData - FeatureCollection of neighborhoods with density property (people/km²)
 */
export function calculatePopulation(
  drawnPolygon: Feature<Polygon>,
  densityData: FeatureCollection
): number {
  if (!densityData?.features?.length) return 0;

  let totalPopulation = 0;

  for (const neighborhood of densityData.features) {
    try {
      // Skip if not a polygon
      if (neighborhood.geometry.type !== 'Polygon' && neighborhood.geometry.type !== 'MultiPolygon') {
        continue;
      }

      // Calculate intersection between drawn area and neighborhood
      const intersection = turfIntersect(
        featureCollection([drawnPolygon, neighborhood as Feature<Polygon>])
      );

      if (intersection) {
        // Get intersection area in km²
        const intersectionAreaKm2 = turfArea(intersection) / 1_000_000;

        // Get density (people per km²)
        const density = neighborhood.properties?.density || 0;

        // Add proportional population
        totalPopulation += intersectionAreaKm2 * density;
      }
    } catch {
      // Skip invalid geometries (common with complex polygons)
      continue;
    }
  }

  return Math.round(totalPopulation);
}

/**
 * Calculate area-weighted average income within a drawn polygon
 * Intersects with census section polygons and calculates weighted average
 *
 * @param drawnPolygon - The user-drawn polygon
 * @param incomeData - FeatureCollection of census sections with avgIncome property (€)
 */
export function calculateAverageIncome(
  drawnPolygon: Feature<Polygon>,
  incomeData: FeatureCollection
): number {
  if (!incomeData?.features?.length) return 0;

  let totalWeightedIncome = 0;
  let totalIntersectionArea = 0;

  for (const section of incomeData.features) {
    try {
      // Skip if not a polygon
      if (section.geometry.type !== 'Polygon' && section.geometry.type !== 'MultiPolygon') {
        continue;
      }

      // Calculate intersection between drawn area and census section
      const intersection = turfIntersect(
        featureCollection([drawnPolygon, section as Feature<Polygon>])
      );

      if (intersection) {
        // Get intersection area in km²
        const intersectionAreaKm2 = turfArea(intersection) / 1_000_000;

        // Get average income for this section
        const avgIncome = section.properties?.avgIncome || 0;

        // Skip sections with no income data
        if (avgIncome > 0) {
          totalWeightedIncome += intersectionAreaKm2 * avgIncome;
          totalIntersectionArea += intersectionAreaKm2;
        }
      }
    } catch {
      // Skip invalid geometries
      continue;
    }
  }

  // Calculate weighted average (avoid division by zero)
  if (totalIntersectionArea === 0) return 0;
  return Math.round(totalWeightedIncome / totalIntersectionArea);
}

/**
 * Format area for display
 * Shows appropriate precision based on size
 */
export function formatArea(km2: number): string {
  if (km2 === 0) return '0 km²';

  if (km2 < 0.01) {
    // Very small - show in m²
    const m2 = km2 * 1_000_000;
    return `${Math.round(m2).toLocaleString()} m²`;
  } else if (km2 < 1) {
    // Small - show 2 decimal places
    return `${km2.toFixed(2)} km²`;
  } else if (km2 < 10) {
    // Medium - show 1 decimal place
    return `${km2.toFixed(1)} km²`;
  } else {
    // Large - show whole number
    return `${Math.round(km2).toLocaleString()} km²`;
  }
}

/**
 * Format population for display
 * Shows "27.1k" format for thousands, rounded to 1 decimal
 */
export function formatPopulation(population: number): string {
  if (population === 0) return '0';

  if (population >= 1000) {
    // Round up to 1 decimal place, show with k suffix
    const thousands = Math.ceil(population / 100) / 10;
    return `${thousands.toFixed(1)}k`;
  }

  // Under 1000 - show whole number
  return Math.round(population).toString();
}

/**
 * Format income for display
 * Shows "€26K" for thousands, "€850" for smaller values
 * Returns "—" when income is 0 (area outside coverage)
 */
export function formatIncome(income: number): string {
  if (income === 0) return '—';

  if (income >= 1000) {
    // Round to nearest thousand and show with K suffix
    const thousands = Math.round(income / 1000);
    return `€${thousands}K`;
  }

  // Under 1000 - show with € symbol
  return `€${Math.round(income)}`;
}

/**
 * Stats cache for drawn shapes
 * Keyed by feature ID to avoid recalculating for the same shape
 */
const statsCache = new Map<string, { area: number; population: number; income: number }>();

/**
 * Get cached stats for a shape, calculating if not cached
 * This significantly improves performance for repeated hovers over the same shape
 */
export function getCachedStats(
  featureId: string,
  feature: Feature<Polygon>,
  densityData: FeatureCollection | null,
  incomeData: FeatureCollection | null
): { area: number; population: number; income: number } {
  if (statsCache.has(featureId)) {
    return statsCache.get(featureId)!;
  }

  const stats = {
    area: calculateAreaKm2(feature),
    population: densityData ? calculatePopulation(feature, densityData) : 0,
    income: incomeData ? calculateAverageIncome(feature, incomeData) : 0,
  };

  statsCache.set(featureId, stats);
  return stats;
}

/**
 * Invalidate cached stats for a specific shape
 * Call this when a shape's geometry is edited
 */
export function invalidateStatsCache(featureId: string): void {
  statsCache.delete(featureId);
}

/**
 * Clear all cached stats
 * Call this when switching cities or doing a full reset
 */
export function clearStatsCache(): void {
  statsCache.clear();
}
