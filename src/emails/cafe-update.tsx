import React from "react";
import { Link, Section, Text } from "@react-email/components";
import { EmailShell, buttonStyle, headingStyle, propertyUrl, textStyle } from "./_shell";
import {
  MAX_LISTED,
  SAMPLE_CAFE_UPDATE_CITIES,
  type CafeUpdateCity,
} from "../lib/cafe-update-email";
import type { ReportCafe } from "../../scripts/data-pipeline/lib/cafe-report";

interface CafeUpdateProps {
  cities: CafeUpdateCity[];
  appUrl?: string;
}

/** "12 new, 3 gone, 5 changed", leaving out the zeros. */
function summary(city: CafeUpdateCity): string {
  return [
    city.added.length && `${city.added.length} new`,
    city.removed.length && `${city.removed.length} gone`,
    city.changed.length && `${city.changed.length} changed`,
  ]
    .filter(Boolean)
    .join(", ");
}

const KIND_LABEL: Record<ReportCafe["kind"], string> = {
  "coffee-trip": "European Coffee Trip",
  regular: "Google",
};

function CafeList({ title, cafes, appUrl }: { title: string; cafes: ReportCafe[]; appUrl: string }) {
  if (cafes.length === 0) return null;
  const shown = cafes.slice(0, MAX_LISTED);
  const more = cafes.length - shown.length;

  return (
    <Section style={{ margin: "12px 0 0" }}>
      <Text style={listTitleStyle}>{title}</Text>
      {shown.map((cafe, i) => (
        <Text key={`${cafe.name}-${i}`} style={itemStyle}>
          {cafe.placeId ? (
            <Link href={propertyUrl(appUrl, cafe.placeId)} style={linkStyle}>
              {cafe.name}
            </Link>
          ) : (
            cafe.name
          )}
          <span style={metaStyle}>
            {" · "}
            {cafe.changes?.length ? cafe.changes.join(", ") : KIND_LABEL[cafe.kind]}
          </span>
        </Text>
      ))}
      {more > 0 && <Text style={itemStyle}>{`and ${more} more`}</Text>}
    </Section>
  );
}

export function CafeUpdate({
  cities = SAMPLE_CAFE_UPDATE_CITIES,
  appUrl = "https://theminers.vercel.app",
}: CafeUpdateProps) {
  const heading = "The cafe map was refreshed";

  return (
    <EmailShell preview={cities.map((c) => `${c.cityName}: ${summary(c)}`).join(" · ")}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={textStyle}>Here is what changed among the cafes on your map since last month.</Text>

      {cities.map((city) => (
        <Section key={city.cityId} style={citySectionStyle}>
          <Text style={cityTitleStyle}>{city.cityName}</Text>
          <Text style={summaryStyle}>{summary(city)}</Text>
          <CafeList title="New" cafes={city.added} appUrl={appUrl} />
          <CafeList title="Changed" cafes={city.changed} appUrl={appUrl} />
          <CafeList title="Gone" cafes={city.removed} appUrl={appUrl} />
        </Section>
      ))}

      <Link href={appUrl} style={buttonStyle}>
        Open the map
      </Link>
    </EmailShell>
  );
}

export default CafeUpdate;

const citySectionStyle: React.CSSProperties = {
  borderTop: "1px solid #e4e4e7",
  margin: "20px 0 0",
  padding: "16px 0 0",
};

const cityTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#18181b",
  margin: "0",
};

const summaryStyle: React.CSSProperties = {
  ...textStyle,
  margin: "2px 0 0",
};

const listTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 4px",
};

const itemStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#3f3f46",
  lineHeight: "1.5",
  margin: "2px 0",
};

const linkStyle: React.CSSProperties = {
  color: "#18181b",
  fontWeight: 600,
  textDecoration: "underline",
};

const metaStyle: React.CSSProperties = {
  color: "#71717a",
};
