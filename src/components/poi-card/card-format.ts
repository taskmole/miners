/**
 * Plain text helpers for the map pin card. No React here, so every rule the
 * card shows can be tested on its own.
 */
import type { PropertyData } from "@/hooks/useMapData";
import type { PropertyActionStage } from "@/lib/property-actions";
import type { ScoutingTripStatus } from "@/types/scouting";
import { capitalizeFirst } from "@/lib/text";
import { formatPrice as formatAmount } from "@/types/inbox";

/**
 * True for a number worth showing. Cluster clicks rebuild a listing from
 * strings, so a missing value can arrive as NaN; and a 0 price or transfer
 * means "unknown", never "free".
 */
export function isShown(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** The listing's photos: the list if it has any, else the single image. */
export function listingPhotos(p: Pick<PropertyData, "photos" | "image_url">): string[] {
  if (Array.isArray(p.photos) && p.photos.length > 0) return p.photos;
  return p.image_url ? [p.image_url] : [];
}

const isCzk = (source: PropertyData["source"]) => source === "sreality";

/** "€2,400" or "45,000 Kč". Null when there is no real price. */
export function formatPrice(price: number | undefined, source: PropertyData["source"]): string | null {
  return isShown(price) ? formatAmount(price, source) : null;
}

/** "€12k" or "350k Kč", for the transfer fee in the facts line. */
function formatShortMoney(amount: number, source: PropertyData["source"]): string {
  const n = amount >= 1000 ? `${Math.round(amount / 1000)}k` : String(Math.round(amount));
  return isCzk(source) ? `${n} Kč` : `€${n}`;
}

/**
 * Change against the last recorded price, ignoring moves under 0.5%.
 * Never shown without a current price.
 */
export function priceChange(p: Pick<PropertyData, "price" | "priceHistory">): { direction: "up" | "down"; text: string } | null {
  if (!isShown(p.price) || !p.priceHistory?.length) return null;
  const last = p.priceHistory[p.priceHistory.length - 1].price;
  if (!isShown(last) || last === p.price) return null;
  const percent = Math.abs(((p.price - last) / last) * 100);
  if (percent < 0.5) return null;
  return {
    direction: p.price > last ? "up" : "down",
    text: `${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`,
  };
}

// The city is already on screen, so the address drops it. "Praha 2" stays:
// the district number is the useful part.
const CITY_SUFFIX = /,\s*(madrid|barcelona|praha|prague)\s*$/i;

// Business-transfer listings write what the business is in front of the
// address: "Bar, restaurant in Calle Mayor 5, Madrid".
const BUSINESS_PREFIX = /^(.{2,40}?) in (?=\S)/;

/** "Bar, restaurant" from a transfer listing's address, else null. */
function businessKind(address: string | undefined): string | null {
  const m = address?.match(BUSINESS_PREFIX);
  return m ? capitalizeFirst(m[1].trim()) : null;
}

/** "Bar in Calle Mayor 5, Madrid" -> "Calle Mayor 5". */
export function shortAddress(address: string | undefined): string {
  if (!address) return "";
  const street = address.replace(BUSINESS_PREFIX, "");
  const short = street.replace(CITY_SUFFIX, "").trim();
  return capitalizeFirst(short || street.trim());
}

/**
 * Up to four real facts, most useful first, so the line never wraps.
 * Only fields the listing actually has; nothing is guessed from the text.
 */
export function listingFacts(
  p: Pick<PropertyData, "size" | "transfer" | "hasStorefront" | "hasAirConditioning" | "hasBathroom" | "source" | "address">,
): string[] {
  const facts: string[] = [];
  const kind = businessKind(p.address);
  if (kind) facts.push(kind);
  if (isShown(p.size)) facts.push(`${Math.round(p.size)} m²`);
  if (isShown(p.transfer)) facts.push(`${formatShortMoney(p.transfer, p.source)} transfer`);
  if (p.hasStorefront) facts.push("Storefront");
  if (p.hasAirConditioning) facts.push("A/C");
  if (p.hasBathroom) facts.push("Bathroom");
  return facts.slice(0, 4);
}

/** "€2,400/mo", or "On request" without a price. */
export function priceLabel(p: Pick<PropertyData, "price" | "source">): string {
  const price = formatPrice(p.price, p.source);
  return price ? `${price}/mo` : "On request";
}

/** Title for the phone's share sheet: "€2,400/mo · 95 m²". */
export function listingShareTitle(p: PropertyData): string {
  const parts = [priceLabel(p)];
  if (isShown(p.size)) parts.push(`${Math.round(p.size)} m²`);
  return parts.join(" · ");
}

// ── Age ──────────────────────────────────────────────────────────────────

function ageParts(dateStr: string, now: number): { n: number; unit: "d" | "w" | "mo" } | null {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now - t) / 86_400_000);
  if (days < 1) return { n: 0, unit: "d" };
  if (days < 14) return { n: days, unit: "d" };
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return { n: weeks, unit: "w" };
  return { n: Math.max(2, Math.floor(days / 30)), unit: "mo" };
}

/** Chip text: "Today", "3d ago", "2w ago", "3mo ago". */
export function ageShort(dateStr: string | undefined, now = Date.now()): string | null {
  if (!dateStr) return null;
  const a = ageParts(dateStr, now);
  if (!a) return null;
  return a.n === 0 ? "Today" : `${a.n}${a.unit} ago`;
}

/** Tooltip text: "Updated today", "Updated 3 days ago", "Updated 1 week ago". */
export function ageLong(dateStr: string | undefined, now = Date.now()): string | null {
  if (!dateStr) return null;
  const a = ageParts(dateStr, now);
  if (!a) return null;
  if (a.n === 0) return "Updated today";
  const word = { d: "day", w: "week", mo: "month" }[a.unit];
  return `Updated ${a.n} ${word}${a.n === 1 ? "" : "s"} ago`;
}

// ── Opening hours ────────────────────────────────────────────────────────

// Madrid, Barcelona and Prague share one clock, including the summer change.
const CITY_TIME_ZONE = "Europe/Madrid";

/** "8:30 AM" -> minutes after midnight; meridiem may be borrowed. */
function parseClock(raw: string): { h: number; m: number; meridiem: "AM" | "PM" | null } | null {
  const match = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  const h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  if (h < 1 || h > 12 || m > 59) return null;
  return { h, m, meridiem: match[3] ? (match[3].toUpperCase() as "AM" | "PM") : null };
}

function to24(h12: number, meridiem: "AM" | "PM"): number {
  return (h12 % 12) + (meridiem === "PM" ? 12 : 0);
}

const clock = (h: number, m: number) => `${h}:${String(m).padStart(2, "0")}`;

/** "8:30 AM – 7:00 PM" -> "8:30–19:00". Null when the format is unknown. */
function parseRange(range: string): string | null {
  const [a, b, extra] = range.split("–");
  if (!a || !b || extra !== undefined) return null;
  const start = parseClock(a);
  const end = parseClock(b);
  if (!start || !end || !end.meridiem) return null;
  // Google drops the first AM/PM when both match ("5:00 – 8:00 PM"). When the
  // start would then come after the end ("11:00 – 1:00 PM"), it was morning.
  let startMeridiem = start.meridiem;
  if (!startMeridiem) {
    startMeridiem = start.h % 12 > end.h % 12 ? (end.meridiem === "PM" ? "AM" : "PM") : end.meridiem;
  }
  const endH = to24(end.h, end.meridiem);
  // Closing at midnight reads better as 24:00 than 0:00.
  const endText = endH === 0 && end.m === 0 ? "24:00" : clock(endH, end.m);
  return `${clock(to24(start.h, startMeridiem), start.m)}–${endText}`;
}

/**
 * Today's line from Google's weekly hours text, as it is written there:
 * "Today 8:30–19:00", "Today 8:00–14:00, 17:00–20:00", "Closed today",
 * "Open 24h". No "open now" maths: the card only repeats what Google says.
 *
 * Input looks like "Monday: 8:30 AM – 7:00 PM; Tuesday: Closed; …" with
 * narrow no-break spaces. Anything unrecognised gives null, never a guess.
 */
export function todayHours(text: string | undefined, now: Date = new Date()): string | null {
  if (!text) return null;
  const clean = text
    .replace(/[   ]/g, " ")
    .replace(/\s*[\u2013\u2014-]\s*/g, "–");
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: CITY_TIME_ZONE }).format(now);
  const entry = clean
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.toLowerCase().startsWith(`${day.toLowerCase()}:`));
  if (!entry) return null;
  const value = entry.slice(day.length + 1).trim();
  if (/^closed$/i.test(value)) return "Closed today";
  if (/^open 24 hours$/i.test(value)) return "Open 24h";
  const ranges = value.split(",").map((r) => parseRange(r));
  if (ranges.length === 0 || ranges.some((r) => r === null)) return null;
  return `Today ${ranges.join(", ")}`;
}

// ── Status pill ──────────────────────────────────────────────────────────

export type PillTone = "grey" | "blue" | "green" | "amber" | "red";

export interface StatusPill {
  /** One or two plain words: "Assigned", "Trip returned". Never who or why. */
  label: string;
  tone: PillTone;
  /** The who / when / why, shown only in the pill's tooltip. */
  detail: string | null;
}

export interface StatusPillInput {
  stage: PropertyActionStage;
  isAssignedToMe: boolean;
  /** "Ana" or "Team Norte"; null when we could not look the name up. */
  assigneeLabel: string | null;
  preRejectReason: string | null;
  pitchStatus: ScoutingTripStatus | null;
  pitchDate: string | null;
  pitchReason: string | null;
}

const PITCH_PILL: Record<ScoutingTripStatus, { label: string; tone: PillTone }> = {
  draft: { label: "Trip started", tone: "blue" },
  submitted: { label: "Trip submitted", tone: "blue" },
  approved: { label: "Trip approved", tone: "green" },
  returned: { label: "Trip returned", tone: "amber" },
  rejected: { label: "Trip rejected", tone: "red" },
};

/**
 * The status that takes the main button's place, or null when the card shows
 * a button instead. Follows evaluatePropertyActions' `stage`, so the pill can
 * never disagree with which actions are on offer.
 */
export function statusPill(i: StatusPillInput): StatusPill | null {
  switch (i.stage) {
    case "preRejected":
      return { label: "Pre-rejected", tone: "red", detail: i.preRejectReason };
    case "pitch": {
      if (!i.pitchStatus) return null;
      const pill = PITCH_PILL[i.pitchStatus];
      const reason = i.pitchStatus === "returned" || i.pitchStatus === "rejected" ? i.pitchReason : null;
      const date = i.pitchDate
        ? new Date(i.pitchDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : null;
      const detail = date ? `${pill.label} on ${date}${reason ? `: ${reason}` : ""}` : reason;
      return { label: pill.label, tone: pill.tone, detail };
    }
    case "assigned":
      // The holder gets "Plan trip" instead.
      if (i.isAssignedToMe) return null;
      return { label: "Assigned", tone: "blue", detail: i.assigneeLabel ? `Assigned to ${i.assigneeLabel}` : null };
    case "requested":
      return { label: "Requested", tone: "grey", detail: "Waiting for a reviewer" };
    case "declined":
      return { label: "Declined", tone: "grey", detail: "Your request for this property was declined" };
    default:
      return null;
  }
}
