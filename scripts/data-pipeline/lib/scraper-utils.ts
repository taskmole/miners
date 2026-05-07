/**
 * Shared Scraper Utilities
 *
 * Common functions used by both the Idealista and Sreality scrapers:
 * - Price change detection
 * - Category ID lookup
 * - Publish listings to Supabase
 * - Email report via Resend
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScraperReport {
  sourceName: string;
  city: string;
  totalScraped: number;
  inserted: number;
  updated: number;
  priceChanges: number;
  errors: number;
  skippedValidation: number;
  inactivated: number;
  safetyGuardTripped: boolean;
  reportedTotal?: number;
}

export interface ValidatedListing {
  sourceId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  price: number | null;
  photos: string[];
  metadata: Record<string, unknown>;
}

export interface PublishStats {
  inserted: number;
  updated: number;
  priceChanges: number;
  errors: number;
  skippedValidation: number;
}

// ---------------------------------------------------------------------------
// Price change detection
// ---------------------------------------------------------------------------

export function detectPriceChange(
  existingMeta: Record<string, unknown> | null,
  newPrice: number | null
): {
  priceChanged: boolean;
  priceHistory: Array<{ price: number; date: string }>;
} {
  if (!existingMeta) {
    return { priceChanged: false, priceHistory: [] };
  }

  const oldPrice = existingMeta.price as number | null;
  const existingHistory = (existingMeta.price_history as Array<{ price: number; date: string }>) || [];

  if (oldPrice !== null && newPrice !== null && oldPrice !== newPrice) {
    return {
      priceChanged: true,
      priceHistory: [
        ...existingHistory,
        { price: oldPrice, date: new Date().toISOString().slice(0, 10) },
      ],
    };
  }

  return { priceChanged: false, priceHistory: existingHistory };
}

// ---------------------------------------------------------------------------
// Category ID lookup
// ---------------------------------------------------------------------------

export async function getCategoryId(
  client: SupabaseClient,
  categoryName: string
): Promise<string> {
  const { data } = await client
    .from("categories")
    .select("id")
    .eq("name", categoryName)
    .single();

  if (!data) {
    throw new Error(
      `Category "${categoryName}" not found in database. Run "npm run publish" first to seed categories.`
    );
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// Publish listings to Supabase
// ---------------------------------------------------------------------------

export async function publishListings(
  client: SupabaseClient,
  listings: ValidatedListing[],
  cityId: string,
  categoryId: string,
  source: string,
  envName: string
): Promise<PublishStats> {
  let inserted = 0;
  let updated = 0;
  let priceChanges = 0;
  let errors = 0;

  console.log(`\nPublishing ${listings.length} listings to ${envName}...`);

  // Batch fetch all existing records in one query
  const sourceIds = listings.map((l) => l.sourceId);
  const { data: existingRows } = await client
    .from("places")
    .select("id, source_id, metadata")
    .eq("source", source)
    .in("source_id", sourceIds);

  const existingMap = new Map<string, { id: string; metadata: Record<string, unknown> | null }>();
  for (const row of existingRows || []) {
    existingMap.set(row.source_id, {
      id: row.id,
      metadata: row.metadata as Record<string, unknown> | null,
    });
  }

  const now = new Date().toISOString();

  for (const listing of listings) {
    const existing = existingMap.get(listing.sourceId);

    const existingMeta = existing?.metadata ?? null;
    const { priceChanged, priceHistory } = detectPriceChange(existingMeta, listing.price);
    if (priceChanged) priceChanges++;

    const metadata = {
      ...listing.metadata,
      price_history: priceHistory,
      price_changed: priceChanged,
    };

    try {
      if (existing) {
        const { error } = await client
          .from("places")
          .update({
            name: listing.name,
            address: listing.address,
            location: `POINT(${listing.longitude} ${listing.latitude})`,
            metadata,
            photos: listing.photos,
            status: "active",
            updated_at: now,
            last_seen_at: now,
          })
          .eq("id", existing.id);

        if (error) {
          console.error(`  Error updating ${listing.name?.slice(0, 50)}:`, error.message);
          errors++;
        } else {
          updated++;
        }
      } else {
        const { error } = await client.from("places").insert({
          city_id: cityId,
          category_id: categoryId,
          source,
          source_id: listing.sourceId,
          name: listing.name,
          address: listing.address,
          location: `POINT(${listing.longitude} ${listing.latitude})`,
          metadata,
          photos: listing.photos,
          is_new: true,
          status: "active",
          created_at: now,
          updated_at: now,
          last_seen_at: now,
        });

        if (error) {
          console.error(`  Error inserting ${listing.name?.slice(0, 50)}:`, error.message);
          errors++;
        } else {
          inserted++;
        }
      }
    } catch (err) {
      console.error(`  Exception for ${listing.name?.slice(0, 50)}:`, err);
      errors++;
    }
  }

  return { inserted, updated, priceChanges, errors, skippedValidation: 0 };
}

// ---------------------------------------------------------------------------
// Email report
// ---------------------------------------------------------------------------

export async function sendScraperReport(report: ScraperReport): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("  No RESEND_API_KEY set, skipping email report.");
    return;
  }

  const hasProblems = report.safetyGuardTripped || report.errors > 5 || report.totalScraped === 0;

  const subject = hasProblems
    ? `Scraper needs attention: ${report.city}`
    : `Scraper ran successfully: ${report.city} (${report.inserted} new, ${report.priceChanges} price changes)`;

  const lines: string[] = [];

  if (hasProblems) {
    lines.push(`Something went wrong with today's ${report.city} scrape. Details below.`);
  } else {
    lines.push(`The ${report.city} scraper ran and everything looks good.`);
  }
  lines.push(``);

  lines.push(`WHAT HAPPENED`);
  lines.push(`--------------`);
  if (report.reportedTotal != null) {
    lines.push(`${report.sourceName} reported ${report.reportedTotal} total listings. We collected and processed ${report.totalScraped}.`);
  } else {
    lines.push(`Scraped ${report.totalScraped} listings from ${report.sourceName}.`);
  }
  if (report.inserted > 0) {
    lines.push(`  ${report.inserted} are brand new (never seen before).`);
  }
  if (report.updated > 0) {
    lines.push(`  ${report.updated} were already in the database and got refreshed.`);
  }
  if (report.priceChanges > 0) {
    lines.push(`  ${report.priceChanges} had a price change since last scrape.`);
  }
  if (report.inactivated > 0) {
    lines.push(`  ${report.inactivated} listings disappeared from ${report.sourceName} and were hidden from the map.`);
  }
  lines.push(``);

  lines.push(`SAFEGUARD CHECKS`);
  lines.push(`-----------------`);

  if (report.totalScraped === 0) {
    lines.push(`PROBLEM: Zero listings scraped. ${report.sourceName} may have changed their website or be blocking requests. Nothing was written to the database.`);
  } else {
    lines.push(`Scraping: ${report.totalScraped} listings found. Looks normal.`);
  }

  if (report.safetyGuardTripped) {
    lines.push(`PROBLEM: Way fewer listings than expected. To be safe, no listings were marked inactive. Your existing data is untouched.`);
  } else if (report.totalScraped > 0) {
    lines.push(`Data protection: Scraped count looks healthy compared to existing data. Safe to mark missing listings as inactive.`);
  }

  if (report.errors > 5) {
    lines.push(`PROBLEM: ${report.errors} listings failed to save. Some individual pages may have errored out.`);
  } else if (report.errors > 0) {
    lines.push(`Minor errors: ${report.errors} listings failed to save. This is normal in small numbers.`);
  } else {
    lines.push(`Errors: None. Every listing saved successfully.`);
  }

  if (report.skippedValidation > 0) {
    const pct = Math.round((report.skippedValidation / Math.max(report.totalScraped, 1)) * 100);
    lines.push(`Validation: ${report.skippedValidation} listings (${pct}%) were missing a price or coordinates and were skipped.${pct > 20 ? ` That's high. ${report.sourceName} may have changed their page layout.` : ""}`);
  } else {
    lines.push(`Validation: All listings had valid data.`);
  }

  lines.push(``);
  lines.push(`-- Miners Location Scout`);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Miners Scraper <onboarding@resend.dev>",
        to: ["founders@taskmole.co"],
        subject,
        text: lines.join("\n"),
      }),
    });

    if (res.ok) {
      console.log("  Report email sent.");
    } else {
      const body = await res.text();
      console.log(`  Failed to send email: ${res.status} ${body.slice(0, 100)}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Failed to send email: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Combined report (multiple scrapers in one email)
// ---------------------------------------------------------------------------

export async function sendCombinedScraperReport(reports: ScraperReport[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("  No RESEND_API_KEY set, skipping email report.");
    return;
  }

  const totalInserted = reports.reduce((s, r) => s + r.inserted, 0);
  const totalPriceChanges = reports.reduce((s, r) => s + r.priceChanges, 0);
  const anyProblems = reports.some((r) => r.safetyGuardTripped || r.errors > 5 || r.totalScraped === 0);
  const cityName = reports[0]?.city ?? "Unknown";

  const subject = anyProblems
    ? `Scraper needs attention: ${cityName}`
    : `Scraper ran successfully: ${cityName} (${totalInserted} new, ${totalPriceChanges} price changes)`;

  const lines: string[] = [];
  lines.push(anyProblems
    ? `Something went wrong with today's ${cityName} scrape. Details below.`
    : `The ${cityName} scraper ran and everything looks good.`);
  lines.push(``);

  for (const report of reports) {
    lines.push(`${report.sourceName.toUpperCase()}`);
    lines.push(`-`.repeat(report.sourceName.length + 1));
    lines.push(`Scraped ${report.totalScraped} listings.`);
    if (report.inserted > 0) lines.push(`  ${report.inserted} brand new.`);
    if (report.updated > 0) lines.push(`  ${report.updated} refreshed.`);
    if (report.priceChanges > 0) lines.push(`  ${report.priceChanges} price changes.`);
    if (report.inactivated > 0) lines.push(`  ${report.inactivated} hidden (no longer listed).`);
    if (report.totalScraped === 0) lines.push(`  PROBLEM: Zero listings scraped.`);
    if (report.safetyGuardTripped) lines.push(`  PROBLEM: Safety guard tripped. Existing data untouched.`);
    if (report.errors > 5) lines.push(`  PROBLEM: ${report.errors} listings failed to save.`);
    else if (report.errors > 0) lines.push(`  Minor: ${report.errors} listings failed to save (normal in small numbers).`);
    if (report.skippedValidation > 0) {
      const pct = Math.round((report.skippedValidation / Math.max(report.totalScraped, 1)) * 100);
      lines.push(`  ${report.skippedValidation} listings (${pct}%) skipped validation.${pct > 20 ? " That's high." : ""}`);
    }
    lines.push(``);
  }

  lines.push(`-- Miners Location Scout`);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Miners Scraper <onboarding@resend.dev>",
        to: ["founders@taskmole.co"],
        subject,
        text: lines.join("\n"),
      }),
    });

    if (res.ok) {
      console.log("  Combined report email sent.");
    } else {
      const body = await res.text();
      console.log(`  Failed to send email: ${res.status} ${body.slice(0, 100)}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Failed to send email: ${msg}`);
  }
}
