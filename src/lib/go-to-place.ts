/**
 * Ask the app to take the map to a place, from anywhere (Activity, Lists,
 * Scouting).
 *
 * page.tsx handles it the same way as a shared link: it works out which city
 * the place is in, switches to it if needed (or explains there is no access),
 * waits for that city's data, then flies there and opens the card. A place
 * that is gone still gets flown to, followed by "no longer on the map".
 */

/** A place id, a bare spot (a drawn shape has no place id), or both. */
export interface PlaceRequest {
  placeId?: string;
  lat?: number;
  lon?: number;
}

export const GO_TO_PLACE_EVENT = "go-to-place";

export function goToPlace(request: PlaceRequest): void {
  window.dispatchEvent(new CustomEvent<PlaceRequest>(GO_TO_PLACE_EVENT, { detail: request }));
}
