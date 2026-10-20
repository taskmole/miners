import { cache } from "react";
import { createServiceSupabase } from "@/lib/supabase-server";
import { SHARE_CODE_RE } from "@/lib/share";

/** What the public preview may show. Deliberately no sharer, no price. */
export interface PublicShare {
  placeId: string;
  placeType: string;
  title: string;
  address: string | null;
  photoUrl: string | null;
}

/**
 * Pauses before asking again for a code that is not saved (yet): about 6
 * seconds in all. The link is copied the moment the button is clicked, while
 * saving it can take up to ~6 s when the server starts cold. A chat app that
 * fetches the link inside that gap would otherwise get "This link doesn't
 * exist" and keep that bare preview for good.
 */
const RETRY_DELAYS_MS = [500, 1000, 1500, 1500, 1500];

/**
 * Look a share code up, asking again after each of `retryDelays` while it is
 * missing.
 *
 * Runs with the service role because share_links has no policies (chat-app
 * link fetchers have no session). A malformed code is turned away before the
 * database is asked. Null means "no such link"; a database error throws, so
 * an outage is never passed off as a missing link.
 */
async function lookupShare(code: string, retryDelays: number[]): Promise<PublicShare | null> {
  if (!SHARE_CODE_RE.test(code)) return null;
  const db = createServiceSupabase();
  if (!db) return null;

  const lookup = () =>
    db
      .from("share_links")
      .select("place_id, place_type, title, address, photo_url")
      .eq("code", code)
      .maybeSingle();

  let { data, error } = await lookup();
  for (const delay of retryDelays) {
    if (data || error) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    ({ data, error } = await lookup());
  }

  if (error) {
    console.error("[share] lookup failed:", error);
    throw new Error("Share lookup failed");
  }
  if (!data) return null;

  return {
    placeId: data.place_id,
    placeType: data.place_type,
    title: data.title,
    address: data.address,
    photoUrl: data.photo_url,
  };
}

/**
 * For the /s/<code> page, waiting for a link that may still be saving.
 * Wrapped in React's cache so the page and its metadata share one lookup
 * (and one wait) per request.
 */
export const getShare = cache((code: string) => lookupShare(code, RETRY_DELAYS_MS));

/**
 * For the preview image: no wait. Chat apps fetch it only after the page,
 * which already waited, and probing random codes stays cheap. A database
 * error falls back to the logo picture rather than a broken image.
 */
export const findShare = cache((code: string) => lookupShare(code, []).catch(() => null));
