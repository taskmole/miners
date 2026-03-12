"use client";

import React from "react";

interface TrafficValueCardProps {
    direccion: string;
    currentHour: number;
    hourly: number[]; // Array of 24 values
    compact?: boolean; // Compact mode shows only value
}

// Shorten address: "Alberto Aguilera 56, 28015 Madrid" → "Alberto Aguilera 56"
function shortenAddress(address: string): string {
    // Remove postal code and city (after comma)
    const parts = address.split(",");
    return parts[0]?.trim() || address;
}

// Format number with K suffix for thousands
function formatCount(value: number): string {
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}k`;
    }
    return Math.round(value).toString();
}

export const TrafficValueCard = React.memo(function TrafficValueCard({ direccion, currentHour, hourly, compact = false }: TrafficValueCardProps) {
    const currentValue = hourly[currentHour] || 0;
    const shortAddress = shortenAddress(direccion);

    // COMPACT MODE: Just the value and unit
    if (compact) {
        return (
            <div className="glass rounded-lg px-2 py-1 shadow-md border border-white/40">
                <div className="flex items-baseline gap-1">
                    <span className="text-sm font-bold text-zinc-900">
                        {formatCount(currentValue)}
                    </span>
                    <span className="text-[9px] text-zinc-500">
                        ppl/hr
                    </span>
                </div>
            </div>
        );
    }

    // FULL MODE: Address and value only
    return (
        <div className="glass rounded-xl px-3 py-2.5 min-w-[120px] max-w-[180px] shadow-lg border border-white/40">
            {/* Address - truncated */}
            <div className="text-[10px] font-medium text-zinc-500 truncate mb-0.5">
                {shortAddress}
            </div>

            {/* Current value */}
            <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold text-zinc-900">
                    {formatCount(currentValue)}
                </span>
                <span className="text-[10px] text-zinc-400">
                    people/hr
                </span>
            </div>
        </div>
    );
});
