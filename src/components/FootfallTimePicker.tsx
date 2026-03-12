"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Clock } from "lucide-react";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

interface FootfallTimePickerProps {
  trafficEnabled: boolean;
  trafficHour: number;
  onTrafficHourChange: (hour: number) => void;
}

/**
 * FootfallTimePicker — Mobile bottom strip for filtering footfall data by hour.
 * Always-visible single row: clock icon, time label, interactive sparkline.
 * Only visible on mobile when traffic layer is enabled.
 */
export function FootfallTimePicker({
  trafficEnabled,
  trafficHour,
  onTrafficHourChange,
}: FootfallTimePickerProps) {
  const isMobile = useMobile();
  const [hourlyData, setHourlyData] = useState<number[]>(new Array(24).fill(0));
  const barChartRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Fetch grouped traffic data for the 24h sparkline
  useEffect(() => {
    if (!trafficEnabled) return;

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
      });
  }, [trafficEnabled]);

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

  // Don't render on desktop or when traffic is off
  if (!isMobile || !trafficEnabled) return null;

  return (
    <div
      className={cn(
        "fixed left-4 right-4 z-40 transition-all duration-200 ease-out",
        // Position above MobileBottomNav (56px + 12px gap + safe area)
        "bottom-[calc(68px+env(safe-area-inset-bottom))]"
      )}
    >
      <div
        className={cn(
          // Glassmorphism per design system
          "bg-white/75 backdrop-blur-[16px] backdrop-saturate-[180%]",
          "border border-white/40",
          "shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.5)]",
          "overflow-hidden rounded-[16px]"
        )}
      >
        {/* Single always-visible strip */}
        <div className="w-full flex items-center gap-3 px-4 h-[52px]">
          <Clock className="w-5 h-5 text-zinc-500 shrink-0" />
          <span className="text-sm font-semibold text-zinc-900 shrink-0">
            {formatHour(trafficHour)}
          </span>

          {/* Interactive sparkline */}
          <div
            ref={barChartRef}
            className="flex-1 flex items-end gap-[1px] h-6 touch-none select-none cursor-pointer"
            onPointerDown={handleBarPointerDown}
            onPointerMove={handleBarPointerMove}
            onPointerUp={handleBarPointerUp}
            onPointerCancel={handleBarPointerUp}
          >
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
        </div>
      </div>
    </div>
  );
}
