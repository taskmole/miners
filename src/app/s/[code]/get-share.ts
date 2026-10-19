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
 * Look a share code up for the public preview page and its image.
 *
 * Runs with the service role because share_links has no policies (chat-app
 * link fetchers have no session). A malformed code is turned away before the
 * database is asked. Wrapped in React's cache so the page and its metadata
 * share one query (and one wait) per request.
 */
export const getShare = cache(async (code: string): Promise<PublicShare | null> => {
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
  for (const delay of RETRY_DELAYS_MS) {
    if (data || error) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    ({ data, error } = await lookup());
  }

  if (error) {
    console.error("[share] lookup failed:", error);
    return null;
  }
  if (!data) return null;

  return {
    placeId: data.place_id,
    placeType: data.place_type,
    title: data.title,
    address: data.address,
    photoUrl: data.photo_url,
  };
});
