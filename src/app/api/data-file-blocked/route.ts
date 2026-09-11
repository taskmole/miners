import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Where direct requests for `/data/<something>.csv` land.
 *
 * The map data files live in `public/data/`, which Next.js serves as static
 * URLs. That made the city check on `/api/data` pointless, because anyone
 * could fetch the file directly and skip it. A beforeFiles rewrite in
 * next.config.ts sends those URLs here instead.
 *
 * 404 rather than 403 on purpose: a 403 confirms the file is there, and there
 * is nothing to be gained by telling an unauthenticated stranger which
 * datasets exist. The gravity score layers are excluded from the rewrite and
 * still serve normally.
 */
export function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
