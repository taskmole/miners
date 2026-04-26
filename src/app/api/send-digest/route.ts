import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { render } from "@react-email/render";
import React from "react";
import MinersDigest from "@/emails/miners-digest";
import {
  getSubscribedUsers,
  getNewListingsForCity,
} from "@/lib/digest-queries";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-digest-secret");
  if (secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const users = await getSubscribedUsers();
    const results: { email: string; city: string; status: string }[] = [];

    for (const user of users) {
      for (const city of user.cities) {
        const listings = await getNewListingsForCity(city);

        if (listings.length === 0) continue;

        const html = await render(
          React.createElement(MinersDigest, {
            city,
            listings,
            appUrl: "https://theminers.vercel.app",
          })
        );

        const { error } = await resend.emails.send({
          from: "Miners Scout <onboarding@resend.dev>",
          to: user.email,
          subject: `${listings.length} new locations found in ${city}`,
          html,
        });

        results.push({
          email: user.email,
          city,
          status: error ? `Failed: ${error.message}` : "Sent",
        });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
