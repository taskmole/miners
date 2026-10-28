import { describe, it, expect } from "vitest";
import { buildAiScoutEmail, type RawAiScoutRows } from "../ai-scout-email-queries";
import { soFarLine } from "../ai-scout-unlock";

const start = new Date("2026-10-16T08:00:00Z");
const end = new Date("2026-10-23T08:00:00Z");

/** n overall verdicts on n different listings, all inside the week. */
function rated(n: number): RawAiScoutRows["feedback"] {
  return Array.from({ length: n }, (_, i) => ({
    place_id: `p${i}`,
    kind: "overall" as const,
    ai_value: null,
    human_value: null,
    note: null,
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
  }));
}

function quiet(thisWeek: number, sinceSuggestions: number, ready = false): boolean {
  return buildAiScoutEmail(
    {
      ratings: [],
      feedback: rated(thisWeek),
      suggestions: ready
        ? [{ title: "t", status: "ready", score_before: 0.5, score_after: 0.6, held_reason: null, created_at: "2026-10-21T22:00:00Z" }]
        : [],
      activePoints: [],
      ratedSinceSuggestions: sinceSuggestions,
      soFar: { listingsTaught: 0, changesThatHelped: 0 },
    },
    start,
    end,
    "https://example.test",
  ).quiet;
}

describe("Friday email: quiet version", () => {
  it("is quiet while fewer than 3 listings are rated since the last suggestions", () => {
    expect(quiet(1, 2)).toBe(true);
  });

  it("is full once 3 are rated, even across several weeks", () => {
    expect(quiet(1, 3)).toBe(false);
  });

  it("is full in a busy week whose ratings Wednesday's run already used", () => {
    expect(quiet(4, 0)).toBe(false);
  });

  it("is full whenever a suggestion is ready", () => {
    expect(quiet(0, 0, true)).toBe(false);
  });
});

describe("Friday email and AI scout tab: the So far line", () => {
  it("names the listings and the changes that helped", () => {
    expect(soFarLine({ listingsTaught: 23, changesThatHelped: 2 })).toBe(
      "So far: learned from 23 listings, 2 changes made it agree with you more.",
    );
    expect(soFarLine({ listingsTaught: 1, changesThatHelped: 1 })).toBe(
      "So far: learned from 1 listing, 1 change made it agree with you more.",
    );
  });

  it("leaves out a zero instead of showing it", () => {
    expect(soFarLine({ listingsTaught: 5, changesThatHelped: 0 })).toBe("So far: learned from 5 listings.");
    expect(soFarLine({ listingsTaught: 0, changesThatHelped: 0 })).toBeNull();
  });
});
