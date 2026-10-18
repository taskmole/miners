import type { Metadata } from "next";
import { headers } from "next/headers";
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
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

/**
 * The origin this request was served from, so the preview image URL is
 * absolute and points at the same deployment (production, preview or local)
 * rather than at a hard-coded domain.
 */
async function requestOrigin(): Promise<URL> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "theminers.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return new URL(`${proto}://${host}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const share = await getShare(code);
  const metadataBase = await requestOrigin();
  // Shared places are for the people they were sent to, never for Google.
  const robots = { index: false, follow: false };

  if (!share) {
    return { metadataBase, title: "The Miners", robots };
  }

  const description = share.address ?? undefined;
  return {
    metadataBase,
    title: { absolute: share.title },
    description,
    robots,
    openGraph: {
      title: share.title,
      description,
      siteName: "The Miners",
      type: "website",
      url: `/s/${code}`,
    },
    twitter: { card: "summary_large_image", title: share.title, description },
  };
}

export default async function SharePage({ params }: Props) {
  const { code } = await params;
  const share = await getShare(code);

  return (
    <main className="min-h-dvh bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[411px] bg-white rounded-2xl shadow-lg overflow-hidden">
        {share ? (
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
        ) : (
          <div className="p-6 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/miners-logo-cropped.png" alt="The Miners" className="h-6 w-auto mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-zinc-900">This link doesn&apos;t exist</h1>
            <p className="mt-1 text-sm text-zinc-500">It may have been mistyped or removed.</p>
            <a
              href="/"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Open The Miners
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
