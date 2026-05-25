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

interface TripStatusUpdateProps {
  tripName: string;
  tripAddress: string;
  recipientName: string;
  status: "approved" | "rejected" | "returned";
  reason?: string;
  reviewerName: string;
  appUrl?: string;
}

const LOGO_URL =
  "https://raw.githubusercontent.com/taskmole/miners/main/public/assets/miners-logo-cropped.png";

const STATUS_CONFIG = {
  approved: {
    color: "#16a34a",
    label: "Approved",
    heading: "Your scouting trip has been approved!",
    message: "Great work. Your submission passed review and has been accepted.",
  },
  rejected: {
    color: "#dc2626",
    label: "Rejected",
    heading: "Your scouting trip was not accepted",
    message: "The reviewer provided feedback below. Please review and consider submitting a new trip.",
  },
  returned: {
    color: "#d97706",
    label: "Returned for Edits",
    heading: "Your scouting trip needs some changes",
    message: "The reviewer has sent your trip back for revisions. Please make the requested changes and resubmit.",
  },
};

export function TripStatusUpdate({
  tripName = "Sample Trip",
  tripAddress = "123 Main Street",
  recipientName = "Scout",
  status = "approved",
  reason,
  reviewerName = "Admin",
  appUrl = "https://theminers.vercel.app",
}: TripStatusUpdateProps) {
  const config = STATUS_CONFIG[status];

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
      <Preview>{config.heading}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={{ padding: "32px 24px" }}>
            <Img src={LOGO_URL} alt="Miners" width={100} height={28} />

            <Text style={headingStyle}>{config.heading}</Text>

            <Text style={textStyle}>Hi {recipientName},</Text>

            <Text style={textStyle}>{config.message}</Text>

            <Section style={cardStyle}>
              <Text style={cardTitleStyle}>{tripName}</Text>
              {tripAddress && <Text style={cardSubtitleStyle}>{tripAddress}</Text>}
              <Text style={{ ...statusBadgeStyle, backgroundColor: config.color }}>
                {config.label}
              </Text>
            </Section>

            {reason && (
              <Section style={reasonBoxStyle}>
                <Text style={reasonLabelStyle}>Feedback from {reviewerName}:</Text>
                <Text style={reasonTextStyle}>{reason}</Text>
              </Section>
            )}

            {status === "returned" && (
              <Link href={appUrl} style={buttonStyle}>
                Open App to Edit
              </Link>
            )}

            {status === "approved" && (
              <Link href={appUrl} style={buttonStyle}>
                View in App
              </Link>
            )}

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

export default TripStatusUpdate;

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

const statusBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  color: "#ffffff",
  fontSize: "11px",
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: "20px",
  margin: "0",
};

const reasonBoxStyle: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "16px 0",
  border: "1px solid #fde68a",
};

const reasonLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#92400e",
  margin: "0 0 6px",
};

const reasonTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#78350f",
  lineHeight: "1.5",
  margin: 0,
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
