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

  // Calculate sheet height based on snap point
  const sheetHeight = snapPoint === "full" ? "95vh" : "65vh";

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
          "relative bg-white rounded-t-2xl shadow-2xl",
          "transition-transform duration-200 ease-out",
          isLandscapeMode
            ? "rounded-t-none rounded-r-2xl h-full w-[80vw] max-w-md"
            : "w-full",
          isDragging && "transition-none",
          className
        )}
        style={{
          height: isLandscapeMode ? "100%" : sheetHeight,
          transform: isLandscapeMode
            ? isOpen
              ? "translateX(0)"
              : "translateX(-100%)"
            : isOpen
            ? `translateY(${dragOffset}px)`
            : "translateY(100%)",
          willChange: "transform",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Close button - always visible, top-right */}
        <button
          onClick={onClose}
          className="absolute top-2 right-3 z-50 w-10 h-10 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-zinc-300 rounded-full" />
        </div>

        {/* Title bar (optional) */}
        {title && (
          <div className="px-4 pb-3 pr-16 border-b border-zinc-100">
            <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
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
