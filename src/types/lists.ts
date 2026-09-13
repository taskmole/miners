// Types for the "Add to list" feature - localStorage based

// Place types that can be added to lists
export type PlaceType =
  | 'cafe'
  | 'eu_coffee_trip'
  | 'regular_cafe'
  | 'property'
  | 'transit'
  | 'office'
  | 'shopping'
  | 'high_street'
  | 'dorm'
  | 'university'
  | 'gym';

// Visit log for tracking location visits (per PRD Section 3.8)
export interface VisitLog {
  visitDate?: string;           // YYYY-MM-DD
  visitTime?: string;           // HH:MM
  weather?: string;             // Manual text entry
  trafficObservation?: string;  // Manual text entry
  comments?: string;            // Freeform notes
}

// An item within a list (a saved place)
export interface ListItem {
  id: string;              // UUID for this list entry
  placeId: string;         // Generated from coordinates + type
  placeType: PlaceType;
  placeName: string;
  placeAddress: string;
  lat: number;
  lon: number;
  addedAt: string;         // ISO timestamp
}

// Drawn area item (polygon or line from drawing tool)
export interface DrawnAreaItem {
  id: string;              // UUID for this list entry
  areaId: string;          // References the drawn feature ID
  areaType: 'polygon' | 'line';
  name: string;            // User-given name or auto-generated
  addedAt: string;         // ISO timestamp
}

/**
 * Whose list this is, from the server's point of view.
 *
 *   own       the caller created it
 *   team      shared with a team the caller is in
 *   readonly  somebody else's, visible because the caller approves in a city
 *             that person holds a grant in
 *
 * Optional, and a missing value means writable. That is safe: localStorage
 * only ever holds the caller's own lists, so anything without a tag came from
 * there.
 */
export type ListAccess = 'own' | 'team' | 'readonly';

// A user's list containing saved places and areas
export interface LocationList {
  id: string;              // UUID
  name: string;            // User-provided name
  createdAt: string;       // ISO timestamp
  createdBy?: string;      // User ID of creator (from server)
  teamId?: string;         // Team ID if shared with a team
  access?: ListAccess;     // Whose list this is (server-set; absent = writable)
  items: ListItem[];
  drawnAreas: DrawnAreaItem[];
  visitPlan?: VisitLog;    // Visit planning at list level
}

// Full state stored in localStorage
export interface ListsState {
  version: number;         // For future data migrations
  lists: LocationList[];
}

// Place info passed to AddToListButton component
export interface PlaceInfo {
  placeId: string;
  placeType: PlaceType;
  placeName: string;
  placeAddress: string;
  lat: number;
  lon: number;
}
