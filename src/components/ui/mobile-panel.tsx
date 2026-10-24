"use client";

import React, { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { MAP_TOOL_MARKER } from "@/lib/map-tools";
import { BottomSheet } from "./bottom-sheet";

interface MobilePanelProps {
  // Whether the panel is open
  isOpen: boolean;
  // Called when user wants to close
  onClose: () => void;
  // Content to render inside the panel
  children: React.ReactNode;
  // Optional class names
  className?: string;
  // Optional title for mobile sheet
  title?: string;
  // Snap point for mobile sheet
  snapPoint?: "partial" | "full";
}

/**
 * One of the map tool panels (Filters, Lists, Trips, Draw, Activity).
 *
 * Desktop: a frosted panel beside the tool bar (see .mt-panel), never taller
 * than the screen. Its scroll area is a `.mt-body` that fills what the header
 * leaves. Phones: a bottom sheet.
 */
export function MobilePanel({
  isOpen,
  onClose,
  children,
  className,
  title,
  snapPoint = "partial",
}: MobilePanelProps) {
  const isMobile = useMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // Click outside to close (desktop only)
  useEffect(() => {
    if (isMobile || !isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current && !panelRef.current.contains(target)) {
        // Don't close when clicking inside Radix portals (dropdowns, dialogs),
        // or on the tool bar: its buttons switch or close the panel themselves.
        if (target.closest(`[data-radix-popper-content-wrapper], [role='dialog'], [role='menu'], [${MAP_TOOL_MARKER}]`)) {
          return;
        }
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

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={title}
      className={cn("mt-panel mt-font glass", className)}
    >
      {children}
    </div>
  );
}

/**
 * The one header every tool panel uses: Outfit title, round grey close X,
 * and a slot for extra buttons before it. On phones the sheet already shows
 * the title and its own close X, so only the extra buttons render.
 */
export function MobilePanelHeader({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children?: React.ReactNode; // Extra header buttons, e.g. "Mark all read"
}) {
  const isMobile = useMobile();

  if (isMobile) {
    return children ? (
      <div className="flex items-center justify-end gap-2 px-4 pb-3">{children}</div>
    ) : null;
  }

  return (
    <div className="mt-head">
      <h2 className="mt-title">{title}</h2>
      <div className="mt-head-end">
        {children}
        <button type="button" onClick={onClose} className="mt-x" aria-label={`Close ${title.toLowerCase()}`}>
          <X strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

/** Empty state: one icon, one line, one hint. Same everywhere. */
export function PanelEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mt-empty">
      <Icon strokeWidth={1.75} aria-hidden />
      <p className="mt-empty-title">{title}</p>
      {hint && <p className="mt-empty-hint">{hint}</p>}
    </div>
  );
}
