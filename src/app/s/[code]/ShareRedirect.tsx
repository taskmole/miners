"use client";

import { useEffect } from "react";
import { focusPath } from "@/lib/place-id";
import { alreadyForwarded } from "./forward-script";

/**
 * Forward a person from the share page into the app, on the shared place.
 *
 * location.replace, not a push, so Back returns to the chat the link came
 * from instead of landing here and being bounced forward again. The button
 * stays as a fallback for the moment before scripts run, or if they don't.
 * Signed-in people have usually been forwarded already by the page's inline
 * script (forward-script.ts); then this stays out of the way.
 */
export function ShareRedirect({ placeId }: { placeId: string }) {
  const target = focusPath(placeId);

  useEffect(() => {
    if (alreadyForwarded()) return;
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
