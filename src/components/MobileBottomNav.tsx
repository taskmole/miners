"use client";

import React from "react";
import { Funnel, Pencil, FolderOpen, MapPinned, Activity, MessageSquareText } from "lucide-react";
import { useSheetState } from "@/contexts/SheetContext";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onFeedbackOpen?: () => void;
}

export function MobileBottomNav({ onFeedbackOpen }: MobileBottomNavProps) {
  const isMobile = useMobile();
  const filters = useSheetState("filters");
  const draw = useSheetState("draw");
  const lists = useSheetState("lists");
  const scouting = useSheetState("scouting");
  const activity = useSheetState("activity");

  if (!isMobile) return null;

  const navItems = [
    { id: "filters", icon: Funnel, sheet: filters },
    { id: "draw", icon: Pencil, sheet: draw },
    { id: "lists", icon: FolderOpen, sheet: lists },
    { id: "scouting", icon: MapPinned, sheet: scouting },
    { id: "activity", icon: Activity, sheet: activity },
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
          {navItems.map(({ id, icon: Icon, sheet }) => (
            <button
              key={id}
              onClick={sheet.toggle}
              className={cn(
                "flex items-center justify-center w-10 h-10 rounded-full transition-all active:scale-90",
                sheet.isOpen
                  ? "bg-black/10 text-zinc-900"
                  : "text-zinc-700 active:text-zinc-900"
              )}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={1.5} />
            </button>
          ))}
        </div>
        {onFeedbackOpen && (
          <button
            onClick={onFeedbackOpen}
            className="flex items-center justify-center w-12 h-12 rounded-[20px] bg-zinc-900 shadow-lg active:scale-95 transition-transform"
            aria-label="Send feedback"
          >
            <MessageSquareText className="w-5 h-5 text-white" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
