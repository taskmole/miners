"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Flag icons - easy to remove: just delete this import and the Flag component usage below
import { ES, CZ } from "country-flag-icons/react/3x2";

// Map country codes to flag components
export const FLAGS: Record<string, React.ComponentType<{ className?: string }>> = {
  ES,
  CZ,
};

// The city list itself lives in src/lib/cities.ts, which is the one source the
// admin screens and the server routes read too. Re-exported here so the many
// existing "import { cities, type City } from '@/components/CitySelector'"
// call sites keep working.
import { cities, type City } from "@/lib/cities";
export { cities };
export type { City };

interface CitySelectorProps {
  selectedCity: City;
  onCityChange: (city: City) => void;
  /**
   * The cities this person has been granted. Defaults to all of them, which
   * is what the demo and the signed-out landing map want. Somebody with
   * access to one city sees one city here rather than three they cannot open.
   */
  available?: City[];
}

/**
 * Only cities that are live AND granted are offered. Cities that are granted
 * but not live yet still appear, greyed with a "coming soon" chip, because
 * hiding the roadmap is what made Barcelona invisible in the first place.
 */
export function CitySelector({ selectedCity, onCityChange, available = cities }: CitySelectorProps) {
  return (
    <div className="z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="glass flex items-center gap-2 px-4 py-2 rounded-2xl md:px-3 md:py-1.5 md:rounded-xl hover:bg-white/20 transition-all text-[15px] md:text-sm font-semibold text-zinc-900 font-heading">
            {FLAGS[selectedCity.countryCode] && (
              <span className="w-5 h-4 md:w-4 md:h-3 rounded-[2px] overflow-hidden flex-shrink-0">
                {React.createElement(FLAGS[selectedCity.countryCode], { className: "w-full h-full" })}
              </span>
            )}
            {selectedCity.name}
            <ChevronDown className="w-5 h-5 md:w-4 md:h-4 text-zinc-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="glass border-none p-1 rounded-xl min-w-[140px]">
          {available.map((city) => (
            <DropdownMenuItem
              key={city.id}
              disabled={!city.active}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                "focus:bg-black/10 data-[highlighted]:bg-black/10",
                !city.active && "opacity-50 cursor-not-allowed",
                selectedCity.id === city.id && "bg-black/5"
              )}
              onClick={() => {
                if (city.active) {
                  onCityChange(city);
                }
              }}
            >
              {FLAGS[city.countryCode] && (
                <span className="w-4 h-3 rounded-[2px] overflow-hidden flex-shrink-0">
                  {React.createElement(FLAGS[city.countryCode], { className: "w-full h-full" })}
                </span>
              )}
              <span className="text-[15px] font-semibold text-zinc-900 font-heading">
                {city.name}
              </span>
              {city.chip && (
                <span
                  className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    city.chip.style === "gold"
                      ? "bg-yellow-300 text-amber-800"
                      : "bg-zinc-300 text-zinc-600"
                  )}
                >
                  {city.chip.text}
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
