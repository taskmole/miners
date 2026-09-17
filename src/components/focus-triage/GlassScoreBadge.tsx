"use client";

/**
 * Score badge shown over the listing photo in the triage deck.
 *
 * The score is still being tuned, so the number carries a BETA marker beside
 * it. The marker's type and colour come from the shared `.beta-mark` rule in
 * globals.css, the same one the map popup badge uses, so the wording and the
 * amber only have to be changed in one place.
 *
 * The chip stays 44px tall so it remains a valid touch target.
 */
export function GlassScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="h-11 px-3 rounded-xl inline-flex items-center gap-1.5 text-white"
      style={{
        backgroundColor: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <span
        className="text-sm font-bold leading-none"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </span>
      <span className="beta-mark">BETA</span>
    </div>
  );
}
