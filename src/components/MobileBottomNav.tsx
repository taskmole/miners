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

  // Design system: 56px height, glass background, 24px icons, 11px labels
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-t border-zinc-200 safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {navItems.map(({ id, label, icon: Icon, sheet }) => (
          <button
            key={id}
            onClick={sheet.toggle}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
              sheet.isOpen
                ? "text-blue-600"
                : "text-zinc-500 active:text-zinc-900"
            )}
          >
            <Icon className="w-6 h-6" />
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
