import React from "react";
import { Link, Section, Text } from "@react-email/components";
import { EmailShell, buttonStyle, headingStyle } from "./_shell";
import { COLOR, Flag, StatBar } from "./weekly-summary";
import { SAMPLE_CAFE_UPDATE_CITIES, type CafeUpdateCity } from "../lib/cafe-update-email";
import type { ReportCafe } from "../../scripts/data-pipeline/lib/cafe-report";

interface CafeUpdateProps {
  cities: CafeUpdateCity[];
  appUrl?: string;
}

/**
 * Monthly cafe update, laid out like the weekly summary but shorter: big
 * totals and one card per city with bars. The cafes themselves are on the map.
 */

const MOBILE_CSS = `
  @media only screen and (max-width: 480px) {
    .wk-big { font-size: 30px !important; line-height: 34px !important; }
    .wk-row-label, .wk-row-value { font-size: 15px !important; }
  }
`;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** `max` is the biggest number across all cities, so bars compare between cards. */
function CityCard({ city, max }: { city: CafeUpdateCity; max: number }) {
  // Zero rows are dropped, like the weekly summary: a bare track reads as noise.
  const rows = [
    { label: "New cafes", value: city.added.length, color: COLOR.green },
    { label: "Updated", value: city.changed.length, color: COLOR.blue },
    { label: "Closed", value: city.removed.length, color: COLOR.red },
  ].filter((r) => r.value > 0);

  return (
    <Section style={cardStyle}>
      <Text style={cardTitleStyle}>
        <Flag cityId={city.cityId} />
        {city.cityName}
      </Text>
      {rows.map((r) => (
        <StatBar key={r.label} label={r.label} value={r.value} max={max} color={r.color} />
      ))}
    </Section>
  );
}

export function CafeUpdate({
  cities = SAMPLE_CAFE_UPDATE_CITIES,
  appUrl = "https://theminers.vercel.app",
}: CafeUpdateProps) {
  const total = (pick: (c: CafeUpdateCity) => ReportCafe[]) => cities.reduce((n, c) => n + pick(c).length, 0);
  const totals = [
    { value: total((c) => c.added), label: "New cafes" },
    { value: total((c) => c.changed), label: "Updated" },
    { value: total((c) => c.removed), label: "Closed" },
  ];
  const barMax = Math.max(0, ...cities.flatMap((c) => [c.added.length, c.changed.length, c.removed.length]));
  const heading = totals[0].value > 0 ? `${plural(totals[0].value, "new cafe", "new cafes")} on your map` : "Your cafe map was updated";

  return (
    <EmailShell
      preview={cities.map((c) => `${c.cityName}: ${c.added.length} new`).join(" · ")}
      headStyles={MOBILE_CSS}
      maxWidth={600}
    >
      <Text style={{ ...headingStyle, marginBottom: "2px", textAlign: "center" }}>{heading}</Text>
      <Text style={subtitleStyle}>Monthly cafe refresh</Text>

      <table cellPadding={0} cellSpacing={0} border={0} width="100%" style={stripStyle}>
        <tbody>
          <tr>
            {totals.map((t) => (
              <td key={t.label} style={{ width: "33.33%", textAlign: "center", padding: "8px 4px" }}>
                <div className="wk-big" style={bigNumberStyle}>
                  {t.value}
                </div>
                <div style={bigLabelStyle}>{t.label}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {cities.map((city) => (
        <CityCard key={city.cityId} city={city} max={barMax} />
      ))}

      <Section style={{ textAlign: "center", marginTop: "8px" }}>
        <Link href={appUrl} style={buttonStyle}>
          Open app
        </Link>
      </Section>
    </EmailShell>
  );
}

export default CafeUpdate;

const subtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: COLOR.faint,
  margin: "0 0 4px",
  textAlign: "center",
};

const stripStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  margin: "20px 0 4px",
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

const cardStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  border: `1px solid ${COLOR.line}`,
  borderRadius: "10px",
  padding: "16px",
  margin: "16px 0 0",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 700,
  color: COLOR.ink,
  margin: "0 0 8px",
};

