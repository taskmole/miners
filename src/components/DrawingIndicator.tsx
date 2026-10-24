"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { useMapDraw } from '@/hooks/useMapDraw';
import { HousePlus, VectorSquare } from 'lucide-react';
import { useMobile } from '@/hooks/useMobile';
import { isDrawingMode } from '@/lib/map-tools';

/**
 * Shows a persistent indicator at top center when drawing is active
 * Disappears when user returns to selection mode
 */
export function DrawingIndicator() {
  const { mode } = useMapDraw();
  const isMobile = useMobile();

  if (!isDrawingMode(mode)) return null;

  // What to do next, in the words of the Draw panel's two tiles.
  const { label, Icon } = mode === 'draw_point'
    ? { label: isMobile ? 'Tap the map to add a place' : 'Click the map to add a place', Icon: HousePlus }
    : { label: isMobile ? 'Tap corners, double-tap to finish' : 'Click corners, double-click to finish', Icon: VectorSquare };

  const indicator = (
    // Desktop: 36px tall, level with the city tray and the tool bar (24px
    // down). Phones: 48px tall, under the city and search tray (which moves
    // down with the notch).
    <div className="fixed top-[calc(80px+env(safe-area-inset-top,0px))] sm:top-6 left-1/2 -translate-x-1/2 z-[9998] pointer-events-none">
      {/* On narrow desktops it stays clear of the city tray (about 180px in from each side) and cuts its words short. */}
      <div className="glass flex items-center gap-2 h-12 px-4 rounded-[16px] sm:h-9 sm:px-3 sm:rounded-[12px] sm:max-w-[calc(100vw-372px)] animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Pulsing dot */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
        </span>
        <Icon className="w-4 h-4 shrink-0 text-teal-600" />
        <span className="mt-font text-sm font-semibold text-zinc-900 truncate">{label}</span>
      </div>
    </div>
  );

  // Render via portal to escape any stacking contexts
  if (typeof document !== 'undefined') {
    return createPortal(indicator, document.body);
  }
  return null;
}
