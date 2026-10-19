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
}

/** Resting, link on the clipboard, or sent through the phone's share sheet. */
type Status = "idle" | "copied" | "shared";

/** The visible word for each status, and what a screen reader hears. */
const WORDS: Record<Status, string> = { idle: "Link", copied: "Copied", shared: "Done" };
const ANNOUNCE: Record<Status, string> = { idle: "", copied: "Link copied", shared: "Link shared" };

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
export function ShareButton({ placeId, placeType, title, address, photoUrl }: ShareButtonProps) {
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

    apiFetch("/api/share", {
      method: "POST",
      keepalive: true,
      body: JSON.stringify({ code, placeId, placeType, title, address, photoUrl }),
    }).catch((err) => {
      console.error("[share] saving the link failed:", err);
      stopReset();
      setStatus("idle");
      showToast("The link couldn't be saved. Please try again.", "error");
    });

    /** Resolves true once the link is on the clipboard. */
    const copy = () =>
      navigator.clipboard.writeText(url).then(
        () => {
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
        () => flash("shared"),
        async (err: unknown) => {
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
        {(Object.keys(WORDS) as Status[]).map((s) => (
          <span key={s} data-active={s === status || undefined}>{WORDS[s]}</span>
        ))}
      </span>
      <span className="sr-only" aria-live="polite">
        {ANNOUNCE[status]}
      </span>
    </button>
  );
}
