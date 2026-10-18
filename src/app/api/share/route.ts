import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceSupabase, mayViewCity } from "@/lib/supabase-server";
import { cityForCoordinates } from "@/lib/notify-routing";
import { cleanShareInput } from "@/lib/share";

export const dynamic = "force-dynamic";

/**
 * Save a share link (the row behind /s/<code>).
 *
 * The browser has already copied the link by the time this runs, so this only
 * has to make it resolve. What it checks before storing a snapshot that the
 * public preview will show to anyone holding the link:
 *
 * - the caller is signed in;
 * - the city comes from the place id's coordinates, never from the browser;
 * - the caller holds at least View in that city (mayViewCity, asked as them);
 * - name, address and photo are trimmed and the photo host is allow-listed.
 *
 * The insert uses the service role: see 20261018000001_share_links.sql.
 */
export async function POST(request: NextRequest) {
  // Check the body before paying for the auth round trip.
  const share = cleanShareInput(await request.json().catch(() => null));
  if (!share) {
    return NextResponse.json({ error: "Invalid share" }, { status: 400 });
  }
  const cityId = cityForCoordinates(share.lat, share.lon);
  if (!cityId) {
    return NextResponse.json({ error: "Place is not in a known city" }, { status: 400 });
  }

  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;

  const mayView = await mayViewCity(auth.supabase, cityId);
  if (mayView === null) {
    return NextResponse.json({ error: "Could not check access" }, { status: 503 });
  }
  if (!mayView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceSupabase();
  if (!service) {
    console.error("[api/share] SUPABASE_SERVICE_ROLE_KEY is not configured");
    return NextResponse.json({ error: "Sharing is not configured" }, { status: 503 });
  }

  // Plain insert, never upsert: a code that already exists is refused rather
  // than repointed, so nobody can hijack a link someone else already sent.
  const { error } = await service.from("share_links").insert({
    code: share.code,
    place_id: share.placeId,
    place_type: share.placeType,
    city_id: cityId,
    title: share.title,
    address: share.address,
    photo_url: share.photoUrl,
    created_by: auth.userId,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Code already used" }, { status: 409 });
    }
    console.error("[api/share] insert failed:", error);
    return NextResponse.json({ error: "Could not save the link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
