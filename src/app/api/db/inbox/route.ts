import { NextRequest, NextResponse } from "next/server";
import { accessFor, authenticateRequest, untypedDb } from "@/lib/supabase-server";
import { canTrainAiIn } from "@/lib/permissions";
import { parseWkbPoint } from "@/lib/wkb";
import { PROPERTY_SOURCES, generatePropertyPlaceId } from "@/lib/place-id";
import type { AiBreakdown, AiBreakdownPoint, AiVerdict } from "@/types/inbox";

export const dynamic = "force-dynamic";

/** The one customer today. Every AI record carries it. */
const CUSTOMER_ID = "miners";

const VERDICTS: AiVerdict[] = ["too_low", "right", "too_high"];

/** A rating point as an ai_profiles version defines it. */
interface ProfilePoint {
  id: string;
  label: string;
  kind: "fact" | "ai";
  weight: number;
}

/** A 1-5 integer, or null for anything else ("can't tell"). */
function toRating(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
}

/**
 * The AI scout's breakdown for each listing, keyed by places.id.
 *
 * Uses the newest rating per listing from ANY instructions version, not just
 * the active one: when the instructions change, older listings keep their
 * breakdown until they are re-scored. Labels, kinds and weights come from the
 * version that produced each rating, so they always match its values.
 *
 * Best effort on purpose: a listing without a rating, or any failure here
 * (including the AI tables not existing yet), just means the card shows no
 * breakdown. The inbox itself must never fail because of the AI.
 *
 * Two round trips: ratings, the caller's access and the caller's own
 * feedback in parallel, then the profiles those ratings point at.
 */
async function loadAiBreakdowns(
  supabase: unknown,
  userId: string,
  cityId: string,
  placeIds: string[],
): Promise<Map<string, AiBreakdown>> {
  const out = new Map<string, AiBreakdown>();
  if (placeIds.length === 0) return out;

  try {
    const db = untypedDb(supabase);
    const [ratingsRes, access, feedbackRes] = await Promise.all([
      db
        .from("ai_ratings")
        .select("id, place_id, profile_id, points, blend, gut, second_look, summary, photos_checked")
        .eq("customer_id", CUSTOMER_ID)
        .in("place_id", placeIds)
        .order("created_at", { ascending: false }),
      accessFor(supabase, userId),
      db
        .from("ai_feedback")
        .select("place_id, kind, point_id, human_value, verdict, note")
        .eq("user_id", userId)
        .in("kind", ["point", "overall"])
        .in("place_id", placeIds),
    ]);

    if (ratingsRes.error) {
      console.warn("[api/db/inbox] ai_ratings read failed:", ratingsRes.error.message);
      return out;
    }

    // Newest first, so the first row seen per listing is its latest rating.
    const latest = new Map<string, any>();
    for (const r of ratingsRes.data || []) {
      if (!latest.has(r.place_id)) latest.set(r.place_id, r);
    }
    if (latest.size === 0) return out;

    const profileIds = [...new Set([...latest.values()].map((r) => r.profile_id))];
    // ai_profiles itself is readable only by trainers (it holds the
    // customer's strategy). This RPC hands anyone signed in just the labels,
    // kinds and weights the card needs: rows of { id, points }.
    const { data: profiles, error: profilesError } = await db.rpc("ai_profile_labels", {
      p_ids: profileIds,
    });

    if (profilesError) {
      console.warn("[api/db/inbox] ai_profile_labels failed:", profilesError.message);
      return out;
    }

    const pointsByProfile = new Map<string, ProfilePoint[]>();
    for (const p of (profiles || []) as { id: string; points: unknown }[]) {
      if (!Array.isArray(p.points)) continue;
      pointsByProfile.set(
        p.id,
        (p.points as ProfilePoint[]).filter(
          (pt) => pt && typeof pt.id === "string" && (pt.kind === "fact" || pt.kind === "ai"),
        ),
      );
    }

    if (feedbackRes.error) {
      console.warn("[api/db/inbox] ai_feedback read failed:", feedbackRes.error.message);
    }

    // The caller's earlier answers, grouped per listing.
    const mineByPlace = new Map<string, AiBreakdown["mine"]>();
    for (const f of feedbackRes.data || []) {
      let mine = mineByPlace.get(f.place_id);
      if (!mine) {
        mine = { points: {}, verdict: null, note: null };
        mineByPlace.set(f.place_id, mine);
      }
      if (f.kind === "point" && f.point_id) {
        const v = toRating(f.human_value);
        if (v !== null) mine.points[f.point_id] = v;
      } else if (f.kind === "overall") {
        mine.verdict = VERDICTS.includes(f.verdict) ? f.verdict : null;
        mine.note = typeof f.note === "string" && f.note ? f.note : null;
      }
    }

    // The breakdown is only shown to people who train the AI (today that is
    // the super admins). Everyone else keeps the score and the AI summary, as
    // before. A failed access lookup means no breakdown, never an error.
    const canTrain = access ? canTrainAiIn(access, cityId) : false;
    if (!canTrain) return out;

    for (const r of latest.values()) {
      const profilePoints = pointsByProfile.get(r.profile_id);
      if (!profilePoints) continue;

      const values = (r.points || {}) as Record<string, { value?: unknown; reason?: unknown }>;
      const points: AiBreakdownPoint[] = profilePoints.map((p) => ({
        id: p.id,
        label: p.label || p.id,
        kind: p.kind,
        weight: Number(p.weight) || 0,
        value: toRating(values[p.id]?.value),
        reason: typeof values[p.id]?.reason === "string" ? (values[p.id].reason as string) : "",
      }));

      out.set(r.place_id, {
        ratingId: r.id,
        blend: Number(r.blend) || 0,
        gut: r.gut != null ? Number(r.gut) : null,
        secondLook: r.second_look || null,
        summary: r.summary || "",
        photosChecked: Number(r.photos_checked) || 0,
        points,
        canTrain,
        mine: mineByPlace.get(r.place_id) ?? { points: {}, verdict: null, note: null },
      });
    }
  } catch (err) {
    console.warn("[api/db/inbox] AI breakdown skipped:", err);
  }

  return out;
}

export async function GET(request: NextRequest) {
  const cityId = request.nextUrl.searchParams.get("city_id");
  if (!cityId) {
    return NextResponse.json({ error: "city_id required" }, { status: 400 });
  }

  const mode = request.nextUrl.searchParams.get("mode");

  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    // Find the latest scrape batch: anchor on most recent insert, look back 12h
    const { data: anchor } = await supabase
      .from("places")
      .select("created_at")
      .eq("city_id", cityId)
      .in("source", PROPERTY_SOURCES)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!anchor) {
      return NextResponse.json(mode === "count" ? { count: 0 } : []);
    }

    const cutoff = new Date(anchor.created_at);
    cutoff.setHours(cutoff.getHours() - 12);

    if (mode === "count") {
      // Get the latest batch. Select location so we count only places that
      // would actually render (the list drops rows with unparseable coords).
      const { data: batch, error: batchError } = await supabase
        .from("places")
        .select("id, location")
        .eq("city_id", cityId)
        .in("source", PROPERTY_SOURCES)
        .eq("status", "active")
        .gte("created_at", cutoff.toISOString());

      if (batchError) {
        return NextResponse.json({ error: batchError.message }, { status: 500 });
      }

      const batchIds = (batch || [])
        .filter((p: any) => parseWkbPoint(p.location) !== null)
        .map((p: any) => p.id);
      if (batchIds.length === 0) return NextResponse.json({ count: 0 });

      // Count how many of THOSE the user has already marked read
      const { count: readCount } = await supabase
        .from("inbox_reads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("place_id", batchIds);

      const unread = Math.max(0, batchIds.length - (readCount || 0));
      return NextResponse.json({ count: unread });
    }

    const { data: places, error: placesError } = await supabase
      .from("places")
      .select("id, name, address, location, source, metadata, photos, score, image_analysis, created_at")
      .eq("city_id", cityId)
      .in("source", PROPERTY_SOURCES)
      .eq("status", "active")
      .gte("created_at", cutoff.toISOString())
      .order("created_at", { ascending: false });

    if (placesError) {
      console.error("[api/db/inbox] places query error:", placesError);
      return NextResponse.json({ error: placesError.message }, { status: 500 });
    }

    if (!places || places.length === 0) {
      return NextResponse.json([]);
    }

    const placeIds = places.map((p: any) => p.id);
    // The AI breakdown runs alongside the read-marks rather than after them,
    // so it adds no extra round trip. It may cover a few already-read
    // listings; those are dropped below with the rest of them.
    const [{ data: reads }, aiBreakdowns] = await Promise.all([
      supabase
        .from("inbox_reads")
        .select("place_id")
        .eq("user_id", userId)
        .in("place_id", placeIds),
      loadAiBreakdowns(supabase, userId, cityId, placeIds),
    ]);

    const readSet = new Set((reads || []).map((r: any) => r.place_id));

    const unread = places
      .filter((p: any) => !readSet.has(p.id))
      .map((p: any) => {
        const coords = parseWkbPoint(p.location);
        if (!coords) return null;
        const meta = (p.metadata || {}) as Record<string, any>;
        const placeId = generatePropertyPlaceId({
          latitude: coords.lat,
          longitude: coords.lon,
          url: meta.url || "",
        });
        return {
          id: p.id,
          placeId,
          name: p.name || "Property",
          address: p.address || "",
          latitude: coords.lat,
          longitude: coords.lon,
          source: p.source === "sreality" ? "sreality" : "idealista",
          price: meta.price || 0,
          size: meta.size || 0,
          priceByArea: meta.priceByArea || meta.pricePerSqm || 0,
          district: meta.district || "",
          hasAirConditioning: meta.hasAirConditioning === true,
          url: meta.url || "",
          transfer: meta.transfer || undefined,
          hasBathroom: meta.bathrooms != null && meta.bathrooms > 0,
          hasStorefront: meta.hasStorefront === true,
          image_url: p.photos?.[0] || undefined,
          photos: p.photos?.length ? p.photos : undefined,
          score: p.score != null ? Number(p.score) : undefined,
          aiScore: (p.image_analysis as any)?.text?.qualitative_score ?? undefined,
          aiReason: (p.image_analysis as any)?.text?.reason ?? undefined,
          createdAt: p.created_at || undefined,
          aiBreakdown: aiBreakdowns.get(p.id),
        };
      })
      .filter(Boolean);

    return NextResponse.json(unread);
  } catch (err) {
    console.error("[api/db/inbox] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { action, place_ids, city_id } = body;

    if (!action || !place_ids || !Array.isArray(place_ids) || place_ids.length === 0) {
      return NextResponse.json(
        { error: "action and place_ids[] required" },
        { status: 400 },
      );
    }

    if (action === "mark_read" || action === "mark_all_read") {
      const rows = place_ids.map((placeId: string) => ({
        user_id: userId,
        place_id: placeId,
        city_id: city_id || "unknown",
      }));

      const { error } = await supabase.from("inbox_reads").upsert(rows, {
        onConflict: "user_id,place_id",
        ignoreDuplicates: true,
      });

      if (error) {
        console.error("[api/db/inbox] mark_read error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, count: place_ids.length });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/db/inbox] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
