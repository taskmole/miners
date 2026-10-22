import { describe, it, expect, afterEach } from "vitest";
import { render } from "@react-email/render";
import React from "react";
import { NextRequest } from "next/server";
import {
  addToReport,
  cafePlaceId,
  describeChanges,
  diffCafes,
  type CafeReport,
} from "../../../scripts/data-pipeline/lib/cafe-report";
import {
  MAX_LISTED,
  buildCafeUpdateEmails,
  cafeUpdateSubject,
  citiesWithChanges,
  isReportDue,
} from "../cafe-update-email";
import { CafeUpdate } from "@/emails/cafe-update";
import { GET } from "@/app/api/send-cafe-update-email/route";

describe("cafe change report", () => {
  it("builds the same id the map uses for a cafe pin", () => {
    expect(cafePlaceId("40.4168", "-3.7038")).toBe("cafe-40.41680--3.70380");
  });

  it("reports renames, real rating moves, known-to-known price changes and Premium", () => {
    const before = { placeId: "x", name: "Old", rating: "4.3", price: "€1–10", premium: "False" };
    expect(describeChanges(before, { ...before, name: "New", rating: "4.5", price: "€10–20", premium: "True" })).toEqual([
      'renamed from "Old"',
      "rating 4.3 → 4.5",
      "price €1–10 → €10–20",
      "now Premium",
    ]);
    // Small rating wobble and a first-ever price are not news.
    expect(describeChanges({ ...before, price: "" }, { ...before, rating: "4.4", price: "€1–10" })).toEqual([]);
  });

  it("diffs by position: new, gone and changed", () => {
    const a = { placeId: "a", name: "A", rating: "4.0" };
    const b = { placeId: "b", name: "B" };
    const c = { placeId: "c", name: "C" };
    const result = diffCafes("regular", [a, b], [{ ...a, rating: "4.5" }, c]);
    expect(result.added).toEqual([{ name: "C", kind: "regular", placeId: "c" }]);
    expect(result.removed).toEqual([{ name: "B", kind: "regular" }]);
    expect(result.changed).toEqual([{ name: "A", kind: "regular", placeId: "a", changes: ["rating 4.0 → 4.5"] }]);
  });

  it("can leave out new and changed cafes (first refresh) but always reports gone ones", () => {
    const result = diffCafes("regular", [{ placeId: "a", name: "A" }], [{ placeId: "b", name: "B" }], {
      reportAdded: false,
      reportChanged: false,
    });
    expect(result).toEqual({ added: [], removed: [{ name: "A", kind: "regular" }], changed: [] });
  });

  it("appends within one run, starts fresh for another, and merges changes to one cafe", () => {
    const changed = (changes: string[]) => ({ added: [], removed: [], changed: [{ name: "A", kind: "coffee-trip" as const, placeId: "a", changes }] });
    let report = addToReport(null, "run-1", "t1", "madrid", changed(["now Premium"]));
    report = addToReport(report, "run-1", "t2", "madrid", changed(["rating 4.0 → 4.5"]));
    expect(report.createdAt).toBe("t1");
    expect(report.cities.madrid.changed).toEqual([
      { name: "A", kind: "coffee-trip", placeId: "a", changes: ["now Premium", "rating 4.0 → 4.5"] },
    ]);

    const next = addToReport(report, "run-2", "t3", "prague", changed(["x"]));
    expect(Object.keys(next.cities)).toEqual(["prague"]);
    expect(next.stamp).toBe("run-2");
  });
});

const NOW = new Date("2026-11-02T08:00:00Z");

function report(overrides: Partial<CafeReport> = {}): CafeReport {
  return {
    stamp: "run-1",
    createdAt: "2026-11-01T05:00:00Z",
    cities: {
      madrid: { added: [{ name: "New Cafe", kind: "regular", placeId: "cafe-40.40000--3.70000" }], removed: [], changed: [] },
      prague: { added: [], removed: [{ name: "Gone Cafe", kind: "coffee-trip" }], changed: [] },
      barcelona: { added: [], removed: [], changed: [] },
    },
    ...overrides,
  };
}

describe("cafe update email", () => {
  it("is due once, while recent, and only with changes", () => {
    expect(isReportDue(report(), null, NOW)).toBe(true);
    expect(isReportDue(report(), { stamp: "run-1", sentTo: ["a@x.com"], done: true }, NOW)).toBe(false);
    // Half-sent: still due, the route then skips the people already reached.
    expect(isReportDue(report(), { stamp: "run-1", sentTo: ["a@x.com"], done: false }, NOW)).toBe(true);
    expect(isReportDue(report(), { stamp: "run-0", sentTo: [], done: true }, NOW)).toBe(true);
    expect(isReportDue(report({ createdAt: "2026-10-01T05:00:00Z" }), null, NOW)).toBe(false);
    expect(isReportDue(report({ cities: {} }), null, NOW)).toBe(false);
    expect(isReportDue(null, null, NOW)).toBe(false);
  });

  it("lists only cities with changes", () => {
    expect(citiesWithChanges(report()).map((c) => c.cityId)).toEqual(["madrid", "prague"]);
  });

  it("sends each person only the changed cities they can see; super admins see all", () => {
    const emails = buildCafeUpdateEmails(report(), [
      { email: "madrid@x.com", isSuperAdmin: false, cityIds: ["madrid"] },
      { email: "barcelona@x.com", isSuperAdmin: false, cityIds: ["barcelona"] },
      { email: "admin@x.com", isSuperAdmin: true, cityIds: [] },
    ]);
    expect(emails.map((e) => [e.email, e.cities.map((c) => c.cityId)])).toEqual([
      ["madrid@x.com", ["madrid"]],
      ["admin@x.com", ["madrid", "prague"]],
    ]);
  });

  it("names the cities in the subject", () => {
    expect(cafeUpdateSubject(citiesWithChanges(report()))).toBe("Cafe map update: Madrid and Prague");
  });

  it("renders links for new cafes, plain names for gone ones, and caps long lists", async () => {
    const many = Array.from({ length: MAX_LISTED + 3 }, (_, i) => ({
      name: `Cafe ${i}`,
      kind: "regular" as const,
      placeId: `cafe-40.4000${i}--3.70000`,
    }));
    const cities = citiesWithChanges(
      report({ cities: { madrid: { added: many, removed: [{ name: "Gone Cafe", kind: "regular" }], changed: [] } } })
    );
    const html = await render(React.createElement(CafeUpdate, { cities, appUrl: "https://app.test" }));
    expect(html).toContain("https://app.test/?focus=cafe-40.40000--3.70000");
    expect(html).toContain("13 new");
    expect(html).toContain("and 3 more");
    expect(html).toContain("Gone Cafe");
    expect(html).not.toContain("Cafe 12");
  });
});

describe("GET /api/send-cafe-update-email", () => {
  const SECRET = process.env.CRON_SECRET;
  afterEach(() => {
    if (SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = SECRET;
  });

  const call = (auth?: string) =>
    GET(new NextRequest("http://localhost/api/send-cafe-update-email", auth ? { headers: { authorization: auth } } : {}));

  it("refuses everyone when CRON_SECRET is unset, even 'Bearer undefined'", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("refuses a wrong or missing secret", async () => {
    process.env.CRON_SECRET = "right";
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call()).status).toBe(401);
  });
});
