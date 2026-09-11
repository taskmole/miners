import React from "react";
import {
  Body,
  Container,
  Column,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
  Font,
} from "@react-email/components";
import { SAMPLE_LISTINGS, type Listing } from "@/lib/digest-queries";
import { LOGO_URL, FEEDBACK_EMAIL } from "./_shell";
import { toCityLabel } from "@/lib/utils";

interface MinersDigestProps {
  city: string;
  listings: Listing[];
  appUrl: string;
}

const LOGO_WHITE_URL =
  "https://raw.githubusercontent.com/taskmole/miners/main/public/assets/miners-logo-cropped-white.png";

const ARROW_URL =
  "https://raw.githubusercontent.com/taskmole/miners/main/public/assets/arrow-right-white.png";

const APP_URL = "https://theminers.vercel.app";

function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 70) return "#2563eb";
  return "#71717a";
}

function listedAgoLabel(days?: number): string {
  if (days === undefined) return "New";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function formatPrice(rent: number, city: string): string {
  if (city === "prague") return `${rent.toLocaleString("en-US")} Kč/mo`;
  return `€${rent.toLocaleString("en-US")}/mo`;
}


function ListingRow({ listing, city }: { listing: Listing; city: string }) {
  const hasScore = listing.score != null;
  const hasReason = listing.reason != null && listing.reason.length > 0;

  return (
    <Row className="listing-row" style={{ paddingTop: "30px", paddingBottom: "12px" }}>
      <Column className="listing-photo-col" style={{ width: "96px", verticalAlign: "top" }}>
        <Img
          className="listing-photo"
          src={listing.photoUrl}
          alt={listing.address}
          width={88}
          height={88}
          style={{
            borderRadius: "8px",
            objectFit: "cover",
            display: "block",
            maxWidth: "100%",
          }}
        />
      </Column>
      <Column className="listing-text-col" style={{ verticalAlign: "top", paddingLeft: "12px" }}>
        {/* Title and score share one row so the badge's right edge lines up
            with the callout below it. The score used to live in a third
            column of the outer table, outside this one, so it always sat
            further right than the callout and looked like it had escaped
            the box. */}
        <table
          cellPadding="0"
          cellSpacing="0"
          border={0}
          width="100%"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <tbody>
            <tr>
              <td style={{ verticalAlign: "top" }}>
                <div className="listing-title" style={listingTitle}>
                  {listing.address}
                </div>
              </td>
              {hasScore && (
                <td
                  style={{
                    verticalAlign: "top",
                    textAlign: "right" as const,
                    paddingLeft: "8px",
                    width: "44px",
                  }}
                >
                  <span
                    className="listing-score"
                    style={{
                      display: "inline-block",
                      backgroundColor: scoreColor(listing.score!),
                      color: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 700,
                      lineHeight: "22px",
                      borderRadius: "12px",
                      padding: "0 9px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {listing.score}
                  </span>
                </td>
              )}
            </tr>
          </tbody>
        </table>
        <div className="listing-meta" style={listingMeta}>
          {listing.district} · {listing.sizeSqm}m² ·{" "}
          {formatPrice(listing.monthlyRent, city)}
        </div>
        {hasReason && (
          <div style={{ marginTop: "4px" }}>
            <div className="listing-callout" style={reasonCallout}>
              <span style={{ fontWeight: 700 }}>Why: </span>
              {listing.reason}
            </div>
          </div>
        )}
        <div className="listing-ago" style={listingListedAgo}>
          {listedAgoLabel(listing.listedDaysAgo)}
        </div>
      </Column>
    </Row>
  );
}

export default function MinersDigest({
  city = "Madrid",
  listings = SAMPLE_LISTINGS,
  appUrl = APP_URL,
}: MinersDigestProps) {
  const MAX_SHOWN = 5;
  const displayListings = listings.slice(0, MAX_SHOWN);
  const topCount = listings.length;
  const cityName = toCityLabel(city);

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: `
          @media only screen and (max-width: 480px) {
            .listing-row,
            .listing-row tbody,
            .listing-row tr {
              display: block !important;
              width: 100% !important;
            }
            .listing-photo-col {
              display: block !important;
              width: 100% !important;
              padding-bottom: 8px !important;
            }
            .listing-photo {
              width: 100% !important;
              height: auto !important;
              max-width: 100% !important;
            }
            .listing-text-col {
              display: block !important;
              width: 100% !important;
              padding-left: 0 !important;
              padding-top: 4px !important;
            }
            /* The score now lives beside the title in every width, so
               there is no separate column to hide here any more. */
            .listing-title {
              font-size: 22px !important;
              line-height: 28px !important;
              white-space: normal !important;
            }
            .listing-meta {
              font-size: 17px !important;
              line-height: 22px !important;
              margin-top: 4px !important;
              white-space: normal !important;
            }
            .listing-callout {
              font-size: 16px !important;
              line-height: 22px !important;
              white-space: normal !important;
            }
            .listing-ago {
              font-size: 15px !important;
              line-height: 20px !important;
            }
            .listing-score {
              font-size: 14px !important;
            }
          }
          @media (prefers-color-scheme: dark) {
            .logo-dark { display: none !important; }
            .logo-light { display: block !important; }
          }
        `}} />
        <Font
          fontFamily="Outfit"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>
        {String(topCount)} new locations found in {cityName}
      </Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={logoSection}>
            <Img
              className="logo-dark"
              src={LOGO_URL}
              alt="THEMINERS"
              height={70}
              style={{ display: "block", margin: "0 auto" }}
            />
            <Img
              className="logo-light"
              src={LOGO_WHITE_URL}
              alt="THEMINERS"
              height={70}
              style={{ display: "none", margin: "0 auto" }}
            />
          </Section>

          <Section style={contentSection}>
            <Text style={heading}>
              {String(topCount)} new locations found in {cityName}
            </Text>
          </Section>

          <Section style={contentSection}>
            <Text style={sectionLabel}>TOP PICKS</Text>

            {displayListings.map((listing, i) => (
              <ListingRow key={i} listing={listing} city={city} />
            ))}
          </Section>

          <Section style={ctaSection}>
            <Link href={`${appUrl}?listings=open`} style={ctaButton}>
              <table cellPadding={0} cellSpacing={0} border={0} style={{ display: "inline-table", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td valign="middle" style={ctaTextCell}>View all</td>
                    <td valign="middle" style={ctaArrowCell}>
                      <Img
                        src={ARROW_URL}
                        alt="→"
                        width={12}
                        height={12}
                        style={{ display: "inline-block", verticalAlign: "middle" }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </Link>
          </Section>

          <Section style={footer}>
            <Text style={footerBrand}>
              <Link href="https://theminers.eu" style={footerLink}>
                The Miners
              </Link>
            </Text>
            <Text style={footerDesc}>
              Got feedback? Email{" "}
              <Link href={`mailto:${FEEDBACK_EMAIL}`} style={footerLink}>
                {FEEDBACK_EMAIL}
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily: "'Outfit', Arial, sans-serif",
  margin: 0,
  padding: "40px 16px",
};

const container: React.CSSProperties = {
  maxWidth: "600px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
};

const logoSection: React.CSSProperties = {
  padding: "40px 32px 0",
  textAlign: "center",
};

// 32px each side, matched by ctaSection and footer, so every row in the
// email starts and ends on the same two vertical lines.
const contentSection: React.CSSProperties = {
  padding: "0 32px",
};

const heading: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 700,
  color: "#18181b",
  lineHeight: "1.3",
  margin: "32px 0 0",
  letterSpacing: "-0.02em",
  textAlign: "center",
};

const sectionLabel: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  color: "#a1a1aa",
  margin: "36px 0 0",
};

const listingTitle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#18181b",
  margin: "0",
  padding: "0",
  lineHeight: "18px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const listingMeta: React.CSSProperties = {
  fontSize: "12px",
  color: "#71717a",
  fontWeight: 400,
  margin: "2px 0 0",
  padding: "0",
  lineHeight: "16px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const reasonCallout: React.CSSProperties = {
  backgroundColor: "#dcfce7",
  border: "1px solid #bbf7d0",
  borderRadius: "5px",
  padding: "3px 8px",
  fontSize: "12px",
  lineHeight: "16px",
  color: "#15803d",
};


const listingListedAgo: React.CSSProperties = {
  fontSize: "11px",
  color: "#a1a1aa",
  fontWeight: 400,
  margin: "8px 0 0",
  padding: "0",
  lineHeight: "16px",
};

const ctaSection: React.CSSProperties = {
  padding: "32px 32px 36px",
  textAlign: "center",
};

// Matches the button in trip-status-update.tsx and property-assigned.tsx.
// It was 16px/64px at 15px text with a 10px radius, which made the digest's
// CTA noticeably chunkier than the same button everywhere else.
const ctaButton: React.CSSProperties = {
  backgroundColor: "#18181b",
  color: "#ffffff",
  textDecoration: "none",
  textAlign: "center",
  padding: "10px 20px",
  borderRadius: "8px",
  fontSize: "13px",
  lineHeight: "18px",
  fontWeight: 600,
  display: "inline-block",
};

const ctaTextCell: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 600,
  lineHeight: "18px",
  paddingRight: "7px",
};

const ctaArrowCell: React.CSSProperties = {
  lineHeight: "18px",
  fontSize: 0,
};

const footer: React.CSSProperties = {
  padding: "28px 32px 36px",
  borderTop: "1px solid #f4f4f5",
  textAlign: "center",
};

const footerLink: React.CSSProperties = {
  color: "#71717a",
  textDecoration: "none",
};

const footerBrand: React.CSSProperties = {
  margin: "0",
  fontSize: "13px",
  fontWeight: 600,
  color: "#71717a",
};

const footerDesc: React.CSSProperties = {
  marginTop: "8px",
  color: "#a1a1aa",
  fontSize: "12px",
  lineHeight: "1.5",
};

