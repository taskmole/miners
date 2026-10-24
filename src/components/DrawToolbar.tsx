"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { useMapDraw } from '@/hooks/useMapDraw';
import { HousePlus, VectorSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSheetState } from '@/contexts/SheetContext';
import { MobilePanel, MobilePanelHeader } from '@/components/ui/mobile-panel';
import { useMobile } from '@/hooks/useMobile';
import type { DrawMode } from '@/types/draw';

type ToolbarButton = {
  mode: DrawMode;
  icon: React.ElementType;
  label: string;
};

// Add place first: it is what people come here for most.
const DRAW_BUTTONS: ToolbarButton[] = [
  { mode: 'draw_point', icon: HousePlus, label: 'Add place' },
  { mode: 'draw_polygon', icon: VectorSquare, label: 'Draw area' },
];

export function DrawToolbar() {
  const { isOpen: isExpanded, close } = useSheetState("draw");
  const isMobile = useMobile();
  const { mode, changeMode } = useMapDraw();

  const handleButtonClick = (button: ToolbarButton) => {
    changeMode(button.mode);
    close(); // Close the panel so the user can draw on the map
  };

  // Render via portal to escape the z-0 stacking context in page.tsx
  const panel = (
    <MobilePanel
      isOpen={isExpanded}
      onClose={close}
      title="Add to map"
      snapPoint="partial"
    >
      <MobilePanelHeader title="Add to map" onClose={close} />

      <div className={cn("grid grid-cols-2 gap-2", isMobile ? "px-4" : "px-2")}>
        {DRAW_BUTTONS.map((button) => (
          <button
            key={button.mode}
            type="button"
            onClick={() => handleButtonClick(button)}
            className={cn("mt-tool", mode === button.mode && "is-on")}
            aria-pressed={mode === button.mode}
          >
            <button.icon strokeWidth={1.75} aria-hidden />
            {button.label}
          </button>
        ))}
      </div>

      <p className="mt-hint">
        {isMobile
          ? "Tap to draw. Double-tap to finish. Long-press to adjust."
          : "Click to start drawing. Double-click to finish. Right-click to adjust."}
      </p>
    </MobilePanel>
  );

  // Portal to document.body to escape z-0 stacking context
  if (typeof document !== 'undefined') {
    return createPortal(panel, document.body);
  }
  return null;
}
