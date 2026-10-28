import React from "react";
import { Link, Section, Text } from "@react-email/components";
import { EmailShell, headingStyle, textStyle, buttonStyle } from "./_shell";
import {
  AI_SCOUT_TAB,
  HIGH_SCORE,
  LOW_SCORE,
  SAMPLE_AI_SCOUT_EMAIL,
  type AiScoutEmailData,
  type AiScoutMisses,
} from "@/lib/ai-scout-email-queries";
import { UNLOCK_RATINGS, soFarLine } from "@/lib/ai-scout-unlock";

/**
 * "Your AI scout this week." Friday morning, to everyone who trains the AI.
 *
 * Its one job is to get head office to spend a minute on the review tab, so
 * it leads with how well the AI matched them, says where it went wrong in
 * plain words, lists what it suggests, and ends on one button.
 *
 * A quiet week (too few new ratings since the last suggestions, nothing
 * ready to accept) gets a short version instead: one line on what unlocks
 * suggestions, and a button.
 *
 * The stat tiles are a three-cell table with percentage widths, the same
 * technique the weekly summary uses, so they hold up in Outlook and on a
 * phone.
 */

const COLOR = {
  ink: "#18181b",
  body: "#3f3f46",
  muted: "#71717a",
  faint: "#a1a1aa",
  tile: "#f4f4f5",
  green: "#059669",
  red: "#dc2626",
  redTile: "#fef2f2",
  amber: "#b45309",
};

const MOBILE_CSS = `
  @media only screen and (max-width: 480px) {
    .ai-big { font-size: 24px !important; line-height: 28px !important; }
    .ai-text { font-size: 15px !important; line-height: 22px !important; }
  }
`;

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** ' Most often: "cellar" (2).' or nothing when nobody wrote a note. */
function notesLine(misses: AiScoutMisses): string {
  if (misses.topNotes.length === 0) return "";
  const quoted = misses.topNotes
    .map((n) => (n.count > 1 ? `"${n.note}" (${n.count})` : `"${n.note}"`))
    .join(", ");
  return ` Most often: ${quoted}.`;
}

function Tile({
  value,
  label,
  alert,
}: {
  value: string;
  label: string;
  alert?: boolean;
}) {
  return (
    <td style={{ width: "33.33%", padding: "0 4px" }}>
      <div
        style={{
          backgroundColor: alert ? COLOR.redTile : COLOR.tile,
          borderRadius: "12px",
          padding: "12px 4px",
          textAlign: "center",
        }}
      >
        <div className="ai-big" style={{ ...bigNumberStyle, color: alert ? COLOR.red : COLOR.ink }}>
          {value}
        </div>
        <div style={bigLabelStyle}>{label}</div>
      </div>
    </td>
  );
}

export function AiScoutWeekly({
  rangeLabel = SAMPLE_AI_SCOUT_EMAIL.rangeLabel,
  stats = SAMPLE_AI_SCOUT_EMAIL.stats,
  misses = SAMPLE_AI_SCOUT_EMAIL.misses,
  suggestions = SAMPLE_AI_SCOUT_EMAIL.suggestions,
  weights = SAMPLE_AI_SCOUT_EMAIL.weights,
  quiet = SAMPLE_AI_SCOUT_EMAIL.quiet,
  appUrl = SAMPLE_AI_SCOUT_EMAIL.appUrl,
}: Partial<AiScoutEmailData>) {
  const heading = "Your AI scout this week";
  const reviewUrl = `${appUrl}/admin?tab=${AI_SCOUT_TAB}`;
  const soFar = soFarLine(stats.soFar);
  const ready = suggestions.filter((s) => s.status === "ready");

  // ---- quiet week ---------------------------------------------------------

  if (quiet) {
    const left = Math.max(UNLOCK_RATINGS - stats.ratedSinceSuggestions, 1);
    return (
      <EmailShell preview={`Rate ${left} more listings to unlock suggestions`} headStyles={MOBILE_CSS}>
        <Text style={{ ...headingStyle, marginBottom: "2px" }}>{heading}</Text>
        <Text style={rangeStyle}>{rangeLabel}</Text>

        <Text className="ai-text" style={{ ...textStyle, color: COLOR.ink, fontWeight: 600, fontSize: "15px" }}>
          Rate {left} more {plural(left, "listing", "listings")} to unlock suggestions.
        </Text>
        <Text className="ai-text" style={textStyle}>
          Your AI scout learns from the listings you rate. Every time head
          office has rated {UNLOCK_RATINGS} more, it suggests ways to match your
          taste better.
          {stats.ratedSinceSuggestions > 0 && ` ${stats.ratedSinceSuggestions} of ${UNLOCK_RATINGS} done.`}
        </Text>
        {soFar && <Text style={footnoteStyle}>{soFar}</Text>}

        <Link href={appUrl} style={buttonStyle}>
          Open the app
        </Link>
      </EmailShell>
    );
  }

  // ---- full week ----------------------------------------------------------

  const missLines: string[] = [];
  const { highRejected, lowAssigned } = misses;
  if (highRejected.count > 0) {
    missLines.push(
      `${highRejected.count} ${plural(highRejected.count, "listing", "listings")} scored ${HIGH_SCORE}+ ${plural(highRejected.count, "was", "were")} rejected.${notesLine(highRejected)}`,
    );
  }
  if (lowAssigned.count > 0) {
    missLines.push(
      `${lowAssigned.count} ${plural(lowAssigned.count, "listing", "listings")} scored ${LOW_SCORE} or less ${plural(lowAssigned.count, "was", "were")} assigned anyway.${notesLine(lowAssigned)}`,
    );
  }

  const preview = [
    `${stats.listingsScored} listings scored`,
    stats.agreement !== null ? `${stats.agreement}% agreed with you` : null,
    ready.length > 0
      ? `${ready.length} ${plural(ready.length, "suggestion", "suggestions")} to review`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <EmailShell preview={preview} headStyles={MOBILE_CSS}>
      <Text style={{ ...headingStyle, marginBottom: "2px" }}>{heading}</Text>
      <Text style={rangeStyle}>{rangeLabel}</Text>

      <table
        cellPadding={0}
        cellSpacing={0}
        border={0}
        width="100%"
        style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", margin: "16px 0 4px" }}
      >
        <tbody>
          <tr>
            <Tile value={String(stats.listingsScored)} label="listings scored" />
            <Tile
              value={stats.agreement !== null ? `${stats.agreement}%` : "-"}
              label="agreed with you"
            />
            <Tile value={String(stats.bigMisses)} label="big misses" alert={stats.bigMisses > 0} />
          </tr>
        </tbody>
      </table>
      <Text style={footnoteStyle}>
        Based on {stats.listingsRated} {plural(stats.listingsRated, "listing", "listings")} head
        office rated this week.{soFar && ` ${soFar}`}
      </Text>

      {missLines.length > 0 && (
        <Section style={{ marginTop: "20px" }}>
          <Text style={sectionLabelStyle}>WHERE WE GOT IT WRONG</Text>
          <ul style={listStyle}>
            {missLines.map((line) => (
              <li key={line} className="ai-text" style={itemStyle}>
                {line}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {suggestions.length > 0 && (
        <Section style={{ marginTop: "20px" }}>
          <Text style={sectionLabelStyle}>SUGGESTIONS</Text>
          <ul style={listStyle}>
            {suggestions.map((s) => {
              const hasScores = s.before !== null && s.after !== null;
              return s.status === "ready" ? (
                <li key={s.title} className="ai-text" style={itemStyle}>
                  <strong>{s.title}</strong>
                  {hasScores && (
                    <span style={{ color: COLOR.muted }}>
                      {" "}
                      (matches you {s.before}% {"→"}{" "}
                      <span style={{ color: COLOR.green, fontWeight: 600 }}>{s.after}%</span>)
                    </span>
                  )}
                </li>
              ) : (
                <li key={s.title} className="ai-text" style={{ ...itemStyle, color: COLOR.muted }}>
                  {s.title}
                  <span style={{ color: COLOR.amber }}>
                    {" "}
                    (held back{hasScores ? `: ${s.before}% → ${s.after}%` : ""})
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section style={{ textAlign: "center", marginTop: "8px" }}>
        <Link href={reviewUrl} style={{ ...buttonStyle, display: "block", padding: "14px 20px", fontSize: "15px" }}>
          {ready.length > 0 ? "Review suggestions (1 min)" : "Open your AI scout"}
        </Link>
      </Section>

      {weights.length > 0 && (
        <Text style={footnoteStyle}>
          Current mix: {weights.map((w) => `${w.label} ${w.weight}%`).join(" · ")}
        </Text>
      )}
    </EmailShell>
  );
}

const rangeStyle: React.CSSProperties = {
  fontSize: "13px",
  color: COLOR.faint,
  margin: "0 0 4px",
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: COLOR.faint,
  margin: "0 0 6px",
};

const bigNumberStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  lineHeight: "28px",
  letterSpacing: "-0.02em",
};

const bigLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: COLOR.muted,
  lineHeight: "15px",
  marginTop: "2px",
};

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "20px",
};

const itemStyle: React.CSSProperties = {
  fontSize: "14px",
  color: COLOR.body,
  lineHeight: "21px",
  margin: "0 0 6px",
};

const footnoteStyle: React.CSSProperties = {
  fontSize: "12px",
  color: COLOR.faint,
  lineHeight: "17px",
  margin: "8px 0 0",
};

export default AiScoutWeekly;
