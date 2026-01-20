"use client";

import React from 'react';
import { createPortal } from 'react-dom';
import { useMapDraw } from '@/hooks/useMapDraw';
import { Pentagon, MapPin } from 'lucide-react';

/**
 * Shows a persistent indicator at top center when drawing is active
 * Disappears when user returns to selection mode
 */
export function DrawingIndicator() {
  const { mode } = useMapDraw();

  // Only show when actively drawing
  const isDrawing = mode === 'draw_polygon' || mode === 'draw_point' || mode === 'draw_line_string';

  if (!isDrawing) return null;

  // Determine label and icon based on mode
  const config = {
    draw_polygon: { label: 'Drawing area', Icon: Pentagon },
    draw_point: { label: 'Drawing point', Icon: MapPin },
    draw_line_string: { label: 'Drawing line', Icon: Pentagon },
  }[mode] || { label: 'Drawing', Icon: Pentagon };

  const { label, Icon } = config;

  const indicator = (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9998] pointer-events-none">
      <div className="glass flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/40 animate-in fade-in slide-in-from-top-2 duration-200">
        {/* Pulsing dot */}
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-500 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
        </span>
        <Icon className="w-4 h-4 text-teal-600" />
        <span className="text-sm font-semibold text-zinc-900">{label}</span>
      </div>
    </div>
  );

  // Render via portal to escape any stacking contexts
  if (typeof document !== 'undefined') {
    return createPortal(indicator, document.body);
  }
  return null;
}
