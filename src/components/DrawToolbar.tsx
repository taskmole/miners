"use client";

import React from 'react';
import { useMapDraw } from '@/hooks/useMapDraw';
import {
  Pentagon,
  Minus,
  MapPin,
  MousePointer,
  Trash2,
  XCircle,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DrawMode, DrawAction } from '@/types/draw';

type ToolbarButton = {
  mode?: DrawMode;
  action?: DrawAction;
  icon: React.ElementType;
  label: string;
  separator?: boolean;
};

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { mode: 'draw_polygon', icon: Pentagon, label: 'Draw Polygon' },
  { mode: 'draw_line_string', icon: Minus, label: 'Draw Line' },
  { mode: 'draw_point', icon: MapPin, label: 'Draw Point' },
  { separator: true, mode: 'simple_select', icon: MousePointer, label: 'Edit' },
  { action: 'delete', icon: Trash2, label: 'Delete Selected' },
  { action: 'clear', icon: XCircle, label: 'Clear All' },
  { action: 'export', icon: Download, label: 'Export GeoJSON' },
];

export function DrawToolbar() {
  const {
    mode,
    selectedFeatureIds,
    features,
    changeMode,
    deleteSelected,
    clearAll,
    exportGeoJSON,
  } = useMapDraw();

  const handleButtonClick = (button: ToolbarButton) => {
    if (button.mode) {
      changeMode(button.mode);
    } else if (button.action) {
      switch (button.action) {
        case 'delete':
          deleteSelected();
          break;
        case 'clear':
          if (confirm('Are you sure you want to clear all drawn features?')) {
            clearAll();
          }
          break;
        case 'export':
          exportGeoJSON();
          break;
      }
    }
  };

  const isButtonActive = (button: ToolbarButton) => {
    if (button.mode) {
      return mode === button.mode;
    }
    return false;
  };

  const isButtonDisabled = (button: ToolbarButton) => {
    if (button.action === 'delete') {
      return selectedFeatureIds.length === 0;
    }
    if (button.action === 'clear' || button.action === 'export') {
      return features.features.length === 0;
    }
    return false;
  };

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-top-4 duration-300">
      <div
        className="glass rounded-2xl border border-white/40 p-2 flex items-center gap-1 shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
        }}
      >
        {TOOLBAR_BUTTONS.map((button, index) => (
          <React.Fragment key={index}>
            {button.separator && index > 0 && (
              <div className="w-px h-8 bg-zinc-300 mx-1" />
            )}
            <button
              onClick={() => handleButtonClick(button)}
              disabled={isButtonDisabled(button)}
              className={cn(
                'relative flex items-center justify-center w-10 h-10 rounded-xl',
                'transition-all duration-200',
                'hover:scale-105 active:scale-95',
                'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100',
                isButtonActive(button)
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-white/30 hover:bg-white/50 text-zinc-700'
              )}
              title={button.label}
            >
              <button.icon className="w-5 h-5" />
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Feature counter */}
      {features.features.length > 0 && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-zinc-600 bg-white/90 px-2 py-1 rounded-full">
          {features.features.length} feature{features.features.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
