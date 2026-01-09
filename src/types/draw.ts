import type MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Map } from 'maplibre-gl';

// Drawing modes
export type DrawMode =
  | 'draw_polygon'
  | 'draw_line_string'
  | 'draw_point'
  | 'simple_select'
  | 'direct_select';

// Drawn feature type
export type DrawnFeature = GeoJSON.Feature<GeoJSON.Geometry>;

// Draw state
export interface DrawState {
  mode: DrawMode;
  features: GeoJSON.FeatureCollection;
  selectedFeatureIds: string[];
}

// Draw action types
export type DrawAction = 'delete' | 'clear' | 'export';

// Type augmentation for MapLibre GL to support MapboxDraw control
declare module 'maplibre-gl' {
  interface Map {
    addControl(control: MapboxDraw, position?: string): this;
    removeControl(control: MapboxDraw): this;
  }
}
