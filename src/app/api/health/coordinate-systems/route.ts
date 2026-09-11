import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createPublicServerSupabase, untypedDb } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Watchdog for the two coordinate system definitions the maps depend on.
 *
 * public.spatial_ref_sys is a PostGIS reference table holding 8,500 coordinate
 * system definitions. It has no access rules on it at all and the logged-out
 * role holds full write permission, so anyone with the key that ships in every
 * page can change or delete its rows. It cannot be fixed from a migration,
 * because the table belongs to an internal Supabase account that migrations
 * are not allowed to touch; closing it is a support request.
 *
 * Until that lands, this is the detection. The loud version of the attack,
 * deleting a row, breaks conversions immediately and somebody notices. The
 * quiet version is worse: editing a definition shifts every position on the
 * map by a wrong but plausible amount and nothing complains. A fingerprint
 * over the two rows catches both.
 *
 * 4326 is the coordinate system every geography column in the database is
 * declared in. 3857 is the one distance maths converts to.
 */
const WATCHED_SRIDS = [3857, 4326];

// Taken from production on 2026-09-11. These rows are fixed reference data,
// identical in every PostGIS install, so this should never change on its own.
// If a PostGIS upgrade legitimately rewrites them, re-read the fingerprint and
// update this line in the same commit that explains why.
const EXPECTED_FINGERPRINT = "49ce44d47f897f8f72d97608895564f0";

type SridRow = {
  srid: number;
  auth_name: string | null;
  auth_srid: number | null;
  srtext: string | null;
  proj4text: string | null;
};

export async function GET(request: NextRequest) {
  // Same shared secret the digest job already uses, so this needs no new
  // configuration anywhere.
  if (request.headers.get("x-digest-secret") !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // untypedDb because spatial_ref_sys is a PostGIS table and is not in the
    // repo's hand-written Database type, so the typed builder collapses to
    // never on it. No session needed: the table is readable without one, which
    // is half the problem this endpoint exists to watch.
    const supabase = untypedDb(createPublicServerSupabase());

    const { data, error } = await supabase
      .from("spatial_ref_sys")
      .select("srid, auth_name, auth_srid, srtext, proj4text")
      .in("srid", WATCHED_SRIDS)
      .order("srid");

    if (error) {
      return NextResponse.json(
        { ok: false, reason: "lookup_failed", detail: error.message },
        { status: 500 },
      );
    }

    const rows: SridRow[] = data || [];

    // A missing row is the loud version of the attack. Report it as a change
    // rather than hashing a shorter list, which would also differ but would
    // not say why.
    if (rows.length !== WATCHED_SRIDS.length) {
      return NextResponse.json(
        {
          ok: false,
          reason: "row_missing",
          expectedSrids: WATCHED_SRIDS,
          foundSrids: rows.map(r => r.srid),
        },
        { status: 500 },
      );
    }

    // Same canonical form the baseline was taken with: one line per row,
    // fields joined by a pipe, rows ordered by srid.
    const canonical = rows
      .map(r =>
        [
          r.srid,
          r.auth_name ?? "",
          r.auth_srid ?? "",
          r.srtext ?? "",
          r.proj4text ?? "",
        ].join("|"),
      )
      .join("\n");

    const fingerprint = createHash("md5").update(canonical).digest("hex");

    if (fingerprint !== EXPECTED_FINGERPRINT) {
      return NextResponse.json(
        {
          ok: false,
          reason: "definition_changed",
          expected: EXPECTED_FINGERPRINT,
          found: fingerprint,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, fingerprint, srids: rows.map(r => r.srid) });
  } catch (err) {
    console.error("[api/health/coordinate-systems] unexpected error:", err);
    return NextResponse.json({ ok: false, reason: "unexpected_error" }, { status: 500 });
  }
}
