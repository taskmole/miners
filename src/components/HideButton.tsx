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
        // Base styles - matches close button style
        "w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200",
        // Normal state (not hidden) - gray, subtle
        !hidden && "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100",
        // Hidden state - highlighted to show "this is hidden"
        hidden && "text-amber-600 bg-amber-50 hover:bg-amber-100",
        className
      )}
      title={hidden ? "Unhide this location" : "Hide this location"}
    >
      {hidden ? (
        // POI is hidden - show Eye icon (click to unhide/reveal)
        <Eye className="w-4 h-4" />
      ) : (
        // POI is visible - show EyeOff icon (click to hide)
        <EyeOff className="w-4 h-4" />
      )}
    </button>
  );
}
