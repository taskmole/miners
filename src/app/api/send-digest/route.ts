import { NextRequest, NextResponse } from "next/server";
import { render } from "@react-email/render";
import React from "react";
import MinersDigest from "@/emails/miners-digest";
import { sendAppEmail } from "@/lib/email";
import { toCityLabel } from "@/lib/utils";
import {
  getSubscribedUsers,
  getNewListingsForCityAndSource,
  type DigestSource,
} from "@/lib/digest-queries";

export const dynamic = "force-dynamic";

const VALID_SOURCES: DigestSource[] = ["idealista", "sreality"];

function isDigestSource(value: unknown): value is DigestSource {
  return (
    typeof value === "string" &&
    (VALID_SOURCES as readonly string[]).includes(value)
  );
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-digest-secret");
  if (secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid or empty JSON body" },
      { status: 400 },
    );
  }

  const { source, city } = (body ?? {}) as { source?: unknown; city?: unknown };
  if (!isDigestSource(source)) {
    return NextResponse.json(
      { error: `Invalid source. Must be one of: ${VALID_SOURCES.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof city !== "string" || city.length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid city" },
      { status: 400 },
    );
  }

  try {
    const users = await getSubscribedUsers();
    const results: {
      email: string;
      source: string;
      city: string;
      status: string;
    }[] = [];

    for (const user of users) {
      if (!user.sources.includes(source)) continue;
      if (!user.cities.includes(city)) continue;

      const listings = await getNewListingsForCityAndSource(city, source);

      if (listings.length === 0) continue;

      const html = await render(
        React.createElement(MinersDigest, {
          city,
          listings,
          appUrl: "https://theminers.vercel.app",
        }),
      );

      // `city` is the raw id ("prague"), so the subject used to read
      // "3 new locations found in prague" while the body said "Prague".
      const cityName = toCityLabel(city);

      const { error } = await sendAppEmail({
        to: user.email,
        subject: `${listings.length} new locations in ${cityName}`,
        html,
      });

      results.push({
        email: user.email,
        source,
        city,
        status: error ? `Failed: ${error}` : "Sent",
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
