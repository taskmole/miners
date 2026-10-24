"use client";

import React, { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { scoreTier } from "@/lib/gravity-lookup";
import { GlassScoreBadge } from "./GlassScoreBadge";

interface ImageCarouselProps {
  photos: string[];
  score?: number;
  showArrows?: boolean;
  /** Laid over the bottom of the photo, e.g. the district caption. */
  caption?: ReactNode;
}

// On phones and narrow windows the photo is a 4:3 box at the top of the card.
// On wide screens (lg) it fills the left column of the side-by-side layout
// instead, and a strip of thumbnails replaces the dots underneath.
export function ImageCarousel({ photos, score, showArrows, caption }: ImageCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(idx);
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  }, []);

  const scrollTo = useCallback(
    (dir: "left" | "right") => {
      scrollToIndex(
        dir === "left"
          ? Math.max(0, activeIndex - 1)
          : Math.min(photos.length - 1, activeIndex + 1),
      );
    },
    [activeIndex, photos.length, scrollToIndex],
  );

  // Keep the active thumbnail in view. Scrolls the strip only, never the
  // page or modal around it (scrollIntoView would move those too).
  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[activeIndex] as HTMLElement | undefined;
    // offsetParent is null while the strip is hidden (phones, narrow windows).
    if (!strip || !thumb || strip.offsetParent === null) return;
    strip.scrollTo({
      left: thumb.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [activeIndex]);

  if (photos.length === 0) {
    const tier = score != null ? scoreTier(score) : "weak";
    const bg =
      tier === "prime"
        ? "from-emerald-800 to-emerald-600"
        : tier === "strong"
          ? "from-amber-700 to-amber-500"
          : tier === "moderate"
            ? "from-zinc-600 to-zinc-400"
            : "from-red-800 to-red-600";
    return (
      <div
        className={`relative w-full aspect-[4/3] lg:aspect-auto lg:h-full bg-gradient-to-br ${bg} flex items-center justify-center`}
      >
        <MapPin className="w-12 h-12 text-white/40" />
        {score != null && (
          <div className="absolute top-3 left-3">
            <GlassScoreBadge score={score} />
          </div>
        )}
        {caption}
      </div>
    );
  }

  const hasMany = photos.length > 1;

  return (
    <div className="lg:h-full lg:flex lg:flex-col">
      <div className="relative w-full aspect-[4/3] lg:aspect-auto lg:flex-1 lg:min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex w-full h-full overflow-x-auto snap-x snap-mandatory"
          style={{ scrollbarWidth: "none" }}
        >
          {photos.map((src, i) => (
            <div key={i} className="w-full h-full flex-shrink-0 snap-center">
              <img
                src={src}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
          ))}
        </div>

        {score != null && (
          <div className="absolute top-3 left-3">
            <GlassScoreBadge score={score} />
          </div>
        )}

        {hasMany && (
          <div
            className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs text-white font-medium"
            style={{
              backgroundColor: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(12px)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {activeIndex + 1}/{photos.length}
          </div>
        )}

        {/* Dots: phones and narrow windows only. Wide screens get thumbnails. */}
        {hasMany && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 lg:hidden">
            {photos.map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i === activeIndex
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.4)",
                }}
              />
            ))}
          </div>
        )}

        {/* After the dots so it paints over them, as it always has. */}
        {caption}

        {showArrows && hasMany && (
          <>
            {activeIndex > 0 && (
              <button
                type="button"
                onClick={() => scrollTo("left")}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-700" />
              </button>
            )}
            {activeIndex < photos.length - 1 && (
              <button
                type="button"
                onClick={() => scrollTo("right")}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md"
              >
                <ChevronRight className="w-4 h-4 text-zinc-700" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Thumbnails: wide screens only. Scrolls sideways when there are many.
          76px tall with a top line, the same band as the buttons beside it,
          so both halves of the window end on one line. */}
      {hasMany && (
        <div
          ref={thumbsRef}
          className="hidden lg:flex items-center gap-1.5 px-2.5 h-[76px] bg-white border-t border-zinc-100 overflow-x-auto shrink-0"
          style={{ scrollbarWidth: "none" }}
        >
          {photos.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => scrollToIndex(i)}
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              aria-current={i === activeIndex}
              className={`w-[88px] h-14 shrink-0 rounded-lg overflow-hidden transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                i === activeIndex
                  ? "opacity-100 ring-2 ring-zinc-900"
                  : "opacity-55 hover:opacity-90"
              }`}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
