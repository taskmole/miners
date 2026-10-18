export interface InboxProperty {
  id: string;
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  source: string;
  price: number;
  size: number;
  priceByArea: number;
  district: string;
  hasAirConditioning: boolean;
  url: string;
  transfer?: number;
  hasBathroom: boolean;
  hasStorefront: boolean;
  image_url?: string;
  photos?: string[];
  score?: number;
  aiScore?: number;
  aiReason?: string;
  createdAt?: string;
  /** The AI scout's point-by-point rating. Absent until the scorer has rated it. */
  aiBreakdown?: AiBreakdown;
}

/** How the overall score felt to the person reviewing it. */
export type AiVerdict = "too_low" | "right" | "too_high";

/** One rated point: either a fact read off the map or a judgment from photos. */
export interface AiBreakdownPoint {
  id: string;
  label: string;
  kind: "fact" | "ai";
  weight: number;
  /** 1 to 5, or null when the AI could not tell. */
  value: number | null;
  reason: string;
}

export interface AiBreakdown {
  ratingId: string;
  /** The final 0-100 score. */
  blend: number;
  /** The AI's gut score from the photos alone, if it gave one. */
  gut: number | null;
  /** Set when facts and gut disagree enough to deserve a human look. */
  secondLook: string | null;
  summary: string;
  photosChecked: number;
  points: AiBreakdownPoint[];
  /** May this person correct the AI in this city? */
  canTrain: boolean;
  /** What this person already told the AI about this listing. */
  mine: {
    /** pointId -> the value they set (1 to 5). */
    points: Record<string, number>;
    verdict: AiVerdict | null;
    note: string | null;
  };
}

export function formatPrice(amount: number, source: string): string {
  const rounded = Math.round(amount).toLocaleString("en-US");
  return source === "sreality" ? `${rounded} Kč` : `€${rounded}`;
}

export function dedupTitle(name: string): string {
  return name.replace(/\s*\d+([.,]\d+)?\s*m[²2]\s*$/i, "").trim();
}

export function formatAge(createdAt?: string): string {
  if (!createdAt) return "";
  const days = Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return "Today";
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function fmtK(n: number, currency?: string): string {
  const prefix = currency ? `${currency === "CZK" ? "Kč" : "€"}` : "";
  if (Math.abs(n) >= 1000) {
    return `${prefix}${Math.round(n / 1000)}k`;
  }
  return `${prefix}${Math.round(n)}`;
}
