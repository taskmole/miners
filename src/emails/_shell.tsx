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
 * Shared chrome for every notification email: font, logo, card, footer.
 *
 * These templates drifted apart as they were written one at a time. The logo
 * was 500x220 rendered into a 168x47 box in two of them (stretched sideways)
 * and height-only in the others; buttons came in three sizes; the assignment
 * mail was a hand-rolled HTML string with a text wordmark instead of the
 * logo. Putting the chrome in one place is what stops that recurring.
 *
 * The digest (miners-digest.tsx) keeps its own wider layout on purpose: it is
 * a listings roundup, not a notification. Its logo, button and footer are
 * matched to the values here by hand.
 */

export const LOGO_URL =
  "https://raw.githubusercontent.com/taskmole/miners/main/public/assets/miners-logo-cropped.png";

/** Source image is 500x220. Set height only; a fixed width distorts it. */
const LOGO_HEIGHT = 70;

export const FEEDBACK_EMAIL = "matus.husar@theminers.eu";

/** CTA target: deep-link to the property when we know which one it is. */
export function propertyUrl(appUrl: string, placeId?: string | null): string {
  return placeId ? `${appUrl}/?focus=${encodeURIComponent(placeId)}` : appUrl;
}

export function EmailShell({
  preview,
  headStyles,
  maxWidth,
  children,
}: {
  preview: string;
  /**
   * Extra CSS for the document head, for templates that need mobile rules.
   * The shell has none of its own: every email using it is stacked text,
   * which reflows by itself. Templates that introduce tables (the weekly
   * summary) do need them, and must not fork the chrome to get them.
   */
  headStyles?: string;
  /** Wider body for report-style emails. Notifications keep the default 480. */
  maxWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <Html>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {headStyles && (
          <style dangerouslySetInnerHTML={{ __html: headStyles }} />
        )}
        <Font
          fontFamily="Outfit"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.gstatic.com/s/outfit/v11/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4S-EiAou6Y.woff2",
            format: "woff2",
          }}
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container
          style={maxWidth ? { ...containerStyle, maxWidth: `${maxWidth}px` } : containerStyle}
        >
          <Section style={{ padding: "32px 24px" }}>
            <Section style={logoSectionStyle}>
              <Img
                src={LOGO_URL}
                alt="The Miners"
                height={LOGO_HEIGHT}
                style={{ display: "block", margin: "0 auto" }}
              />
            </Section>

            {children}

            <Section style={footerSectionStyle}>
              <Text style={footerBrandStyle}>
                <Link href="https://theminers.eu" style={footerLinkStyle}>
                  The Miners
                </Link>
              </Text>
              <Text style={footerDescStyle}>
                Got feedback? Email{" "}
                <Link href={`mailto:${FEEDBACK_EMAIL}`} style={footerLinkStyle}>
                  {FEEDBACK_EMAIL}
                </Link>
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Property (or trip) card. Nothing here renders unless it has a value, so an
 * email never shows a label with nothing after it.
 */
export function DetailCard({
  title,
  subtitle,
  badge,
  badgeColor,
  children,
}: {
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  badgeColor?: string;
  children?: React.ReactNode;
}) {
  // The address is often the same string as the title (a request snapshot
  // uses the address for both), and printing it twice reads as a bug.
  const showSubtitle = !!subtitle?.trim() && subtitle.trim() !== title.trim();

  return (
    <Section style={cardStyle}>
      <Text style={cardTitleStyle}>{title}</Text>
      {showSubtitle && <Text style={cardSubtitleStyle}>{subtitle}</Text>}
      {badge && (
        <Text style={{ ...badgeStyle, backgroundColor: badgeColor || "#16a34a" }}>
          {badge}
        </Text>
      )}
      {children}
    </Section>
  );
}

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
  textAlign: "center",
  padding: "0 0 8px",
};

export const headingStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#18181b",
  margin: "24px 0 8px",
  lineHeight: "1.3",
};

export const textStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#52525b",
  lineHeight: "1.5",
  margin: "8px 0",
};

export const buttonStyle: React.CSSProperties = {
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

/** Reviewer feedback, inside the card rather than a second box of its own. */
export const notedBlockStyle: React.CSSProperties = {
  borderTop: "1px solid #e4e4e7",
  margin: "14px 0 0",
  padding: "14px 0 0",
};

export const notedLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#71717a",
  margin: "0 0 6px",
};

export const notedTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#3f3f46",
  lineHeight: "1.5",
  margin: 0,
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
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: "20px",
  margin: "0",
};

const footerSectionStyle: React.CSSProperties = {
  padding: "28px 0 0",
  borderTop: "1px solid #f4f4f5",
  textAlign: "center",
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
