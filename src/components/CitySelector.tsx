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
const FLAGS: Record<string, React.ComponentType<{ className?: string }>> = {
  ES,
  CZ,
};

// City type for external use
export interface City {
  id: string;
  name: string;
  active: boolean;
  coordinates: [number, number]; // [longitude, latitude] - MapLibre format
  chip: { text: string; style: string } | null;
  countryCode: string; // ISO 3166-1 alpha-2 code for flag lookup
}

// City configuration with coordinates and status chips
export const cities: City[] = [
  { id: "madrid", name: "Madrid", active: true, coordinates: [-3.7038, 40.4168], chip: null, countryCode: "ES" },
  { id: "barcelona", name: "Barcelona", active: true, coordinates: [2.1734, 41.3874], chip: { text: "NEW", style: "gold" }, countryCode: "ES" },
  { id: "seville", name: "Seville", active: false, coordinates: [-5.9845, 37.3891], chip: { text: "COMING SOON", style: "gray" }, countryCode: "ES" },
  { id: "prague", name: "Prague", active: false, coordinates: [14.4378, 50.0755], chip: { text: "COMING SOON", style: "gray" }, countryCode: "CZ" },
];

interface CitySelectorProps {
  onCityChange?: (city: City) => void;
}

export function CitySelector({ onCityChange }: CitySelectorProps) {
  const [selectedCity, setSelectedCity] = React.useState<City>(cities[0]);

  return (
    <div className="fixed top-6 left-6 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Trigger button - glassmorphism style matching MapStyleSwitcher */}
          <button className="glass flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/40 hover:bg-white/20 transition-all text-sm font-semibold text-zinc-900">
            {/* Flag in trigger - remove to revert */}
            {FLAGS[selectedCity.countryCode] && (
              <span className="w-4 h-3 rounded-[2px] overflow-hidden flex-shrink-0">
                {React.createElement(FLAGS[selectedCity.countryCode], { className: "w-full h-full" })}
              </span>
            )}
            {selectedCity.name}
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </button>
        </DropdownMenuTrigger>
        {/* Dropdown content - simple list of city names */}
        <DropdownMenuContent align="start" className="glass border-white/40 p-1 rounded-xl min-w-[140px]">
          {cities.map((city) => (
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
                  setSelectedCity(city);
                  onCityChange?.(city);
                }
              }}
            >
              {/* Flag icon - remove this block to revert to no flags */}
              {FLAGS[city.countryCode] && (
                <span className="w-4 h-3 rounded-[2px] overflow-hidden flex-shrink-0">
                  {React.createElement(FLAGS[city.countryCode], { className: "w-full h-full" })}
                </span>
              )}
              {/* City name */}
              <span className="text-sm font-semibold text-zinc-900">
                {city.name}
              </span>
              {/* Status chip (NEW or COMING SOON) */}
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
