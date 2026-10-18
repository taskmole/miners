"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { BorderBeam } from "border-beam";
import { useReducedMotion } from "framer-motion";

/**
 * A short, one-off glow around an element, built on `border-beam`.
 *
 * The glow is a "look here" signal, not decoration, so it never runs for long:
 * it plays for `playMs` and then fades out by itself. While it is off, Beam
 * runs no animations; all that stays is a small per-instance <style> block.
 *
 * `playKey` decides when it plays. Empty (0, "", null) means stay still. Any
 * other value plays the glow once on mount, and again every time it changes.
 *
 * Beam's spinning styles ignore "reduce motion" on their own, so it is checked
 * here for every style (framer-motion is already in the main bundle).
 */
type BeamGlowProps = Omit<ComponentProps<typeof BorderBeam>, "active"> & {
  playKey: string | number | null | undefined;
  playMs: number;
};

export function BeamGlow({ playKey, playMs, ...beamProps }: BeamGlowProps) {
  const reduceMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playKey || reduceMotion) return;
    setPlaying(true);
    const timer = setTimeout(() => setPlaying(false), playMs);
    return () => clearTimeout(timer);
  }, [playKey, playMs, reduceMotion]);

  return <BorderBeam {...beamProps} active={playing && !reduceMotion} />;
}

/**
 * The NEW listings button's glow (desktop and phone). Goes inside the button,
 * so the button keeps its own position, shadow, red dot and tap shrink.
 * `borderRadius` must match the button's corners: Beam can't read them from
 * the text label it wraps. Green, held still, to stay on-brand; the "sm" and
 * grey "mono" presets are near invisible on a small black button.
 */
export function NewButtonGlow({
  playKey,
  borderRadius,
  children,
}: {
  playKey: number;
  borderRadius: number;
  children: ReactNode;
}) {
  return (
    <BeamGlow
      playKey={playKey}
      playMs={6000}
      colorVariant="forest"
      staticColors
      borderRadius={borderRadius}
      className="w-full h-full flex items-center justify-center"
    >
      {children}
    </BeamGlow>
  );
}
