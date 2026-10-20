import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShare } from "./get-share";
import { ShareRedirect } from "./ShareRedirect";

/**
 * /s/<code>: the public landing spot for a shared place.
 *
 * Two audiences. Chat apps (WhatsApp, Slack, Teams) fetch it without a
 * session to build the link preview, so the page itself must answer 200 with
 * the preview tags in its HTML: a server redirect would hand them the app's
 * landing page instead. People get a small card and are forwarded straight on
 * to /?focus=<placeId>, where the app signs them in, checks their access to
 * the city and opens the card.
 *
 * A link that does not exist answers 404 (not-found.tsx); a database error
 * answers 500 (app/error.tsx), so chat apps try again later rather than
 * keeping a bare preview of a link that is fine.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const share = await getShare(code);
  if (!share) notFound();

  // No metadataBase: on Vercel, Next falls back to the production, branch or
  // deployment URL by itself, so the preview image URL is always absolute and
  // on the deployment that served the page.
  const description = share.address ?? undefined;
  return {
    title: { absolute: share.title },
    description,
    // Shared places are for the people they were sent to, never for Google.
    robots: { index: false, follow: false },
    openGraph: {
      title: share.title,
      description,
      siteName: "The Miners",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: share.title, description },
  };
}

export default async function SharePage({ params }: Props) {
  const { code } = await params;
  const share = await getShare(code);
  if (!share) notFound();

  return (
    <>
      {share.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={share.photoUrl} alt="" className="w-full h-56 object-cover bg-zinc-100" />
      )}
      <div className="p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/miners-logo-cropped.png" alt="The Miners" className="h-6 w-auto mb-4" />
        <h1 className="font-[family-name:var(--font-outfit)] text-[19px] font-semibold leading-snug text-zinc-900">
          {share.title}
        </h1>
        {share.address && <p className="mt-1 text-sm text-zinc-500">{share.address}</p>}
        <ShareRedirect placeId={share.placeId} />
      </div>
    </>
  );
}
