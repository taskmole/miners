/**
 * Address Utilities
 *
 * Functions for normalizing and comparing addresses
 * Used for deduplication (checking if two places have similar addresses)
 */

// Common Spanish address prefixes to remove for comparison
const SPANISH_PREFIXES = [
  "calle",
  "c/",
  "c.",
  "c ",
  "avenida",
  "av.",
  "av ",
  "plaza",
  "pl.",
  "pl ",
  "paseo",
  "p.",
  "carrera",
  "carrer",
  "rambla",
  "travessera",
  "gran via",
  "passeig",
];

// Common words to remove (don't add meaning for comparison)
const NOISE_WORDS = [
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "madrid",
  "barcelona",
  "prague",
  "españa",
  "spain",
  "czech",
];

/**
 * Normalize address for comparison
 * - Lowercase
 * - Remove accents
 * - Remove punctuation
 * - Remove common prefixes and noise words
 */
export function normalizeAddress(address: string): string {
  if (!address) return "";

  let normalized = address.toLowerCase();

  // Remove accents (Spanish and Czech)
  normalized = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Remove punctuation
  normalized = normalized.replace(/[.,;:'"!?()[\]{}]/g, " ");

  // Remove common prefixes
  for (const prefix of SPANISH_PREFIXES) {
    const regex = new RegExp(`\\b${prefix}\\b`, "gi");
    normalized = normalized.replace(regex, " ");
  }

  // Remove noise words
  for (const word of NOISE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    normalized = normalized.replace(regex, " ");
  }

  // Collapse multiple spaces and trim
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Tokenize an address into meaningful parts
 */
export function tokenize(address: string): string[] {
  const normalized = normalizeAddress(address);
  return normalized.split(" ").filter((token) => token.length > 0);
}

/**
 * Calculate similarity between two addresses (0-1)
 * Uses token overlap (Jaccard similarity)
 */
export function addressSimilarity(addr1: string, addr2: string): number {
  const tokens1 = new Set(tokenize(addr1));
  const tokens2 = new Set(tokenize(addr2));

  if (tokens1.size === 0 || tokens2.size === 0) {
    return 0;
  }

  // Count intersection
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) {
      intersection++;
    }
  }

  // Jaccard similarity: intersection / union
  const union = tokens1.size + tokens2.size - intersection;
  return intersection / union;
}

/**
 * Check if two addresses are similar (above threshold)
 * Default threshold is 0.6 (60% token overlap)
 */
export function areAddressesSimilar(
  addr1: string,
  addr2: string,
  threshold: number = 0.6
): boolean {
  return addressSimilarity(addr1, addr2) >= threshold;
}

/**
 * Extract street number from address (if present)
 */
export function extractStreetNumber(address: string): string | null {
  const match = address.match(/\b(\d+)\b/);
  return match ? match[1] : null;
}

/**
 * Default similarity threshold for address matching
 */
export const DEFAULT_ADDRESS_SIMILARITY_THRESHOLD = 0.6;

/**
 * Normalize a cafe name for comparison
 * - Lowercase, remove accents, remove punctuation
 * - Remove common suffixes like "specialty coffee", "café de especialidad"
 */
export function normalizeName(name: string): string {
  if (!name) return "";

  let normalized = name.toLowerCase();

  // Remove accents
  normalized = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // Remove punctuation
  normalized = normalized.replace(/[.,;:'"!?()[\]{}|·-]/g, " ");

  // Remove common cafe suffixes/descriptors
  const suffixes = [
    "specialty coffee", "speciality coffee", "cafe de especialidad",
    "coffee shop", "coffee bar", "coffee roasters", "coffee studio",
    "coffee & brunch", "espresso bar",
  ];
  for (const suffix of suffixes) {
    normalized = normalized.replace(new RegExp(suffix, "gi"), " ");
  }

  // Collapse spaces and trim
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Calculate name similarity using Jaccard on tokens
 */
export function nameSimilarity(name1: string, name2: string): number {
  const tokens1 = new Set(normalizeName(name1).split(" ").filter(t => t.length > 0));
  const tokens2 = new Set(normalizeName(name2).split(" ").filter(t => t.length > 0));

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) intersection++;
  }

  const union = tokens1.size + tokens2.size - intersection;
  return intersection / union;
}

/**
 * Check if two names are similar (above threshold)
 * Default threshold 0.5 (50% token overlap)
 */
export function areNamesSimilar(
  name1: string,
  name2: string,
  threshold: number = 0.5
): boolean {
  return nameSimilarity(name1, name2) >= threshold;
}

export const DEFAULT_NAME_SIMILARITY_THRESHOLD = 0.5;
