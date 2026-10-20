import type { Metadata } from "next";

// Next marks a 404 noindex by itself.
export const metadata: Metadata = { title: "The Miners" };

/** /s/<code> for a code that was never saved (or was mistyped). Answers 404. */
export default function ShareNotFound() {
  return (
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
  );
}
