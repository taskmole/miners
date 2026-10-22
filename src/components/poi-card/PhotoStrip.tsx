"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Swipeable photos with a "3/11" counter, the same scroll-snap approach as
 * the New listings deck. Swiping is the browser's own scrolling, so a
 * vertical swipe that starts on the photo still scrolls the phone sheet.
 * Arrows show with a mouse or keyboard focus (CSS). Next and previous photos are fetched
 * ahead; a photo that fails becomes a plain grey frame.
 */
export function PhotoStrip({ photos, alt, index, onIndex }: {
  photos: string[];
  alt: string;
  /** Photo on screen; owned by the card so it survives a step and Back. */
  index: number;
  onIndex: (i: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Coming back from a step: start on the photo that was showing.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && index > 0) el.scrollLeft = index * el.clientWidth;
    // Only on mount; afterwards scrolling drives the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [failed, setFailed] = React.useState<ReadonlySet<number>>(() => new Set());
  const many = photos.length > 1;

  const onScroll = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    // Only on a new photo: scroll fires every frame, and each call re-renders the card.
    if (i !== index) onIndex(i);
  };

  const go = (delta: number) => {
    const el = ref.current;
    if (!el) return;
    const next = Math.min(photos.length - 1, Math.max(0, index + delta));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  React.useEffect(() => {
    if (!many) return;
    for (const i of [index - 1, index + 1]) {
      const url = photos[i];
      if (url) new Image().src = url;
    }
  }, [index, photos, many]);

  return (
    <>
      <div ref={ref} className="poi-strip" onScroll={onScroll}>
        {photos.map((src, i) => (
          <div key={`${i}-${src}`} className="poi-strip-cell">
            {failed.has(i) ? (
              <div className="poi-photo-missing" aria-label="Photo not available" />
            ) : (
              <img
                src={src}
                alt={i === 0 ? alt : ""}
                loading={i < 2 ? "eager" : "lazy"}
                draggable={false}
                onError={() => setFailed((s) => new Set(s).add(i))}
              />
            )}
          </div>
        ))}
      </div>
      {many && (
        <>
          <span className="poi-count" aria-live="polite">{index + 1}/{photos.length}</span>
          {index > 0 && (
            <button type="button" className="poi-arrow is-left" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous photo">
              <ChevronLeft aria-hidden />
            </button>
          )}
          {index < photos.length - 1 && (
            <button type="button" className="poi-arrow is-right" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next photo">
              <ChevronRight aria-hidden />
            </button>
          )}
        </>
      )}
    </>
  );
}
