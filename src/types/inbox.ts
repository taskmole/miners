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
