import { describe, it, expect } from "vitest";
import {
  GOOGLE_COLUMNS,
  ENRICHMENT_COLUMNS,
  checkGoogleSafety,
  formatPrice,
  gridCells,
  mergeGoogleCity,
  type EnrichmentRow,
  type GoogleMergeInput,
  type GooglePlace,
  type GoogleRow,
  type PlaceCheck,
} from "../../../scripts/data-pipeline/lib/google-cafes";

const NOW = "2026-11-01T05:00:00.000Z";

function row(id: string, name: string, lat: string, lon: string, extra: Partial<GoogleRow> = {}): GoogleRow {
  const blank = Object.fromEntries(GOOGLE_COLUMNS.map((c) => [c, ""])) as GoogleRow;
  return { ...blank, source_id: id, name, lat, lon, rating: "4.5", fetchedAt: "2026-02-02T00:00:00.000Z", ...extra };
}

function place(id: string, name: string, lat: number, lon: number, extra: Partial<GooglePlace> = {}): GooglePlace {
  return {
    id,
    displayName: { text: name },
    formattedAddress: "Calle 1",
    location: { latitude: lat, longitude: lon },
    rating: 4.6,
    userRatingCount: 100,
    primaryType: "coffee_shop",
    businessStatus: "OPERATIONAL",
    ...extra,
  };
}

function enrichment(id: string, name: string, lat: string, lon: string): EnrichmentRow {
  const blank = Object.fromEntries(ENRICHMENT_COLUMNS.map((c) => [c, ""])) as EnrichmentRow;
  return { ...blank, euct_name: name, euct_lat: lat, euct_lon: lon, gp_source_id: id, gp_rating: "4.0" };
}

function merge(input: Partial<GoogleMergeInput>) {
  return mergeGoogleCity({
    existing: [],
    found: [],
    checks: new Map<string, PlaceCheck>(),
    coffeeTrip: [],
    enrichment: [],
    now: NOW,
    ...input,
  });
}

describe("formatPrice", () => {
  it("formats euro ranges with the symbol in front", () => {
    expect(formatPrice({ priceRange: { startPrice: { currencyCode: "EUR", units: "1" }, endPrice: { currencyCode: "EUR", units: "10" } } })).toBe("€1–10");
  });
  it("formats koruna ranges with the symbol after", () => {
    expect(formatPrice({ priceRange: { startPrice: { currencyCode: "CZK", units: "100" }, endPrice: { currencyCode: "CZK", units: "200" } } })).toBe("100–200 Kč");
  });
  it("handles open-ended ranges and falls back to the price level", () => {
    expect(formatPrice({ priceRange: { startPrice: { currencyCode: "EUR", units: "20" } } })).toBe("€20+");
    expect(formatPrice({ priceLevel: "PRICE_LEVEL_MODERATE" })).toBe("Moderate");
    expect(formatPrice({})).toBe("");
  });
});

describe("mergeGoogleCity", () => {
  it("refreshes a found cafe but never moves it or resets when it was first seen", () => {
    const existing = [row("A", "Old Name", "40.1", "-3.1")];
    const found = [place("A", "New Name", 40.2, -3.2, { priceLevel: "PRICE_LEVEL_INEXPENSIVE" })];
    const { rows } = merge({ existing, found });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "New Name",
      lat: "40.1",
      lon: "-3.1",
      rating: "4.6",
      priceRange: "Cheap",
      fetchedAt: "2026-02-02T00:00:00.000Z",
      refreshedAt: NOW,
    });
  });

  it("adds new cafes with a first-seen date", () => {
    const { rows, stats } = merge({ found: [place("B", "Brand New", 40.3, -3.3)] });
    expect(stats.added).toEqual(["Brand New (coffee_shop)"]);
    expect(rows[0]).toMatchObject({ source_id: "B", lat: "40.3", lon: "-3.3", fetchedAt: NOW, refreshedAt: NOW });
  });

  it("removes permanently closed cafes but keeps temporarily closed ones", () => {
    const existing = [row("A", "Closed for good", "40.1", "-3.1"), row("B", "On holiday", "40.2", "-3.2")];
    const found = [
      place("A", "Closed for good", 40.1, -3.1, { businessStatus: "CLOSED_PERMANENTLY" }),
      place("B", "On holiday", 40.2, -3.2, { businessStatus: "CLOSED_TEMPORARILY" }),
    ];
    const { rows, stats } = merge({ existing, found });
    expect(rows.map((r) => r.source_id)).toEqual(["B"]);
    expect(stats.removed).toEqual(["Closed for good"]);
  });

  it("keeps a cafe the search missed when Google says it is still open", () => {
    const existing = [row("A", "Still here", "40.1", "-3.1")];
    const checks = new Map<string, PlaceCheck>([["A", { status: "open" }]]);
    const { rows, stats } = merge({ existing, found: [place("Z", "Other", 41, -4)], checks });
    expect(rows.map((r) => r.source_id)).toContain("A");
    expect(stats.removed).toEqual([]);
  });

  it("refreshes a cafe the search missed from its lookup, without moving it", () => {
    const existing = [row("A", "Old name", "40.1", "-3.1")];
    const lookup = place("A", "New name", 40.5, -3.5, { rating: 4.9 });
    const checks = new Map<string, PlaceCheck>([["A", { status: "open", place: lookup }]]);
    const { rows, stats } = merge({ existing, checks });
    expect(rows[0]).toMatchObject({
      name: "New name",
      rating: "4.9",
      lat: "40.1",
      lon: "-3.1",
      fetchedAt: "2026-02-02T00:00:00.000Z",
      refreshedAt: NOW,
    });
    expect(stats.refreshedByLookup).toBe(1);
  });

  it("keeps a cafe whose check failed, and removes one Google confirms closed", () => {
    const existing = [row("A", "Unknown", "40.1", "-3.1"), row("B", "Closed", "40.2", "-3.2")];
    const checks = new Map<string, PlaceCheck>([
      ["A", { status: "failed" }],
      ["B", { status: "closed" }],
    ]);
    const { rows, stats } = merge({ existing, checks });
    expect(rows.map((r) => r.source_id)).toEqual(["A"]);
    expect(stats.removed).toEqual(["Closed"]);
  });

  it("adopts a new Google id on the old pin and does not add it twice", () => {
    const existing = [row("OLD", "Renamed Id Cafe", "40.1", "-3.1")];
    const found = [place("NEW", "Renamed Id Cafe", 40.5, -3.5)];
    const checks = new Map<string, PlaceCheck>([["OLD", { status: "open", place: found[0] }]]);
    const { rows, stats } = merge({ existing, found, checks });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source_id: "NEW", lat: "40.1", lon: "-3.1" });
    expect(stats.added).toEqual([]);
  });

  it("does not adopt a new id that another pin already holds", () => {
    const existing = [row("OLD", "First", "40.1", "-3.1"), row("NEW", "Second", "40.2", "-3.2")];
    const lookup = place("NEW", "Second", 40.2, -3.2);
    const checks = new Map<string, PlaceCheck>([["OLD", { status: "open", place: lookup }]]);
    const { rows } = merge({ existing, found: [lookup], checks });
    expect(rows.map((r) => r.source_id)).toEqual(["OLD", "NEW"]);
    expect(rows[0]).toEqual(existing[0]);
  });

  it("relinks a 'no longer exists' cafe to a nearby result with a similar name, keeping its position", () => {
    const existing = [row("GONE", "Hola Coffee", "40.4000", "-3.7000")];
    const checks = new Map<string, PlaceCheck>([["GONE", { status: "gone" }]]);
    // About 10 m away.
    const found = [place("FRESH", "Hola Coffee", 40.40009, -3.7)];
    const { rows, stats } = merge({ existing, found, checks });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source_id: "FRESH", lat: "40.4000", lon: "-3.7000" });
    expect(stats.relinked).toHaveLength(1);
    expect(stats.added).toEqual([]);
  });

  it("removes a 'no longer exists' cafe when nothing similar is close by", () => {
    const existing = [row("GONE", "Hola Coffee", "40.4000", "-3.7000")];
    const checks = new Map<string, PlaceCheck>([["GONE", { status: "gone" }]]);
    const found = [place("FRESH", "Totally Different Bar", 40.40009, -3.7)];
    const { rows, stats } = merge({ existing, found, checks });
    expect(stats.removed).toEqual(["Hola Coffee"]);
    expect(rows.map((r) => r.source_id)).toEqual(["FRESH"]);
  });

  it("only adds new hits Google calls a cafe (never a Miners), and never filters existing pins", () => {
    const existing = [row("SUPER", "Old Supermarket", "40.1", "-3.1", { primaryType: "supermarket" })];
    const found = [
      place("SUPER", "Old Supermarket", 40.1, -3.1, { primaryType: "supermarket" }),
      place("MART", "Mercadona", 40.2, -3.2, { primaryType: "supermarket" }),
      place("DONUT", "Dunkin", 40.3, -3.3, { primaryType: "donut_shop" }),
      place("NOTYPE", "Mystery", 40.4, -3.4, { primaryType: undefined }),
      place("CAFE", "Real Cafe", 40.5, -3.5, { primaryType: "cafe" }),
      place("OURS", "The Miners Coffee San Bernardo", 40.6, -3.6),
    ];
    const { rows, stats } = merge({ existing, found });
    expect(rows.map((r) => r.source_id)).toEqual(["SUPER", "CAFE"]);
    expect(stats.added).toEqual(["Real Cafe (cafe)"]);
    expect(stats.skippedTypes).toEqual({ supermarket: 1, donut_shop: 1, unknown: 1 });
  });

  it("turns a new hit matching a coffee-trip cafe by name into that cafe's details, not a pin", () => {
    const coffeeTrip = [{ name: "Toma Cafe", latitude: "40.4260000", longitude: "-3.7080000" }];
    const found = [place("T", "Toma Café", 40.42603, -3.70803, { priceLevel: "PRICE_LEVEL_MODERATE" })];
    const { rows, enrichment: e, stats } = merge({ found, coffeeTrip });
    expect(rows).toEqual([]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ euct_lat: "40.4260000", euct_lon: "-3.7080000", gp_source_id: "T", gp_priceRange: "Moderate" });
    expect(stats.coffeeTripAdded).toEqual(["Toma Cafe"]);
  });

  it("keeps a different cafe in the same building as its own pin", () => {
    const coffeeTrip = [{ name: "Toma Cafe", latitude: "40.4260000", longitude: "-3.7080000" }];
    const found = [place("N", "Bakery Next Door", 40.42603, -3.70803)];
    const { rows, enrichment: e } = merge({ found, coffeeTrip });
    expect(rows.map((r) => r.source_id)).toEqual(["N"]);
    expect(e).toEqual([]);
  });

  it("never adds a second details row for a coffee-trip cafe that has one", () => {
    const coffeeTrip = [{ name: "Toma Cafe", latitude: "40.4260000", longitude: "-3.7080000" }];
    const existingEnrichment = [enrichment("T1", "Toma Cafe", "40.4260000", "-3.7080000")];
    const found = [place("T1", "Toma Café", 40.42603, -3.70803, { rating: 4.8 }), place("T2", "Toma Cafe", 40.42604, -3.70804)];
    const { enrichment: e, rows, stats } = merge({ found, coffeeTrip, enrichment: existingEnrichment });
    expect(e).toHaveLength(1);
    expect(e[0].gp_rating).toBe("4.8");
    expect(stats.coffeeTripUpdated).toBe(1);
    expect(rows).toEqual([]);
  });
});

describe("gridCells", () => {
  it("cuts a square into quarters that cover it exactly", () => {
    const square = { south: 40, north: 41, west: -4, east: -3 };
    const parts = gridCells(square, 2);
    expect(parts).toHaveLength(4);
    const area = (b: typeof square) => (b.north - b.south) * (b.east - b.west);
    expect(parts.reduce((sum, b) => sum + area(b), 0)).toBeCloseTo(area(square));
    expect(Math.min(...parts.map((b) => b.south))).toBe(40);
    expect(Math.max(...parts.map((b) => b.north))).toBe(41);
    expect(Math.min(...parts.map((b) => b.west))).toBe(-4);
    expect(Math.max(...parts.map((b) => b.east))).toBe(-3);
    expect(new Set(parts.map((b) => `${b.south},${b.west}`)).size).toBe(4);
  });
});

describe("checkGoogleSafety", () => {
  it("stops on an empty search or too many removals", () => {
    expect(checkGoogleSafety(100, 0, 0)).toMatch(/no cafes/);
    expect(checkGoogleSafety(100, 90, 16)).toMatch(/16 of 100/);
    expect(checkGoogleSafety(100, 90, 15)).toBeNull();
  });
});
