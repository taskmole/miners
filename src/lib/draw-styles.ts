// Fixed styling configuration for drawn shapes

export const DRAW_STYLES = {
  polygon: {
    fillColor: '#3b82f6',      // blue-500
    fillOpacity: 0.2,
    strokeColor: '#3b82f6',
    strokeWidth: 2,
  },
  line: {
    strokeColor: '#8b5cf6',     // violet-500
    strokeWidth: 3,
  },
  point: {
    circleColor: '#ef4444',     // red-500
    circleRadius: 6,
  },
  active: {
    strokeColor: '#fbbf24',     // amber-400
    fillOpacity: 0.3,
    vertexColor: '#fbbf24',
    midpointColor: '#fbbf24',
  },
  vertex: {
    circleRadius: 5,
    circleColor: '#fbbf24',
  },
  midpoint: {
    circleRadius: 3,
    circleColor: '#fbbf24',
  },
} as const;

// Convert our custom styles to Mapbox GL Draw style format
export function convertToMapboxDrawStyles() {
  return [
    // Polygon fill (inactive)
    {
      id: 'gl-draw-polygon-fill-inactive',
      type: 'fill' as const,
      filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: {
        'fill-color': DRAW_STYLES.polygon.fillColor,
        'fill-outline-color': DRAW_STYLES.polygon.strokeColor,
        'fill-opacity': DRAW_STYLES.polygon.fillOpacity,
      },
    },
    // Polygon fill (active)
    {
      id: 'gl-draw-polygon-fill-active',
      type: 'fill' as const,
      filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
      paint: {
        'fill-color': DRAW_STYLES.polygon.fillColor,
        'fill-outline-color': DRAW_STYLES.active.strokeColor,
        'fill-opacity': DRAW_STYLES.active.fillOpacity,
      },
    },
    // Polygon outline (inactive)
    {
      id: 'gl-draw-polygon-stroke-inactive',
      type: 'line' as const,
      filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': DRAW_STYLES.polygon.strokeColor,
        'line-width': DRAW_STYLES.polygon.strokeWidth,
      },
    },
    // Polygon outline (active)
    {
      id: 'gl-draw-polygon-stroke-active',
      type: 'line' as const,
      filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': DRAW_STYLES.active.strokeColor,
        'line-width': DRAW_STYLES.polygon.strokeWidth,
      },
    },
    // Line (inactive)
    {
      id: 'gl-draw-line-inactive',
      type: 'line' as const,
      filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': DRAW_STYLES.line.strokeColor,
        'line-width': DRAW_STYLES.line.strokeWidth,
      },
    },
    // Line (active)
    {
      id: 'gl-draw-line-active',
      type: 'line' as const,
      filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': DRAW_STYLES.active.strokeColor,
        'line-width': DRAW_STYLES.line.strokeWidth,
      },
    },
    // Point (inactive)
    {
      id: 'gl-draw-point-inactive',
      type: 'circle' as const,
      filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
      paint: {
        'circle-radius': DRAW_STYLES.point.circleRadius,
        'circle-color': DRAW_STYLES.point.circleColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    },
    // Point (active)
    {
      id: 'gl-draw-point-active',
      type: 'circle' as const,
      filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Point'], ['==', 'meta', 'feature']],
      paint: {
        'circle-radius': DRAW_STYLES.point.circleRadius,
        'circle-color': DRAW_STYLES.active.strokeColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    },
    // Vertices (for editing)
    {
      id: 'gl-draw-polygon-and-line-vertex-inactive',
      type: 'circle' as const,
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
      paint: {
        'circle-radius': DRAW_STYLES.vertex.circleRadius,
        'circle-color': DRAW_STYLES.vertex.circleColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    },
    // Vertices (active/hovered)
    {
      id: 'gl-draw-polygon-and-line-vertex-active',
      type: 'circle' as const,
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': DRAW_STYLES.vertex.circleRadius + 1,
        'circle-color': DRAW_STYLES.vertex.circleColor,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    },
    // Midpoints (for adding vertices)
    {
      id: 'gl-draw-polygon-midpoint',
      type: 'circle' as const,
      filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
      paint: {
        'circle-radius': DRAW_STYLES.midpoint.circleRadius,
        'circle-color': DRAW_STYLES.midpoint.circleColor,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
      },
    },
  ];
}
