"use client";

import type { ScoutingTrip } from "@/types/scouting";
import { statusLabels } from "@/types/scouting";

// Format date for display
function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Format currency
function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return "—";
  return `€${amount.toLocaleString()}`;
}

// Load image as base64
async function loadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Status colors for badges
const statusBadgeColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#f4f4f5", text: "#3f3f46" },
  submitted: { bg: "#dbeafe", text: "#1d4ed8" },
  approved: { bg: "#dcfce7", text: "#15803d" },
  rejected: { bg: "#fee2e2", text: "#b91c1c" },
};

/**
 * Generate and download a PDF for a scouting trip
 * Uses jsPDF directly to avoid html2canvas OKLCH color parsing issues
 */
export async function generateTripPdf(trip: ScoutingTrip): Promise<void> {
  // Dynamically import jsPDF
  const { jsPDF } = await import("jspdf");

  // Load logo
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64("/assets/THEMINERS_LOGO_BLACK_UP (4).png");
  } catch (e) {
    console.warn("Could not load logo:", e);
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let pageNumber = 1;

  // Colors
  const black = "#27272a";
  const gray = "#71717a";
  const lightGray = "#e4e4e7";
  const accentColor = "#27272a";

  // Helper: Add page number footer
  const addPageFooter = () => {
    doc.setFontSize(8);
    doc.setTextColor(gray);
    doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  };

  // Helper: Add section header with background
  const addSectionHeader = (title: string) => {
    y += 6;
    // Background bar
    doc.setFillColor("#f4f4f5");
    doc.rect(margin - 2, y - 5, contentWidth + 4, 8, "F");
    // Text
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor);
    doc.text(title, margin, y);
    y += 8;
  };

  // Helper: Add key-value row
  const addRow = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(gray);
    doc.text(label + ":", margin, y);
    doc.setTextColor(black);
    doc.text(value, margin + 42, y);
    y += 5;
  };

  // Helper: Check if we need a new page
  const checkNewPage = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - 25) {
      addPageFooter();
      doc.addPage();
      pageNumber++;
      y = margin;
    }
  };

  // ===== HEADER WITH LOGO =====
  if (logoBase64) {
    const logoWidth = 35;
    const logoHeight = 10;
    doc.addImage(logoBase64, "PNG", (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
    y += logoHeight + 3;

    // Subtle divider
    doc.setDrawColor(lightGray);
    doc.setLineWidth(0.3);
    doc.line(pageWidth / 2 - 25, y, pageWidth / 2 + 25, y);
    y += 8;
  }

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(black);
  doc.text("SCOUTING REPORT", pageWidth / 2, y, { align: "center" });
  y += 8;

  // Trip name
  doc.setFontSize(12);
  doc.text(trip.name || "Untitled Trip", pageWidth / 2, y, { align: "center" });
  y += 6;

  // Status badge (colored pill)
  const statusColor = statusBadgeColors[trip.status] || statusBadgeColors.draft;
  const statusText = statusLabels[trip.status];
  const badgeWidth = doc.getTextWidth(statusText) + 8;
  const badgeX = (pageWidth - badgeWidth) / 2;
  doc.setFillColor(statusColor.bg);
  doc.roundedRect(badgeX, y - 3.5, badgeWidth, 5, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(statusColor.text);
  doc.text(statusText, pageWidth / 2, y, { align: "center" });
  y += 6;

  // Meta info
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(gray);
  const metaText = `Created: ${formatDate(trip.createdAt)} • Author: ${trip.authorName}${trip.submittedAt ? ` • Submitted: ${formatDate(trip.submittedAt)}` : ""}`;
  doc.text(metaText, pageWidth / 2, y, { align: "center" });
  y += 10;

  // ===== KEY METRICS SUMMARY BOX =====
  const hasKeyMetrics = trip.monthlyRent || trip.openingInvestment || trip.paybackMonths || trip.areaSqm;
  if (hasKeyMetrics) {
    // Box background
    doc.setFillColor("#fafafa");
    doc.setDrawColor(lightGray);
    doc.roundedRect(margin, y - 2, contentWidth, 18, 2, 2, "FD");

    const metricsY = y + 4;
    const colWidth = contentWidth / 4;
    let col = 0;

    doc.setFontSize(8);

    const addMetric = (label: string, value: string) => {
      const x = margin + 4 + (col * colWidth);
      doc.setTextColor(gray);
      doc.setFont("helvetica", "normal");
      doc.text(label, x, metricsY);
      doc.setTextColor(black);
      doc.setFont("helvetica", "bold");
      doc.text(value, x, metricsY + 4);
      col++;
    };

    if (trip.monthlyRent) addMetric("Monthly Rent", formatCurrency(trip.monthlyRent));
    if (trip.openingInvestment) addMetric("Investment", formatCurrency(trip.openingInvestment));
    if (trip.paybackMonths) addMetric("Payback", `${trip.paybackMonths} months`);
    if (trip.areaSqm) addMetric("Area", `${trip.areaSqm} m²`);

    y += 20;
  }

  // ===== PROPERTY BEING SCOUTED =====
  if (trip.property) {
    checkNewPage(18);
    doc.setFillColor("#fef3c7");
    doc.setDrawColor("#fcd34d");
    doc.roundedRect(margin, y - 2, contentWidth, 14, 2, 2, "FD");
    doc.setFontSize(7);
    doc.setTextColor("#92400e");
    doc.setFont("helvetica", "bold");
    doc.text("PROPERTY BEING SCOUTED", margin + 3, y + 2);
    doc.setFontSize(9);
    doc.setTextColor(black);
    doc.text(trip.property.name, margin + 3, y + 7);
    if (trip.property.address) {
      doc.setFontSize(7);
      doc.setTextColor(gray);
      doc.setFont("helvetica", "normal");
      doc.text(trip.property.address, margin + 3, y + 10);
    }
    y += 18;
  }

  // ===== LOCATION SECTION =====
  const hasLocationData = trip.address || trip.areaSqm || trip.storageSqm ||
    trip.propertyType || trip.footfallEstimate;

  if (hasLocationData) {
    checkNewPage(35);
    addSectionHeader("LOCATION");
    if (trip.address) addRow("Address", trip.address);
    if (trip.areaSqm) addRow("Area", `${trip.areaSqm} m²`);
    if (trip.storageSqm) addRow("Storage", `${trip.storageSqm} m²`);
    if (trip.propertyType) addRow("Type", trip.propertyType);
    if (trip.footfallEstimate) addRow("Footfall", `${trip.footfallEstimate.toLocaleString()}/day`);
    y += 2;
  }

  if (trip.neighbourhoodProfile) {
    checkNewPage(15);
    doc.setFontSize(8);
    doc.setTextColor(gray);
    doc.text("Neighbourhood:", margin, y);
    y += 4;
    doc.setTextColor(black);
    const lines = doc.splitTextToSize(trip.neighbourhoodProfile, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 3.5 + 2;
  }

  // ===== FINANCIAL SECTION =====
  const hasFinancialData = trip.monthlyRent || trip.serviceFees || trip.deposit ||
    trip.fitoutCost || trip.openingInvestment || trip.paybackMonths;

  if (hasFinancialData) {
    checkNewPage(45);
    addSectionHeader("FINANCIAL");
    if (trip.monthlyRent) addRow("Monthly Rent", `${formatCurrency(trip.monthlyRent)}/mo`);
    if (trip.serviceFees) addRow("Service Fees", `${formatCurrency(trip.serviceFees)}/mo`);
    if (trip.deposit) addRow("Deposit", formatCurrency(trip.deposit));
    if (trip.transferFee) addRow("Transfer Fee", formatCurrency(trip.transferFee));
    if (trip.fitoutCost) addRow("Fit-out Cost", formatCurrency(trip.fitoutCost));
    if (trip.openingInvestment) addRow("Opening Investment", formatCurrency(trip.openingInvestment));
    if (trip.expectedDailyRevenue) addRow("Expected Daily Revenue", formatCurrency(trip.expectedDailyRevenue));
    if (trip.monthlyRevenueRange) addRow("Revenue Range", trip.monthlyRevenueRange);
    if (trip.paybackMonths) addRow("Payback Period", `${trip.paybackMonths} months`);
    y += 2;
  }

  // ===== OPERATIONAL SECTION =====
  const hasOperationalData = trip.ventilation || trip.waterWaste || trip.powerCapacity ||
    trip.visibility || trip.deliveryAccess || trip.seatingCapacity;

  if (hasOperationalData) {
    checkNewPage(40);
    addSectionHeader("OPERATIONAL");
    if (trip.ventilation) addRow("Ventilation", trip.ventilation);
    if (trip.waterWaste) addRow("Water/Waste", trip.waterWaste);
    if (trip.powerCapacity) addRow("Power Capacity", trip.powerCapacity);
    if (trip.visibility) addRow("Visibility", trip.visibility);
    if (trip.deliveryAccess) addRow("Delivery Access", trip.deliveryAccess);
    if (trip.seatingCapacity) addRow("Seating Capacity", String(trip.seatingCapacity));
    if (trip.outdoorSeating !== undefined) addRow("Outdoor Seating", trip.outdoorSeating ? "Yes" : "No");
    y += 2;
  }

  // ===== CHECKLIST SECTION =====
  if (trip.checklist && trip.checklist.length > 0) {
    checkNewPage(25);
    addSectionHeader("CHECKLIST");

    // Progress indicator
    const checked = trip.checklist.filter(i => i.isChecked).length;
    const total = trip.checklist.length;
    doc.setFontSize(8);
    doc.setTextColor(gray);
    doc.text(`${checked} of ${total} completed`, margin, y);
    y += 5;

    for (const item of trip.checklist) {
      checkNewPage(12);

      // Draw checkbox
      const boxSize = 3.5;
      const boxX = margin;
      const boxY = y - 2.8;

      if (item.isChecked) {
        doc.setFillColor("#15803d");
        doc.roundedRect(boxX, boxY, boxSize, boxSize, 0.5, 0.5, "F");
        // Checkmark
        doc.setDrawColor("#ffffff");
        doc.setLineWidth(0.5);
        doc.line(boxX + 0.7, boxY + 1.8, boxX + 1.4, boxY + 2.6);
        doc.line(boxX + 1.4, boxY + 2.6, boxX + 2.8, boxY + 0.9);
      } else {
        doc.setDrawColor(lightGray);
        doc.setLineWidth(0.3);
        doc.roundedRect(boxX, boxY, boxSize, boxSize, 0.5, 0.5, "S");
      }

      // Question text
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(item.isChecked ? gray : black);
      const questionLines = doc.splitTextToSize(item.question, contentWidth - 8);
      doc.text(questionLines, margin + 6, y);
      y += questionLines.length * 4;

      if (item.notes) {
        doc.setFontSize(7);
        doc.setTextColor(gray);
        doc.setFont("helvetica", "italic");
        const noteLines = doc.splitTextToSize(`Notes: ${item.notes}`, contentWidth - 8);
        doc.text(noteLines, margin + 6, y);
        doc.setFont("helvetica", "normal");
        y += noteLines.length * 3;
      }
      y += 2;
    }
  }

  // ===== RISKS SECTION =====
  if (trip.risks) {
    checkNewPage(25);
    addSectionHeader("RISKS & CONCERNS");
    doc.setFontSize(9);
    doc.setTextColor(black);
    const riskLines = doc.splitTextToSize(trip.risks, contentWidth);
    doc.text(riskLines, margin, y);
    y += riskLines.length * 4 + 2;
  }

  // ===== RELATED PLACES =====
  if (trip.relatedPlaces && trip.relatedPlaces.length > 0) {
    checkNewPage(15);
    addSectionHeader("RELATED PLACES");
    doc.setFontSize(9);
    doc.setTextColor(black);
    const placesText = trip.relatedPlaces.map(p => p.name).join(" • ");
    const placeLines = doc.splitTextToSize(placesText, contentWidth);
    doc.text(placeLines, margin, y);
    y += placeLines.length * 4 + 2;
  }

  // ===== PHOTOS (if any) =====
  if (trip.attachments && trip.attachments.length > 0) {
    const imageAttachments = trip.attachments.filter(a => a.type.startsWith("image/"));
    if (imageAttachments.length > 0) {
      checkNewPage(60);
      addSectionHeader("PHOTOS");

      let photoX = margin;
      const photoWidth = 40;
      const photoHeight = 30;
      let photosInRow = 0;

      for (const attachment of imageAttachments.slice(0, 6)) { // Max 6 photos
        if (photosInRow >= 4) {
          photoX = margin;
          y += photoHeight + 5;
          photosInRow = 0;
          checkNewPage(photoHeight + 10);
        }

        try {
          doc.addImage(attachment.data, "JPEG", photoX, y, photoWidth, photoHeight);
          photoX += photoWidth + 5;
          photosInRow++;
        } catch (e) {
          console.warn("Could not add image:", e);
        }
      }
      y += photoHeight + 5;
    }
  }

  // ===== FOOTER =====
  addPageFooter();

  // Generation timestamp at bottom
  const footerY = pageHeight - 15;
  doc.setDrawColor(lightGray);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
  doc.setFontSize(7);
  doc.setTextColor(gray);
  doc.text("Generated by Miners Location Scout", pageWidth / 2, footerY, { align: "center" });
  doc.text(new Date().toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }), pageWidth / 2, footerY + 3, { align: "center" });

  // Generate filename and save
  const sanitizedName = (trip.name || "scouting-trip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  doc.save(`${sanitizedName}-report.pdf`);
}
