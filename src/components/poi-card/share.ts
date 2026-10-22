import { apiFetch } from "@/lib/api-client";
import { makeShareCode, shareUrl } from "@/lib/share";

export interface SharePlace {
  placeId: string;
  /** Place-id prefix or finer type (property, eu_coffee_trip, gym, ...). */
  placeType: string;
  title: string;
  address?: string | null;
  /** Drives the WhatsApp preview image. */
  photoUrl?: string | null;
  /** A listing's own URL, so the server can look the listing up. Properties only. */
  listingUrl?: string;
}

type ShowToast = (text: string, type?: "success" | "error") => void;

const SAVE_FAILED = "The link couldn't be saved. Please try again.";

/**
 * Share a place from the card's More menu.
 *
 * On touch screens with a share sheet it opens that sheet (WhatsApp is one
 * tap from there). Everywhere else it copies a /s/<code> link and says so in
 * a toast, because the menu closes on tap and nothing else would confirm it.
 *
 * Must be called straight from the tap: browsers only open the share sheet
 * and write the clipboard inside a user gesture.
 *
 * The code is made here, synchronously (see makeShareCode for why). Saving
 * the link runs alongside, with keepalive so closing the card cannot cancel
 * it. If the save fails the link would not resolve, so any confirmation is
 * replaced by a toast asking to try again.
 */
export function sharePlace(place: SharePlace, showToast: ShowToast): void {
  const code = makeShareCode();
  const url = shareUrl(window.location.origin, code);

  let saveFailed = false;
  apiFetch("/api/share", {
    method: "POST",
    keepalive: true,
    body: JSON.stringify({ code, ...place }),
  }).catch((err) => {
    console.error("[share] saving the link failed:", err);
    saveFailed = true;
    showToast(SAVE_FAILED, "error");
  });

  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => {
        // Offline, the save has usually failed already: don't confirm a
        // link that will not open.
        if (!saveFailed) showToast("Link copied");
      },
      () => showToast("Couldn't copy the link", "error"),
    );

  const useShareSheet =
    typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

  if (useShareSheet) {
    navigator.share({ title: place.title, url }).then(
      () => {
        // The sheet may have hidden the save error: say it again now.
        if (saveFailed) showToast(SAVE_FAILED, "error");
      },
      (err: unknown) => {
        if (saveFailed) return showToast(SAVE_FAILED, "error");
        // Closing the sheet without picking an app is not an error.
        if (err instanceof DOMException && err.name === "AbortError") return;
        void copy();
      },
    );
    return;
  }
  void copy();
}
