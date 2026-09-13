import type MapboxDraw from '@mapbox/mapbox-gl-draw';
import type { Map, Subscription } from 'maplibre-gl';
import type { Attachment } from './attachments';

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

// Shape metadata (name, color, tags, link, attachments, category, address, authorship) - stored separately from GeoJSON
export interface ShapeMetadata {
  name?: string;
  color?: string;
  tags?: string[];
  link?: string;
  attachments?: Attachment[];
  categoryId?: string;      // Reference to point category (only for Points, not Polygons)
  address?: string;         // Reverse-geocoded address (only for Points)
  createdBy?: string;       // Browser session ID or Supabase user ID (undefined for legacy shapes)
  addressCoords?: [number, number]; // Coordinates [lon, lat] used when address was fetched (for detecting moves)
}

// Shape comment
export interface ShapeComment {
  id: string;
  text: string;
  createdAt: string;
}

// Type augmentation for MapLibre GL to support MapboxDraw control
declare module 'maplibre-gl' {
  interface Map {
    addControl(control: MapboxDraw, position?: string): this;
    removeControl(control: MapboxDraw): this;
    // maplibre-gl 6 types `on`/`off` strictly against its own event list, which
    // does not know about MapboxDraw's events. MapboxDraw's own types already
    // map each event name to its payload, so reuse those rather than restating
    // them here.
    on<T extends keyof MapboxDraw.DrawEvents>(
      type: T,
      listener: (e: MapboxDraw.DrawEvents[T]) => void,
    ): Subscription;
    off<T extends keyof MapboxDraw.DrawEvents>(
      type: T,
      listener: (e: MapboxDraw.DrawEvents[T]) => void,
    ): this;
  }
}
