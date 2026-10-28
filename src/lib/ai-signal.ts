import { after } from "next/server";
import { accessFor, untypedDb } from "@/lib/supabase-server";
import { canTrainAiIn } from "@/lib/permissions";
import { findListingRow } from "@/lib/share-place";

/**
 * Best-effort learning signal for the AI scout: a decision by somebody with
 * "Can train AI" in the listing's city is copied into ai_feedback.
 *
 * Runs in after(), once the response is already on its way, and swallows
 * every error. This write path had a 2-day outage once; nothing here may
 * change what the caller gets back.
 *
 * Finds the listing from its web link (`url`), which the map card, the inbox
 * and every request carry. findListingRow only trusts a row that really is
 * the listing behind property_place_id, so a stray link can never file a
 * signal on another place. No link, no signal.
 */
export function recordAiSignal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  signal: {
    url: unknown;
    propertyPlaceId: string;
    kind: "assign" | "reject" | "request";
    note: string | null;
  },
) {
  if (typeof signal.url !== "string" || !signal.url) return;

  try {
    after(async () => {
      try {
        const place = await findListingRow<{ location: string | null; id: string; city_id: string | null }>(
          untypedDb(supabase),
          signal.propertyPlaceId,
          signal.url,
          "id, city_id",
        );
        if (!place?.city_id) {
          // Not an error, but if it starts happening for every decision (a
          // new link format, moved pins) the AI stops learning: say so.
          console.warn(`[ai-signal] ${signal.kind}: no listing matches ${signal.propertyPlaceId}`);
          return;
        }

        const access = await accessFor(supabase, userId);
        if (!access || !canTrainAiIn(access, place.city_id)) return;

        // city_id is filled in by a trigger from the place.
        const { error } = await untypedDb(supabase).from("ai_feedback").insert({
          place_id: place.id,
          user_id: userId,
          kind: signal.kind,
          note: signal.note ? signal.note.slice(0, 500) : null,
        });
        if (error) {
          console.warn(`[ai-signal] ${signal.kind} feedback not saved:`, error.message);
        }
      } catch (err) {
        console.warn(`[ai-signal] ${signal.kind} feedback failed:`, err);
      }
    });
  } catch (err) {
    console.warn(`[ai-signal] could not schedule ${signal.kind} feedback:`, err);
  }
}
