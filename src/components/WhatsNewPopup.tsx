"use client";

import { memo, useEffect, useId, useRef, useState, type TouchEvent } from "react";
import { ChevronRight, X } from "lucide-react";
import { NewButtonGlow } from "@/components/BeamGlow";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import { WhatsNewPicture } from "@/components/WhatsNewPicture";
import type { WhatsNewEntry } from "@/lib/whats-new";

interface WhatsNewPopupProps {
  entries: WhatsNewEntry[];
  /** The page's "nothing else is in the way" verdict. False hides it again. */
  canShow: boolean;
  /** X, Escape, backdrop or "Got it": everything shown counts as seen. */
  onDismiss: () => void;
}

/** Waits a beat after the map settles, so it never lands mid-load. */
const SHOW_DELAY_MS = 1500;
const SWIPE_PX = 40;

/** Same glass recipe as the Feedback panel, a touch more opaque for reading. */
const GLASS = {
  background: "rgba(255, 255, 255, 0.92)",
  backdropFilter: "blur(16px) saturate(180%)",
  boxShadow:
    "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 32px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(255,255,255,0.5)",
};

/**
 * The "What's new" card. Bottom-right and non-blocking on desktop, centred
 * over a dim backdrop on phones. Renders nothing until `canShow` has held for
 * SHOW_DELAY_MS, which also lets useMobile() measure the screen first.
 */
// Memoised: it stays mounted on the busy map page, and its props are stable.
export const WhatsNewPopup = memo(function WhatsNewPopup({ entries, canShow, onDismiss }: WhatsNewPopupProps) {
  const isMobile = useMobile();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [rawIndex, setIndex] = useState(0);

  const hasEntries = entries.length > 0;
  useEffect(() => {
    if (!canShow || !hasEntries) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canShow, hasEntries]);

  const last = entries.length - 1;
  const go = (to: number) => setIndex(Math.max(0, Math.min(last, to)));

  // Escape closes, and closing counts as read, so it must be aimed at the
  // card: on phones (modal) any Escape not already handled; on desktop (not
  // modal) only while focus is inside the card, never one meant for search or
  // a place popup. Arrow keys live on the card itself for the same reason.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!isMobile && !cardRef.current?.contains(document.activeElement)) return;
      onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, isMobile, onDismiss]);

  // On phones it is modal: move focus in so screen readers announce it, and
  // hand it back to wherever it was when the card goes.
  useEffect(() => {
    if (!visible || !isMobile) return;
    const previous = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    return () => previous?.focus?.();
  }, [visible, isMobile]);

  if (!visible || !hasEntries) return null;

  const index = Math.min(rawIndex, last);
  const current = entries[index];
  const isLast = index === last;

  const onTouchStart = (e: TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  // Mostly sideways only, so scrolling a tall card never flips the slide.
  const onTouchEnd = (e: TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
  };

  const card = (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal={isMobile || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className={cn(
        "rounded-3xl p-5 outline-none overflow-y-auto overscroll-contain",
        "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
        isMobile ? "w-full max-w-[400px]" : "w-[380px] slide-in-from-bottom-2 origin-bottom-right",
      )}
      style={{
        ...GLASS,
        maxHeight: isMobile
          ? "calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))"
          : "calc(100dvh - 88px)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 id={titleId} className="font-heading text-xl font-semibold text-zinc-900 tracking-tight">
          What&apos;s new
        </h2>
        <button
          onClick={onDismiss}
          className="-mr-2 w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          aria-label="Close what's new"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Picture. Fixed shape so the card never resizes between slides. */}
      <div
        className="relative w-full aspect-[16/10] max-h-[32dvh] overflow-hidden rounded-2xl border border-black/5 bg-zinc-100"
      >
        <div key={current.id} className="absolute inset-0 animate-in fade-in-0 duration-300 motion-reduce:animate-none">
          <WhatsNewPicture visual={current.visual} />
        </div>
      </div>

      {/* Every slide's text stacked in one grid cell: the box is as tall as
          the longest one, so nothing below it jumps when you page through. */}
      {/* Screen readers hear each page turn; the stacked panes below never
          change text, so they cannot announce it themselves. */}
      <p className="sr-only" aria-live="polite">{`Update ${index + 1} of ${entries.length}: ${current.title}`}</p>
      <div className="grid mt-4">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={cn("[grid-area:1/1]", i === index ? "visible" : "invisible")}
            aria-hidden={i !== index}
          >
            <h3 className="font-heading text-lg font-semibold text-zinc-900 leading-snug">{entry.title}</h3>
            <p className="mt-1 text-sm text-zinc-500 leading-relaxed">{entry.body}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-5">
        {entries.length > 1 && (
          <div className="flex items-center -ml-1">
            {entries.map((entry, i) => (
              <button
                key={entry.id}
                onClick={() => go(i)}
                aria-label={`Show update ${i + 1} of ${entries.length}`}
                aria-current={i === index}
                className="px-1 py-3 -my-1"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none",
                    i === index ? "w-6 bg-zinc-900" : "w-1.5 bg-zinc-300 hover:bg-zinc-400",
                  )}
                />
              </button>
            ))}
          </div>
        )}
        {/* Paging lives here, not on the picture, so it never covers what a
            screenshot is pointing at. It glows once as the card appears, the
            same green light the NEW button uses. Padding sits inside the glow
            so the light runs along the button's own edge. */}
        <button
          onClick={isLast ? onDismiss : () => go(index + 1)}
          className="ml-auto h-11 sm:h-9 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 active:scale-95 transition-all"
        >
          <NewButtonGlow playKey={1} borderRadius={10}>
            <span className="flex items-center gap-1 px-3.5">
              {isLast ? "Got it" : <>Next<ChevronRight className="w-4 h-4 -mr-1" /></>}
            </span>
          </NewButtonGlow>
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center px-4"
        style={{
          paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div
          className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
          onClick={onDismiss}
          aria-hidden
        />
        <div className="relative w-full flex justify-center">{card}</div>
      </div>
    );
  }

  // Above the right-hand sidebar (z 60), just clear of the profile avatar
  // below it (24px in, 36px tall) and on the same right edge.
  return <div className="fixed right-6 bottom-[72px] z-[70]">{card}</div>;
});
