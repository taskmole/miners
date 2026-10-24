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

  // `!!playKey`: clearing the signal mid-glow stops it at once (the cleanup
  // has already cancelled the timer that would have).
  return <BorderBeam {...beamProps} active={!!playKey && playing && !reduceMotion} />;
}

/**
 * The "What's new" Next button's one-off glow. Goes inside the button,
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

/**
 * Two soft green breaths inside a light box (AI Summary, "All caught up").
 * `borderRadius` must match the box's corners.
 */
export function BreatheGlow(props: Omit<BeamGlowProps, "playMs">) {
  return (
    <BeamGlow
      playMs={4600}
      size="pulse-inner"
      colorVariant="forest"
      staticColors
      theme="light"
      {...props}
    />
  );
}

/**
 * A 2 px glowing ring just outside a button (sign-in, Done). The negative
 * margin hands the 2 px back, so nothing moves. `background` must match what
 * is around the button, so the ring can't be seen while idle. Flex keeps an
 * inline-flex button from sitting a pixel low. Must sit in a flex container,
 * or it would stretch to full width.
 */
export function RingGlow({
  radius,
  background,
  ...glowProps
}: Omit<BeamGlowProps, "borderRadius" | "style"> & { radius: number; background: string }) {
  return (
    <BeamGlow
      brightness={1.9}
      {...glowProps}
      borderRadius={radius + 2}
      style={{ display: "flex", padding: 2, margin: -2, background }}
    />
  );
}
