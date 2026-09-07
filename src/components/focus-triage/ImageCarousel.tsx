"use client";

import React, { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { scoreTier } from "@/lib/gravity-lookup";
import { GlassScoreBadge } from "./GlassScoreBadge";

interface ImageCarouselProps {
  photos: string[];
  score?: number;
  showArrows?: boolean;
}

export function ImageCarousel({ photos, score, showArrows }: ImageCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(idx);
  }, []);

  const scrollTo = useCallback(
    (dir: "left" | "right") => {
      const el = scrollRef.current;
      if (!el) return;
      const next =
        dir === "left"
          ? Math.max(0, activeIndex - 1)
          : Math.min(photos.length - 1, activeIndex + 1);
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    },
    [activeIndex, photos.length],
  );

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
        className={`relative w-full aspect-[4/3] bg-gradient-to-br ${bg} flex items-center justify-center`}
      >
        <MapPin className="w-12 h-12 text-white/40" />
        {score != null && (
          <div className="absolute top-3 left-3">
            <GlassScoreBadge score={score} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-[4/3]">
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

      {photos.length > 1 && (
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

      {photos.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
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

      {showArrows && photos.length > 1 && (
        <>
          {activeIndex > 0 && (
            <button
              onClick={() => scrollTo("left")}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-700" />
            </button>
          )}
          {activeIndex < photos.length - 1 && (
            <button
              onClick={() => scrollTo("right")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md"
            >
              <ChevronRight className="w-4 h-4 text-zinc-700" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
