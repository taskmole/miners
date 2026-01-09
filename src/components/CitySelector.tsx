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

const cities = [
  { id: "madrid", name: "Madrid", active: true, image: "/madrid-silhouette.png" },
  { id: "barcelona", name: "Barcelona", active: false, image: "/barcelona-silhouette.png" },
  { id: "prague", name: "Prague", active: false, image: "/prague-silhouette.png" },
];

export function CitySelector() {
  const [selectedCity, setSelectedCity] = React.useState(cities[0]);

  return (
    <div className="fixed top-6 left-6 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 px-4 py-2 glass rounded-2xl hover:bg-white/20 transition-all text-sm font-semibold text-zinc-900 border-white/40">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {selectedCity.name}
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 glass-dark border-white/10 p-2 rounded-2xl">
          {cities.map((city) => (
            <DropdownMenuItem
              key={city.id}
              disabled={!city.active}
              className={cn(
                "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors focus:bg-white/10",
                !city.active && "opacity-50 grayscale cursor-not-allowed"
              )}
              onClick={() => city.active && setSelectedCity(city)}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-white leading-none">
                  {city.name.toUpperCase()}
                </span>
                {!city.active && (
                  <span className="text-[10px] font-black tracking-widest text-zinc-400">
                    COMING SOON
                  </span>
                )}
              </div>
              {city.image && (
                <img
                  src={city.image}
                  alt={city.name}
                  className="h-8 object-contain opacity-60"
                />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
