"use client";

import React from "react";
import { useSheet } from "@/contexts/SheetContext";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import { MAP_TOOL_BY_ID, mapToolLabel, newListingsLabel, type MapToolId } from "@/lib/map-tools";

// The phone bar keeps the order it has always had.
const PHONE_ORDER: MapToolId[] = ["filters", "draw", "lists", "scouting", "activity"];
const PHONE_TOOLS = PHONE_ORDER.map((id) => MAP_TOOL_BY_ID[id]);

interface MobileBottomNavProps {
  onNewListingsOpen: () => void;
  /** Something unread in Activity, until "Mark all read". */
  activityGlow: boolean;
  activityCount: number;
  /** Unread listings in the latest batch, until every one is read. */
  newGlow: boolean;
  newCount: number;
}

export function MobileBottomNav({
  onNewListingsOpen,
  activityGlow,
  activityCount,
  newGlow,
  newCount,
}: MobileBottomNavProps) {
  const isMobile = useMobile();
  const { activeSheet, openSheet, closeSheet } = useSheet();

  if (!isMobile) return null;

  return (
    <div className="fixed bottom-4 left-0 right-0 z-50 safe-area-pb flex justify-center px-5">
      <div className="flex items-center gap-2">
        {/* The desktop tool bar laid on its side: a tray of 40px buttons. */}
        <div className="mt-tray flex items-center gap-2">
          {PHONE_TOOLS.map((tool) => {
            const { id, icon: Icon } = tool;
            const isOpen = activeSheet === id;
            const glow = id === "activity" && activityGlow;
            return (
              <button
                key={id}
                type="button"
                onClick={() => (isOpen ? closeSheet() : openSheet(id))}
                aria-label={mapToolLabel(tool, activityCount)}
                aria-expanded={isOpen}
                className={cn(
                  "relative flex items-center justify-center w-10 h-10 rounded-[12px] transition-all active:scale-90",
                  // Open: the white tile, as on desktop.
                  isOpen
                    ? "bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                    : "text-zinc-700 active:text-zinc-900",
                  glow && "mt-lit is-light",
                )}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={1.5} aria-hidden />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onNewListingsOpen}
          className={cn(
            // A 48px tile, as tall as the tray beside it.
            "relative flex items-center justify-center w-12 h-12 rounded-[16px] bg-zinc-900 shadow-lg active:scale-95 transition-transform",
            newGlow && "mt-lit",
          )}
          aria-label={newListingsLabel(newCount)}
          aria-haspopup="dialog"
        >
          <span className="mt-font text-[11px] font-extrabold text-white tracking-tight">NEW</span>
        </button>
      </div>
    </div>
  );
}
