"use client";

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useHiddenPoisContext } from '@/contexts/HiddenPoisContext';
import { cn } from '@/lib/utils';

interface HideButtonProps {
  placeId: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * HideButton - Icon-only toggle button for hiding/unhiding POIs
 * Appears in popup header next to close button
 *
 * - EyeOff icon (gray) when POI is visible (click to hide)
 * - Eye icon (highlighted) when POI is hidden (click to unhide)
 */
export function HideButton({ placeId, className, style }: HideButtonProps) {
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
        "flex items-center justify-center",
        !hidden && "text-zinc-500",
        hidden && "text-rose-500",
        className
      )}
      title={hidden ? "Unhide this location" : "Hide this location"}
      style={style}
    >
      {hidden ? (
        // POI is hidden - show Eye icon (click to unhide/reveal)
        <Eye className="h-5 w-5" />
      ) : (
        // POI is visible - show EyeOff icon (click to hide)
        <EyeOff className="h-5 w-5" />
      )}
    </button>
  );
}
