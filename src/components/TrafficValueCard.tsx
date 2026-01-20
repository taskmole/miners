"use client";

import React from "react";
import { cn } from "@/lib/utils";

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
    const maxValue = Math.max(...hourly);
    const shortAddress = shortenAddress(direccion);

    // Time labels for bar chart (every 6 hours)
    const timeLabels = ["0", "6", "12", "18", "24"];

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

    // FULL MODE: Address, value, and sparkline chart
    return (
        <div className="glass rounded-xl px-3 py-2 min-w-[160px] max-w-[200px] shadow-lg border border-white/40">
            {/* Address - truncated */}
            <div className="text-[10px] font-medium text-zinc-500 truncate mb-1">
                {shortAddress}
            </div>

            {/* Current value */}
            <div className="flex items-baseline gap-1 mb-2">
                <span className="text-lg font-bold text-zinc-900">
                    {formatCount(currentValue)}
                </span>
                <span className="text-[10px] text-zinc-400">
                    people/hr
                </span>
            </div>

            {/* 24-hour bar chart */}
            <div className="relative">
                {/* Bars */}
                <div className="flex items-end gap-px h-8">
                    {hourly.map((value, hour) => {
                        const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
                        const isCurrentHour = hour === currentHour;

                        return (
                            <div
                                key={hour}
                                className={cn(
                                    "flex-1 rounded-sm transition-all duration-200",
                                    isCurrentHour
                                        ? "bg-blue-500"
                                        : "bg-zinc-300/80"
                                )}
                                style={{ height: `${Math.max(height, 4)}%` }}
                                title={`${hour}:00 - ${Math.round(value)} people/hr`}
                            />
                        );
                    })}
                </div>

                {/* Time labels */}
                <div className="flex justify-between mt-1">
                    {timeLabels.map((label) => (
                        <span key={label} className="text-[8px] text-zinc-400">
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
});
