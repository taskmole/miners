"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMapDraw } from '@/hooks/useMapDraw';
import {
  Pentagon,
  MapPin,
  Pencil,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DrawMode } from '@/types/draw';

type ToolbarButton = {
  mode: DrawMode;
  icon: React.ElementType;
  label: string;
};

// Drawing tool buttons - simplified to Area and Point only
const DRAW_BUTTONS: ToolbarButton[] = [
  { mode: 'draw_polygon', icon: Pentagon, label: 'Area' },
  { mode: 'draw_point', icon: MapPin, label: 'Point' },
];

export function DrawToolbar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDrawSectionExpanded, setIsDrawSectionExpanded] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    mode,
    features,
    changeMode,
  } = useMapDraw();

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleButtonClick = (button: ToolbarButton) => {
    changeMode(button.mode);
  };

  const isButtonActive = (button: ToolbarButton) => {
    return mode === button.mode;
  };

  const featureCount = features.features.length;
  const isDrawing = mode !== 'simple_select';

  // Render content based on state
  const content = isExpanded ? (
    // Expanded panel - matches Sidebar styling
    <div ref={panelRef} className="fixed top-[168px] right-6 z-[55]">
      <div className="glass rounded-2xl overflow-hidden border border-white/40 w-72 animate-in fade-in slide-in-from-top-2 duration-200">

        {/* ===== DRAW SECTION ===== */}
        <div className="border-b border-white/10">
          {/* Header row - matches Sidebar section headers */}
          <button
            onClick={() => setIsDrawSectionExpanded(!isDrawSectionExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-white/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChevronRight className={cn(
                "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                isDrawSectionExpanded && "rotate-90"
              )} />
              <Pencil className="w-4 h-4 text-zinc-700" />
              <span className="text-sm font-bold text-zinc-900">Draw</span>
            </div>
            {featureCount > 0 && (
              <span className="px-2 py-0.5 bg-teal-100/50 text-teal-700 text-[10px] font-bold rounded-full">
                {featureCount} shape{featureCount !== 1 ? 's' : ''}
              </span>
            )}
            {isDrawing && featureCount === 0 && (
              <span className="px-2 py-0.5 bg-amber-100/50 text-amber-700 text-[10px] font-bold rounded-full">
                Drawing
              </span>
            )}
          </button>

          {/* Expandable content */}
          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: isDrawSectionExpanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div className="border-t border-white/10">
                {/* Draw mode buttons */}
                <div className="p-3 space-y-2">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide px-2">
                    Shape
                  </span>
                  <div className="space-y-1">
                    {DRAW_BUTTONS.map((button) => {
                      const isActive = isButtonActive(button);
                      return (
                        <button
                          key={button.label}
                          onClick={() => handleButtonClick(button)}
                          className={cn(
                            "w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors cursor-pointer",
                            isActive
                              ? "bg-teal-500/20 text-teal-700"
                              : "hover:bg-white/30 text-zinc-700"
                          )}
                        >
                          <button.icon className={cn(
                            "w-4 h-4",
                            isActive ? "text-teal-600" : "text-zinc-400"
                          )} />
                          <span className={cn(
                            "text-sm font-medium",
                            isActive ? "text-teal-700" : "text-zinc-700"
                          )}>
                            {button.label}
                          </span>
                          {isActive && (
                            <span className="ml-auto px-1.5 py-0.5 bg-teal-500/20 text-teal-600 text-[9px] font-bold rounded">
                              Active
                            </span>
                          )}
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
      </div>
    </div>
  ) : (
    // Collapsed state - matches Sidebar collapsed button
    <div ref={panelRef} className="fixed top-[168px] right-6 z-40">
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          "glass w-10 h-10 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 transition-all duration-200",
          isDrawing && "ring-2 ring-teal-500/50"
        )}
        title="Draw tools"
      >
        <Pencil className={cn(
          "w-5 h-5",
          isDrawing ? "text-teal-600" : "text-zinc-700"
        )} />
      </button>
    </div>
  );

  // Portal to document.body
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return null;
}
