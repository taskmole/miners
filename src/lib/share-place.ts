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
 * The places row of the listing behind a property place id, found by the
 * listing's URL, with the given columns. Null when no listing matches.
 *
 * A property id ends in a hash of the listing's URL, so callers pass that URL
 * and this checks it: the row must have it, and its coordinates and URL must
 * rebuild the exact id. A stray or made-up URL can never reach another
 * listing. Runs as the client it is given, so the database's city rules still
 * apply. Throws on a database error.
 */
export async function findListingRow<Row extends { location: string | null }>(
  db: SupabaseClient,
  placeId: string,
  listingUrl: unknown,
  columns: string,
  cityId?: string,
): Promise<Row | null> {
  if (typeof listingUrl !== "string" || !listingUrl || listingUrl.length > 1000) return null;
  // The id ends in the URL's hash: a URL that cannot match costs no query.
  if (!placeId.endsWith(`-${hashUrl(listingUrl)}`)) return null;

  let query = db
    .from("places")
    .select(`location, ${columns}`)
    .in("source", PROPERTY_SOURCES)
    .eq("metadata->>url", listingUrl);
  if (cityId) query = query.eq("city_id", cityId);
  const { data, error } = await query.limit(10);
  if (error) throw new Error(`Listing lookup failed: ${error.message}`);

  for (const row of (data ?? []) as unknown as Row[]) {
    const coords = row.location ? parseWkbPoint(row.location) : null;
    if (coords && generatePropertyPlaceId({ latitude: coords.lat, longitude: coords.lon, url: listingUrl }) === placeId) {
      return row;
    }
  }
  return null;
}

/**
 * The real name, address and photo of the listing behind a property place id,
 * so a share preview shows what the map shows rather than whatever the
 * browser sent. Null when no listing matches (see findListingRow).
 */
export async function findListing(
  db: SupabaseClient,
  cityId: string,
  placeId: string,
  listingUrl: unknown,
): Promise<ListingSnapshot | null> {
  const row = await findListingRow<{ location: string | null; name: string | null; address: string | null; photos: string[] | null }>(
    db,
    placeId,
    listingUrl,
    "name, address, photos",
    cityId,
  );
  if (!row) return null;
  // Same wording as the map card (see /api/db/places and the property popup).
  return {
    title: capitalizeFirst(row.name || "Property"),
    address: capitalizeFirst(row.address || "") || null,
    photoUrl: row.photos?.[0] ?? null,
  };
}
