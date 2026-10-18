import { after } from "next/server";
import { accessFor, untypedDb } from "@/lib/supabase-server";
import { canTrainAiIn } from "@/lib/permissions";
import { parseWkbPoint } from "@/lib/wkb";
import { generatePropertyPlaceId } from "@/lib/place-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Best-effort learning signal for the AI scout: a decision by somebody with
 * "Can train AI" in the listing's city is copied into ai_feedback.
 *
 * Runs in after(), once the response is already on its way, and swallows
 * every error. This write path had a 2-day outage once; nothing here may
 * change what the caller gets back.
 *
 * Needs the listing's places.id (`place_uuid`), which the client sends when
 * it has one. It is only trusted if it really is the same listing as
 * property_place_id, so a stray uuid can never file a signal on another place.
 * No uuid, no signal.
 */
export function recordAiSignal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  signal: {
    placeUuid: unknown;
    propertyPlaceId: string;
    kind: "assign" | "reject" | "request";
    note: string | null;
  },
) {
  if (typeof signal.placeUuid !== "string" || !UUID_RE.test(signal.placeUuid)) return;
  const placeUuid = signal.placeUuid;

  try {
    after(async () => {
      try {
        const { data: place } = await untypedDb(supabase)
          .from("places")
          .select("id, city_id, location, url:metadata->>url")
          .eq("id", placeUuid)
          .maybeSingle();
        if (!place?.city_id) return;

        const coords = parseWkbPoint(place.location);
        if (!coords) return;
        const samePlace =
          generatePropertyPlaceId({
            latitude: coords.lat,
            longitude: coords.lon,
            url: place.url || "",
          }) === signal.propertyPlaceId;
        if (!samePlace) return;

        const access = await accessFor(supabase, userId);
        if (!access || !canTrainAiIn(access, place.city_id)) return;

        // city_id is filled in by a trigger from the place.
        const { error } = await untypedDb(supabase).from("ai_feedback").insert({
          place_id: placeUuid,
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
