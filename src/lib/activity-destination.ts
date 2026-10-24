import type { ActivityItem } from "@/hooks/useActivities";
import type { PlaceRequest } from "@/lib/go-to-place";

/**
 * Where clicking an Activity row leads. Every row leads somewhere, or says
 * plainly why it can't, so a click is never silently ignored.
 */
export type ActivityDestination =
  | { kind: "place"; request: PlaceRequest }
  | { kind: "lists" }
  | { kind: "trip"; tripId: string }
  | { kind: "message"; text: string };

export function activityDestination(item: ActivityItem): ActivityDestination {
  const { actionType } = item;

  if (item.target.type === "list" && item.type === "created") return { kind: "lists" };
  if (actionType === "deleted_list") return { kind: "message", text: "This list was deleted" };
  if (item.tripId) return { kind: "trip", tripId: item.tripId };
  if (item.isOrphaned) {
    return { kind: "message", text: actionType === "created_area" ? "This area was deleted" : "This point was deleted" };
  }

  // Drawn shapes carry no place id, only their spot
  const placeId = item.entityId;
  const hasSpot = item.lat != null && item.lon != null;
  if (!placeId && !hasSpot) return { kind: "message", text: "Nothing to show on the map for this one" };
  return { kind: "place", request: { placeId, lat: item.lat, lon: item.lon } };
}
