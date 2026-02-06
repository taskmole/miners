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

/**
 * Generate and download a DOCX for a scouting trip
 */
export async function generateTripDocx(trip: ScoutingTrip): Promise<void> {
  // Dynamically import docx
  const {
    Document,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    AlignmentType,
    HeadingLevel,
    Packer,
    ImageRun,
  } = await import("docx");

  // Helper to create a section heading
  const createSectionHeading = (text: string) =>
    new Paragraph({
      text,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
    });

  // Shared border config for invisible table borders
  const noBorders = {
    top: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
  };

  // Helper to create a key-value row
  const createKeyValueRow = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: noBorders,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: label, color: "666666", size: 20 }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 65, type: WidthType.PERCENTAGE },
          borders: noBorders,
          children: [
            new Paragraph({
              children: [new TextRun({ text: value, size: 20 })],
            }),
          ],
        }),
      ],
    });

  // Build document sections
  const children: (typeof Paragraph.prototype | typeof Table.prototype)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: "SCOUTING REPORT",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  // Trip name
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: trip.name || "Untitled Trip", bold: true, size: 28 }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  // Status badge
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Status: ${statusLabels[trip.status]}`,
          size: 20,
          color: trip.status === "approved" ? "15803d" : trip.status === "rejected" ? "b91c1c" : "666666",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    })
  );

  // Meta info
  const metaParts = [`Created: ${formatDate(trip.createdAt)}`, `Author: ${trip.authorName}`];
  if (trip.submittedAt) metaParts.push(`Submitted: ${formatDate(trip.submittedAt)}`);
  children.push(
    new Paragraph({
      children: [new TextRun({ text: metaParts.join(" • "), size: 18, color: "666666" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );

  // Key Metrics Summary
  const hasKeyMetrics = trip.monthlyRent || trip.openingInvestment || trip.paybackMonths || trip.areaSqm;
  if (hasKeyMetrics) {
    // Helper to create a metric cell
    const createMetricCell = (label: string, value: string) =>
      new TableCell({
        children: [
          new Paragraph({ children: [new TextRun({ text: label, size: 16, color: "666666" })] }),
          new Paragraph({ children: [new TextRun({ text: value, bold: true, size: 20 })] }),
        ],
        borders: noBorders,
      });

    const metricsCells: (typeof TableCell.prototype)[] = [];
    if (trip.monthlyRent) metricsCells.push(createMetricCell("Monthly Rent", formatCurrency(trip.monthlyRent)));
    if (trip.openingInvestment) metricsCells.push(createMetricCell("Investment", formatCurrency(trip.openingInvestment)));
    if (trip.paybackMonths) metricsCells.push(createMetricCell("Payback", `${trip.paybackMonths} months`));
    if (trip.areaSqm) metricsCells.push(createMetricCell("Area", `${trip.areaSqm} m²`));

    if (metricsCells.length > 0) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ children: metricsCells })],
        })
      );
      children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
    }
  }

  // Property Being Scouted
  if (trip.property) {
    children.push(createSectionHeading("Property Being Scouted"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: trip.property.name, bold: true, size: 22 }),
        ],
        spacing: { after: 50 },
      })
    );
    if (trip.property.address) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trip.property.address, size: 20, color: "666666" })],
          spacing: { after: 200 },
        })
      );
    }
  }

  // Location Section
  const hasLocationData = trip.address || trip.areaSqm || trip.storageSqm || trip.propertyType || trip.footfallEstimate;
  if (hasLocationData) {
    children.push(createSectionHeading("Location"));
    const locationRows: (typeof TableRow.prototype)[] = [];
    if (trip.address) locationRows.push(createKeyValueRow("Address", trip.address));
    if (trip.areaSqm) locationRows.push(createKeyValueRow("Area", `${trip.areaSqm} m²`));
    if (trip.storageSqm) locationRows.push(createKeyValueRow("Storage", `${trip.storageSqm} m²`));
    if (trip.propertyType) locationRows.push(createKeyValueRow("Type", trip.propertyType));
    if (trip.footfallEstimate) locationRows.push(createKeyValueRow("Footfall", `${trip.footfallEstimate.toLocaleString()}/day`));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: locationRows,
      })
    );
  }

  if (trip.neighbourhoodProfile) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Neighbourhood:", bold: true, size: 20 })],
        spacing: { before: 200, after: 50 },
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: trip.neighbourhoodProfile, size: 20 })],
        spacing: { after: 200 },
      })
    );
  }

  // Financial Section
  const hasFinancialData = trip.monthlyRent || trip.serviceFees || trip.deposit || trip.fitoutCost || trip.openingInvestment || trip.paybackMonths;
  if (hasFinancialData) {
    children.push(createSectionHeading("Financial"));
    const financialRows: (typeof TableRow.prototype)[] = [];
    if (trip.monthlyRent) financialRows.push(createKeyValueRow("Monthly Rent", `${formatCurrency(trip.monthlyRent)}/mo`));
    if (trip.serviceFees) financialRows.push(createKeyValueRow("Service Fees", `${formatCurrency(trip.serviceFees)}/mo`));
    if (trip.deposit) financialRows.push(createKeyValueRow("Deposit", formatCurrency(trip.deposit)));
    if (trip.transferFee) financialRows.push(createKeyValueRow("Transfer Fee", formatCurrency(trip.transferFee)));
    if (trip.fitoutCost) financialRows.push(createKeyValueRow("Fit-out Cost", formatCurrency(trip.fitoutCost)));
    if (trip.openingInvestment) financialRows.push(createKeyValueRow("Opening Investment", formatCurrency(trip.openingInvestment)));
    if (trip.expectedDailyRevenue) financialRows.push(createKeyValueRow("Expected Daily Revenue", formatCurrency(trip.expectedDailyRevenue)));
    if (trip.monthlyRevenueRange) financialRows.push(createKeyValueRow("Revenue Range", trip.monthlyRevenueRange));
    if (trip.paybackMonths) financialRows.push(createKeyValueRow("Payback Period", `${trip.paybackMonths} months`));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: financialRows,
      })
    );
  }

  // Operational Section
  const hasOperationalData = trip.ventilation || trip.waterWaste || trip.powerCapacity || trip.visibility || trip.deliveryAccess || trip.seatingCapacity;
  if (hasOperationalData) {
    children.push(createSectionHeading("Operational"));
    const operationalRows: (typeof TableRow.prototype)[] = [];
    if (trip.ventilation) operationalRows.push(createKeyValueRow("Ventilation", trip.ventilation));
    if (trip.waterWaste) operationalRows.push(createKeyValueRow("Water/Waste", trip.waterWaste));
    if (trip.powerCapacity) operationalRows.push(createKeyValueRow("Power Capacity", trip.powerCapacity));
    if (trip.visibility) operationalRows.push(createKeyValueRow("Visibility", trip.visibility));
    if (trip.deliveryAccess) operationalRows.push(createKeyValueRow("Delivery Access", trip.deliveryAccess));
    if (trip.seatingCapacity) operationalRows.push(createKeyValueRow("Seating Capacity", String(trip.seatingCapacity)));
    if (trip.outdoorSeating !== undefined) operationalRows.push(createKeyValueRow("Outdoor Seating", trip.outdoorSeating ? "Yes" : "No"));

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: operationalRows,
      })
    );
  }

  // Checklist Section
  if (trip.checklist && trip.checklist.length > 0) {
    children.push(createSectionHeading("Checklist"));
    const checked = trip.checklist.filter((i) => i.isChecked).length;
    const total = trip.checklist.length;
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `${checked} of ${total} completed`, size: 18, color: "666666" })],
        spacing: { after: 150 },
      })
    );

    for (const item of trip.checklist) {
      const checkbox = item.isChecked ? "☑" : "☐";
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${checkbox} `, size: 20 }),
            new TextRun({ text: item.question, size: 20, color: item.isChecked ? "666666" : "000000" }),
          ],
          spacing: { after: item.notes ? 50 : 100 },
        })
      );
      if (item.notes) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: `   Notes: ${item.notes}`, italics: true, size: 18, color: "666666" })],
            spacing: { after: 100 },
          })
        );
      }
    }
  }

  // Risks Section
  if (trip.risks) {
    children.push(createSectionHeading("Risks & Concerns"));
    children.push(
      new Paragraph({
        children: [new TextRun({ text: trip.risks, size: 20 })],
        spacing: { after: 200 },
      })
    );
  }

  // Related Places
  if (trip.relatedPlaces && trip.relatedPlaces.length > 0) {
    children.push(createSectionHeading("Related Places"));
    const placesText = trip.relatedPlaces.map((p) => p.name).join(" • ");
    children.push(
      new Paragraph({
        children: [new TextRun({ text: placesText, size: 20 })],
        spacing: { after: 200 },
      })
    );
  }

  // Photos - embed images if available
  if (trip.attachments && trip.attachments.length > 0) {
    const imageAttachments = trip.attachments.filter((a) => a.type.startsWith("image/"));
    if (imageAttachments.length > 0) {
      children.push(createSectionHeading("Photos"));

      for (const attachment of imageAttachments.slice(0, 6)) {
        try {
          // Extract base64 data from data URL
          const base64Data = attachment.data.split(",")[1];
          if (base64Data) {
            const imageBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: imageBuffer,
                    transformation: { width: 300, height: 200 },
                    type: "png",
                  }),
                ],
                spacing: { after: 150 },
              })
            );
          }
        } catch (e) {
          console.warn("Could not add image to DOCX:", e);
        }
      }
    }
  }

  // Footer
  children.push(new Paragraph({ text: "", spacing: { before: 400 } }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Generated by Miners Location Scout • " +
            new Date().toLocaleString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            }),
          size: 16,
          color: "999999",
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

  // Create document
  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  const sanitizedName = (trip.name || "scouting-trip")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizedName}-report.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
