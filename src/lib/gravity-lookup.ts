// Tier classification for score badges/chips. Shared so map pin, popup badge,
// and mobile sheet header all agree on color. The scores themselves are
// computed on the server (see gravity-server.ts).
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

// Tailwind background color classes per tier. Used on the filled circle/chip.
export const SCORE_TIER_BG: Record<ScoreTier, string> = {
    prime: "bg-green-600",
    strong: "bg-amber-500",
    moderate: "bg-zinc-500",
    weak: "bg-red-600",
};
