import { describe, expect, it } from "vitest";
import { nextUnseenIndex } from "../triage-deck";

const deck = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("nextUnseenIndex", () => {
  it("moves to the next listing when nothing is seen", () => {
    expect(nextUnseenIndex(deck, 0, new Set())).toBe(1);
  });

  it("skips listings already seen", () => {
    expect(nextUnseenIndex(deck, 0, new Set(["a", "b", "c"]))).toBe(3);
  });

  it("wraps round to the start", () => {
    expect(nextUnseenIndex(deck, 3, new Set(["d"]))).toBe(0);
  });

  it("can land back on the current one if it is still new", () => {
    expect(nextUnseenIndex(deck, 1, new Set(["a", "c", "d"]))).toBe(1);
  });

  it("returns -1 when everything is seen", () => {
    expect(nextUnseenIndex(deck, 2, new Set(["a", "b", "c", "d"]))).toBe(-1);
  });

  it("handles a one-listing deck", () => {
    expect(nextUnseenIndex([{ id: "a" }], 0, new Set())).toBe(0);
    expect(nextUnseenIndex([{ id: "a" }], 0, new Set(["a"]))).toBe(-1);
  });

  it("returns -1 for an empty deck", () => {
    expect(nextUnseenIndex([], 0, new Set())).toBe(-1);
  });
});
