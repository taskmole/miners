/**
 * AI scout helpers
 *
 * The pieces of the listing scorer that do not talk to the database or the
 * model: map facts (size, rent, metro, cafes, footfall, storefront), example
 * matching for few-shot prompts, prompt and schema building, and the blend.
 *
 * Nothing customer-specific lives here. The customer's business description,
 * rating points and learned rules come from the ai_profiles table at run time,
 * because this repository is public and those instructions are their strategy.
 */

import * as fs from "fs";
import * as path from "path";
import { haversineDistance } from "./geo-utils";
import { buildGravityIndex, scoreAt, type GravityIndex } from "./gravity-grid";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PointKind = "fact" | "ai";

export interface AiPoint {
  id: string;
  label: string;
  kind: PointKind;
  weight: number;
  guide: string;
}

export interface MatchWeights {
  size: number;
  rent: number;
  distance: number;
  deal: number;
}

export interface AiProfile {
  id: string;
  customer_id: string;
  version: number;
  model: string | null;
  business: string;
  rules: string[];
  points: AiPoint[];
  match_weights: MatchWeights;
  ideal_size: { min: number; max: number };
}

/** One rated point: 1-5, or null when the evidence cannot support a rating. */
export interface PointValue {
  value: number | null;
  reason: string;
}

export type PointValues = Record<string, PointValue>;

/** The listing fields the scorer needs, already decoded. */
export interface Listing {
  id: string;
  cityId: string;
  name: string;
  address: string;
  source: string;
  metadata: Record<string, unknown>;
  photos: string[];
  lat: number | null;
  lon: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Small parsers
// ---------------------------------------------------------------------------

/**
 * Decode a PostGIS point. Supabase returns geography columns as hex EWKB:
 * byte order, type with the SRID flag, a 4-byte SRID, then lon and lat as
 * little-endian doubles. Same layout src/lib/wkb.ts reads for the map.
 */
export function parseWkbPoint(hex: unknown): { lat: number; lon: number } | null {
  if (typeof hex !== "string" || hex.length < 50) return null;
  const buf = Buffer.from(hex.slice(18, 50), "hex");
  if (buf.length < 16) return null;
  const lon = buf.readDoubleLE(0);
  const lat = buf.readDoubleLE(8);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/** A metadata value as a positive number, or null. Scrapers store some as strings. */
export function positiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Minimal RFC 4180 CSV reader. Addresses in the Google Places exports contain
 * commas inside quotes, so splitting on commas would shift every column.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.length > 1 || (r[0] ?? "") !== "")
    .map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), r[idx] ?? ""])));
}

// ---------------------------------------------------------------------------
// Map data per city (read from public/data, the same files the map uses)
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(__dirname, "..", "..", "..", "public", "data");

// Spelled out per city rather than built from the id: Madrid's metro file has
// no city suffix, and a city without a file simply gets a null rating.
const METRO_FILES: Record<string, string> = {
  madrid: "metro.geojson",
  prague: "metro_prague.geojson",
};
const GRAVITY_FILES: Record<string, string> = {
  madrid: "gravity_madrid.geojson",
};

interface Station {
  name: string;
  lat: number;
  lon: number;
}

export interface CityGeo {
  stations: Station[] | null;
  cafes: { lat: number; lon: number }[] | null;
  gravity: GravityIndex | null;
}

const geoCache = new Map<string, CityGeo>();

// hasOwnProperty, not a plain lookup, so "constructor" is not a city.
function fileFor(files: Record<string, string>, cityId: string): string | null {
  return Object.prototype.hasOwnProperty.call(files, cityId) ? files[cityId] : null;
}

function readIfExists(file: string): string | null {
  const full = path.join(DATA_DIR, file);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf-8") : null;
}

/** Load (once) the metro stations, cafes and footfall grid for a city. */
export function loadCityGeo(cityId: string): CityGeo {
  const cached = geoCache.get(cityId);
  if (cached) return cached;

  let stations: Station[] | null = null;
  const metroFile = fileFor(METRO_FILES, cityId);
  const metroText = metroFile ? readIfExists(metroFile) : null;
  if (metroText) {
    const features = (JSON.parse(metroText).features ?? []) as {
      geometry?: { type?: string; coordinates?: number[] };
      properties?: { name?: string };
    }[];
    stations = features
      .filter((f) => f.geometry?.type === "Point" && Array.isArray(f.geometry.coordinates))
      .map((f) => ({
        name: f.properties?.name || "metro",
        lon: f.geometry!.coordinates![0],
        lat: f.geometry!.coordinates![1],
      }));
  }

  let cafes: { lat: number; lon: number }[] | null = null;
  // City ids are lowercase letters from our own config, but the guard keeps a
  // stray value from reading outside the data folder.
  const cafeText = /^[a-z_]+$/.test(cityId) ? readIfExists(`google_places_${cityId}.csv`) : null;
  if (cafeText) {
    cafes = parseCsv(cafeText)
      .map((r) => ({ lat: parseFloat(r.lat), lon: parseFloat(r.lon) }))
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
  }

  let gravity: GravityIndex | null = null;
  const gravityFile = fileFor(GRAVITY_FILES, cityId);
  const gravityText = gravityFile ? readIfExists(gravityFile) : null;
  if (gravityText) gravity = buildGravityIndex(JSON.parse(gravityText));

  const geo = { stations, cafes, gravity };
  geoCache.set(cityId, geo);
  return geo;
}

// ---------------------------------------------------------------------------
// Rent market per city (for rent_value and for matching examples)
// ---------------------------------------------------------------------------

/**
 * Transfers (a traspaso: rent plus a one-off fee for the running business)
 * are a different market from plain rentals, so each is ranked on its own.
 */
export function sourceFamily(source: string): "transfer" | "rental" {
  return source === "idealista_transfer" ? "transfer" : "rental";
}

// Below this many priced listings a percentile says more about noise than
// about the market, so rent_value stays null.
const MIN_MARKET_SIZE = 30;

export interface RentMarket {
  /** Sorted rent-per-m2 values per source family, only when large enough. */
  byFamily: Map<string, number[]>;
}

export function rentPerSqm(meta: Record<string, unknown>): number | null {
  const price = positiveNumber(meta.price);
  const size = positiveNumber(meta.size);
  return price && size ? price / size : null;
}

export function buildRentMarket(listings: { source: string; metadata: Record<string, unknown> }[]): RentMarket {
  const raw = new Map<string, number[]>();
  for (const l of listings) {
    const v = rentPerSqm(l.metadata);
    if (v == null) continue;
    const fam = sourceFamily(l.source);
    const list = raw.get(fam);
    if (list) list.push(v);
    else raw.set(fam, [v]);
  }
  const byFamily = new Map<string, number[]>();
  for (const [fam, values] of raw) {
    if (values.length >= MIN_MARKET_SIZE) byFamily.set(fam, values.sort((a, b) => a - b));
  }
  return { byFamily };
}

/**
 * Share of the market (0-1) that is cheaper per m2 than this listing. Ties
 * count half so a run of identical prices lands in the middle, not the top.
 */
export function rentPercentile(market: RentMarket | null, source: string, meta: Record<string, unknown>): number | null {
  const v = rentPerSqm(meta);
  const values = market?.byFamily.get(sourceFamily(source));
  if (v == null || !values) return null;
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + equal / 2) / values.length;
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

/** The fact point ids the code knows how to compute. Anything else is null. */
export const KNOWN_FACTS = ["size_fit", "rent_value", "transit", "cafes_nearby", "footfall", "storefront"] as const;

/**
 * Footfall cut points on the 0-100 gravity score, one per quintile. Derived
 * from the score at all 860 active Madrid Property listings (18 October
 * 2026), not from the whole grid: over half the grid is parks, ring roads
 * and empty edge cells at 0, which would put every real street in the top
 * band. Re-derive if the gravity grid is regenerated.
 */
const FOOTFALL_THRESHOLDS = [18, 28, 39, 50];

export const CURRENCY_BY_SOURCE: Record<string, string> = {
  sreality: "CZK",
  idealista: "EUR",
  idealista_transfer: "EUR",
};

export function currencyFor(listing: Listing): string | null {
  const meta = listing.metadata;
  return (typeof meta.currency === "string" ? meta.currency : null) || CURRENCY_BY_SOURCE[listing.source] || null;
}

function hasCoords(l: Listing): l is Listing & { lat: number; lon: number } {
  return l.lat != null && l.lon != null;
}

/** Nearest metro station, or null when the city has no metro file or no coords. */
export function nearestStation(listing: Listing): { name: string; meters: number } | null {
  const geo = loadCityGeo(listing.cityId);
  if (!geo.stations || !hasCoords(listing)) return null;
  let best: { name: string; meters: number } | null = null;
  for (const s of geo.stations) {
    const d = haversineDistance(listing.lat, listing.lon, s.lat, s.lon);
    if (!best || d < best.meters) best = { name: s.name, meters: d };
  }
  return best;
}

function sizeFit(listing: Listing, ideal: { min: number; max: number }): PointValue {
  const size = positiveNumber(listing.metadata.size);
  if (size == null) return { value: null, reason: "Size not listed" };
  const range = `${ideal.min}-${ideal.max} m2 target`;
  if (size >= ideal.min && size <= ideal.max) return { value: 5, reason: `${Math.round(size)} m2, inside the ${range}` };
  const near = size < ideal.min ? size >= ideal.min * 0.75 : size <= ideal.max * 1.25;
  const side = size < ideal.min ? "below" : "above";
  return near
    ? { value: 3, reason: `${Math.round(size)} m2, a little ${side} the ${range}` }
    : { value: 1, reason: `${Math.round(size)} m2, well ${side} the ${range}` };
}

function rentValue(listing: Listing, market: RentMarket | null): PointValue {
  const p = rentPercentile(market, listing.source, listing.metadata);
  if (p == null) {
    return rentPerSqm(listing.metadata) == null
      ? { value: null, reason: "Rent or size not listed" }
      : { value: null, reason: "Too few listings in this city to compare rent" };
  }
  const perSqm = rentPerSqm(listing.metadata)!;
  const unit = currencyFor(listing) ? `${currencyFor(listing)}/m2` : "per m2";
  const fam = sourceFamily(listing.source) === "transfer" ? "transfers" : "rentals";
  const value = p < 0.2 ? 5 : p < 0.4 ? 4 : p < 0.6 ? 3 : p < 0.8 ? 2 : 1;
  const cheaperThan = Math.round((1 - p) * 100);
  return {
    value,
    reason: `${perSqm.toFixed(1)} ${unit}, cheaper than ${cheaperThan}% of ${fam} here`,
  };
}

function transit(listing: Listing): PointValue {
  if (!loadCityGeo(listing.cityId).stations) return { value: null, reason: "No metro map for this city" };
  const s = nearestStation(listing);
  if (!s) return { value: null, reason: "No location for this listing" };
  const m = s.meters;
  const value = m <= 300 ? 5 : m <= 600 ? 4 : m <= 1000 ? 3 : m <= 1500 ? 2 : 1;
  return { value, reason: `${Math.round(m / 10) * 10} m to ${s.name} metro` };
}

function cafesNearby(listing: Listing): PointValue {
  const cafes = loadCityGeo(listing.cityId).cafes;
  if (!cafes) return { value: null, reason: "No cafe map for this city" };
  if (!hasCoords(listing)) return { value: null, reason: "No location for this listing" };
  const n = cafes.filter((c) => haversineDistance(listing.lat, listing.lon, c.lat, c.lon) <= 300).length;
  // A few cafes prove there is coffee demand; none means unproven, and a
  // crowded strip means fighting for the same customers.
  const value = n === 0 ? 2 : n <= 3 ? 4 : n <= 8 ? 5 : 3;
  return { value, reason: n === 1 ? "1 cafe within 300 m" : `${n} cafes within 300 m` };
}

function footfall(listing: Listing): PointValue {
  const grid = loadCityGeo(listing.cityId).gravity;
  if (!grid) return { value: null, reason: "No footfall map for this city" };
  if (!hasCoords(listing)) return { value: null, reason: "No location for this listing" };
  const score = scoreAt(grid, listing.lat, listing.lon);
  if (score == null) return { value: null, reason: "Outside the footfall map" };
  const band = FOOTFALL_THRESHOLDS.filter((t) => score >= t).length; // 0..4
  return { value: band + 1, reason: `Footfall score ${score}/100` };
}

function storefront(listing: Listing): PointValue {
  const v = listing.metadata.hasStorefront;
  if (v === true) return { value: 5, reason: "Street-level storefront" };
  if (v === false) return { value: 2, reason: "No street-level storefront listed" };
  return { value: null, reason: "Storefront not stated" };
}

/** Compute every fact point in the profile for one listing. */
export function computeFacts(listing: Listing, profile: AiProfile, market: RentMarket | null): PointValues {
  const out: PointValues = {};
  for (const point of profile.points) {
    if (point.kind !== "fact") continue;
    switch (point.id) {
      case "size_fit":
        out[point.id] = sizeFit(listing, profile.ideal_size);
        break;
      case "rent_value":
        out[point.id] = rentValue(listing, market);
        break;
      case "transit":
        out[point.id] = transit(listing);
        break;
      case "cafes_nearby":
        out[point.id] = cafesNearby(listing);
        break;
      case "footfall":
        out[point.id] = footfall(listing);
        break;
      case "storefront":
        out[point.id] = storefront(listing);
        break;
      default:
        out[point.id] = { value: null, reason: "No data source for this point yet" };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Blend
// ---------------------------------------------------------------------------

/**
 * Weighted average of every point that has a value, on 0-100. Points that
 * could not be rated drop out and the remaining weights are rescaled, so a
 * missing metro file does not drag a listing down. Null when nothing rated.
 */
export function blendScore(profile: AiProfile, values: PointValues): number | null {
  let sum = 0;
  let weight = 0;
  for (const p of profile.points) {
    const v = values[p.id]?.value;
    if (v == null || !(p.weight > 0)) continue;
    sum += p.weight * ((v - 1) / 4) * 100;
    weight += p.weight;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}

// ---------------------------------------------------------------------------
// Examples (few-shot from head office feedback)
// ---------------------------------------------------------------------------

export interface FeedbackRow {
  place_id: string;
  city_id: string | null;
  rating_id: string | null;
  kind: "point" | "overall" | "assign" | "reject" | "request";
  point_id: string | null;
  ai_value: number | null;
  human_value: number | null;
  verdict: "too_low" | "right" | "too_high" | null;
  note: string | null;
  created_at: string;
}

/** Every piece of feedback on one listing, with what the AI said at the time. */
export interface ExamplePlace {
  listing: Listing;
  rentPct: number | null;
  blend: number | null;
  feedback: FeedbackRow[];
  newest: string;
  disagreed: boolean;
}

// Used to widen the example pool to the same country when a city has few.
const COUNTRY_BY_CITY: Record<string, string> = {
  madrid: "ES",
  barcelona: "ES",
  seville: "ES",
  valencia: "ES",
  prague: "CZ",
  brno: "CZ",
};

/** Did head office disagree with the AI on this piece of feedback? */
function feedbackDisagrees(f: FeedbackRow, blend: number | null): boolean {
  if (f.verdict) return f.verdict !== "right";
  if (f.ai_value != null && f.human_value != null) return f.ai_value !== f.human_value;
  if (blend == null) return false;
  // A decision is a disagreement when it goes against a clear AI lean.
  if (f.kind === "reject") return blend >= 60;
  if (f.kind === "assign" || f.kind === "request") return blend < 40;
  return false;
}

export function buildExamplePlace(
  listing: Listing,
  feedback: FeedbackRow[],
  blend: number | null,
  rentPct: number | null
): ExamplePlace {
  const newest = feedback.reduce((acc, f) => (f.created_at > acc ? f.created_at : acc), "");
  return {
    listing,
    rentPct,
    blend,
    feedback,
    newest,
    disagreed: feedback.some((f) => feedbackDisagrees(f, blend)),
  };
}

/**
 * How alike two listings are (0-100), weighted by the profile's match
 * weights. A factor that cannot be compared is dropped and the others are
 * rescaled, rather than being counted as a mismatch.
 */
export function matchPercent(
  target: Listing,
  targetPct: number | null,
  other: ExamplePlace,
  weights: MatchWeights
): number {
  const parts: { w: number; v: number }[] = [];

  const s1 = positiveNumber(target.metadata.size);
  const s2 = positiveNumber(other.listing.metadata.size);
  if (s1 && s2) {
    const ratio = Math.max(s1, s2) / Math.min(s1, s2);
    parts.push({ w: weights.size, v: Math.max(0, 1 - Math.log(ratio) / Math.log(3)) });
  }

  if (targetPct != null && other.rentPct != null) {
    parts.push({ w: weights.rent, v: Math.max(0, 1 - 2 * Math.abs(targetPct - other.rentPct)) });
  }

  if (target.cityId === other.listing.cityId && hasCoords(target) && hasCoords(other.listing)) {
    const d = haversineDistance(target.lat, target.lon, other.listing.lat, other.listing.lon);
    parts.push({ w: weights.distance, v: d <= 500 ? 1 : Math.max(0, 1 - (d - 500) / 2500) });
  }

  parts.push({ w: weights.deal, v: target.source === other.listing.source ? 1 : 0 });

  const total = parts.reduce((a, p) => a + p.w, 0);
  if (total <= 0) return 0;
  return Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / total) * 100);
}

function metersBetween(a: Listing, b: Listing): number | null {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  return haversineDistance(a.lat, a.lon, b.lat, b.lon);
}

/** The same shop listed twice (or relisted) is not a useful example of itself. */
function isNearDuplicate(a: Listing, b: Listing): boolean {
  const d = metersBetween(a, b);
  const s1 = positiveNumber(a.metadata.size);
  const s2 = positiveNumber(b.metadata.size);
  return d != null && d <= 30 && s1 != null && s2 != null && Math.abs(s1 - s2) <= 5;
}

const MAX_MATCHED = 10;
const MAX_DISAGREEMENTS = 7;
const MAX_NEWEST = 5;
const MIN_MATCH = 40;
const MIN_POOL = 10;

/**
 * Pick the feedback examples to show the model for one listing.
 *
 * The closest matches teach the most, but only if they are varied: at most
 * two from any one 500 m patch, and a mix of corrections (where head office
 * disagreed, the lessons) and agreements (so the model does not learn that
 * every rating is wrong). The newest feedback in the city is added on top so
 * a fresh correction shows up straight away, even before it is a close match.
 */
export function pickExamples(
  target: Listing,
  targetPct: number | null,
  all: ExamplePlace[],
  weights: MatchWeights
): { matched: { ex: ExamplePlace; match: number }[]; newest: ExamplePlace[] } {
  const usable = all.filter((e) => e.listing.id !== target.id && !isNearDuplicate(e.listing, target));
  if (usable.length === 0) return { matched: [], newest: [] };

  // Same city first, then the same country, then everywhere.
  let pool = usable.filter((e) => e.listing.cityId === target.cityId);
  if (pool.length < MIN_POOL) {
    const country = COUNTRY_BY_CITY[target.cityId];
    if (country) {
      pool = pool.concat(
        usable.filter((e) => e.listing.cityId !== target.cityId && COUNTRY_BY_CITY[e.listing.cityId] === country)
      );
    }
  }
  if (pool.length < MIN_POOL) {
    const inPool = new Set(pool.map((e) => e.listing.id));
    pool = pool.concat(usable.filter((e) => !inPool.has(e.listing.id)));
  }

  const scored = pool
    .map((ex) => ({ ex, match: matchPercent(target, targetPct, ex, weights) }))
    .filter((s) => s.match >= MIN_MATCH)
    .sort((a, b) => b.match - a.match);

  const chosen: { ex: ExamplePlace; match: number }[] = [];
  const crowded = (ex: ExamplePlace) =>
    chosen.filter((c) => {
      const d = metersBetween(c.ex.listing, ex.listing);
      return d != null && d <= 500;
    }).length >= 2;
  const take = (want: (s: { ex: ExamplePlace }) => boolean, cap: number) => {
    for (const s of scored) {
      if (chosen.length >= MAX_MATCHED || cap <= 0) return;
      if (!want(s) || chosen.includes(s) || crowded(s.ex)) continue;
      chosen.push(s);
      cap--;
    }
  };
  // Corrections first (capped so at least three agreements fit when there
  // are some), then agreements, then anything left if slots remain.
  take((s) => s.ex.disagreed, MAX_DISAGREEMENTS);
  take((s) => !s.ex.disagreed, MAX_MATCHED);
  take(() => true, MAX_MATCHED);
  chosen.sort((a, b) => b.match - a.match);

  const chosenIds = new Set(chosen.map((c) => c.ex.listing.id));
  const newest = usable
    .filter((e) => e.listing.cityId === target.cityId && !chosenIds.has(e.listing.id))
    .sort((a, b) => (a.newest < b.newest ? 1 : -1))
    .slice(0, MAX_NEWEST);

  return { matched: chosen, newest };
}

function rentBand(pct: number | null): string {
  if (pct == null) return "rent n/a";
  if (pct < 0.2) return "rent cheapest fifth";
  if (pct < 0.4) return "rent below average";
  if (pct < 0.6) return "rent average";
  if (pct < 0.8) return "rent above average";
  return "rent priciest fifth";
}

const VERDICT_WORDS: Record<string, string> = {
  too_low: "too low",
  right: "right",
  too_high: "too high",
};

/** One compact line per example: the listing, what the AI said, what head office said. */
export function renderExample(ex: ExamplePlace, profile: AiProfile, match: number | null): string {
  const meta = ex.listing.metadata;
  const size = positiveNumber(meta.size);
  const district = typeof meta.district === "string" && meta.district ? meta.district : ex.listing.cityId;
  const deal = sourceFamily(ex.listing.source) === "transfer" ? "transfer" : "rental";
  const head = [size ? `${Math.round(size)} m2` : "size n/a", district, rentBand(ex.rentPct), deal].join(", ");

  const labelOf = (id: string | null) => profile.points.find((p) => p.id === id)?.label ?? id ?? "point";
  const ai: string[] = [];
  const human: string[] = [];
  const notes: string[] = [];
  if (ex.blend != null) ai.push(`overall ${ex.blend}/100`);

  for (const f of ex.feedback) {
    if (f.kind === "point") {
      if (f.ai_value != null) ai.push(`${labelOf(f.point_id)} ${f.ai_value}/5`);
      const verdict = f.verdict ? VERDICT_WORDS[f.verdict] : null;
      const value = f.human_value != null ? `${f.human_value}/5` : null;
      human.push(`${labelOf(f.point_id)} ${[verdict, value && `(should be ${value})`].filter(Boolean).join(" ")}`.trim());
    } else if (f.kind === "overall") {
      const verdict = f.verdict ? VERDICT_WORDS[f.verdict] : null;
      const value = f.human_value != null ? `${f.human_value}/5` : null;
      human.push(`overall ${[verdict, value && `(they rate it ${value})`].filter(Boolean).join(" ")}`.trim());
    } else if (f.kind === "assign") {
      human.push("sent a scout");
    } else if (f.kind === "reject") {
      human.push("rejected it");
    } else if (f.kind === "request") {
      human.push("asked to see it");
    }
    if (f.note) notes.push(f.note.replace(/\s+/g, " ").trim().slice(0, 200));
  }

  const matchText = match != null ? ` [${match}% match]` : "";
  const noteText = notes.length ? ` Note: "${notes.join("; ")}"` : "";
  return `- ${head}${matchText}. AI said: ${ai.join(", ") || "n/a"}. Head office: ${human.join(", ") || "no verdict"}.${noteText}`;
}

// ---------------------------------------------------------------------------
// Prompt and schema
// ---------------------------------------------------------------------------

/**
 * The base layer every customer shares. It says how to rate, not what a good
 * location is: that comes from the customer's own profile text below it.
 */
const BASE_PROMPT = `You are a commercial real estate location analyst. You rate retail and hospitality premises for a client, using the listing text, the listing photos and the map facts provided.

How to read the photos:
- Listing photos are marketing. Look for what they show and what they avoid showing: the street outside, the shop front, the windows, the ceiling height, stairs, the state of the fit-out, signs of a previous kitchen or bar.
- An interior with no street view tells you nothing about the street. Do not infer foot traffic from interior shots.
- If a photo is a floor plan, map or logo, use it only for what it clearly shows.

How to rate:
- Rate each requested point from 1 (poor) to 5 (excellent) using the point's guide.
- Use null when the evidence cannot support a rating. Never guess, and never fill a gap with an average.
- The map facts are computed from data and are given for context. Do not contradict them; use them.
- Rents are in the listing's own currency (for example EUR or CZK). Judge them against that city's market, never as if they were euros.
- gut_score is your overall 0-100 judgement of the premises for this client, formed independently of the point weights.
- If your gut score disagrees with what the points add up to, say why in disagreement_reason. Otherwise leave it as an empty string.
- Be concise: each reason is a short phrase.
- The summary is what a busy person reads on the map, so keep it to one short sentence, two at most, under 25 words. Use plain everyday words a 15-year-old would understand, with no jargon. Lead with the biggest plus, then the biggest minus. Skip figures unless one really matters: "near the metro", not "140 m to the metro". Example: "Big shop near the metro with fair rent, but the ceiling is low."`;

export function buildSystemPrompt(profile: AiProfile): string {
  const aiPoints = profile.points.filter((p) => p.kind === "ai");
  const sections = [BASE_PROMPT, `## The client\n${profile.business.trim()}`];
  const rules = (profile.rules || []).map((r) => r.trim()).filter(Boolean);
  if (rules.length) sections.push(`## What the client has taught us\n${rules.map((r) => `- ${r}`).join("\n")}`);
  sections.push(
    `## Points to rate\n${aiPoints.map((p) => `- ${p.id} (${p.label}): ${p.guide.trim()}`).join("\n")}`
  );
  return sections.join("\n\n");
}

/** Address plus district, unless the scraper already put the district in it. */
export function withDistrict(listing: Listing): string {
  const base = listing.address || listing.name;
  const district = typeof listing.metadata.district === "string" ? listing.metadata.district.trim() : "";
  return district && !base.toLowerCase().includes(district.toLowerCase()) ? `${base}, ${district}` : base;
}

/** The listing as the model reads it: plain facts, one per line. */
export function buildListingText(listing: Listing, facts: PointValues, profile: AiProfile): string {
  const meta = listing.metadata;
  const size = positiveNumber(meta.size);
  const price = positiveNumber(meta.price);
  const currency = currencyFor(listing);
  const perSqm = rentPerSqm(meta);

  const money = currency ?? "(currency unknown)";
  let rent = price ? `${Math.round(price)} ${money} per month` : "not listed";
  if (price && perSqm) rent += ` (${perSqm.toFixed(1)} ${money} per m2)`;

  // Some rentals are really transfers: the fee was found in their description.
  let deal = "rental";
  const fee = positiveNumber(meta.transfer);
  if (listing.source === "idealista_transfer" || fee) {
    deal = `transfer of an existing business${fee ? `, one-off fee ${Math.round(fee)} ${money}` : ""}`;
  }

  const storefront = meta.hasStorefront === true ? "yes" : meta.hasStorefront === false ? "no" : "not stated";
  const station = nearestStation(listing);
  const description =
    typeof meta.description === "string" && meta.description.trim()
      ? meta.description.replace(/\s+/g, " ").trim().slice(0, 300)
      : null;

  const lines = [
    `Address: ${withDistrict(listing)}`,
    `City: ${listing.cityId}`,
    `Size: ${size ? `${Math.round(size)} m2` : "not listed"}`,
    `Rent: ${rent}`,
    `Deal type: ${deal}`,
  ];
  if (meta.floor != null && meta.floor !== "") lines.push(`Floor: ${meta.floor}`);
  lines.push(`Street-level storefront: ${storefront}`);
  if (station) lines.push(`Nearest metro: ${station.name}, ${Math.round(station.meters / 10) * 10} m`);
  if (description) lines.push(`Description: ${description}`);

  const factLines = profile.points
    .filter((p) => p.kind === "fact")
    .map((p) => {
      const f = facts[p.id];
      return `- ${p.label}: ${f?.value != null ? `${f.value}/5` : "unknown"} (${f?.reason ?? "no data"})`;
    });
  if (factLines.length) lines.push("", "Map facts (already rated, for context):", ...factLines);

  return lines.join("\n");
}

/**
 * JSON schema for the reply, built from the profile's AI points so a new
 * point in the database needs no code change. Structured outputs do not
 * support minimum/maximum, so the 1-5 range is an enum and 0-100 is clamped
 * after parsing.
 */
export function buildOutputSchema(profile: AiProfile): Record<string, unknown> {
  const aiPoints = profile.points.filter((p) => p.kind === "ai");
  const pointSchema = {
    type: "object",
    properties: {
      value: { anyOf: [{ type: "integer", enum: [1, 2, 3, 4, 5] }, { type: "null" }] },
      reason: { type: "string" },
    },
    required: ["value", "reason"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      points: {
        type: "object",
        properties: Object.fromEntries(aiPoints.map((p) => [p.id, pointSchema])),
        required: aiPoints.map((p) => p.id),
        additionalProperties: false,
      },
      gut_score: { type: "integer" },
      summary: { type: "string" },
      disagreement_reason: { type: "string" },
    },
    required: ["points", "gut_score", "summary", "disagreement_reason"],
    additionalProperties: false,
  };
}

export interface ModelVerdict {
  points: PointValues;
  gut: number;
  summary: string;
  disagreement: string;
}

/**
 * Read the model's reply. Structured output should already be clean JSON;
 * the fence stripping is a fallback for a reply that slipped through as
 * markdown. Returns null when the shape is unusable.
 */
export function parseVerdict(text: string, profile: AiProfile): ModelVerdict | null {
  const raw = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const obj = parsed as {
    points?: Record<string, { value?: unknown; reason?: unknown }>;
    gut_score?: unknown;
    summary?: unknown;
    disagreement_reason?: unknown;
  };
  if (!obj || typeof obj !== "object" || typeof obj.points !== "object" || obj.points === null) return null;
  if (typeof obj.gut_score !== "number" || typeof obj.summary !== "string") return null;

  const points: PointValues = {};
  for (const p of profile.points.filter((x) => x.kind === "ai")) {
    const got = obj.points[p.id];
    const v = typeof got?.value === "number" ? Math.round(got.value) : null;
    points[p.id] = {
      value: v != null && v >= 1 && v <= 5 ? v : null,
      reason: typeof got?.reason === "string" ? got.reason : "",
    };
  }
  return {
    points,
    gut: Math.max(0, Math.min(100, Math.round(obj.gut_score))),
    summary: obj.summary.trim(),
    disagreement: typeof obj.disagreement_reason === "string" ? obj.disagreement_reason.trim() : "",
  };
}

// Gut feel and the points can differ a little; past this gap a person should
// look at the listing themselves.
const SECOND_LOOK_GAP = 20;

export function secondLook(gut: number, blend: number, reason: string): string | null {
  if (Math.abs(gut - blend) <= SECOND_LOOK_GAP) return null;
  if (reason) return reason;
  return gut > blend
    ? `Gut feel (${gut}) is well above what the points add up to (${blend}).`
    : `Gut feel (${gut}) is well below what the points add up to (${blend}).`;
}

// ---------------------------------------------------------------------------
// Learning loop (weekly suggestions and the scoreboard)
// ---------------------------------------------------------------------------

/**
 * One exact change to the instructions, in the shape stored in
 * ai_suggestions.change. Accepting applies it in SQL
 * (decide_ai_suggestion), so applyChange below must do the same arithmetic.
 */
export type SuggestionChange =
  | { add_rule: string }
  | { add_point: { id: string; label: string; guide: string; weight: number } }
  | { move_weight: { from: string; to: string; amount: number } };

export type SuggestionKind = "rule" | "point" | "weight";

export function changeKind(change: SuggestionChange): SuggestionKind {
  if ("add_rule" in change) return "rule";
  if ("add_point" in change) return "point";
  return "weight";
}

const SUGGESTION_POINT_ID = /^[a-z_]{1,40}$/;
const MAX_RULE_LENGTH = 300;
const MAX_LABEL_LENGTH = 60;
const MAX_GUIDE_LENGTH = 600;

function cleanText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function isWholeIn(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Read a stored or proposed change into its exact shape, without checking it
 * against any instructions. Returns an error in plain words when it is not
 * one of the three shapes.
 */
export function parseChange(raw: unknown): { change: SuggestionChange } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "the change is not an object" };
  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).length !== 1) return { error: "a suggestion must hold exactly one change" };

  if ("add_rule" in obj) {
    const rule = cleanText(obj.add_rule);
    if (!rule) return { error: "the rule is empty" };
    if (rule.length > MAX_RULE_LENGTH) return { error: `the rule is longer than ${MAX_RULE_LENGTH} characters` };
    return { change: { add_rule: rule } };
  }

  if ("add_point" in obj) {
    const p = (obj.add_point || {}) as Record<string, unknown>;
    const id = typeof p.id === "string" ? p.id.trim() : "";
    const label = cleanText(p.label);
    const guide = cleanText(p.guide);
    if (!SUGGESTION_POINT_ID.test(id)) return { error: `the new point id "${id}" is not snake_case` };
    if (!label || label.length > MAX_LABEL_LENGTH) return { error: "the new point needs a short label" };
    if (!guide || guide.length > MAX_GUIDE_LENGTH) return { error: "the new point needs a guide" };
    if (!isWholeIn(p.weight, 1, 30)) return { error: "a new point must weigh a whole 1 to 30" };
    return { change: { add_point: { id, label, guide, weight: p.weight } } };
  }

  if ("move_weight" in obj) {
    const m = (obj.move_weight || {}) as Record<string, unknown>;
    const from = typeof m.from === "string" ? m.from : "";
    const to = typeof m.to === "string" ? m.to : "";
    if (!from || !to || from === to) return { error: "a weight move needs two different points" };
    if (!isWholeIn(m.amount, 1, 10)) return { error: "weights move by a whole 1 to 10 at a time" };
    return { change: { move_weight: { from, to, amount: m.amount } } };
  }

  return { error: "unknown kind of change" };
}

/**
 * Parse a change and check that it fits these instructions: a new rule or
 * point that is not already there, a weight move between points that exist
 * and that leaves the giving point with some weight (points are never
 * removed, not even by weighing nothing).
 */
export function validateChange(raw: unknown, profile: AiProfile): { change: SuggestionChange } | { error: string } {
  const parsed = parseChange(raw);
  if ("error" in parsed) return parsed;
  const change = parsed.change;

  if ("add_rule" in change) {
    const key = change.add_rule.toLowerCase();
    if (profile.rules.some((r) => cleanText(r).toLowerCase() === key)) return { error: "that rule is already there" };
  } else if ("add_point" in change) {
    if (profile.points.some((p) => p.id === change.add_point.id)) return { error: "that rating point already exists" };
  } else {
    const { from, to, amount } = change.move_weight;
    const giver = profile.points.find((p) => p.id === from);
    if (!giver) return { error: `there is no rating point "${from}"` };
    if (!profile.points.some((p) => p.id === to)) return { error: `there is no rating point "${to}"` };
    if (giver.weight - amount < 1) return { error: `"${from}" does not have ${amount} weight to give` };
  }
  return { change };
}

/**
 * The instructions with one change applied, as a new object. Same arithmetic
 * as decide_ai_suggestion: a new point is an AI point whose weight comes
 * proportionally from the others (each scaled by (100 - w) / 100 and
 * rounded), and the heaviest point absorbs the rounding so the total stays
 * 100. On a tie for heaviest the first in the list takes it.
 */
export function applyChange(profile: AiProfile, change: SuggestionChange): AiProfile {
  const points = profile.points.map((p) => ({ ...p }));
  const rules = [...profile.rules];

  if ("add_rule" in change) {
    rules.push(change.add_rule);
  } else if ("add_point" in change) {
    const w = change.add_point.weight;
    for (const p of points) p.weight = Math.round((p.weight * (100 - w)) / 100);
    points.push({ id: change.add_point.id, label: change.add_point.label, kind: "ai", weight: w, guide: change.add_point.guide });
    const total = points.reduce((a, p) => a + p.weight, 0);
    let heaviest = points[0];
    for (const p of points) if (p.weight > heaviest.weight) heaviest = p;
    heaviest.weight += 100 - total;
  } else {
    const { from, to, amount } = change.move_weight;
    for (const p of points) {
      if (p.id === from) p.weight -= amount;
      else if (p.id === to) p.weight += amount;
    }
  }
  return { ...profile, rules, points };
}

/** Do two versions hold the same rules and points (ignoring ids and dates)? */
export function sameInstructions(a: AiProfile, b: AiProfile): boolean {
  const pts = (p: AiProfile) => JSON.stringify(p.points.map((x) => [x.id, x.kind, Number(x.weight), x.label, x.guide]));
  const rules = (p: AiProfile) => JSON.stringify(p.rules.map(cleanText));
  return pts(a) === pts(b) && rules(a) === rules(b);
}

/** A stable key per change, so the same change is not suggested twice. */
export function changeKey(change: SuggestionChange): string {
  if ("add_rule" in change) return `rule:${cleanText(change.add_rule).toLowerCase()}`;
  if ("add_point" in change) return `point:${change.add_point.id}`;
  const m = change.move_weight;
  return `weight:${m.from}>${m.to}:${m.amount}`;
}

/** One piece of feedback as the scoreboard reads it. */
export interface LabelSource {
  place_id: string;
  kind: FeedbackRow["kind"];
  point_id: string | null;
  human_value: number | null;
  verdict: FeedbackRow["verdict"];
  /** When head office last set it (updated_at, else created_at). */
  at: string;
  /** For overall verdicts: the blend head office was reacting to. */
  old_blend: number | null;
}

/**
 * What head office said, in a form a rating can be checked against:
 * a point value, an overall verdict on a known blend, or a decision that
 * wants a high (scout sent, viewing asked for) or low (rejected) blend.
 */
export type Label =
  | { kind: "point"; placeId: string; at: string; pointId: string; human: number }
  | { kind: "overall"; placeId: string; at: string; verdict: "too_low" | "right" | "too_high"; oldBlend: number }
  | { kind: "decision"; placeId: string; at: string; want: "high" | "low" };

/**
 * Turn feedback into labels. When several people labelled the same thing
 * (the same point, the overall verdict, or the decision on one listing), the
 * newest wins. Feedback that cannot be checked (a note without a verdict, a
 * verdict on an unknown blend) is left out.
 */
export function buildLabels(rows: LabelSource[]): Label[] {
  const newest = new Map<string, Label>();
  for (const r of rows) {
    let label: Label | null = null;
    let key = "";
    if (r.kind === "point" && r.point_id && r.human_value != null) {
      label = { kind: "point", placeId: r.place_id, at: r.at, pointId: r.point_id, human: r.human_value };
      key = `${r.place_id}|point|${r.point_id}`;
    } else if (r.kind === "overall" && r.verdict && r.old_blend != null) {
      label = { kind: "overall", placeId: r.place_id, at: r.at, verdict: r.verdict, oldBlend: r.old_blend };
      key = `${r.place_id}|overall`;
    } else if (r.kind === "assign" || r.kind === "request" || r.kind === "reject") {
      label = { kind: "decision", placeId: r.place_id, at: r.at, want: r.kind === "reject" ? "low" : "high" };
      key = `${r.place_id}|decision`;
    }
    if (!label) continue;
    const prev = newest.get(key);
    if (!prev || label.at > prev.at) newest.set(key, label);
  }
  return [...newest.values()];
}

export const SAMPLE_LISTINGS = 50;

/** The labels on the most recently labelled listings (all labels on each). */
export function sampleLabels(labels: Label[], size = SAMPLE_LISTINGS): Label[] {
  const lastAt = new Map<string, string>();
  for (const l of labels) {
    const prev = lastAt.get(l.placeId);
    if (!prev || l.at > prev) lastAt.set(l.placeId, l.at);
  }
  const keep = new Set(
    [...lastAt.entries()]
      .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
      .slice(0, size)
      .map(([id]) => id)
  );
  return labels.filter((l) => keep.has(l.placeId));
}

/** What one version of the instructions says about one listing. */
export interface Prediction {
  points: PointValues;
  blend: number;
  gut: number | null;
}

/**
 * Re-blend stored point values under (possibly different) weights. Same
 * fallback as the scorer: when nothing could be rated, the gut score is used.
 */
export function predictFromPoints(profile: AiProfile, points: PointValues, gut: number | null): Prediction | null {
  const blend = blendScore(profile, points) ?? gut;
  return blend == null ? null : { points, blend, gut };
}

// A decision for a listing agrees with a blend of 60+ (worth a scout) or,
// for a rejection, under 50. An overall "too high" or "too low" wants the
// blend to move at least 5; "right" wants it to stay within 10.
const DECISION_HIGH = 60;
const DECISION_LOW = 50;
const VERDICT_MOVE = 5;
const VERDICT_STEADY = 10;

/** How well one prediction matches one label, 0 to 1, or null when it cannot say. */
export function labelAgreement(label: Label, pred: Prediction): number | null {
  if (label.kind === "point") {
    const v = pred.points[label.pointId]?.value;
    return v == null ? null : 1 - Math.abs(v - label.human) / 4;
  }
  if (label.kind === "decision") {
    const ok = label.want === "high" ? pred.blend >= DECISION_HIGH : pred.blend < DECISION_LOW;
    return ok ? 1 : 0;
  }
  const delta = pred.blend - label.oldBlend;
  if (label.verdict === "too_high") return delta <= -VERDICT_MOVE ? 1 : 0;
  if (label.verdict === "too_low") return delta >= VERDICT_MOVE ? 1 : 0;
  return Math.abs(delta) <= VERDICT_STEADY ? 1 : 0;
}

export interface Scoreboard {
  /** Mean agreement (0-1) of the first version on the shared labels. */
  before: number;
  /** Mean agreement (0-1) of the second version on the same labels. */
  after: number;
  /** How many labels both versions could be judged on. */
  sample: number;
}

/**
 * Compare two versions on exactly the same labels. A label counts only when
 * both versions have a rating for the listing and a value for the point, so
 * a failed model call or a point one version lacks cannot tilt the result.
 * Null when no label could be judged.
 */
export function compareOnLabels(
  labels: Label[],
  before: Map<string, Prediction>,
  after: Map<string, Prediction>
): Scoreboard | null {
  let a = 0;
  let b = 0;
  let n = 0;
  for (const l of labels) {
    const pa = before.get(l.placeId);
    const pb = after.get(l.placeId);
    if (!pa || !pb) continue;
    const sa = labelAgreement(l, pa);
    const sb = labelAgreement(l, pb);
    if (sa == null || sb == null) continue;
    a += sa;
    b += sb;
    n++;
  }
  return n > 0 ? { before: a / n, after: b / n, sample: n } : null;
}

/** Re-blend every prediction under another version's weights. */
export function reweigh(profile: AiProfile, preds: Map<string, Prediction>): Map<string, Prediction> {
  const out = new Map<string, Prediction>();
  for (const [id, p] of preds) {
    const next = predictFromPoints(profile, p.points, p.gut);
    if (next) out.set(id, next);
  }
  return out;
}

export const TUNE_STEP = 5;

/**
 * Weight self-tune, with no model calls: try moving `step` weight from each
 * point to each other point, re-blend the stored ratings, and return the move
 * that best matches head office's decisions and overall verdicts (point
 * labels do not depend on weights, so they are left out). Null when no move
 * can be judged.
 */
export function bestWeightMove(
  profile: AiProfile,
  labels: Label[],
  base: Map<string, Prediction>,
  step = TUNE_STEP
): { change: SuggestionChange; board: Scoreboard } | null {
  const useful = labels.filter((l) => l.kind !== "point");
  const current = reweigh(profile, base);
  let best: { change: SuggestionChange; board: Scoreboard } | null = null;
  for (const from of profile.points) {
    if (from.weight - step < 1) continue;
    for (const to of profile.points) {
      if (to.id === from.id) continue;
      const change: SuggestionChange = { move_weight: { from: from.id, to: to.id, amount: step } };
      const board = compareOnLabels(useful, current, reweigh(applyChange(profile, change), base));
      if (board && (!best || board.after > best.board.after)) best = { change, board };
    }
  }
  return best;
}

/** 0.623 as "62%". */
export function percent(x: number): string {
  return `${Math.round(x * 100)}%`;
}
