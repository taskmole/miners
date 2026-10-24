"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable segmented toggle row: grey track, white knob (see .mt-seg).
 *
 * Used by the map's property sub-filters and the Scouting panel's
 * "Mine & team / All in city" switch, so the two always look alike.
 *
 * It survives 375px on its own: the track scrolls sideways and each option
 * is `flex: 1 1 0; min-width: 0; white-space: nowrap`.
 */
export function SegmentedFilterRow<T extends string>({
    label,
    options,
    value,
    onChange,
    counts,
    hideLabel = false,
}: {
    label?: string;
    /** Keep the label for screen readers only. */
    hideLabel?: boolean;
    options: { value: T; label: string }[];
    value: T;
    onChange?: (v: T) => void;
    counts?: number[];
}) {
    return (
        <div>
            {label && !hideLabel && <span className="mt-seg-label">{label}</span>}
            <div className="mt-seg" role="group" aria-label={label}>
                {options.map((opt, i) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange?.(opt.value)}
                        className={cn(value === opt.value && "is-on")}
                        aria-pressed={value === opt.value}
                    >
                        {opt.label}
                        {counts && counts[i] != null && <small>{counts[i]}</small>}
                    </button>
                ))}
            </div>
        </div>
    );
}
