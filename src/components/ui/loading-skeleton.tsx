import React from "react";

/** Shimmering grey rows while a map tool panel's list loads (see .mt-skel). */
export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="mt-skel" />
      <div className="mt-skel" />
      <div className="mt-skel" />
    </div>
  );
}
