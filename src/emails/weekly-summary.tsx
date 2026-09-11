import React from "react";
import { Link, Section, Text } from "@react-email/components";
import { EmailShell, headingStyle, textStyle, buttonStyle } from "./_shell";
import {
  SAMPLE_WEEKLY_SUMMARY,
  type WeeklyCityStats,
  type WeeklySummaryData,
} from "@/lib/weekly-summary-queries";
import { cityNames } from "@/lib/cities";

/**
 * "This week in Miners Scout." Friday, to super admins only.
 *
 * The job of this email is to make the work visible, so it leads with people
 * and effort and only then shows the funnel. It is written to be forwarded.
 *
 * Two things drive every layout decision here:
 *
 * 1. It is the first email in the project built out of tables rather than
 *    stacked text, and tables do not reflow. Every width below is a
 *    percentage. The only fixed pixel value is a bar's height.
 * 2. Gmail silently truncates past about 102KB, so the per-person list is
 *    capped. It is the one part that grows without limit.
 *
 * Bars are nested tables with a background colour, which is the only bar
 * technique that survives Outlook.
 */

const COLOR = {
  ink: "#18181b",
  body: "#52525b",
  muted: "#71717a",
  faint: "#a1a1aa",
  track: "#f4f4f5",
  line: "#e4e4e7",
  green: "#16a34a",
  blue: "#2563eb",
  amber: "#d97706",
  red: "#dc2626",
};

/** Named per-person lines printed in full. The rest collapse into one line. */
const MAX_PEOPLE = 10;

const MOBILE_CSS = `
  @media only screen and (max-width: 480px) {
    .wk-big { font-size: 30px !important; line-height: 34px !important; }
    .wk-big-label { font-size: 10px !important; }
    .wk-row-label { font-size: 15px !important; }
    .wk-row-value { font-size: 15px !important; }
    .wk-card-title { font-size: 17px !important; }
    .wk-section-label { font-size: 12px !important; }
    .wk-text { font-size: 15px !important; line-height: 21px !important; }
    .wk-pill { font-size: 13px !important; }
  }
`;

function cityLabel(cityId: string): string {
  return cityNames[cityId] ?? cityId.charAt(0).toUpperCase() + cityId.slice(1);
}

function pct(part: number, whole: number): string | null {
  if (whole <= 0) return null;
  return `${Math.round((part / whole) * 100)}%`;
}

/** "1 request approved", "3 requests approved". A week of ones is common. */
function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/**
 * One labelled bar.
 *
 * Scaled against the largest number in its own group, so a group of small
 * numbers is still readable. A non-zero value never renders thinner than 4%,
 * otherwise a 1 beside a 40 disappears and reads as nothing happened.
 */
function StatBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const share = max > 0 && value > 0 ? Math.max(Math.round((value / max) * 100), 4) : 0;

  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      border={0}
      width="100%"
      style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
    >
      <tbody>
        <tr>
          <td
            className="wk-row-label"
            style={{ width: "44%", ...rowLabelStyle }}
          >
            {label}
          </td>
          <td style={{ width: "42%", padding: "6px 8px" }}>
            <table
              cellPadding={0}
              cellSpacing={0}
              border={0}
              width="100%"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: COLOR.track,
                borderRadius: "4px",
              }}
            >
              <tbody>
                <tr>
                  <td style={{ padding: 0, fontSize: 0, lineHeight: "8px" }}>
                    {share > 0 ? (
                      <table
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        width={`${share}%`}
                        style={{ borderCollapse: "collapse" }}
                      >
                        <tbody>
                          <tr>
                            <td
                              style={{
                                backgroundColor: color,
                                borderRadius: "4px",
                                fontSize: 0,
                                lineHeight: "8px",
                                height: "8px",
                              }}
                            >
                              &nbsp;
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : (
                      <span style={{ fontSize: 0, lineHeight: "8px" }}>&nbsp;</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
          <td
            className="wk-row-value"
            style={{ width: "14%", ...rowValueStyle }}
          >
            {value}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** A decision count, tinted. Only rendered when there is something to say. */
function Pill({
  label,
  value,
  share,
  color,
  background,
}: {
  label: string;
  value: number;
  share?: string | null;
  color: string;
  background: string;
}) {
  return (
    <span
      className="wk-pill"
      style={{
        display: "inline-block",
        backgroundColor: background,
        color,
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: "18px",
        padding: "3px 10px",
        borderRadius: "20px",
        marginRight: "6px",
        marginTop: "6px",
      }}
    >
      {value} {label}
      {share ? ` (${share})` : ""}
    </span>
  );
}

/** Label and number, one per line. Zero lines are dropped by the caller. */
function CountLine({ label, value }: { label: string; value: number }) {
  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      border={0}
      width="100%"
      style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}
    >
      <tbody>
        <tr>
          <td className="wk-row-label" style={{ width: "80%", ...rowLabelStyle }}>
            {label}
          </td>
          <td className="wk-row-value" style={{ width: "20%", ...rowValueStyle }}>
            {value}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * A block of count lines with every zero removed. Returns nothing at all when
 * the whole block is zero: a section padded with zeros argues against the
 * point this email is making.
 */
function CountBlock({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const shown = rows.filter((r) => r.value > 0);
  if (shown.length === 0) return null;

  return (
    <Section style={{ marginTop: "28px" }}>
      <Text className="wk-section-label" style={sectionLabelStyle}>
        {title}
      </Text>
      {shown.map((r) => (
        <CountLine key={r.label} label={r.label} value={r.value} />
      ))}
    </Section>
  );
}

function CityCard({ city }: { city: WeeklyCityStats }) {
  const stages = [
    { label: "Properties added", value: city.propertiesAdded, color: COLOR.blue },
    { label: "Triaged in the inbox", value: city.triaged, color: COLOR.green },
    { label: "Requested", value: city.requested, color: COLOR.amber },
    { label: "Pitched", value: city.pitched, color: COLOR.ink },
  ];
  const max = Math.max(...stages.map((s) => s.value));

  const requestsDecided = city.requestsApproved + city.requestsRejected;
  const pitchesDecided =
    city.pitchesApproved + city.pitchesRejected + city.pitchesReturned;

  const hasDecisions = requestsDecided > 0 || pitchesDecided > 0;

  return (
    <Section style={cardStyle}>
      <Text className="wk-card-title" style={cardTitleStyle}>
        {cityLabel(city.cityId)}
      </Text>

      {stages.map((s) => (
        <StatBar
          key={s.label}
          label={s.label}
          value={s.value}
          max={max}
          color={s.color}
        />
      ))}

      {hasDecisions && (
        <Section style={{ borderTop: `1px solid ${COLOR.line}`, margin: "12px 0 0", padding: "10px 0 0" }}>
          <Text style={pillLabelStyle}>Decisions</Text>
          <Text style={{ margin: 0 }}>
            {city.requestsApproved > 0 && (
              <Pill
                label={plural(city.requestsApproved, "request approved", "requests approved")}
                value={city.requestsApproved}
                share={pct(city.requestsApproved, requestsDecided)}
                color="#15803d"
                background="#dcfce7"
              />
            )}
            {city.requestsRejected > 0 && (
              <Pill
                label={plural(city.requestsRejected, "request rejected", "requests rejected")}
                value={city.requestsRejected}
                share={pct(city.requestsRejected, requestsDecided)}
                color="#b91c1c"
                background="#fee2e2"
              />
            )}
            {city.pitchesApproved > 0 && (
              <Pill
                label={plural(city.pitchesApproved, "pitch approved", "pitches approved")}
                value={city.pitchesApproved}
                share={pct(city.pitchesApproved, pitchesDecided)}
                color="#15803d"
                background="#dcfce7"
              />
            )}
            {city.pitchesRejected > 0 && (
              <Pill
                label={plural(city.pitchesRejected, "pitch rejected", "pitches rejected")}
                value={city.pitchesRejected}
                share={pct(city.pitchesRejected, pitchesDecided)}
                color="#b91c1c"
                background="#fee2e2"
              />
            )}
            {city.pitchesReturned > 0 && (
              <Pill
                label={plural(city.pitchesReturned, "pitch returned", "pitches returned")}
                value={city.pitchesReturned}
                share={pct(city.pitchesReturned, pitchesDecided)}
                color="#b45309"
                background="#fef3c7"
              />
            )}
          </Text>
          {/* Auto-rejected rivals are not a human saying no, so they are kept
              out of the rejection count and named separately. */}
          {city.requestsClosedAsDuplicate > 0 && (
            <Text style={footnoteStyle}>
              {city.requestsClosedAsDuplicate}{" "}
              {plural(city.requestsClosedAsDuplicate, "request", "requests")} closed as
              duplicates
            </Text>
          )}
        </Section>
      )}
    </Section>
  );
}

export function WeeklySummary({
  rangeLabel = SAMPLE_WEEKLY_SUMMARY.rangeLabel,
  headline = SAMPLE_WEEKLY_SUMMARY.headline,
  people = SAMPLE_WEEKLY_SUMMARY.people,
  cities = SAMPLE_WEEKLY_SUMMARY.cities,
  research = SAMPLE_WEEKLY_SUMMARY.research,
  admin = SAMPLE_WEEKLY_SUMMARY.admin,
  appUrl = SAMPLE_WEEKLY_SUMMARY.appUrl,
}: Partial<WeeklySummaryData>) {
  const heading = "This week in Miners Scout";
  const quiet = headline.totalActions === 0 && cities.length === 0;

  const named = people.all.slice(0, MAX_PEOPLE);
  const others = people.all.slice(MAX_PEOPLE);
  const othersActions = others.reduce((sum, p) => sum + p.actions, 0);
  const topActions = named.length > 0 ? named[0].actions : 0;

  return (
    <EmailShell preview={`${heading}: ${rangeLabel}`} headStyles={MOBILE_CSS} maxWidth={600}>
      <Text style={{ ...headingStyle, marginBottom: "2px" }}>{heading}</Text>
      <Text style={rangeStyle}>{rangeLabel}</Text>

      {/* A silent week and a broken report must not look the same. */}
      {quiet ? (
        <Text className="wk-text" style={textStyle}>
          Nothing was logged in the app this week. No properties came in, and
          nobody triaged, requested or pitched anything. This email went out
          anyway so you know the report itself is still working.
        </Text>
      ) : (
        <>
          {/* Headline strip: the point has to land in the inbox preview. */}
          <table
            cellPadding={0}
            cellSpacing={0}
            border={0}
            width="100%"
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              margin: "20px 0 4px",
            }}
          >
            <tbody>
              <tr>
                {[
                  { value: headline.activePeople, label: "People active" },
                  { value: headline.propertiesReviewed, label: "Properties reviewed" },
                  { value: headline.totalActions, label: "Actions taken" },
                ].map((stat) => (
                  <td
                    key={stat.label}
                    style={{ width: "33.33%", textAlign: "center", padding: "8px 4px" }}
                  >
                    <div className="wk-big" style={bigNumberStyle}>
                      {stat.value}
                    </div>
                    <div className="wk-big-label" style={bigLabelStyle}>
                      {stat.label}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          {/* People */}
          <Section style={{ marginTop: "24px" }}>
            <Text className="wk-section-label" style={sectionLabelStyle}>
              THE PEOPLE
            </Text>
            <Text className="wk-text" style={textStyle}>
              {people.activeCount} of {people.withAccessCount} people with access
              did something this week. Active means real work, not opening the
              page: a logged action, a trip, a request, or inbox triage.
            </Text>

            {named.map((p) => (
              <StatBar
                key={p.name}
                label={p.name}
                value={p.actions}
                max={topActions}
                color={COLOR.blue}
              />
            ))}

            {others.length > 0 && (
              <Text style={footnoteStyle}>
                and {others.length} {plural(others.length, "other", "others")}, {othersActions}{" "}
                {plural(othersActions, "action", "actions")} between them
              </Text>
            )}

            {people.addedThisWeek.length > 0 && (
              <Text style={{ ...footnoteStyle, color: COLOR.body }}>
                New this week: {people.addedThisWeek.join(", ")}
              </Text>
            )}
          </Section>

          {/* Pipeline, per city */}
          {cities.length > 0 && (
            <Section style={{ marginTop: "28px" }}>
              <Text className="wk-section-label" style={sectionLabelStyle}>
                PIPELINE BY CITY
              </Text>
              <Text className="wk-text" style={{ ...textStyle, color: COLOR.faint, fontSize: "12px" }}>
                These bars count what was done in the week, not one batch of
                properties followed through. Only the decision percentages are
                rates.
              </Text>
              {cities.map((c) => (
                <CityCard key={c.cityId} city={c} />
              ))}
            </Section>
          )}

          <CountBlock
            title="RESEARCH AND CURATION"
            rows={[
              { label: "Properties saved to lists", value: research.savedToLists },
              { label: "Lists created", value: research.listsCreated },
              { label: "Custom points on the map", value: research.customPoints },
              { label: "Areas drawn", value: research.areasDrawn },
              { label: "Photos and files uploaded", value: research.filesUploaded },
              { label: "Comments written", value: research.comments },
            ]}
          />

          <CountBlock
            title="TEAM AND ADMIN"
            rows={[
              { label: "Properties assigned", value: admin.assignmentsMade },
              { label: "Assignments removed", value: admin.assignmentsRemoved },
              { label: "People added to teams", value: admin.joinedTeams },
              { label: "People removed from teams", value: admin.leftTeams },
              { label: "Users added", value: admin.usersAdded },
            ]}
          />
        </>
      )}

      <Link href={appUrl} style={buttonStyle}>
        Open the dashboard
      </Link>
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
  margin: "0 0 8px",
};

const bigNumberStyle: React.CSSProperties = {
  fontSize: "30px",
  fontWeight: 700,
  color: COLOR.ink,
  lineHeight: "34px",
  letterSpacing: "-0.02em",
};

const bigLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: COLOR.muted,
  lineHeight: "15px",
  marginTop: "2px",
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: "13px",
  color: COLOR.body,
  lineHeight: "18px",
  padding: "6px 0",
  verticalAlign: "middle",
};

const rowValueStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: COLOR.ink,
  lineHeight: "18px",
  padding: "6px 0",
  textAlign: "right",
  verticalAlign: "middle",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px",
  margin: "12px 0",
  border: `1px solid ${COLOR.line}`,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: COLOR.ink,
  margin: "0 0 6px",
};

const pillLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: COLOR.muted,
  margin: "0 0 2px",
};

const footnoteStyle: React.CSSProperties = {
  fontSize: "12px",
  color: COLOR.faint,
  lineHeight: "17px",
  margin: "10px 0 0",
};

export default WeeklySummary;
