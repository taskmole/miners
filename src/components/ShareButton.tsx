"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
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


/**
 * The quiet "Copy" link next to a place card's title.
 *
 * With a mouse it copies a /s/<code> link and says "Copied" for two seconds.
 * On touch screens it opens the phone's share sheet instead (WhatsApp is one
 * tap from there), falling back to copying where there is no share sheet.
 *
 * The code is made here, synchronously, so the copy or share happens inside
 * the click: Safari and iOS refuse both once the click has waited on the
 * network. Saving the link runs alongside, with keepalive so closing the card
 * cannot cancel it. If the save fails the copied link would not resolve, so
 * "Copied" is taken back and a toast says to try again.
 */
export function ShareButton({ placeId, placeType, title, address, photoUrl }: ShareButtonProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  // Decided after mount: the media query and navigator.share are browser-only.
  const [useShareSheet, setUseShareSheet] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setUseShareSheet(
      typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches,
    );
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const flashCopied = () => {
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
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
      if (resetTimer.current) clearTimeout(resetTimer.current);
      setCopied(false);
      showToast("The link couldn't be saved. Please try again.", "error");
    });

    const copy = () =>
      navigator.clipboard.writeText(url).then(
        flashCopied,
        () => showToast("Couldn't copy the link", "error"),
      );

    if (useShareSheet) {
      navigator.share({ title, url }).catch((err: unknown) => {
        // Closing the sheet without picking an app is not an error.
        if (err instanceof DOMException && err.name === "AbortError") return;
        copy().then(() => showToast("Link copied"));
      });
      return;
    }
    void copy();
  };

  const verb = useShareSheet ? "Share" : "Copy";

  return (
    <button
      type="button"
      onClick={handleClick}
      className="share-btn"
      data-copied={copied || undefined}
      aria-label={useShareSheet ? "Share this place" : "Copy link to this place"}
      title={useShareSheet ? "Share this place" : "Copy link to this place"}
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {/* Both words sit in the same grid cell, so the button is always as
          wide as "Copied" and the title never shifts on click. */}
      <span className="share-btn-label" aria-hidden>
        <span data-active={!copied || undefined}>{verb}</span>
        <span data-active={copied || undefined}>Copied</span>
      </span>
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </button>
  );
}
