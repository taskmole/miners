"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { X, Coffee, MapPin, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMapData } from "@/hooks/useMapData";
import type { CompetitorEntry } from "@/types/scouting";

function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function parseCompetitors(value: string | undefined): CompetitorEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return value.trim()
      ? [{ name: value.trim(), distance: null, source: "manual" as const }]
      : [];
  }
}

interface NearbyCompetitorsProps {
  cityId: string;
  propertyLat: number | undefined;
  propertyLon: number | undefined;
  entries: CompetitorEntry[];
  onEntriesChange: (entries: CompetitorEntry[]) => void;
  onNavigate?: (lat: number, lon: number) => void;
}

export function NearbyCompetitors({
  cityId,
  propertyLat,
  propertyLon,
  entries,
  onEntriesChange,
  onNavigate,
}: NearbyCompetitorsProps) {
  const { cafes } = useMapData(cityId);
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const prevCoordsRef = useRef<string | null>(null);

  const hasProperty = propertyLat != null && propertyLon != null;

  const cafesWithDistance = useMemo(() => {
    if (!hasProperty) {
      return cafes.map((c) => ({ name: c.name, lat: c.lat, lon: c.lon, distance: null as number | null }));
    }
    return cafes
      .map((c) => ({
        name: c.name,
        lat: c.lat,
        lon: c.lon,
        distance: haversineMeters(propertyLat!, propertyLon!, c.lat, c.lon) as number | null,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [cafes, propertyLat, propertyLon, hasProperty]);

  // Auto-populate top 10 nearest cafes when property coordinates change
  useEffect(() => {
    const coordKey = hasProperty ? `${propertyLat},${propertyLon}` : null;
    if (coordKey === prevCoordsRef.current) return;
    prevCoordsRef.current = coordKey;
    if (!coordKey || cafesWithDistance.length === 0) return;

    const manualEntries = entriesRef.current.filter((e) => e.source === "manual");
    const nearby = cafesWithDistance
      .filter((c) => c.distance != null && c.distance <= 500)
      .slice(0, 10)
      .map((c) => ({
        name: c.name,
        distance: c.distance!,
        source: "auto" as const,
        lat: c.lat,
        lon: c.lon,
      }));

    onEntriesChange([...nearby, ...manualEntries]);
  }, [propertyLat, propertyLon, cafesWithDistance, hasProperty, onEntriesChange]);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    if (!query) return [];
    const entryNames = new Set(entries.map((e) => e.name.toLowerCase()));
    return cafesWithDistance
      .filter(
        (c) =>
          c.name.toLowerCase().includes(query) &&
          !entryNames.has(c.name.toLowerCase())
      )
      .slice(0, 6);
  }, [inputValue, cafesWithDistance, entries]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addEntry = (name: string, distance: number | null, source: "auto" | "manual", lat?: number, lon?: number) => {
    onEntriesChange([...entries, { name, distance, source, lat, lon }]);
    setInputValue("");
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const handleSelectSuggestion = (suggestion: (typeof cafesWithDistance)[0]) => {
    addEntry(suggestion.name, suggestion.distance, "manual", suggestion.lat, suggestion.lon);
  };

  const handleAddFreeText = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    addEntry(trimmed, null, "manual");
  };

  const handleRemove = (index: number) => {
    onEntriesChange(entries.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      return;
    }
    if (e.key === "ArrowDown" && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
      return;
    }
    if (e.key === "ArrowUp" && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (
        showSuggestions &&
        selectedSuggestionIndex >= 0 &&
        selectedSuggestionIndex < suggestions.length
      ) {
        handleSelectSuggestion(suggestions[selectedSuggestionIndex]);
      } else {
        handleAddFreeText();
      }
    }
  };

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry, i) => (
            <div
              key={`${entry.source}-${i}`}
              className="flex items-center justify-between px-3 py-2 bg-zinc-50 rounded-md group"
            >
              <div className="flex items-center gap-2 min-w-0">
                {entry.source === "auto" ? (
                  <Coffee className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                ) : (
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                )}
                <span className="text-sm text-zinc-700 truncate">
                  {entry.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                {entry.lat != null && entry.lon != null && onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate(entry.lat!, entry.lon!)}
                    className="text-zinc-400 hover:text-zinc-700 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {entry.distance != null && (
                  <span className="text-xs text-zinc-400">
                    {formatDistance(entry.distance)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  className="text-zinc-400 hover:text-zinc-700 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 && !hasProperty && (
        <p className="text-xs text-zinc-400 italic">
          Select a property to see nearby cafes
        </p>
      )}

      {entries.length === 0 && hasProperty && (
        <p className="text-xs text-zinc-400 italic">No cafes found within 500m</p>
      )}

      <div className="relative">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
            setSelectedSuggestionIndex(-1);
          }}
          onFocus={() => inputValue.trim() && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search or add competitor..."
          className="h-9 text-sm"
        />

        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden"
          >
            {suggestions.map((cafe, i) => (
              <button
                key={`sug-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectSuggestion(cafe)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-50 ${
                  i === selectedSuggestionIndex ? "bg-zinc-100" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Coffee className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                  <span className="text-zinc-700 truncate">{cafe.name}</span>
                </div>
                {cafe.distance != null && (
                  <span className="text-xs text-zinc-400 flex-shrink-0 ml-2">
                    {formatDistance(cafe.distance)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
