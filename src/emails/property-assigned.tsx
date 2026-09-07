import React from "react";
import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * "A property was assigned to you (or to your team)".
 *
 * Shares the layout of trip-status-update.tsx on purpose: assignment mail used
 * to be a plainer hand-rolled HTML string, so the two most common emails did
 * not look like the same product. It also always said "your team", which read
 * as a bug when the property had been given to one person.
 */
interface PropertyAssignedProps {
  propertyName: string;
  propertyAddress?: string;
  /** True when the whole team was assigned, false for a single person. */
  isTeam?: boolean;
  teamName?: string;
  /** Deep-links the CTA to the property via ?focus=. */
  placeId?: string | null;
  appUrl?: string;
}

const LOGO_URL =
  "https://raw.githubusercontent.com/taskmole/miners/main/public/assets/miners-logo-cropped.png";

export function PropertyAssigned({
  propertyName = "A property",
  propertyAddress = "",
  isTeam = false,
  teamName = "",
  placeId = null,
  appUrl = "https://theminers.vercel.app",
}: PropertyAssignedProps) {
  const heading = isTeam
    ? "A new property for your team"
    : "A new property is yours to scout";

  const message = isTeam
    ? `This property has been assigned to ${teamName || "your team"} to scout.`
    : "This property has been assigned to you. You can start a scouting trip on it whenever you are ready.";

  // The address is frequently the same string as the name; printing both then
  // looks like a mistake.
  const showAddress =
    Boolean(propertyAddress) && propertyAddress.trim() !== propertyName.trim();

  const target = placeId
    ? `${appUrl}/?focus=${encodeURIComponent(placeId)}`
    : appUrl;

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
      <Preview>{heading}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={{ padding: "32px 24px" }}>
            <Section style={{ textAlign: "center" as const, padding: "0 0 8px" }}>
              <Img src={LOGO_URL} alt="Miners" width={168} height={47} style={logoStyle} />
            </Section>

            <Text style={headingStyle}>{heading}</Text>
            <Text style={textStyle}>{message}</Text>

            <Section style={cardStyle}>
              <Text style={cardTitleStyle}>{propertyName}</Text>
              {showAddress && <Text style={cardSubtitleStyle}>{propertyAddress}</Text>}
              <Text style={badgeStyle}>Assigned</Text>
            </Section>

            <Link href={target} style={buttonStyle}>
              {placeId ? "View property" : "Open app"}
            </Link>

            <Section style={footerSectionStyle}>
              <Text style={footerBrandStyle}>
                <Link href="https://theminers.eu" style={footerLinkStyle}>
                  The Miners
                </Link>
              </Text>
              <Text style={footerDescStyle}>
                Got feedback? Email{" "}
                <Link href="mailto:matus.husar@theminers.eu" style={footerLinkStyle}>
                  matus.husar@theminers.eu
                </Link>
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PropertyAssigned;

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

const logoStyle: React.CSSProperties = {
  display: "block",
  margin: "0 auto",
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
  margin: "0 0 12px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#16a34a",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: "20px",
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

const footerSectionStyle: React.CSSProperties = {
  padding: "28px 0 0",
  borderTop: "1px solid #f4f4f5",
  textAlign: "center" as const,
  marginTop: "24px",
};

const footerLinkStyle: React.CSSProperties = {
  color: "#71717a",
  textDecoration: "none",
};

const footerBrandStyle: React.CSSProperties = {
  margin: "0",
  fontSize: "13px",
  fontWeight: 600,
  color: "#71717a",
};

const footerDescStyle: React.CSSProperties = {
  marginTop: "8px",
  color: "#a1a1aa",
  fontSize: "12px",
  lineHeight: "1.5",
};
