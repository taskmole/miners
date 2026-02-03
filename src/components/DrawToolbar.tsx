"use client";

import React, { useState } from 'react';
import { useMapDraw } from '@/hooks/useMapDraw';
import {
  Scan,
  MapPin,
  Pencil,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSheetState } from '@/contexts/SheetContext';
import { MobilePanel } from '@/components/ui/mobile-panel';
import { useMobile } from '@/hooks/useMobile';
import type { DrawMode } from '@/types/draw';

type ToolbarButton = {
  mode: DrawMode;
  icon: React.ElementType;
  label: string;
};

// Drawing tool buttons - simplified to Area and Point only
const DRAW_BUTTONS: ToolbarButton[] = [
  { mode: 'draw_polygon', icon: Scan, label: 'Area' },
  { mode: 'draw_point', icon: MapPin, label: 'Point' },
];

export function DrawToolbar() {
  const { isOpen: isExpanded, open, close } = useSheetState("draw");
  const isMobile = useMobile();
  const [isDrawSectionExpanded, setIsDrawSectionExpanded] = useState(true);

  const {
    mode,
    features,
    changeMode,
  } = useMapDraw();

  const handleButtonClick = (button: ToolbarButton) => {
    changeMode(button.mode);
    close(); // Close the panel so the user can draw on the map
  };

  const isButtonActive = (button: ToolbarButton) => {
    return mode === button.mode;
  };

  const featureCount = features.features.length;
  const isDrawing = mode !== 'simple_select';

  // Collapsed button
  const collapsedButton = (
    <button
      onClick={open}
      className={cn(
        "glass w-11 h-11 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-all duration-200",
        isDrawing && "ring-2 ring-teal-500/50"
      )}
      title="Draw tools"
    >
      <Pencil className={cn(
        "w-5 h-5",
        isDrawing ? "text-teal-600" : "text-zinc-500"
      )} />
    </button>
  );

  return (
    <MobilePanel
      isOpen={isExpanded}
      onClose={close}
      desktopPosition={{ top: "192px", right: "24px" }}
      title="Draw"
      collapsedButton={collapsedButton}
      desktopWidth="w-72"
      zIndex={55}
      snapPoint="partial"
    >
      {/* Header - only on desktop */}
      {!isMobile && (
        <div className="p-4 flex items-center justify-between border-b border-white/10">
          <span className="text-sm font-bold text-zinc-900">Draw</span>
          <button
            onClick={close}
            className="w-7 h-7 rounded-md text-zinc-400 flex items-center justify-center hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

        {/* ===== DRAW SECTION ===== */}
        <div className="border-b border-white/10">
          {/* Header row - matches Sidebar section headers */}
          <button
            onClick={() => setIsDrawSectionExpanded(!isDrawSectionExpanded)}
            className="w-full p-4 flex items-center hover:bg-white/20 active:bg-white/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronRight className={cn(
                "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                isDrawSectionExpanded && "rotate-90"
              )} />
              <Pencil className="w-4 h-4 text-zinc-700" />
              <span className="text-sm font-bold text-zinc-900">Add new</span>
            </div>
          </button>

          {/* Expandable content */}
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: isDrawSectionExpanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="border-t border-white/10">
                {/* Draw mode buttons - 2 column grid */}
                <div className="p-3">
                  <div className="grid grid-cols-2 gap-2">
                    {DRAW_BUTTONS.map((button) => {
                      const isActive = isButtonActive(button);
                      return (
                        <button
                          key={button.label}
                          onClick={() => handleButtonClick(button)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl transition-colors cursor-pointer",
                            isActive
                              ? "bg-teal-500/20 text-teal-700"
                              : "hover:bg-white/30 text-zinc-700"
                          )}
                        >
                          <button.icon className={cn(
                            "w-5 h-5",
                            isActive ? "text-teal-600" : "text-zinc-400"
                          )} />
                          <span className={cn(
                            "text-xs font-medium",
                            isActive ? "text-teal-700" : "text-zinc-700"
                          )}>
                            {button.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hint text at bottom */}
        <div className="px-4 py-2.5 text-[10px] text-zinc-500">
          Click to draw. Double-click to finish.
        </div>
    </MobilePanel>
  );
}
