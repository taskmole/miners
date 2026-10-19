import { describe, it, expect } from "vitest";
import { Zap } from "lucide-react";
import type { Access, CityGrant } from "../permissions";
import {
  WHATS_NEW,
  LATEST_WHATS_NEW_ID,
  MAX_POPUP_SLIDES,
  canSeeEntry,
  unseenEntries,
  visibleEntries,
  type WhatsNewAudience,
  type WhatsNewEntry,
} from "../whats-new";

const grant = (cityId: string, level: CityGrant["level"], canTrainAi = false): CityGrant => ({
  cityId,
  level,
  receivesAlerts: false,
  canTrainAi,
});

const person = (grants: CityGrant[], extras: Partial<Access> = {}): Access => ({
  isSuperAdmin: false,
  isActive: true,
  canSeeFinancials: false,
  grants,
  ...extras,
});

let nextId = 1;
const entry = (audience: WhatsNewAudience, extras: Partial<WhatsNewEntry> = {}): WhatsNewEntry => ({
  id: nextId++,
  date: "2026-10-18",
  title: "t",
  body: "b",
  audience,
  visual: { kind: "card", tone: "sky", icon: Zap, headline: "h" },
  ...extras,
});

const viewer = person([grant("madrid", "view")]);
const contributor = person([grant("madrid", "contribute")]);
const approver = person([grant("madrid", "approve")]);
const trainer = person([grant("madrid", "approve", true)]);
const superAdmin = person([], { isSuperAdmin: true });
const switchedOff = person([grant("madrid", "approve", true)], { isActive: false });

describe("canSeeEntry", () => {
  const cases: [WhatsNewAudience, Access[], Access[]][] = [
    ["everyone", [viewer, contributor, approver, trainer, superAdmin], [switchedOff, person([])]],
    ["contributors", [contributor, approver, trainer, superAdmin], [viewer, switchedOff]],
    ["approvers", [approver, trainer, superAdmin], [viewer, contributor, switchedOff]],
    ["ai-trainers", [trainer, superAdmin], [viewer, contributor, approver, switchedOff]],
    ["super-admins", [superAdmin], [viewer, contributor, approver, trainer]],
  ];
  for (const [audience, yes, no] of cases) {
    it(`${audience}: shows to the right people only`, () => {
      const e = entry(audience);
      yes.forEach((a) => expect(canSeeEntry(e, a)).toBe(true));
      no.forEach((a) => expect(canSeeEntry(e, a)).toBe(false));
    });
  }

  it("city limit: needs the audience level in one of the listed cities", () => {
    const e = entry("approvers", { cities: ["prague"] });
    expect(canSeeEntry(e, approver)).toBe(false); // approves in Madrid only
    expect(canSeeEntry(e, person([grant("madrid", "approve"), grant("prague", "view")]))).toBe(false);
    expect(canSeeEntry(e, person([grant("prague", "approve")]))).toBe(true);
    expect(canSeeEntry(e, superAdmin)).toBe(true);
  });
});

describe("unseenEntries", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  const old = entry("everyone", { date: "2026-08-01" });
  const recent = entry("everyone", { date: "2026-10-10" });
  const trainerOnly = entry("ai-trainers", { date: "2026-10-19" });
  const list = [old, recent, trainerOnly];

  it("first view: only the last 30 days, newest first", () => {
    expect(unseenEntries(trainer, null, now, list)).toEqual([trainerOnly, recent]);
    expect(unseenEntries(viewer, null, now, list)).toEqual([recent]);
  });

  it("after a close: only ids above the one seen, whatever the date", () => {
    expect(unseenEntries(trainer, old.id, now, list)).toEqual([trainerOnly, recent]);
    expect(unseenEntries(trainer, recent.id, now, list)).toEqual([trainerOnly]);
  });

  it("nothing new means nothing to show", () => {
    expect(unseenEntries(trainer, trainerOnly.id, now, list)).toEqual([]);
    expect(unseenEntries(viewer, recent.id, now, list)).toEqual([]);
  });

  it(`caps the popup at ${MAX_POPUP_SLIDES} slides, keeping the newest`, () => {
    const many = Array.from({ length: 8 }, () => entry("everyone", { date: "2026-10-19" }));
    const shown = unseenEntries(viewer, null, now, many);
    expect(shown).toHaveLength(MAX_POPUP_SLIDES);
    expect(shown[0].id).toBe(many[7].id);
    expect(visibleEntries(viewer, many)).toHaveLength(8);
  });
});

describe("the real entries", () => {
  it("have unique, increasing ids", () => {
    const ids = WHATS_NEW.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
    expect(LATEST_WHATS_NEW_ID).toBe(ids[ids.length - 1]);
  });

  it("have valid dates", () => {
    WHATS_NEW.forEach((e) => expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/));
    WHATS_NEW.forEach((e) => expect(Number.isNaN(Date.parse(e.date))).toBe(false));
  });
});
