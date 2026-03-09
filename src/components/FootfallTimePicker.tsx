"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clock, ChevronUp, ChevronDown, Users } from "lucide-react";
import { useMobile, useLandscape } from "@/hooks/useMobile";
import { useSheet } from "@/contexts/SheetContext";
import { cn } from "@/lib/utils";

interface FootfallTimePickerProps {
  trafficEnabled: boolean;
  trafficHour: number;
  onTrafficHourChange: (hour: number) => void;
}

// Quick-pick time presets
const QUICK_PICKS = [
  { label: "Now", getHour: () => new Date().getHours() },
  { label: "Morning", getHour: () => 8, range: "7-9" },
  { label: "Lunch", getHour: () => 13, range: "12-2" },
  { label: "Evening", getHour: () => 18, range: "5-7" },
  { label: "Night", getHour: () => 21, range: "8-11" },
] as const;

// Time label positions
const TIME_LABELS = ["12AM", "6AM", "12PM", "6PM", "12AM"];

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(Math.round(count));
}

/**
 * FootfallTimePicker — Mobile bottom bar for filtering footfall data by hour.
 * Collapsed: shows current hour + mini sparkline + count.
 * Expanded: full 24h bar chart + quick-pick pills.
 * Only visible on mobile when traffic layer is enabled.
 */
export function FootfallTimePicker({
  trafficEnabled,
  trafficHour,
  onTrafficHourChange,
}: FootfallTimePickerProps) {
  const isMobile = useMobile();
  const isLandscape = useLandscape();
  const { activeSheet } = useSheet();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hourlyData, setHourlyData] = useState<number[]>(new Array(24).fill(0));
  const [isLoading, setIsLoading] = useState(false);
  const [hasShownTooltip, setHasShownTooltip] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const barChartRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Fetch grouped traffic data for the 24h bar chart
  useEffect(() => {
    if (!trafficEnabled) return;

    setIsLoading(true);
    fetch("/api/traffic?grouped=true")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations && Array.isArray(data.locations)) {
          // Aggregate all locations: average hourly counts
          const totals = new Array(24).fill(0);
          const counts = new Array(24).fill(0);
          for (const loc of data.locations) {
            if (Array.isArray(loc.hourly)) {
              for (let h = 0; h < 24; h++) {
                if (loc.hourly[h] != null) {
                  totals[h] += loc.hourly[h];
                  counts[h]++;
                }
              }
            }
          }
          const averages = totals.map((t, i) =>
            counts[i] > 0 ? Math.round(t / counts[i]) : 0
          );
          setHourlyData(averages);
        }
      })
      .catch(() => {
        // Silently fail — component will show zeros
      })
      .finally(() => setIsLoading(false));
  }, [trafficEnabled]);

  // First-time tooltip
  useEffect(() => {
    if (!trafficEnabled || !isMobile) return;
    const key = "footfall-tooltip-shown";
    if (typeof window !== "undefined" && !localStorage.getItem(key)) {
      setShowTooltip(true);
      setHasShownTooltip(true);
      localStorage.setItem(key, "1");
      const timer = setTimeout(() => setShowTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [trafficEnabled, isMobile]);

  // Auto-expand on first enable (if tooltip hasn't been shown before)
  useEffect(() => {
    if (trafficEnabled && isMobile && hasShownTooltip) {
      setIsExpanded(true);
    }
  }, [trafficEnabled, isMobile, hasShownTooltip]);

  // Collapse when a sheet opens
  useEffect(() => {
    if (activeSheet) setIsExpanded(false);
  }, [activeSheet]);

  // Bar chart touch/click interaction — select hour by tapping or dragging
  const getHourFromPosition = useCallback(
    (clientX: number) => {
      if (!barChartRef.current) return null;
      const rect = barChartRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      return Math.round(ratio * 23);
    },
    []
  );

  const handleBarPointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDraggingRef.current = true;
      const hour = getHourFromPosition(e.clientX);
      if (hour !== null) onTrafficHourChange(hour);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [getHourFromPosition, onTrafficHourChange]
  );

  const handleBarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const hour = getHourFromPosition(e.clientX);
      if (hour !== null) onTrafficHourChange(hour);
    },
    [getHourFromPosition, onTrafficHourChange]
  );

  const handleBarPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Derived values
  const maxCount = useMemo(() => Math.max(...hourlyData, 1), [hourlyData]);
  const currentCount = hourlyData[trafficHour] || 0;
  const avgCount = useMemo(
    () => Math.round(hourlyData.reduce((a, b) => a + b, 0) / 24),
    [hourlyData]
  );

  // Find which quick-pick matches the current hour
  const activeQuickPick = useMemo(() => {
    const now = new Date().getHours();
    for (const pick of QUICK_PICKS) {
      if (pick.label === "Now" && trafficHour === now) return "Now";
      if (pick.label === "Morning" && trafficHour >= 7 && trafficHour <= 9)
        return "Morning";
      if (pick.label === "Lunch" && trafficHour >= 12 && trafficHour <= 14)
        return "Lunch";
      if (pick.label === "Evening" && trafficHour >= 17 && trafficHour <= 19)
        return "Evening";
      if (pick.label === "Night" && trafficHour >= 20 && trafficHour <= 23)
        return "Night";
    }
    return null;
  }, [trafficHour]);

  // Don't render on desktop, when traffic is off, or when a sheet is open
  if (!isMobile || !trafficEnabled || activeSheet) return null;

  // In landscape, only show collapsed
  const canExpand = !isLandscape;

  return (
    <div
      className={cn(
        "fixed left-4 right-4 z-40 transition-all duration-200 ease-out",
        // Position above MobileBottomNav (56px + safe area)
        "bottom-[calc(56px+env(safe-area-inset-bottom))]"
      )}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-xs px-3 py-1.5 rounded-full whitespace-nowrap animate-in fade-in-0 slide-in-from-bottom-2">
          Tap a bar to see footfall at that hour
        </div>
      )}

      <div
        className={cn(
          // Glassmorphism per design system
          "bg-white/75 backdrop-blur-[16px] backdrop-saturate-[180%]",
          "border border-white/40",
          "shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.5)]",
          "overflow-hidden transition-all duration-200 ease-out",
          isExpanded && canExpand ? "rounded-t-[24px] rounded-b-[16px]" : "rounded-[16px]"
        )}
      >
        {/* COLLAPSED BAR — always visible */}
        <button
          onClick={() => canExpand && setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-3 px-4 h-[52px] active:bg-white/40 transition-colors"
        >
          <Clock className="w-5 h-5 text-zinc-500 shrink-0" />
          <span className="text-sm font-semibold text-zinc-900 shrink-0">
            {formatHour(trafficHour)}
          </span>

          {/* Mini sparkline */}
          <div className="flex-1 flex items-end gap-[1px] h-6">
            {hourlyData.map((count, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-sm min-h-[2px] transition-colors",
                  i === trafficHour ? "bg-blue-500" : "bg-zinc-200"
                )}
                style={{ height: `${Math.max(8, (count / maxCount) * 100)}%` }}
              />
            ))}
          </div>

          {/* Count */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-sm font-bold text-zinc-900">
              {isLoading ? "..." : formatCount(currentCount)}
            </span>
            <span className="text-[11px] text-zinc-400">ppl/hr</span>
          </div>

          {canExpand && (
            isExpanded
              ? <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              : <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
          )}
        </button>

        {/* EXPANDED CONTENT */}
        {isExpanded && canExpand && (
          <div className="px-4 pb-3 animate-in slide-in-from-bottom-2 fade-in-0 duration-200">
            {/* Drag handle */}
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 bg-zinc-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-base font-semibold text-zinc-900">
                Footfall by hour
              </span>
              <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full">
                {formatCount(currentCount)} ppl/hr
              </span>
            </div>

            {/* 24-hour bar chart — tappable/scrubbable */}
            <div
              ref={barChartRef}
              className="flex items-end gap-[2px] h-24 max-h-[72px] sm:max-h-24 touch-none select-none cursor-pointer"
              onPointerDown={handleBarPointerDown}
              onPointerMove={handleBarPointerMove}
              onPointerUp={handleBarPointerUp}
              onPointerCancel={handleBarPointerUp}
            >
              {hourlyData.map((count, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  {/* Selected indicator dot */}
                  {i === trafficHour && (
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mb-0.5" />
                  )}
                  <div
                    className={cn(
                      "w-full rounded-sm transition-colors min-h-[3px]",
                      i === trafficHour
                        ? "bg-blue-500"
                        : count > avgCount
                          ? "bg-zinc-300"
                          : "bg-zinc-200"
                    )}
                    style={{
                      height: `${Math.max(4, (count / maxCount) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Time labels */}
            <div className="flex justify-between mt-1.5">
              {TIME_LABELS.map((label, i) => (
                <span
                  key={i}
                  className="text-[11px] font-medium text-zinc-400"
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Quick-pick pills */}
            <div className="flex gap-2 mt-3 overflow-x-auto [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain] pb-1">
              {QUICK_PICKS.map((pick) => {
                const isActive = activeQuickPick === pick.label;
                return (
                  <button
                    key={pick.label}
                    onClick={() => onTrafficHourChange(pick.getHour())}
                    className={cn(
                      "shrink-0 h-9 px-3 rounded-full text-[13px] font-medium border transition-all",
                      isActive
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-transparent text-zinc-600 border-zinc-200 active:bg-zinc-100"
                    )}
                  >
                    {pick.label}
                    {pick.range && (
                      <span className="text-[11px] opacity-60 ml-1">
                        ({pick.range})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
