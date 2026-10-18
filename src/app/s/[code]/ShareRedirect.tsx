"use client";

import { useEffect } from "react";

/**
 * Forward a person from the share page into the app, on the shared place.
 *
 * location.replace, not a push, so Back returns to the chat the link came
 * from instead of landing here and being bounced forward again. The button
 * stays as a fallback for the moment before scripts run, or if they don't.
 */
export function ShareRedirect({ placeId }: { placeId: string }) {
  const target = `/?focus=${encodeURIComponent(placeId)}`;

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <a
      href={target}
      className="mt-5 flex h-11 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800"
    >
      Open in The Miners
    </a>
  );
}
