// Complete MapboxDraw styling configuration
// Colors: green for shapes, darker green for active/editing state
// Supports per-shape custom colors via user_color property

const COLORS = {
  fill: '#22c55e',        // green-500 - default polygon fill
  stroke: '#22c55e',      // green-500 - lines and outlines
  active: '#16a34a',      // green-600 - active/selected state
  vertex: '#16a34a',      // green-600 - vertex points
  white: '#ffffff',
};

// Preset colors for shape customization
export const PRESET_COLORS = [
  '#22c55e', // green (default)
  '#0f766e', // teal
  '#2563eb', // blue
  '#7c3aed', // purple
  '#db2777', // pink
  '#ea580c', // orange
];

// Helper to create data-driven color expression
// Uses user_color if set, falls back to default
const getShapeColor = (defaultColor: string) => [
  'case',
  ['has', 'user_color'],
  ['get', 'user_color'],
  defaultColor
];

// Complete MapboxDraw styles covering all drawing states
export function convertToMapboxDrawStyles() {
  return [
    // ===== POLYGON STYLES =====

    // Polygon fill - inactive (completed, not selected)
    // Uses custom user_color if set, otherwise default teal
    {
      id: 'gl-draw-polygon-fill-inactive',
      type: 'fill',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'Polygon'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'fill-color': getShapeColor(COLORS.fill) as any,
        'fill-outline-color': getShapeColor(COLORS.stroke) as any,
        'fill-opacity': 0.4
      }
    },
    // Polygon fill - active (selected or being drawn)
    {
      id: 'gl-draw-polygon-fill-active',
      type: 'fill',
      filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
      paint: {
        'fill-color': COLORS.active,
        'fill-outline-color': COLORS.active,
        'fill-opacity': 0.5
      }
    },
    // Polygon fill - static
    {
      id: 'gl-draw-polygon-fill-static',
      type: 'fill',
      filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
      paint: {
        'fill-color': getShapeColor(COLORS.fill) as any,
        'fill-outline-color': getShapeColor(COLORS.stroke) as any,
        'fill-opacity': 0.4
      }
    },
    // Polygon outline - inactive
    // Uses custom user_color if set
    {
      id: 'gl-draw-polygon-stroke-inactive',
      type: 'line',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'Polygon'],
        ['!=', 'mode', 'static']
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': getShapeColor(COLORS.stroke) as any,
        'line-width': 2
      }
    },
    // Polygon outline - active
    {
      id: 'gl-draw-polygon-stroke-active',
      type: 'line',
      filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': COLORS.active,
        'line-width': 2
      }
    },
    // Polygon outline - static
    {
      id: 'gl-draw-polygon-stroke-static',
      type: 'line',
      filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Polygon']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': getShapeColor(COLORS.stroke) as any,
        'line-width': 2
      }
    },

    // ===== LINE STYLES =====

    // Line - inactive
    {
      id: 'gl-draw-line-inactive',
      type: 'line',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'LineString'],
        ['!=', 'mode', 'static']
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': COLORS.stroke,
        'line-width': 3
      }
    },
    // Line - active
    {
      id: 'gl-draw-line-active',
      type: 'line',
      filter: ['all',
        ['==', '$type', 'LineString'],
        ['==', 'active', 'true']
      ],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': COLORS.active,
        'line-width': 3
      }
    },
    // Line - static
    {
      id: 'gl-draw-line-static',
      type: 'line',
      filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'LineString']],
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': COLORS.stroke,
        'line-width': 3
      }
    },

    // ===== POINT STYLES =====

    // Point glow - outer (soft halo) - inactive
    {
      id: 'gl-draw-point-glow-outer-inactive',
      type: 'circle',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'Point'],
        ['==', 'meta', 'feature'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'circle-radius': 24,
        'circle-color': getShapeColor(COLORS.stroke) as any,
        'circle-blur': 1,
        'circle-opacity': 0.5
      }
    },
    // Point glow - inner (brighter ring) - inactive
    {
      id: 'gl-draw-point-glow-inner-inactive',
      type: 'circle',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'Point'],
        ['==', 'meta', 'feature'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'circle-radius': 16,
        'circle-color': getShapeColor(COLORS.stroke) as any,
        'circle-blur': 0.6,
        'circle-opacity': 0.8
      }
    },
    // Point - inactive (white ring around colored center)
    // Uses custom user_color if set
    {
      id: 'gl-draw-point-point-stroke-inactive',
      type: 'circle',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'Point'],
        ['==', 'meta', 'feature'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'circle-radius': 7,
        'circle-opacity': 1,
        'circle-color': COLORS.white
      }
    },
    {
      id: 'gl-draw-point-inactive',
      type: 'circle',
      filter: ['all',
        ['==', 'active', 'false'],
        ['==', '$type', 'Point'],
        ['==', 'meta', 'feature'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'circle-radius': 5,
        'circle-color': getShapeColor(COLORS.stroke) as any
      }
    },
    // Point glow - outer - active
    {
      id: 'gl-draw-point-glow-outer-active',
      type: 'circle',
      filter: ['all',
        ['==', '$type', 'Point'],
        ['==', 'active', 'true'],
        ['!=', 'meta', 'midpoint']
      ],
      paint: {
        'circle-radius': 28,
        'circle-color': COLORS.active,
        'circle-blur': 1,
        'circle-opacity': 0.6
      }
    },
    // Point glow - inner - active
    {
      id: 'gl-draw-point-glow-inner-active',
      type: 'circle',
      filter: ['all',
        ['==', '$type', 'Point'],
        ['==', 'active', 'true'],
        ['!=', 'meta', 'midpoint']
      ],
      paint: {
        'circle-radius': 18,
        'circle-color': COLORS.active,
        'circle-blur': 0.6,
        'circle-opacity': 1
      }
    },
    // Point - active
    {
      id: 'gl-draw-point-stroke-active',
      type: 'circle',
      filter: ['all',
        ['==', '$type', 'Point'],
        ['==', 'active', 'true'],
        ['!=', 'meta', 'midpoint']
      ],
      paint: {
        'circle-radius': 8,
        'circle-color': COLORS.white
      }
    },
    {
      id: 'gl-draw-point-active',
      type: 'circle',
      filter: ['all',
        ['==', '$type', 'Point'],
        ['!=', 'meta', 'midpoint'],
        ['==', 'active', 'true']
      ],
      paint: {
        'circle-radius': 6,
        'circle-color': COLORS.active
      }
    },
    // Point glow - outer - static
    {
      id: 'gl-draw-point-glow-outer-static',
      type: 'circle',
      filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': 24,
        'circle-color': getShapeColor(COLORS.stroke) as any,
        'circle-blur': 1,
        'circle-opacity': 0.5
      }
    },
    // Point glow - inner - static
    {
      id: 'gl-draw-point-glow-inner-static',
      type: 'circle',
      filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': 16,
        'circle-color': getShapeColor(COLORS.stroke) as any,
        'circle-blur': 0.6,
        'circle-opacity': 0.8
      }
    },
    // Point - static
    {
      id: 'gl-draw-point-static',
      type: 'circle',
      filter: ['all', ['==', 'mode', 'static'], ['==', '$type', 'Point']],
      paint: {
        'circle-radius': 5,
        'circle-color': getShapeColor(COLORS.stroke) as any
      }
    },

    // ===== VERTEX STYLES (for editing polygons/lines) =====

    // Vertex halos (white background circles)
    {
      id: 'gl-draw-polygon-and-line-vertex-stroke-inactive',
      type: 'circle',
      filter: ['all',
        ['==', 'meta', 'vertex'],
        ['==', '$type', 'Point'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'circle-radius': 6,
        'circle-color': COLORS.white
      }
    },
    // Vertex points
    {
      id: 'gl-draw-polygon-and-line-vertex-inactive',
      type: 'circle',
      filter: ['all',
        ['==', 'meta', 'vertex'],
        ['==', '$type', 'Point'],
        ['!=', 'mode', 'static']
      ],
      paint: {
        'circle-radius': 4,
        'circle-color': COLORS.vertex
      }
    },

    // ===== MIDPOINT STYLES (small dots between vertices for adding new points) =====

    {
      id: 'gl-draw-polygon-midpoint',
      type: 'circle',
      filter: ['all',
        ['==', '$type', 'Point'],
        ['==', 'meta', 'midpoint']
      ],
      paint: {
        'circle-radius': 3,
        'circle-color': COLORS.vertex
      }
    }
  ];
}
