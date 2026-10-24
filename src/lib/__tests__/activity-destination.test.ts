import { describe, expect, it } from "vitest";
import { activityDestination } from "@/lib/activity-destination";
import type { ActivityItem } from "@/hooks/useActivities";

function row(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: "log-1",
    type: "added",
    userName: "Ana",
    action: "did",
    target: { name: "x", type: "poi" },
    time: "1h ago",
    createdAt: "2026-10-24T10:00:00Z",
    isRead: true,
    ...overrides,
  };
}

const PROPERTY_ID = "property-50.07550-14.43810-1a2b3c4d";

describe("activityDestination", () => {
  it("sends a place comment (id only, no spot) to that place", () => {
    expect(activityDestination(row({ type: "commented", entityId: "cafe-40.41270-3.70300" })))
      .toEqual({ kind: "place", request: { placeId: "cafe-40.41270-3.70300", lat: undefined, lon: undefined } });
  });

  it("sends a request decision to the listing, even in another city", () => {
    expect(activityDestination(row({ actionType: "rejected_request", entityId: PROPERTY_ID })))
      .toMatchObject({ kind: "place", request: { placeId: PROPERTY_ID } });
  });

  it("keeps the spot alongside the place id when the row has one", () => {
    expect(activityDestination(row({ actionType: "added_to_list", entityId: PROPERTY_ID, lat: 50.0755, lon: 14.4381 })))
      .toEqual({ kind: "place", request: { placeId: PROPERTY_ID, lat: 50.0755, lon: 14.4381 } });
  });

  it("sends a drawn point to its spot", () => {
    expect(activityDestination(row({ actionType: "created_point", shapeId: "9f1c2b3a-uuid", lat: 40.4, lon: -3.7 })))
      .toEqual({ kind: "place", request: { placeId: undefined, lat: 40.4, lon: -3.7 } });
  });

  it("sends a comment on a drawn shape to its spot", () => {
    expect(activityDestination(row({ actionType: "commented_on_shape", lat: 40.4, lon: -3.7 })))
      .toMatchObject({ kind: "place", request: { lat: 40.4, lon: -3.7 } });
  });

  it("says a deleted point or area is gone", () => {
    expect(activityDestination(row({ actionType: "created_point", shapeId: "s", lat: 1, lon: 1, isOrphaned: true })))
      .toEqual({ kind: "message", text: "This point was deleted" });
    expect(activityDestination(row({ actionType: "created_area", shapeId: "s", lat: 1, lon: 1, isOrphaned: true })))
      .toEqual({ kind: "message", text: "This area was deleted" });
  });

  it("opens Lists for a new list and explains a deleted one", () => {
    expect(activityDestination(row({ type: "created", target: { name: '"A"', type: "list" }, entityId: "uuid" })))
      .toEqual({ kind: "lists" });
    expect(activityDestination(row({ type: "deleted", actionType: "deleted_list", target: { name: '"A"', type: "list" } })))
      .toEqual({ kind: "message", text: "This list was deleted" });
  });

  it("opens the trip for scouting trip rows", () => {
    expect(activityDestination(row({ actionType: "approved_scouting_trip", tripId: "trip-1" })))
      .toEqual({ kind: "trip", tripId: "trip-1" });
  });

  it("explains rows with nothing on the map", () => {
    expect(activityDestination(row({ actionType: "added_to_team", target: { name: "x", type: "list" } })))
      .toEqual({ kind: "message", text: "Nothing to show on the map for this one" });
  });
});
