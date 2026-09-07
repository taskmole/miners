"use client";

export function GlassScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold"
      style={{
        backgroundColor: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {score}
    </div>
  );
}
