"use client";

import React from "react";
import { StepHead } from "@/components/poi-card/PoiCard";
import { DETAILS_SHEET } from "./layout";

interface StepSheetProps {
  title: string;
  subtitle?: string;
  /** Stays at the bottom while the body scrolls, e.g. the note composer. */
  footer?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The second steps of the New listings window (Assign, Pre-reject, Notes &
 * files, Save to a list). Same head as the map card's steps, with Back on the
 * left, so a step looks the same wherever it opens. On wide screens it rises
 * over the details column only; on phones it covers the width.
 */
export function StepSheet({ title, subtitle, footer, onClose, children }: StepSheetProps) {
  // Escape means Back, even from the note or reason field (those stop the key
  // from bubbling). Capture on document, as the map card's steps do, so the
  // photo viewer (capture on window) still gets it first.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <>
      <div className="absolute inset-0 bg-black/40 z-40" onClick={onClose} />

      <div
        role="dialog"
        aria-label={title}
        className={`absolute bottom-0 left-0 right-0 ${DETAILS_SHEET} max-h-full bg-white rounded-t-2xl z-50 flex flex-col overflow-hidden`}
        style={{ animation: "triage-sheet-up 250ms ease-out" }}
      >
        <StepHead title={title} subtitle={subtitle} onBack={onClose} />

        <div className="poi-step-body flex-1 min-h-0 max-h-[60vh] overflow-y-auto">{children}</div>

        {footer ? (
          <div
            className="poi-step-foot shrink-0"
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        ) : (
          // No footer: keep the body clear of the phone's home bar.
          <div className="shrink-0" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
        )}
      </div>
    </>
  );
}
