import { describe, it, expect } from "vitest";
import {
  type AiProfile,
  type Label,
  type Prediction,
  applyChange,
  bestWeightMove,
  buildLabels,
  compareOnLabels,
  labelAgreement,
  sampleLabels,
  sameInstructions,
  validateChange,
} from "../../../scripts/data-pipeline/lib/ai-scout";

// Placeholder instructions: the real ones live in the database only.
function profile(weights: Record<string, number>): AiProfile {
  return {
    id: "p1",
    customer_id: "test",
    version: 1,
    model: null,
    business: "A test business.",
    rules: ["Existing rule"],
    points: Object.entries(weights).map(([id, weight]) => ({ id, label: id, kind: "ai" as const, weight, guide: "g" })),
    match_weights: { size: 35, rent: 30, distance: 20, deal: 15 },
    ideal_size: { min: 50, max: 150 },
  };
}

const weightsOf = (p: AiProfile) => Object.fromEntries(p.points.map((x) => [x.id, x.weight]));

describe("applyChange matches decide_ai_suggestion", () => {
  it("adds a point, scales the others and fixes the total on the heaviest", () => {
    // 45*0.9 = 40.5 -> 41, 35*0.9 = 31.5 -> 32, 20*0.9 = 18. Sum 91 + 10 = 101,
    // so the heaviest (a, 41) gives back 1.
    const next = applyChange(profile({ a: 45, b: 35, c: 20 }), {
      add_point: { id: "d", label: "D", guide: "gd", weight: 10 },
    });
    expect(weightsOf(next)).toEqual({ a: 40, b: 32, c: 18, d: 10 });
    expect(next.points.find((p) => p.id === "d")?.kind).toBe("ai");
  });

  it("tops up when rounding leaves the total short", () => {
    const next = applyChange(profile({ a: 34, b: 33, c: 33 }), {
      add_point: { id: "d", label: "D", guide: "gd", weight: 5 },
    });
    // 34*0.95 = 32.3 -> 32, 33*0.95 = 31.35 -> 31 twice. 32+31+31+5 = 99, a gets +1.
    expect(weightsOf(next)).toEqual({ a: 33, b: 31, c: 31, d: 5 });
    expect(next.points.reduce((s, p) => s + p.weight, 0)).toBe(100);
  });

  it("moves weight and appends rules without touching the original", () => {
    const base = profile({ a: 50, b: 50 });
    expect(weightsOf(applyChange(base, { move_weight: { from: "a", to: "b", amount: 10 } }))).toEqual({ a: 40, b: 60 });
    expect(applyChange(base, { add_rule: "New rule" }).rules).toEqual(["Existing rule", "New rule"]);
    expect(base.rules).toEqual(["Existing rule"]);
    expect(weightsOf(base)).toEqual({ a: 50, b: 50 });
  });

  it("recognises the version a change was applied to", () => {
    const base = profile({ a: 50, b: 50 });
    const next = applyChange(base, { add_rule: "New rule" });
    expect(sameInstructions(applyChange(base, { add_rule: "New rule" }), next)).toBe(true);
    expect(sameInstructions(base, next)).toBe(false);
  });
});

describe("validateChange", () => {
  const base = profile({ a: 50, b: 45, c: 5 });
  it("accepts the three shapes", () => {
    expect(validateChange({ add_rule: " Avoid  basements " }, base)).toEqual({ change: { add_rule: "Avoid basements" } });
    expect("change" in validateChange({ add_point: { id: "new_one", label: "New", guide: "1 bad, 5 good", weight: 8 } }, base)).toBe(true);
    expect("change" in validateChange({ move_weight: { from: "a", to: "c", amount: 10 } }, base)).toBe(true);
  });
  it("rejects bad or duplicate changes", () => {
    expect("error" in validateChange({ add_rule: "existing rule" }, base)).toBe(true);
    expect("error" in validateChange({ add_point: { id: "a", label: "A", guide: "g", weight: 5 } }, base)).toBe(true);
    expect("error" in validateChange({ add_point: { id: "Bad-Id", label: "A", guide: "g", weight: 5 } }, base)).toBe(true);
    expect("error" in validateChange({ add_point: { id: "x", label: "X", guide: "g", weight: 31 } }, base)).toBe(true);
    expect("error" in validateChange({ move_weight: { from: "c", to: "a", amount: 5 } }, base)).toBe(true); // would remove c
    expect("error" in validateChange({ move_weight: { from: "a", to: "zz", amount: 5 } }, base)).toBe(true);
    expect("error" in validateChange({ move_weight: { from: "a", to: "b", amount: 11 } }, base)).toBe(true);
    expect("error" in validateChange({ add_rule: "x", move_weight: {} }, base)).toBe(true);
  });
});

describe("scoreboard maths", () => {
  const pred = (blend: number, points: Record<string, number | null> = {}): Prediction => ({
    blend,
    gut: null,
    points: Object.fromEntries(Object.entries(points).map(([k, v]) => [k, { value: v, reason: "" }])),
  });

  it("scores each label kind", () => {
    const point: Label = { kind: "point", placeId: "x", at: "t", pointId: "a", human: 2 };
    expect(labelAgreement(point, pred(50, { a: 2 }))).toBe(1);
    expect(labelAgreement(point, pred(50, { a: 4 }))).toBe(0.5);
    expect(labelAgreement(point, pred(50, { a: null }))).toBeNull();

    const assign: Label = { kind: "decision", placeId: "x", at: "t", want: "high" };
    const reject: Label = { kind: "decision", placeId: "x", at: "t", want: "low" };
    expect(labelAgreement(assign, pred(60))).toBe(1);
    expect(labelAgreement(assign, pred(59))).toBe(0);
    expect(labelAgreement(reject, pred(49))).toBe(1);
    expect(labelAgreement(reject, pred(50))).toBe(0);

    const tooHigh: Label = { kind: "overall", placeId: "x", at: "t", verdict: "too_high", oldBlend: 70 };
    const tooLow: Label = { kind: "overall", placeId: "x", at: "t", verdict: "too_low", oldBlend: 40 };
    const right: Label = { kind: "overall", placeId: "x", at: "t", verdict: "right", oldBlend: 50 };
    expect(labelAgreement(tooHigh, pred(65))).toBe(1);
    expect(labelAgreement(tooHigh, pred(66))).toBe(0);
    expect(labelAgreement(tooLow, pred(45))).toBe(1);
    expect(labelAgreement(tooLow, pred(44))).toBe(0);
    expect(labelAgreement(right, pred(60))).toBe(1);
    expect(labelAgreement(right, pred(61))).toBe(0);
  });

  it("compares two versions on the same labels only", () => {
    const labels: Label[] = [
      { kind: "decision", placeId: "x", at: "t", want: "high" },
      { kind: "decision", placeId: "y", at: "t", want: "low" },
      { kind: "point", placeId: "x", at: "t", pointId: "new_one", human: 5 },
    ];
    const before = new Map([["x", pred(55)], ["y", pred(40)]]);
    // y failed to re-rate, and only the candidate has the new point: both drop out.
    const after = new Map([["x", pred(65, { new_one: 5 })]]);
    expect(compareOnLabels(labels, before, after)).toEqual({ before: 0, after: 1, sample: 1 });
    expect(compareOnLabels(labels, new Map(), after)).toBeNull();
  });

  it("keeps the newest label per thing and samples the newest listings", () => {
    const labels = buildLabels([
      { place_id: "x", kind: "assign", point_id: null, human_value: null, verdict: null, at: "2026-10-01", old_blend: null },
      { place_id: "x", kind: "reject", point_id: null, human_value: null, verdict: null, at: "2026-10-02", old_blend: null },
      { place_id: "x", kind: "overall", point_id: null, human_value: null, verdict: null, at: "2026-10-02", old_blend: 50 },
      { place_id: "y", kind: "overall", point_id: null, human_value: null, verdict: "right", at: "2026-10-03", old_blend: null },
      { place_id: "z", kind: "point", point_id: "a", human_value: 3, verdict: null, at: "2026-09-01", old_blend: null },
    ]);
    // x: one decision (the newer reject); the note-only overall and y's
    // verdict on an unknown blend are not labels.
    expect(labels).toEqual([
      { kind: "decision", placeId: "x", at: "2026-10-02", want: "low" },
      { kind: "point", placeId: "z", at: "2026-09-01", pointId: "a", human: 3 },
    ]);
    expect(sampleLabels(labels, 1).map((l) => l.placeId)).toEqual(["x"]);
  });

  it("lets a rejected viewing request override the scout's earlier request", () => {
    const labels = buildLabels([
      { place_id: "x", kind: "request", point_id: null, human_value: null, verdict: null, at: "2026-10-01", old_blend: null },
      { place_id: "x", kind: "reject", point_id: null, human_value: null, verdict: null, at: "2026-10-03", old_blend: null },
    ]);
    expect(labels).toEqual([{ kind: "decision", placeId: "x", at: "2026-10-03", want: "low" }]);
  });

  it("finds a weight move that fixes the decisions", () => {
    // Head office rejects listings that rate well on a and badly on b.
    const base = profile({ a: 50, b: 50 });
    const stored = new Map<string, Prediction>();
    const labels: Label[] = [];
    for (let i = 0; i < 10; i++) {
      stored.set(`r${i}`, pred(0, { a: 5, b: 1 }));
      labels.push({ kind: "decision", placeId: `r${i}`, at: "t", want: "low" });
    }
    // Starts at blend 50 (not under 50), so every rejection disagrees.
    const best = bestWeightMove(base, labels, stored);
    expect(best?.change).toEqual({ move_weight: { from: "a", to: "b", amount: 5 } });
    expect(best?.board).toEqual({ before: 0, after: 1, sample: 10 });
  });
});
