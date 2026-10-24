"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSheet } from "@/contexts/SheetContext";
import { useMobile } from "@/hooks/useMobile";
import { MAP_TOOLS, MAP_TOOL_MARKER, mapToolLabel, newListingsLabel, useDrawingNow } from "@/lib/map-tools";

// One cell plus the gap to the next (.mt-cell height + .mt-bar gap in
// globals.css): how far the white tile slides per tool.
const STEP = 28 + 6;
// .mt-tip's height, to centre the hover name on the button it names.
const TIP_HEIGHT = 28;

interface MapToolRailProps {
  /** Something unread in Activity, until "Mark all read". */
  activityGlow: boolean;
  activityCount: number;
  /** Unread listings in the latest batch, until every one is read. */
  newGlow: boolean;
  newCount: number;
  onNewListingsOpen: () => void;
  isNewListingsOpen: boolean;
}

/**
 * The map tools on desktop: one frosted bar with the five tools, and the
 * black NEW tile under it, as wide as the bar. A white tile slides to the
 * open tool; its panel opens beside the bar. Phones get MobileBottomNav.
 */
export function MapToolRail({
  activityGlow,
  activityCount,
  newGlow,
  newCount,
  onNewListingsOpen,
  isNewListingsOpen,
}: MapToolRailProps) {
  const isMobile = useMobile();
  const { activeSheet, openSheet, closeSheet } = useSheet();
  const drawing = useDrawingNow();
  const openIndex = MAP_TOOLS.findIndex((t) => t.id === activeSheet);
  const tip = useHoverName(activeSheet !== null || isNewListingsOpen);

  if (isMobile) return null;

  return (
    <div className="mt-rail mt-font">
      <div className="mt-bar glass" role="toolbar" aria-label="Map tools" aria-orientation="vertical">
        {/* Hidden when nothing, or something other than a tool (a place card), is open. */}
        <div
          className="mt-hl"
          aria-hidden
          style={{ transform: `translateY(${Math.max(openIndex, 0) * STEP}px)`, opacity: openIndex >= 0 ? 1 : 0 }}
        />
        {MAP_TOOLS.map((tool) => {
          const isOpen = activeSheet === tool.id;
          const glow = tool.id === "activity" && activityGlow;
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              {...{ [MAP_TOOL_MARKER]: "" }}
              aria-label={mapToolLabel(tool, activityCount)}
              aria-expanded={isOpen}
              onClick={() => (isOpen ? closeSheet() : openSheet(tool.id))}
              className={cn(
                "mt-cell",
                isOpen && "is-on",
                tool.id === "draw" && drawing && "is-drawing",
                glow && "mt-lit is-light",
              )}
              {...tip.handlers(tool.name)}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden />
            </button>
          );
        })}
      </div>

      {/* No tool marker on purpose: opening the listings window also closes an open panel. */}
      <button
        type="button"
        onClick={onNewListingsOpen}
        aria-label={newListingsLabel(newCount)}
        aria-haspopup="dialog"
        className={cn("mt-new", newGlow && "mt-lit")}
        {...tip.handlers("New listings")}
      >
        NEW
      </button>

      {tip.shown && (
        <div className="mt-tip" style={{ transform: `translateY(${tip.shown.top}px)` }} aria-hidden>
          {tip.shown.name}
        </div>
      )}
    </div>
  );
}

/**
 * Hover names: the first one waits 450ms, so passing the mouse over the bar
 * does not flash it; after that it follows from cell to cell at once. Mouse
 * and keyboard focus only, never an iPad tap, and never while a panel is open.
 */
function useHoverName(disabled: boolean) {
  const [shown, setShown] = useState<{ name: string; top: number } | null>(null);
  const warm = useRef(false);
  const timers = useRef<{ show?: number; hide?: number; cool?: number }>({});

  useEffect(() => {
    if (disabled) setShown(null);
  }, [disabled]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      window.clearTimeout(t.show);
      window.clearTimeout(t.hide);
      window.clearTimeout(t.cool);
    };
  }, []);

  const show = (name: string, top: number, now: boolean) => {
    if (disabled) return;
    const t = timers.current;
    window.clearTimeout(t.hide);
    window.clearTimeout(t.cool);
    window.clearTimeout(t.show);
    if (now || warm.current) {
      warm.current = true;
      setShown({ name, top });
      return;
    }
    t.show = window.setTimeout(() => {
      warm.current = true;
      setShown({ name, top });
    }, 450);
  };

  const hide = () => {
    const t = timers.current;
    window.clearTimeout(t.show);
    t.hide = window.setTimeout(() => setShown(null), 60);
    t.cool = window.setTimeout(() => { warm.current = false; }, 600);
  };

  // Centred on the button it names, read from the button itself.
  const topOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return r.top + (r.height - TIP_HEIGHT) / 2;
  };

  const handlers = (name: string) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => { if (e.pointerType === "mouse") show(name, topOf(e.currentTarget), false); },
    onPointerLeave: hide,
    onFocus: (e: React.FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(":focus-visible")) show(name, topOf(e.currentTarget), true); },
    onBlur: hide,
  });

  return { shown: disabled ? null : shown, handlers };
}
