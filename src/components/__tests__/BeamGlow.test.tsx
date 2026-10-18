import { render, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Stand-ins: the real BorderBeam needs CSS features jsdom lacks, and the
// reduce-motion setting has to be switchable per test.
let reduceMotion = false;
vi.mock("framer-motion", () => ({ useReducedMotion: () => reduceMotion }));
vi.mock("border-beam", () => ({
  BorderBeam: ({ active }: { active: boolean }) => (
    <div data-testid="beam" data-active={String(active)} />
  ),
}));

import { BeamGlow } from "@/components/BeamGlow";

const glowing = () =>
  document.querySelector("[data-testid=beam]")!.getAttribute("data-active") === "true";

describe("BeamGlow", () => {
  beforeEach(() => {
    reduceMotion = false;
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("stays still with an empty play signal", () => {
    render(<BeamGlow playKey={0} playMs={1000}>x</BeamGlow>);
    expect(glowing()).toBe(false);
  });

  it("plays for playMs, then stops by itself", () => {
    render(<BeamGlow playKey={1} playMs={1000}>x</BeamGlow>);
    expect(glowing()).toBe(true);
    act(() => void vi.advanceTimersByTime(999));
    expect(glowing()).toBe(true);
    act(() => void vi.advanceTimersByTime(1));
    expect(glowing()).toBe(false);
  });

  it("plays again when the play signal changes", () => {
    const { rerender } = render(<BeamGlow playKey={1} playMs={1000}>x</BeamGlow>);
    act(() => void vi.advanceTimersByTime(1000));
    expect(glowing()).toBe(false);
    rerender(<BeamGlow playKey={2} playMs={1000}>x</BeamGlow>);
    expect(glowing()).toBe(true);
  });

  it("never plays when the device asks for reduced motion", () => {
    reduceMotion = true;
    render(<BeamGlow playKey={1} playMs={1000}>x</BeamGlow>);
    expect(glowing()).toBe(false);
  });
});
