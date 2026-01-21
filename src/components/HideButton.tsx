"use client";

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useHiddenPoisContext } from '@/contexts/HiddenPoisContext';
import { cn } from '@/lib/utils';

interface HideButtonProps {
  placeId: string;
  className?: string;
}

/**
 * HideButton - Icon-only toggle button for hiding/unhiding POIs
 * Appears in popup header next to close button
 *
 * - EyeOff icon (gray) when POI is visible (click to hide)
 * - Eye icon (highlighted) when POI is hidden (click to unhide)
 */
export function HideButton({ placeId, className }: HideButtonProps) {
  const { isHidden, toggleHidden } = useHiddenPoisContext();

  const hidden = isHidden(placeId);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent popup from closing
    toggleHidden(placeId);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        // Base styles - matches close button exactly
        "h-[27px] w-[27px] rounded-full flex items-center justify-center transition-all duration-200",
        // Normal state (not hidden) - white background with shadow, like close button
        !hidden && "bg-white/90 shadow-md text-zinc-500 hover:bg-gray-100 hover:scale-110",
        // Hidden state - subtle rose/red to indicate "this is hidden"
        hidden && "bg-rose-50 shadow-md text-rose-500 hover:bg-rose-100 hover:scale-110",
        className
      )}
      title={hidden ? "Unhide this location" : "Hide this location"}
    >
      {hidden ? (
        // POI is hidden - show Eye icon (click to unhide/reveal)
        <Eye className="h-3.5 w-3.5" />
      ) : (
        // POI is visible - show EyeOff icon (click to hide)
        <EyeOff className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
