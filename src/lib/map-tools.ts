import { useSyncExternalStore } from "react";
import { SlidersHorizontal, Bookmark, Route, Plus, History, type LucideIcon } from "lucide-react";
import type { DrawMode } from "@/types/draw";

/**
 * The five map tools, in the desktop bar's order (the phone bar has its own
 * order). Both bars read this, so their icons, names and labels never drift.
 * `id` is the SheetContext sheet each one opens.
 */
export type MapToolId = "filters" | "lists" | "scouting" | "draw" | "activity";
export type MapTool = { id: MapToolId; name: string; icon: LucideIcon };

export const MAP_TOOLS: MapTool[] = [
  { id: "filters", name: "Filters", icon: SlidersHorizontal },
  { id: "lists", name: "Saved lists", icon: Bookmark },
  { id: "scouting", name: "Scouting trips", icon: Route },
  { id: "draw", name: "Add to map", icon: Plus },
  { id: "activity", name: "Activity", icon: History },
];

export const MAP_TOOL_BY_ID = Object.fromEntries(MAP_TOOLS.map((t) => [t.id, t])) as Record<MapToolId, MapTool>;

/** A tool button's accessible name; Activity says how many are unread. */
export function mapToolLabel(tool: MapTool, activityCount: number): string {
  return tool.id === "activity" && activityCount > 0 ? `${tool.name}, ${activityCount} unread` : tool.name;
}

/** The NEW button's accessible name. */
export function newListingsLabel(count: number): string {
  return count > 0 ? `New listings, ${count} waiting` : "New listings";
}

/** Placing a point or drawing a shape (not selecting or editing). */
export function isDrawingMode(mode: DrawMode): boolean {
  return mode === "draw_point" || mode === "draw_polygon" || mode === "draw_line_string";
}

/** Attribute on the bar's buttons (`data-map-tool`), so an open panel does not treat them as a click outside. */
export const MAP_TOOL_MARKER = "data-map-tool";

/**
 * "Drawing now" flag for the Draw button's teal colour.
 *
 * A tiny module store rather than SheetContext: every SheetContext change
 * re-renders the whole map, and this flips each time someone starts drawing.
 * MapDraw writes it as its mode changes; the bar reads it.
 */
let drawing = false;
const listeners = new Set<() => void>();

export function setDrawingNow(next: boolean) {
  if (drawing === next) return;
  drawing = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDrawingNow(): boolean {
  return useSyncExternalStore(subscribe, () => drawing, () => false);
}
