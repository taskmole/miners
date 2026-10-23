import { describe, it, expect } from "vitest";
import {
  isShown, listingPhotos, formatPrice, priceChange, shortAddress, listingFacts, transferLabel,
  listingShareTitle, ageShort, ageLong, todayHours, statusPill, type StatusPillInput,
} from "../card-format";
import type { PropertyData } from "@/hooks/useMapData";

const listing = (over: Partial<PropertyData> = {}): PropertyData => ({
  type: "property", source: "idealista", address: "Calle Mayor 5, Madrid",
  latitude: 40.4, longitude: -3.7, price: 2400, size: 95, priceByArea: 25,
  district: "Centro", hasAirConditioning: false, url: "https://x", title: "t",
  ...over,
});

// Real Google text: narrow no-break space before AM/PM, thin spaces round the dash.
const WEEK =
  "Monday: Closed; " +
  "Tuesday: 8:30 AM – 7:00 PM; " +
  "Wednesday: 8:00 AM – 2:00 PM, 5:00 – 8:00 PM; " +
  "Thursday: Open 24 hours; " +
  "Friday: 11:00 – 1:00 PM; " +
  "Saturday: 8:00 PM – 12:00 AM; " +
  "Sunday: by appointment";

// Noon UTC on known weekdays in October 2026 (Europe/Madrid is UTC+2).
const MON = new Date("2026-10-19T12:00:00Z");
const day = (offset: number) => new Date(MON.getTime() + offset * 86_400_000);

describe("numbers", () => {
  it("hides NaN, zero and missing values", () => {
    expect(isShown(NaN)).toBe(false);
    expect(isShown(0)).toBe(false);
    expect(isShown(undefined)).toBe(false);
    expect(isShown(5)).toBe(true);
  });

  it("formats euro and koruna prices, null without a price", () => {
    expect(formatPrice(2400, "idealista")).toBe("€2,400");
    expect(formatPrice(45000, "sreality")).toBe("45,000 Kč");
    expect(formatPrice(0, "sreality")).toBeNull();
    expect(formatPrice(NaN, "idealista")).toBeNull();
  });

  it("reports a price change only with a current price and at least 0.5%", () => {
    expect(priceChange({ price: 2280, priceHistory: [{ price: 2400, date: "" }] })).toEqual({ direction: "down", text: "5.0%" });
    expect(priceChange({ price: 3000, priceHistory: [{ price: 2400, date: "" }] })).toEqual({ direction: "up", text: "25%" });
    expect(priceChange({ price: 2401, priceHistory: [{ price: 2400, date: "" }] })).toBeNull();
    expect(priceChange({ price: 0, priceHistory: [{ price: 2400, date: "" }] })).toBeNull();
  });
});

describe("photos", () => {
  it("falls back to the single image when the list is empty", () => {
    expect(listingPhotos({ photos: [], image_url: "a.jpg" })).toEqual(["a.jpg"]);
    expect(listingPhotos({ photos: ["b.jpg"], image_url: "a.jpg" })).toEqual(["b.jpg"]);
    expect(listingPhotos({})).toEqual([]);
  });
});

describe("address", () => {
  it("drops the city but keeps a Prague district", () => {
    expect(shortAddress("calle Mayor 5, Madrid")).toBe("Calle Mayor 5");
    expect(shortAddress("Vinohradská 48, Praha 2")).toBe("Vinohradská 48, Praha 2");
    expect(shortAddress("Vinohradská 48, Praha")).toBe("Vinohradská 48");
    expect(shortAddress("Madrid")).toBe("Madrid");
  });

  it("moves a transfer listing's business type out of the address", () => {
    const a = "Bar, restaurant in Calle de Raimundo Fernández Villaverde, Madrid";
    expect(shortAddress(a)).toBe("Calle de Raimundo Fernández Villaverde");
    expect(listingFacts(listing({ address: a, transfer: 169000 }))).toEqual(["Bar, restaurant", "95 m²"]);
  });
});

describe("facts", () => {
  it("keeps the four most useful real facts in order", () => {
    const p = listing({ transfer: 12000, hasStorefront: true, hasAirConditioning: true, hasBathroom: true });
    expect(listingFacts(p)).toEqual(["95 m²", "Storefront", "A/C", "Bathroom"]);
  });

  it("never shows a zero size", () => {
    expect(listingFacts(listing({ size: 0, hasBathroom: true }))).toEqual(["Bathroom"]);
  });
});

describe("transfer", () => {
  it("shortens the fee for the chip by the price", () => {
    expect(transferLabel(listing({ transfer: 240000 }))).toBe("€240k transfer");
    expect(transferLabel(listing({ transfer: 12400 }))).toBe("€12k transfer");
  });

  it("never shows a zero or missing fee", () => {
    expect(transferLabel(listing({ transfer: 0 }))).toBeNull();
    expect(transferLabel(listing({ transfer: undefined }))).toBeNull();
    expect(transferLabel(listing({ transfer: Number.NaN }))).toBeNull();
  });

  it("writes koruna after the number", () => {
    expect(transferLabel(listing({ source: "sreality", transfer: 350000 }))).toBe("350k Kč transfer");
  });
});

describe("share", () => {
  it("share title is price and size", () => {
    expect(listingShareTitle(listing())).toBe("€2,400/mo · 95 m²");
    expect(listingShareTitle(listing({ price: 0, size: 0 }))).toBe("On request");
  });
});

describe("age", () => {
  const now = new Date("2026-10-22T12:00:00Z").getTime();
  it("says today, days, weeks, months", () => {
    expect(ageShort("2026-10-22T08:00:00Z", now)).toBe("Today");
    expect(ageShort("2026-10-19T12:00:00Z", now)).toBe("3d ago");
    expect(ageShort("2026-10-01T12:00:00Z", now)).toBe("3w ago");
    expect(ageShort("2026-06-01T12:00:00Z", now)).toBe("4mo ago");
    expect(ageShort(undefined, now)).toBeNull();
    expect(ageShort("nonsense", now)).toBeNull();
  });

  it("spells it out for the tooltip", () => {
    expect(ageLong("2026-10-21T12:00:00Z", now)).toBe("Updated 1 day ago");
    expect(ageLong("2026-10-19T12:00:00Z", now)).toBe("Updated 3 days ago");
  });
});

describe("todayHours", () => {
  it("reads each kind of day", () => {
    expect(todayHours(WEEK, day(0))).toBe("Closed today");
    expect(todayHours(WEEK, day(1))).toBe("Today 8:30–19:00");
    expect(todayHours(WEEK, day(2))).toBe("Today 8:00–14:00, 17:00–20:00");
    expect(todayHours(WEEK, day(3))).toBe("Open 24h");
    expect(todayHours(WEEK, day(4))).toBe("Today 11:00–13:00");
    expect(todayHours(WEEK, day(5))).toBe("Today 20:00–24:00");
  });

  it("gives nothing for unknown text or a missing day", () => {
    expect(todayHours(WEEK, day(6))).toBeNull();
    expect(todayHours("Tuesday: 8:30 AM – 7:00 PM", day(0))).toBeNull();
    expect(todayHours(undefined)).toBeNull();
  });

  it("picks the day in the city's time zone, not the browser's", () => {
    // 23:30 UTC on Monday is already Tuesday in Madrid.
    expect(todayHours(WEEK, new Date("2026-10-19T23:30:00Z"))).toBe("Today 8:30–19:00");
  });
});

describe("statusPill", () => {
  const base: StatusPillInput = {
    stage: "free", isAssignedToMe: false, assigneeLabel: null,
    preRejectReason: null, pitchStatus: null, pitchDate: null, pitchReason: null,
  };

  it("no pill while free or loading", () => {
    expect(statusPill(base)).toBeNull();
    expect(statusPill({ ...base, stage: "loading" })).toBeNull();
  });

  it("pre-rejected keeps the reason for the tooltip only", () => {
    expect(statusPill({ ...base, stage: "preRejected", preRejectReason: "too small" }))
      .toEqual({ label: "Pre-rejected", tone: "red", detail: "too small" });
  });

  it("pitch pills keep the reason and date for the tooltip only", () => {
    const pill = statusPill({ ...base, stage: "pitch", pitchStatus: "returned", pitchReason: "fix photos", pitchDate: "2026-10-03T10:00:00Z" });
    expect(pill).toEqual({ label: "Trip returned", tone: "amber", detail: "Trip returned on 3 Oct 2026: fix photos" });
    expect(statusPill({ ...base, stage: "pitch", pitchStatus: "approved" })).toMatchObject({ label: "Trip approved", tone: "green" });
    expect(statusPill({ ...base, stage: "pitch", pitchStatus: "draft" })).toMatchObject({ label: "Trip started", tone: "blue" });
  });

  it("assigned names who only in the tooltip, and is hidden from the holder", () => {
    expect(statusPill({ ...base, stage: "assigned", assigneeLabel: "Team Norte" }))
      .toEqual({ label: "Assigned", tone: "blue", detail: "Assigned to Team Norte" });
    expect(statusPill({ ...base, stage: "assigned" })).toMatchObject({ label: "Assigned" });
    expect(statusPill({ ...base, stage: "assigned", isAssignedToMe: true })).toBeNull();
  });

  it("my request states are grey", () => {
    expect(statusPill({ ...base, stage: "requested" })).toMatchObject({ label: "Requested", tone: "grey" });
    expect(statusPill({ ...base, stage: "declined" })).toMatchObject({ label: "Declined", tone: "grey" });
  });
});
