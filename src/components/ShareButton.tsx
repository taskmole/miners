"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { makeShareCode, shareUrl } from "@/lib/share";
import { useToast } from "@/contexts/ToastContext";

interface ShareButtonProps {
  placeId: string;
  /** Place-id prefix or finer type (property, eu_coffee_trip, gym, ...). */
  placeType: string;
  title: string;
  address?: string | null;
  photoUrl?: string | null;
  /** A listing's own URL, so the server can look the listing up. Properties only. */
  listingUrl?: string;
}

/**
 * The visible word for each status: resting, link on the clipboard, or sent
 * through the phone's share sheet.
 */
const WORDS = { idle: "Link", copied: "Copied", shared: "Done" } as const;
type Status = keyof typeof WORDS;
const STATUSES = Object.keys(WORDS) as Status[];

const SAVE_FAILED = "The link couldn't be saved. Please try again.";

/**
 * The "Link" button at the end of a place card's title line.
 *
 * With a mouse it copies a /s/<code> link and says "Copied" for two seconds.
 * On touch screens it opens the phone's share sheet instead (WhatsApp is one
 * tap from there) and says "Done" once something was sent, falling back to
 * copying where there is no share sheet.
 *
 * The code is made here, synchronously (see makeShareCode for why). Saving
 * the link runs alongside, with keepalive so closing the card cannot cancel
 * it. If the save fails the link would not resolve, so the confirmation is
 * taken back and a toast says to try again.
 */
export function ShareButton({ placeId, placeType, title, address, photoUrl, listingUrl }: ShareButtonProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  // Decided after mount: the media query and navigator.share are browser-only.
  const [useShareSheet, setUseShareSheet] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  };

  useEffect(() => {
    setUseShareSheet(
      typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches,
    );
    return stopReset;
  }, []);

  const flash = (next: Exclude<Status, "idle">) => {
    setStatus(next);
    stopReset();
    resetTimer.current = setTimeout(() => setStatus("idle"), 2000);
  };

  const handleClick = (e: React.MouseEvent) => {
    // Never let the click reach the card: it would close it or open another.
    e.stopPropagation();

    const code = makeShareCode();
    const url = shareUrl(window.location.origin, code);

    // Set when the save fails, so a share sheet closing later can't say "Done".
    let saveFailed = false;
    apiFetch("/api/share", {
      method: "POST",
      keepalive: true,
      body: JSON.stringify({ code, placeId, placeType, title, address, photoUrl, listingUrl }),
    }).catch((err) => {
      console.error("[share] saving the link failed:", err);
      saveFailed = true;
      stopReset();
      setStatus("idle");
      showToast(SAVE_FAILED, "error");
    });

    /** Resolves true once the link is on the clipboard. */
    const copy = () =>
      navigator.clipboard.writeText(url).then(
        () => {
          // Offline, the save has usually failed already: don't confirm a
          // link that will not open.
          if (saveFailed) return false;
          flash("copied");
          return true;
        },
        () => {
          showToast("Couldn't copy the link", "error");
          return false;
        },
      );

    if (useShareSheet) {
      navigator.share({ title, url }).then(
        () => {
          // The sheet may have hidden the save error: say it again now.
          if (saveFailed) showToast(SAVE_FAILED, "error");
          else flash("shared");
        },
        async (err: unknown) => {
          if (saveFailed) return showToast(SAVE_FAILED, "error");
          // Closing the sheet without picking an app is not an error.
          if (err instanceof DOMException && err.name === "AbortError") return;
          if (await copy()) showToast("Link copied");
        },
      );
      return;
    }
    void copy();
  };

  const label = useShareSheet ? "Share link to this place" : "Copy link to this place";
  const done = status !== "idle";

  return (
    <button
      type="button"
      onClick={handleClick}
      className="share-btn"
      data-done={done || undefined}
      aria-label={label}
      title={label}
    >
      {done ? <Check aria-hidden /> : <LinkIcon aria-hidden />}
      {/* Every word shares one grid cell; see .share-btn-label */}
      <span className="share-btn-label" aria-hidden>
        {STATUSES.map((s) => (
          <span key={s} data-active={s === status || undefined}>{WORDS[s]}</span>
        ))}
      </span>
      {/* Screen readers hear "Link copied" or "Link shared". */}
      <span className="sr-only" aria-live="polite">
        {done ? `Link ${status}` : ""}
      </span>
    </button>
  );
}
