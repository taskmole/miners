// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findListing } from "../share-place";
import { generatePropertyPlaceId } from "../place-id";

/** A PostGIS EWKB point, as the database returns `location`. */
function wkb(lat: number, lon: number): string {
  const view = new DataView(new ArrayBuffer(16));
  view.setFloat64(0, lon, true);
  view.setFloat64(8, lat, true);
  const hex = [...new Uint8Array(view.buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return "0101000020e6100000" + hex;
}

const URL_ = "https://www.idealista.com/inmueble/123/";
const LAT = 40.41234;
const LON = -3.70123;
const PLACE_ID = generatePropertyPlaceId({ latitude: LAT, longitude: LON, url: URL_ });
const ROW = { name: "local en calle mayor", address: "calle mayor 1", location: wkb(LAT, LON), photos: ["https://img4.idealista.com/a.jpg"] };

/** A fake client that answers the one query findListing makes. */
function db(answer: { data: unknown; error: unknown }, seen: Record<string, string> = {}) {
  const query = {
    select: () => query,
    in: () => query,
    eq: (col: string, value: string) => ((seen[col] = value), query),
    limit: async () => answer,
  };
  return { from: () => query } as unknown as SupabaseClient;
}

describe("findListing", () => {
  it("returns the listing as the map shows it", async () => {
    const seen: Record<string, string> = {};
    expect(await findListing(db({ data: [ROW], error: null }, seen), "madrid", PLACE_ID, URL_)).toEqual({
      title: "Local en calle mayor",
      address: "Calle mayor 1",
      photoUrl: "https://img4.idealista.com/a.jpg",
    });
    expect(seen).toEqual({ city_id: "madrid", "metadata->>url": URL_ });
  });

  it("refuses a URL that does not rebuild the place id, without asking for one that cannot", async () => {
    const elsewhere = { ...ROW, location: wkb(LAT + 0.01, LON) };
    expect(await findListing(db({ data: [elsewhere], error: null }), "madrid", PLACE_ID, URL_)).toBeNull();
    const seen: Record<string, string> = {};
    expect(await findListing(db({ data: [ROW], error: null }, seen), "madrid", PLACE_ID, URL_ + "x")).toBeNull();
    expect(seen).toEqual({}); // the hash already ruled it out
  });

  it("refuses when there is no listing or no URL", async () => {
    expect(await findListing(db({ data: [], error: null }), "madrid", PLACE_ID, URL_)).toBeNull();
    expect(await findListing(db({ data: [ROW], error: null }), "madrid", PLACE_ID, undefined)).toBeNull();
    expect(await findListing(db({ data: [ROW], error: null }), "madrid", PLACE_ID, 42)).toBeNull();
  });

  it("falls back like the map for a listing with no name, address or photo", async () => {
    const bare = { ...ROW, name: null, address: null, photos: null };
    expect(await findListing(db({ data: [bare], error: null }), "madrid", PLACE_ID, URL_)).toEqual({
      title: "Property",
      address: null,
      photoUrl: null,
    });
  });

  it("throws on a database error", async () => {
    await expect(findListing(db({ data: null, error: { message: "boom" } }), "madrid", PLACE_ID, URL_)).rejects.toThrow();
  });
});
