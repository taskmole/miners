import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { isAllowedPhotoUrl, placeTypeLabel } from "@/lib/share";
import { getShare } from "./get-share";

/**
 * The preview picture WhatsApp, Slack and Teams show for a /s/<code> link.
 *
 * With a photo: the photo across the top, a white strip underneath with the
 * name, the address and The Miners logo. Without one (cafes, gyms and other
 * places have none): a clean branded card with the category.
 *
 * Rendered as PNG by next/og, then re-encoded as JPEG, because WhatsApp
 * quietly drops preview images much past ~300 KB and a photo-filled PNG at
 * this size is well over a megabyte.
 */

export const alt = "A place shared from The Miners";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

const PHOTO_HEIGHT = 430;

// Read once per server instance. Both files ship with this route via
// outputFileTracingIncludes in next.config.ts.
const assets = (async () => {
  const [regular, semibold, logo] = await Promise.all([
    readFile(join(process.cwd(), "src/assets/fonts/Outfit-Regular.ttf")),
    readFile(join(process.cwd(), "src/assets/fonts/Outfit-SemiBold.ttf")),
    readFile(join(process.cwd(), "public/assets/miners-logo-cropped.png")),
  ]);
  return { regular, semibold, logo: `data:image/png;base64,${logo.toString("base64")}` };
})();

/**
 * Download the listing photo and crop it to the strip above the text.
 *
 * Returns null on any trouble (slow host, wrong type, oversized file), and the
 * no-photo card is drawn instead: a preview is better without a photo than
 * missing altogether. sharp normalises whatever format the host sends into a
 * JPEG the renderer can draw.
 */
async function loadPhoto(url: string | null): Promise<string | null> {
  if (!url || !isAllowedPhotoUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > 8 * 1024 * 1024) return null;
    const jpeg = await sharp(raw)
      .resize(size.width, PHOTO_HEIGHT, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** One-line-safe text: the renderer has no line clamp, so cut by length. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [share, { regular, semibold, logo }] = await Promise.all([getShare(code), assets]);
  const photo = await loadPhoto(share?.photoUrl ?? null);

  const title = truncate(share?.title ?? "The Miners", photo ? 44 : 60);
  const address = share?.address ? truncate(share.address, 60) : null;

  const body = photo ? (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", fontFamily: "Outfit" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} width={size.width} height={PHOTO_HEIGHT} alt="" />
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 56px", gap: 40 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: 46, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.15 }}>{title}</div>
          {address && <div style={{ fontSize: 30, color: "#777", marginTop: 10 }}>{address}</div>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={168} height={74} alt="" />
      </div>
    </div>
  ) : (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "#fafaf9",
        fontFamily: "Outfit",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} width={227} height={100} alt="" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {share && (
          <div style={{ display: "flex" }}>
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: "#555",
                background: "#ececea",
                borderRadius: 10,
                padding: "6px 16px",
                textTransform: "uppercase",
                letterSpacing: 2,
              }}
            >
              {placeTypeLabel(share.placeType)}
            </div>
          </div>
        )}
        <div style={{ fontSize: 68, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.1, marginTop: 22 }}>{title}</div>
        {address && <div style={{ fontSize: 36, color: "#777", marginTop: 14 }}>{address}</div>}
      </div>
    </div>
  );

  const png = new ImageResponse(body, {
    ...size,
    fonts: [
      { name: "Outfit", data: regular, weight: 400, style: "normal" },
      { name: "Outfit", data: semibold, weight: 600, style: "normal" },
    ],
  });
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      // A share's snapshot never changes, so a found one caches for good. An
      // unknown code must not: the row may simply not be saved yet when a
      // chat app fetches the preview a second after the link was copied.
      "Cache-Control": share ? "public, max-age=31536000, immutable" : "no-store",
    },
  });
}
