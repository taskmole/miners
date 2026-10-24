import { useCallback, useRef, useState } from "react";

/**
 * One server action at a time. Without it a double tap on Request sent two
 * requests: "Request sent", then an error toast for the duplicate. `busy` is
 * for disabling buttons; the ref is what actually blocks, since state lags a
 * render behind a fast second tap.
 */
export function useExclusive(): [busy: boolean, run: (action: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
