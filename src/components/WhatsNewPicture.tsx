"use client";

import { cn } from "@/lib/utils";
import type { WhatsNewTone, WhatsNewVisual } from "@/lib/whats-new";

/**
 * The picture area of a "What's new" update: a screenshot, or a colour card
 * with an icon and big words. Shared by the popup and the history page, and
 * kept apart from the popup so the page doesn't load the popup's code.
 */

const TONES: Record<WhatsNewTone, string> = {
  peach: "from-[#f8dcb4] to-[#f6b48c]",
  mint: "from-[#cdeedb] to-[#86cfa8]",
  sky: "from-[#d3e5fb] to-[#94bdf0]",
  lilac: "from-[#e6dbfb] to-[#b9a1ee]",
};

/** Fills its box; the caller decides the shape. */
export function WhatsNewPicture({ visual }: { visual: WhatsNewVisual }) {
  if (visual.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={visual.src} alt={visual.alt} loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
    );
  }
  const Icon = visual.icon;
  return (
    <div className={cn("relative w-full h-full overflow-hidden flex items-center justify-center gap-5 bg-gradient-to-br", TONES[visual.tone])}>
      {visual.speedBackdrop && <SpeedBackdrop src={visual.speedBackdrop} tone={visual.tone} />}
      <Icon className="relative w-12 h-12 text-white/80 shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="relative text-white" style={{ textShadow: "0 2px 14px rgba(0,0,0,0.18)" }}>
        <div className="font-heading text-5xl font-extrabold italic leading-none tracking-tight">{visual.headline}</div>
        {visual.subline && <div className="font-heading text-xl font-semibold italic mt-1">{visual.subline}</div>}
      </div>
    </div>
  );
}

/**
 * A blurred map racing past, with a few light streaks, to make "faster" felt.
 * The strip runs as [map, mirrored map] twice over and slides by half its
 * width: mirrored copies meet edge to edge, so the loop has no visible seam.
 * The tint is a multiply layer so the pale map's streets read as blue lines.
 * Animations live in globals.css and stop under "reduce motion".
 */
const STREAKS: [top: number, delay: number][] = [[22, 0], [41, 0.23], [63, 0.46], [80, 0.69]];

function SpeedBackdrop({ src, tone }: { src: string; tone: WhatsNewTone }) {
  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="whats-new-race flex h-full w-max blur-[1px] contrast-150 brightness-90">
        {[0, 1, 2, 3].map((i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" decoding="async" className={cn("h-full w-auto max-w-none", i % 2 === 1 && "-scale-x-100")} />
        ))}
      </div>
      <div className={cn("absolute inset-0 bg-gradient-to-br mix-blend-multiply", TONES[tone])} />
      {STREAKS.map(([top, delay]) => (
        <span
          key={top}
          className="whats-new-streak absolute right-0 h-[3px] w-1/3 rounded-full bg-gradient-to-l from-white/0 via-white/80 to-white/0"
          style={{ top: `${top}%`, animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}
