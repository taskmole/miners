import type { SupabaseClient } from "@supabase/supabase-js";
import { PROPERTY_SOURCES, generatePropertyPlaceId, hashUrl } from "@/lib/place-id";
import { capitalizeFirst } from "@/lib/text";
import { parseWkbPoint } from "@/lib/wkb";

/** What a listing's share preview shows, read from the database. */
export interface ListingSnapshot {
  title: string;
  address: string | null;
  photoUrl: string | null;
}

/**
 * The real name, address and photo of the listing behind a property place id,
 * so a share preview shows what the map shows rather than whatever the
 * browser sent. Null when no listing matches.
 *
 * A property id ends in a hash of the listing's URL, so the browser sends that
 * URL and this checks it: the row must have it, and its coordinates and URL
 * must rebuild the exact id. Runs as the caller, so the database's city rules
 * still apply. Throws on a database error.
 */
export async function findListing(
  db: SupabaseClient,
  cityId: string,
  placeId: string,
  listingUrl: unknown,
): Promise<ListingSnapshot | null> {
  if (typeof listingUrl !== "string" || !listingUrl || listingUrl.length > 1000) return null;
  // The id ends in the URL's hash: a URL that cannot match costs no query.
  if (!placeId.endsWith(`-${hashUrl(listingUrl)}`)) return null;

  const { data, error } = await db
    .from("places")
    .select("name, address, location, photos")
    .eq("city_id", cityId)
    .in("source", PROPERTY_SOURCES)
    .eq("metadata->>url", listingUrl)
    .limit(10);
  if (error) throw new Error(`Listing lookup failed: ${error.message}`);

  for (const row of data ?? []) {
    const coords = parseWkbPoint(row.location);
    if (!coords) continue;
    if (generatePropertyPlaceId({ latitude: coords.lat, longitude: coords.lon, url: listingUrl }) !== placeId) continue;
    // Same wording as the map card (see /api/db/places and the property popup).
    return {
      title: capitalizeFirst(row.name || "Property"),
      address: capitalizeFirst(row.address || "") || null,
      photoUrl: row.photos?.[0] ?? null,
    };
  }
  return null;
}
