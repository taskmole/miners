"use client";

import { ThinkingOrb, type OrbSize, type OrbState } from "thinking-orbs";

/**
 * The app's one loading indicator: a small animated dotted orb from
 * `thinking-orbs`, used everywhere a spinner used to be.
 *
 * - `size`: 20 sits next to text or inside a button, 32 fills an empty
 *   panel, 64 is for a full-screen wait. Only these three are tuned.
 * - `state`: "searching" (a globe being scanned) for waiting on data,
 *   "working" (orbiting dots) for an action the person started.
 * - `onDark`: the orb is strictly black or white dots. The app is light only,
 *   so it is pinned to dark dots unless it sits on a dark surface. Left on
 *   "auto" it would follow the OS and turn white on our white panels.
 * - `label`: give one only when the orb is alone. Next to visible text
 *   ("Loading...") leave it out, so screen readers skip the orb instead of
 *   saying "Loading" twice.
 *
 * It already shows a still frame under "reduce motion" and pauses itself
 * when off screen or the tab is hidden.
 */
export function LoadingOrb({
  size = 20,
  state = "searching",
  onDark = false,
  label,
}: {
  size?: OrbSize;
  state?: OrbState;
  onDark?: boolean;
  label?: string;
}) {
  return (
    <ThinkingOrb
      state={state}
      size={size}
      theme={onDark ? "dark" : "light"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      // Keeps its size when squeezed in a row next to text.
      style={{ flexShrink: 0 }}
    />
  );
}
