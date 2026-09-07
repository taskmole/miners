"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker, in production only.
 *
 * sw.js is cache-first for every same-origin non-navigation GET, which
 * includes /_next/static/chunks/*.js. In production those filenames are
 * content-hashed, so a deploy produces new URLs and the cache is harmless.
 * In development Next serves chunks at stable, unhashed URLs, so the worker
 * pins the first build it ever saw and keeps serving it: the server sends
 * fresh HTML, the browser runs stale JS, and hydration blows up. A hard
 * reload does not help, because the worker answers before the network does.
 */
export function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Tear down any worker a previous dev session left behind, and drop its
      // caches, so an already-poisoned browser recovers on the next reload.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((names) => names.forEach((name) => caches.delete(name)));
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.error("SW registration failed:", error));
  }, []);

  return null;
}
