"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileDevice } from "@/hooks/useMobile";

interface BottomSheetProps {
  // Whether the sheet is open
  isOpen: boolean;
  // Called when user wants to close (swipe down, tap backdrop, etc.)
  onClose: () => void;
  // Content to render inside the sheet
  children: React.ReactNode;
  // Optional class name for the sheet content area
  className?: string;
  // Title shown at top of sheet (optional)
  title?: string;
  // Whether to show backdrop overlay (default: true)
  showBackdrop?: boolean;
  // Snap point as percentage of viewport height (default: 65 for partial, 95 for full)
  snapPoint?: "partial" | "full";
  // Whether to show the default close button (default: true)
  showCloseButton?: boolean;
  // Extra buttons to render next to close button (e.g., hide button)
  headerButtons?: React.ReactNode;
}

// Threshold for swipe-to-dismiss (pixels)
const SWIPE_THRESHOLD = 100;

export function BottomSheet({
  isOpen,
  onClose,
  children,
  className,
  title,
  showBackdrop = true,
  snapPoint = "partial",
  showCloseButton = true,
  headerButtons,
}: BottomSheetProps) {
  const { isMobile, isMobileLandscape } = useMobileDevice();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const [mounted, setMounted] = useState(false);

  // Portal mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset drag state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only start drag if touching the drag handle area (top 48px)
    const touch = e.touches[0];
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return;

    const touchY = touch.clientY - rect.top;
    if (touchY < 48) {
      dragStartY.current = touch.clientY;
      setIsDragging(true);
    }
  }, []);

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const delta = touch.clientY - dragStartY.current;

      // Only allow dragging down (positive delta)
      if (delta > 0) {
        setDragOffset(delta);
      }
    },
    [isDragging]
  );

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    // If dragged past threshold, close the sheet
    if (dragOffset > SWIPE_THRESHOLD) {
      onClose();
    }

    // Reset drag state
    setDragOffset(0);
    setIsDragging(false);
  }, [isDragging, dragOffset, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if clicking the backdrop itself, not the sheet
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // On desktop, render with animation
  if (!isMobile) {
    if (!isOpen) return null;
    return (
      <div className="animate-in fade-in-0 zoom-in-95 duration-200">
        {children}
      </div>
    );
  }

  // Don't render on server or before mount
  if (!mounted) return null;

  // Sheet height class — uses dvh (dynamic viewport height) with vh fallback.
  // dvh accounts for iOS Safari browser chrome so the sheet always fits the visible area.
  const sheetHeightClass = snapPoint === "full" ? "sheet-height-full" : "sheet-height-partial";

  // In landscape, use side sheet from left
  const isLandscapeMode = isMobileLandscape;

  const sheetContent = (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex",
        isLandscapeMode ? "flex-row" : "flex-col justify-end",
        isOpen ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Backdrop overlay */}
      {showBackdrop && (
        <div
          className={cn(
            "absolute inset-0 bg-black/40 transition-opacity duration-200",
            isOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={handleBackdropClick}
        />
      )}

      {/* Sheet container */}
      <div
        ref={sheetRef}
        className={cn(
          "relative z-10 flex flex-col bg-white rounded-t-2xl shadow-2xl",
          "transition-transform duration-200 ease-out",
          isLandscapeMode
            ? "rounded-t-none rounded-r-2xl h-full w-[80vw] max-w-md"
            : "w-full",
          !isLandscapeMode && sheetHeightClass,
          isDragging && "transition-none",
          className
        )}
        style={{
          transform: isLandscapeMode
            ? isOpen
              ? "translateX(0)"
              : "translateX(-100%)"
            : isOpen
            ? `translateY(${dragOffset}px)`
            : "translateY(100%)",
          willChange: "transform",
        }}
      >
        {/* Header buttons - top-right, with safe area padding */}
        {(showCloseButton || headerButtons) && (
          <div
            className="absolute right-3 z-50 flex items-center gap-2"
            style={{ top: "calc(8px + env(safe-area-inset-top, 0px))" }}
          >
            {headerButtons}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/90 shadow-md text-zinc-500 hover:bg-gray-100 hover:scale-105 transition-all duration-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Drag handle - floats over content with semi-transparent background */}
        {/* Touch handlers are ONLY on the drag handle, not the entire sheet.
            React's onTouchStart/onTouchMove register as non-passive listeners,
            which blocks native scroll on the entire parent element. */}
        <div
          className="absolute left-0 right-0 flex justify-center pb-2 z-40 rounded-t-2xl"
          style={{
            paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
            background: "linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 70%, transparent 100%)"
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 bg-zinc-400 rounded-full shadow-sm" />
        </div>

        {/* Scrollable content — absolute for explicit height (iOS Safari can't compute
            scroll regions from nested flex). All siblings are absolute too. */}
        <div
          className="absolute inset-0 overflow-y-auto touch-pan-y overscroll-contain rounded-t-2xl"
          style={{
            paddingTop: "calc(40px + env(safe-area-inset-top, 0px))",
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {title && (
            <div className="px-4 pb-3 pr-16 border-b border-zinc-100 sticky top-0 bg-white z-[5]">
              <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );

  // Render in portal to escape any parent overflow/positioning
  return createPortal(sheetContent, document.body);
}

// Convenience component for sheet content with padding
export function BottomSheetContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
