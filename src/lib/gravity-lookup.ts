// Tier classification for score badges/chips. Shared so the map card, the
// "pick one" list and the New listings deck all agree on colour for the same
// number. The number is the AI scout's score (places.image_analysis).
export type ScoreTier = "prime" | "strong" | "moderate" | "weak";

export function scoreTier(score: number): ScoreTier {
    if (score >= 80) return "prime";
    if (score >= 65) return "strong";
    if (score >= 45) return "moderate";
    return "weak";
}

// Hex colors per tier. Used for inline styles (dots, text).
export const SCORE_TIER_COLORS: Record<ScoreTier, string> = {
    prime: "#16a34a",
    strong: "#f59e0b",
    moderate: "#71717a",
    weak: "#dc2626",
};

export const SCORE_TIER_LABELS: Record<ScoreTier, string> = {
    prime: "Prime",
    strong: "Strong",
    moderate: "Moderate",
    weak: "Weak",
};
