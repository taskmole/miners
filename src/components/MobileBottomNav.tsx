"use client";

import React from "react";
import { Funnel, Pencil, FolderOpen, MapPinned, Activity } from "lucide-react";
import { useSheetState } from "@/contexts/SheetContext";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onNewListingsOpen?: () => void;
  newListingsCount?: number;
  activityCount?: number;
}

export function MobileBottomNav({ onNewListingsOpen, newListingsCount = 0, activityCount = 0 }: MobileBottomNavProps) {
  const isMobile = useMobile();
  const filters = useSheetState("filters");
  const draw = useSheetState("draw");
  const lists = useSheetState("lists");
  const scouting = useSheetState("scouting");
  const activity = useSheetState("activity");

  if (!isMobile) return null;

  const navItems = [
    { id: "filters", icon: Funnel, sheet: filters, badge: 0 },
    { id: "draw", icon: Pencil, sheet: draw, badge: 0 },
    { id: "lists", icon: FolderOpen, sheet: lists, badge: 0 },
    { id: "scouting", icon: MapPinned, sheet: scouting, badge: 0 },
    { id: "activity", icon: Activity, sheet: activity, badge: activityCount },
  ];

  return (
    <div className="fixed bottom-4 left-0 right-0 z-50 safe-area-pb flex justify-center px-5">
      <div className="flex items-center gap-2">
        <div
          className="flex items-center rounded-full px-2 py-1 gap-2"
          style={{
            background: "rgba(255, 255, 255, 0.68)",
            backdropFilter: "blur(36px) saturate(180%)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
          }}
        >
          {navItems.map(({ id, icon: Icon, sheet, badge }) => (
            <button
              key={id}
              onClick={sheet.toggle}
              className={cn(
                "relative flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-90",
                sheet.isOpen
                  ? "bg-black/10 text-zinc-900"
                  : "text-zinc-700 active:text-zinc-900"
              )}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={1.5} />
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
        {onNewListingsOpen && (
          <button
            onClick={onNewListingsOpen}
            className="relative flex items-center justify-center w-12 h-12 rounded-[20px] bg-zinc-900 shadow-lg active:scale-95 transition-transform"
            aria-label="New listings"
          >
            <span className="text-[11px] font-extrabold text-white tracking-tight">NEW</span>
            {newListingsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}
