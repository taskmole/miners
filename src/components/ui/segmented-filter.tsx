"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable segmented toggle row.
 *
 * Lifted out of Sidebar.tsx unchanged so the Scouting panel's "Mine & team /
 * All in city" switch looks exactly like the map's property sub-filters rather
 * than inventing a second style for the same control.
 *
 * It already survives 375px on its own: the track scrolls sideways and each
 * option is `flex-1 min-w-0 whitespace-nowrap`.
 */
export function SegmentedFilterRow<T extends string>({
    label,
    options,
    value,
    onChange,
    counts,
}: {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    onChange?: (v: T) => void;
    counts?: number[];
}) {
    return (
        <div className="pr-3">
            <span className="text-[10px] font-medium text-zinc-500 mb-1 block">{label}</span>
            <div className="flex bg-zinc-300/60 rounded-lg p-1 overflow-x-auto scrollbar-hide">
                {options.map((opt, i) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange?.(opt.value)}
                        className={cn(
                            "flex-1 text-xs font-semibold px-2 py-1.5 rounded-md transition-all whitespace-nowrap text-center min-w-0",
                            value === opt.value
                                ? "bg-white text-zinc-900 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        {opt.label}
                        {counts && counts[i] != null && (
                            <span className={cn(
                                "ml-1 text-[10px] font-medium",
                                value === opt.value
                                    ? "text-zinc-400"
                                    : "text-zinc-400/60"
                            )}>
                                {counts[i]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}
