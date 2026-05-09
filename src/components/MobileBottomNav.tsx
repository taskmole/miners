"use client";

import React from "react";
import { Funnel, Pencil, FolderOpen, MapPinned, Activity } from "lucide-react";
import { useSheetState } from "@/contexts/SheetContext";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

// Mobile bottom navigation bar - shows only on mobile to open panels
export function MobileBottomNav() {
  const isMobile = useMobile();
  const filters = useSheetState("filters");
  const draw = useSheetState("draw");
  const lists = useSheetState("lists");
  const scouting = useSheetState("scouting");
  const activity = useSheetState("activity");

  // Only show on mobile
  if (!isMobile) return null;

  const navItems = [
    { id: "filters", label: "Filters", icon: Funnel, sheet: filters },
    { id: "draw", label: "Draw", icon: Pencil, sheet: draw },
    { id: "lists", label: "Lists", icon: FolderOpen, sheet: lists },
    { id: "scouting", label: "Trips", icon: MapPinned, sheet: scouting },
    { id: "activity", label: "Activity", icon: Activity, sheet: activity },
  ];

  return (
    <div className="fixed bottom-4 left-0 right-0 z-50 safe-area-pb flex justify-center">
      <div className="flex items-center gap-2 px-2 py-2">
        {navItems.map(({ id, icon: Icon, sheet }) => (
          <button
            key={id}
            onClick={sheet.toggle}
            className={cn(
              "flex items-center justify-center w-14 h-14 rounded-[22px] transition-all active:scale-95",
              sheet.isOpen ? "text-white" : "text-white/90"
            )}
            style={{
              background: sheet.isOpen
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(24px) saturate(180%)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <Icon className="w-6 h-6" strokeWidth={sheet.isOpen ? 2.5 : 2} />
          </button>
        ))}
      </div>
    </div>
  );
}
