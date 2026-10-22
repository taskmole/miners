import fs from "fs";
import path from "path";
import { createServiceSupabase } from "@/lib/supabase-server";
import { cityNames } from "@/lib/cities";
import type { CafeReport, ReportCafe } from "../../scripts/data-pipeline/lib/cafe-report";

/**
 * The "what changed on the cafe map" email, sent once after each monthly
 * cafe refresh to everyone who can see a city that changed.
 *
 * The refresh (.github/workflows/euct-refresh.yml) commits
 * public/data/cafe-changes.json together with the cafe files, so this reads
 * the report from the same deploy that carries the new cafes: every link in
 * the email already works.
 */

export const CAFE_REPORT_PATH = path.join(process.cwd(), "public/data/cafe-changes.json");

/** An old report is never sent: it would announce last month's news as new. */
export const MAX_REPORT_AGE_DAYS = 10;

/** Longer lists end in "and N more". */
export const MAX_LISTED = 10;

export interface CafeUpdateCity {
  cityId: string;
  cityName: string;
  added: ReportCafe[];
  removed: ReportCafe[];
  changed: ReportCafe[];
}

export interface CafeUpdatePerson {
  email: string;
  isSuperAdmin: boolean;
  /** Cities this person has any access to. */
  cityIds: string[];
}

export function readCafeReport(filePath = CAFE_REPORT_PATH): CafeReport | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as CafeReport;
  } catch {
    // No refresh has written a report yet.
    return null;
  }
}

/** Cities in the report with at least one new, gone or changed cafe, in a stable order. */
export function citiesWithChanges(report: CafeReport): CafeUpdateCity[] {
  return Object.entries(report.cities)
    .filter(([, c]) => c.added.length + c.removed.length + c.changed.length > 0)
    .map(([cityId, c]) => ({ cityId, cityName: cityNames[cityId] ?? cityId, ...c }))
    .sort((a, b) => a.cityName.localeCompare(b.cityName));
}

/** Who already has which report. Stored in app_settings so a retry skips them. */
export interface CafeUpdateMarker {
  stamp: string;
  sentTo: string[];
  /** Everyone due an email got it. */
  done: boolean;
}

/** Whether the timer should send (or finish sending) this report now. */
export function isReportDue(report: CafeReport | null, marker: CafeUpdateMarker | null, now: Date): boolean {
  if (!report || (marker?.stamp === report.stamp && marker.done)) return false;
  const ageDays = (now.getTime() - new Date(report.createdAt).getTime()) / 86_400_000;
  if (!(ageDays <= MAX_REPORT_AGE_DAYS)) return false;
  return citiesWithChanges(report).length > 0;
}

/** One email per person, covering only the changed cities they can see. */
export function buildCafeUpdateEmails(
  report: CafeReport,
  people: CafeUpdatePerson[]
): { email: string; cities: CafeUpdateCity[] }[] {
  const changed = citiesWithChanges(report);
  return people
    .map((p) => ({
      email: p.email,
      cities: changed.filter((c) => p.isSuperAdmin || p.cityIds.includes(c.cityId)),
    }))
    .filter((e) => e.cities.length > 0);
}

/** "Cafe map update: Madrid and Prague" */
export function cafeUpdateSubject(cities: CafeUpdateCity[]): string {
  const names = cities.map((c) => c.cityName);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `Cafe map update: ${joined}`;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function serviceClient() {
  const client = createServiceSupabase();
  if (!client) throw new Error("Supabase service role is not configured");
  return client;
}

/**
 * Everyone who can see at least one city: any grant row means at least View.
 * Super admins see every city. A blank is_active counts as active, the same
 * rule the access checks use (has_city_level).
 */
export async function getCafeUpdateRecipients(): Promise<CafeUpdatePerson[]> {
  const supabase = serviceClient();
  const [profiles, grants] = await Promise.all([
    supabase.from("user_profiles").select("id, email, is_active, is_super_admin"),
    supabase.from("user_city_grants").select("user_id, city_id"),
  ]);
  if (profiles.error) throw new Error(`recipient lookup failed: ${profiles.error.message}`);
  if (grants.error) throw new Error(`grant lookup failed: ${grants.error.message}`);

  const citiesByUser = new Map<string, string[]>();
  for (const g of grants.data as { user_id: string; city_id: string }[]) {
    citiesByUser.set(g.user_id, [...(citiesByUser.get(g.user_id) ?? []), g.city_id]);
  }

  type Profile = { id: string; email: string | null; is_active: boolean | null; is_super_admin: boolean | null };
  return (profiles.data as Profile[])
    .filter((p) => p.email && p.is_active !== false)
    .map((p) => ({ email: p.email!, isSuperAdmin: !!p.is_super_admin, cityIds: citiesByUser.get(p.id) ?? [] }))
    .filter((p) => p.isSuperAdmin || p.cityIds.length > 0);
}

/** app_settings key holding the CafeUpdateMarker of the latest report. */
const MARKER_KEY = "cafe_update_email_last_sent";

export async function getCafeUpdateMarker(): Promise<CafeUpdateMarker | null> {
  const { data, error } = await serviceClient()
    .from("app_settings")
    .select("value")
    .eq("key", MARKER_KEY)
    .maybeSingle();

  // Fail loudly: guessing "not sent" here would risk a double send.
  if (error) throw new Error(`last-sent lookup failed: ${error.message}`);
  const value = data?.value as Partial<CafeUpdateMarker> | null;
  if (typeof value?.stamp !== "string") return null;
  return { stamp: value.stamp, sentTo: Array.isArray(value.sentTo) ? value.sentTo : [], done: value.done === true };
}

export async function saveCafeUpdateMarker(marker: CafeUpdateMarker): Promise<void> {
  const { error } = await serviceClient()
    .from("app_settings")
    .upsert({ key: MARKER_KEY, value: marker, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Cafe update email sent, but who got it was not recorded: ${error.message}`);
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://theminers.vercel.app";
}

/** Sample data for the email preview server (npm run email:dev). */
export const SAMPLE_CAFE_UPDATE_CITIES: CafeUpdateCity[] = [
  {
    cityId: "madrid",
    cityName: "Madrid",
    added: [
      { name: "Hola Coffee Lagasca", kind: "coffee-trip", placeId: "cafe-40.42500--3.68400" },
      { name: "Café Comercial", kind: "regular", placeId: "cafe-40.43100--3.70200" },
    ],
    removed: [{ name: "Old Corner Cafe", kind: "regular" }],
    changed: [{ name: "Toma Café", kind: "coffee-trip", placeId: "cafe-40.42600--3.70800", changes: ["rating 4.5 → 4.7"] }],
  },
];
