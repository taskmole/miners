"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { BottomSheet } from "./bottom-sheet";

interface MobilePanelProps {
  // Whether the panel is open
  isOpen: boolean;
  // Called when user wants to close
  onClose: () => void;
  // Content to render inside the panel
  children: React.ReactNode;
  // Desktop position (for fixed panels)
  desktopPosition?: {
    top?: string;
    right?: string;
    left?: string;
    bottom?: string;
  };
  // Optional class names
  className?: string;
  // Optional title for mobile sheet
  title?: string;
  // Whether to show the collapsed button (desktop only)
  collapsedButton?: React.ReactNode;
  // Panel width on desktop (default: w-80)
  desktopWidth?: string;
  // Z-index for desktop panel
  zIndex?: number;
  // Snap point for mobile sheet
  snapPoint?: "partial" | "full";
}

export function MobilePanel({
  isOpen,
  onClose,
  children,
  desktopPosition = { top: "24px", right: "24px" },
  className,
  title,
  collapsedButton,
  desktopWidth = "w-80",
  zIndex = 40,
  snapPoint = "partial",
}: MobilePanelProps) {
  const isMobile = useMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close (desktop only)
  useEffect(() => {
    if (isMobile || !isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobile, isOpen, onClose]);

  // Mobile: use BottomSheet
  if (isMobile) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose}
        title={title}
        snapPoint={snapPoint}
        className={className}
      >
        {children}
      </BottomSheet>
    );
  }

  // Desktop: use fixed positioning
  // Show collapsed button when closed, expanded panel when open
  if (!isOpen) {
    return collapsedButton ? (
      <div
        ref={panelRef}
        className="fixed"
        style={{
          ...desktopPosition,
          zIndex,
        }}
      >
        {collapsedButton}
      </div>
    ) : null;
  }

  return (
    <div
      ref={panelRef}
      className="fixed"
      style={{
        ...desktopPosition,
        zIndex: zIndex + 10, // Expanded panel above collapsed buttons
      }}
    >
      <div
        className={cn(
          "glass rounded-2xl overflow-hidden border border-white/40",
          "max-w-[80vw]",
          desktopWidth,
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

// Header component for panels - consistent styling
export function MobilePanelHeader({
  title,
  onClose,
  children,
  icon,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode; // Additional header content (e.g., buttons)
  icon?: React.ReactNode;
}) {
  const isMobile = useMobile();

  // On mobile, the BottomSheet handles the title, so we just render children
  if (isMobile) {
    return children ? (
      <div className="p-4 flex items-center justify-end gap-2 border-b border-zinc-100">
        {children}
      </div>
    ) : null;
  }

  // Desktop header
  return (
    <div className="p-4 flex items-center justify-between border-b border-white/10">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-bold text-zinc-900">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-md text-zinc-400 flex items-center justify-center hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
