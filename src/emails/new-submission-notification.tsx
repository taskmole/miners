import React from "react";
import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Font,
} from "@react-email/components";

interface NewSubmissionNotificationProps {
  // Card title: the place address (street, number, city). Falls back to the
  // trip name upstream when no address is set.
  title: string;
  cityLabel: string;
  authorName: string;
  submittedAt?: string;
  appUrl?: string;
}

const LOGO_URL =
  "https://raw.githubusercontent.com/taskmole/miners/main/public/assets/miners-logo-cropped.png";

// Format an ISO timestamp into a readable line, e.g. "4 Jun 2026, 14:32".
// Falls back to an empty string when the value is missing or unparseable.
function formatSubmittedAt(submittedAt?: string): string {
  if (!submittedAt) return "";
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NewSubmissionNotification({
  title = "Spálená, Praha 1",
  cityLabel = "Prague",
  authorName = "Scout",
  submittedAt,
  appUrl = "https://theminers.vercel.app",
}: NewSubmissionNotificationProps) {
  const submittedLine = formatSubmittedAt(submittedAt);
  const reviewUrl = `${appUrl}/admin?tab=submissions`;

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Outfit"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4S-EiAou6Y.woff2",
            format: "woff2",
          }}
        />
      </Head>
      <Preview>New scouting trip submitted by {authorName}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={logoSectionStyle}>
            {/* height only: preserves the logo's native 500x220 aspect ratio */}
            <Img
              src={LOGO_URL}
              alt="The Miners"
              height={70}
              style={{ display: "block", margin: "0 auto" }}
            />
          </Section>

          <Section style={contentSectionStyle}>
            <Text style={headingStyle}>New scouting trip submitted</Text>

            <Text style={textStyle}>
              <strong style={{ color: "#18181b" }}>{authorName}</strong> submitted a new trip.
            </Text>

            <Section style={cardStyle}>
              <Text style={cardTitleStyle}>{title}</Text>
              <Text style={cardSubtitleStyle}>
                {cityLabel}
                {submittedLine ? ` · ${submittedLine}` : ""}
              </Text>
            </Section>

            <Link href={reviewUrl} style={buttonStyle}>
              Review submission
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default NewSubmissionNotification;

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily: "'Outfit', Arial, sans-serif",
  margin: 0,
  padding: "40px 0",
};

const containerStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  maxWidth: "480px",
  margin: "0 auto",
  overflow: "hidden",
};

const logoSectionStyle: React.CSSProperties = {
  padding: "40px 24px 0",
  textAlign: "center" as const,
};

const contentSectionStyle: React.CSSProperties = {
  padding: "8px 24px 32px",
};

const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#18181b",
  margin: "24px 0 8px",
  lineHeight: "1.3",
};

const textStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#52525b",
  lineHeight: "1.5",
  margin: "8px 0",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "8px",
  padding: "16px",
  margin: "20px 0",
  border: "1px solid #e4e4e7",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#18181b",
  margin: "0 0 4px",
};

const cardSubtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#71717a",
  margin: "0",
};

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#18181b",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 600,
  padding: "10px 20px",
  borderRadius: "8px",
  textDecoration: "none",
  margin: "16px 0",
};
