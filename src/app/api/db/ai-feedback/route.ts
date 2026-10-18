import { NextRequest, NextResponse } from "next/server";
import { accessFor, authenticateRequest, untypedDb as db } from "@/lib/supabase-server";
import { canTrainAiIn } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = "23505";
/** Postgres insufficient-privilege code: what an RLS-refused insert raises. */
const RLS_REFUSED = "42501";
/** PostgREST "no rows" from .single(): an RLS-filtered update matched nothing. */
const NO_ROWS = "PGRST116";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POINT_ID_RE = /^[a-z_]{1,40}$/;
const VERDICTS = ["too_low", "right", "too_high"] as const;
const MAX_NOTE = 500;

type Verdict = (typeof VERDICTS)[number];

function isRating(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * What gets written. Only keys that are present are changed on an update.
 * rating_id and ai_value are always filled in by the server, never the client.
 */
interface FeedbackFields {
  rating_id?: string | null;
  ai_value?: number | null;
  human_value?: number | null;
  verdict?: Verdict | null;
  note?: string | null;
}

/**
 * Check the body field by field. Returns the parsed request, or a message
 * saying what is wrong. Anything unexpected is refused rather than ignored,
 * because these rows teach the model and a quiet bad value is worse than a 400.
 */
function parseBody(body: unknown):
  | {
      ok: true;
      placeId: string;
      ratingId: string | null;
      kind: "point" | "overall";
      pointId: string | null;
      fields: FeedbackFields;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;

  if (typeof b.placeId !== "string" || !UUID_RE.test(b.placeId)) {
    return { ok: false, error: "placeId must be a uuid" };
  }
  if (b.kind !== "point" && b.kind !== "overall") {
    return { ok: false, error: "kind must be 'point' or 'overall'" };
  }

  const fields: FeedbackFields = {};

  // Only says WHICH rating the person was looking at. The server loads it and
  // checks it belongs to this listing. Any client aiValue is ignored.
  let ratingId: string | null = null;
  if (b.ratingId !== undefined && b.ratingId !== null) {
    if (typeof b.ratingId !== "string" || !UUID_RE.test(b.ratingId)) {
      return { ok: false, error: "ratingId must be a uuid" };
    }
    ratingId = b.ratingId;
  }

  if (b.kind === "point") {
    if (typeof b.pointId !== "string" || !POINT_ID_RE.test(b.pointId)) {
      return { ok: false, error: "pointId must match /^[a-z_]{1,40}$/" };
    }
    if (!isRating(b.humanValue)) {
      return { ok: false, error: "humanValue must be an integer from 1 to 5" };
    }
    if (b.verdict !== undefined || b.note !== undefined) {
      return { ok: false, error: "verdict and note belong to kind 'overall'" };
    }
    fields.human_value = b.humanValue;
    return { ok: true, placeId: b.placeId, ratingId, kind: "point", pointId: b.pointId, fields };
  }

  // kind === "overall". The verdict chips and the note save separately, so a
  // key that is absent means "leave it as it is", and null means "clear it".
  if (b.pointId !== undefined || b.humanValue !== undefined) {
    return { ok: false, error: "pointId and humanValue belong to kind 'point'" };
  }
  if (b.verdict !== undefined) {
    if (b.verdict !== null && !VERDICTS.includes(b.verdict as Verdict)) {
      return { ok: false, error: "verdict must be 'too_low', 'right' or 'too_high'" };
    }
    fields.verdict = b.verdict as Verdict | null;
  }
  if (b.note !== undefined) {
    if (b.note !== null && typeof b.note !== "string") {
      return { ok: false, error: "note must be text" };
    }
    const note = typeof b.note === "string" ? b.note.trim() : "";
    if (note.length > MAX_NOTE) {
      return { ok: false, error: `note must be at most ${MAX_NOTE} characters` };
    }
    fields.note = note || null;
  }
  if (fields.verdict === undefined && fields.note === undefined) {
    return { ok: false, error: "Send a verdict, a note, or both" };
  }
  return { ok: true, placeId: b.placeId, ratingId, kind: "overall", pointId: null, fields };
}

/**
 * POST /api/db/ai-feedback
 *
 * Head office corrects one AI point, or says how the overall score felt.
 * One live answer per person, listing and point: saving again updates it.
 *
 * Body: { placeId, ratingId?, kind: 'point'|'overall', pointId?, aiValue?,
 *         humanValue?, verdict?, note? }
 *
 * RLS is the real gate (insert/update need can_train_ai on the listing's
 * city, which a trigger copies from the place). The check here exists so the
 * caller gets a clear 403 instead of a database error.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { placeId, ratingId, kind, pointId, fields } = parsed;

  try {
    // The rating the feedback is about: the one named, or else the newest for
    // this listing. Its values, not the client's, are what the AI said.
    const ratingQuery = ratingId
      ? db(supabase).from("ai_ratings").select("id, place_id, points").eq("id", ratingId).maybeSingle()
      : db(supabase)
          .from("ai_ratings")
          .select("id, place_id, points")
          .eq("place_id", placeId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    const [{ data: place, error: placeError }, access, { data: rating, error: ratingError }] =
      await Promise.all([
        db(supabase).from("places").select("id, city_id").eq("id", placeId).maybeSingle(),
        accessFor(supabase, userId),
        ratingQuery,
      ]);

    if (placeError) {
      console.error("[api/db/ai-feedback] place lookup error:", placeError);
      return NextResponse.json({ error: placeError.message }, { status: 500 });
    }
    if (!place) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (!access) {
      // A failed lookup, not a refusal: say so rather than a misleading 403.
      return NextResponse.json({ error: "Could not load your access" }, { status: 500 });
    }
    if (!place.city_id || !canTrainAiIn(access, place.city_id)) {
      return NextResponse.json(
        { error: "You cannot train the AI scout in this city." },
        { status: 403 },
      );
    }

    if (ratingError) {
      console.error("[api/db/ai-feedback] rating lookup error:", ratingError);
      return NextResponse.json({ error: ratingError.message }, { status: 500 });
    }
    if (ratingId && (!rating || rating.place_id !== placeId)) {
      return NextResponse.json(
        { error: "That rating does not belong to this listing." },
        { status: 400 },
      );
    }
    fields.rating_id = rating?.id ?? null;
    if (kind === "point" && pointId) {
      const aiValue = (rating?.points as Record<string, { value?: unknown }> | null)?.[pointId]?.value;
      fields.ai_value = isRating(aiValue) ? aiValue : null;
    }

    // supabase-js cannot target a partial unique index with onConflict, so
    // look for the existing answer first, then update or insert. A race
    // between two saves surfaces as a unique violation on insert, and is
    // settled by updating the row the other save just created.
    const findExisting = () => {
      let q = db(supabase)
        .from("ai_feedback")
        .select("id")
        .eq("user_id", userId)
        .eq("place_id", placeId)
        .eq("kind", kind);
      q = pointId ? q.eq("point_id", pointId) : q.is("point_id", null);
      return q.maybeSingle();
    };

    const updateRow = (id: string) =>
      db(supabase).from("ai_feedback").update(fields).eq("id", id).select().single();

    const { data: existing, error: findError } = await findExisting();
    if (findError) {
      console.error("[api/db/ai-feedback] lookup error:", findError);
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    let result = existing
      ? await updateRow(existing.id)
      : await db(supabase)
          .from("ai_feedback")
          .insert({ place_id: placeId, kind, point_id: pointId, user_id: userId, ...fields })
          .select()
          .single();

    if (!existing && result.error?.code === UNIQUE_VIOLATION) {
      const { data: raced } = await findExisting();
      if (raced) result = await updateRow(raced.id);
    }

    if (result.error) {
      // RLS said no: an insert raises 42501, an update it filters out
      // matches no row. Either way it is a refusal, not a server fault.
      if (result.error.code === RLS_REFUSED || result.error.code === NO_ROWS) {
        return NextResponse.json(
          { error: "You cannot train the AI scout in this city." },
          { status: 403 },
        );
      }
      console.error("[api/db/ai-feedback] save error:", result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch (err) {
    console.error("[api/db/ai-feedback] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
