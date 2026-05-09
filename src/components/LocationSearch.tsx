"use client";

import { useState, useRef, useEffect, useCallback, useMemo, type ElementType, type KeyboardEvent } from "react";
import {
  Search,
  X,
  Coffee,
  Home,
  Train,
  TrainFront,
  Building2,
  ShoppingBag,
  Users,
  GraduationCap,
  Dumbbell,
  MapPin,
} from "lucide-react";
import { useMobile } from "@/hooks/useMobile";
import { useLocationSearch, type SearchResult } from "@/hooks/useLocationSearch";
import type { CafeData, PropertyData, OtherPoiData } from "@/hooks/useMapData";
import type { City } from "@/components/CitySelector";
import { stripDiacritics } from "@/lib/utils";

const TYPE_ICONS: Record<string, { icon: ElementType; color: string }> = {
  cafe: { icon: Coffee, color: "text-sky-600" },
  eu_coffee_trip: { icon: Coffee, color: "text-blue-900" },
  property: { icon: Home, color: "text-[#78C500]" },
  transit: { icon: Train, color: "text-sky-700" },
  metro: { icon: TrainFront, color: "text-sky-600" },
  office: { icon: Building2, color: "text-purple-800" },
  shopping: { icon: ShoppingBag, color: "text-fuchsia-700" },
  high_street: { icon: Users, color: "text-orange-700" },
  dorm: { icon: GraduationCap, color: "text-cyan-700" },
  university: { icon: GraduationCap, color: "text-rose-700" },
  gym: { icon: Dumbbell, color: "text-red-700" },
};

const TYPE_LABELS: Record<string, string> = {
  property: "Properties",
  cafe: "Cafes",
  eu_coffee_trip: "Cafes",
  transit: "Transit",
  metro: "Metro",
  office: "Offices",
  shopping: "Shopping",
  high_street: "High Streets",
  dorm: "Dorms",
  university: "Universities",
  gym: "Gyms",
};

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (query.length < 2) return <>{text}</>;

  const normalized = stripDiacritics(text.toLowerCase());
  const idx = normalized.indexOf(stripDiacritics(query.toLowerCase()));
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-zinc-900">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

interface LocationSearchProps {
  cafes: CafeData[];
  properties: PropertyData[];
  otherPois: OtherPoiData[];
  selectedCity: City;
}

export function LocationSearch({
  cafes,
  properties,
  otherPois,
  selectedCity,
}: LocationSearchProps) {
  const isMobile = useMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [expandedLeft, setExpandedLeft] = useState(24);
  const { query, setQuery, results, reset } = useLocationSearch(
    cafes,
    properties,
    otherPois,
  );

  const handleOpen = useCallback(() => {
    if (buttonRef.current) {
      setExpandedLeft(buttonRef.current.getBoundingClientRect().left);
    }
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setHighlightedIndex(-1);
    reset();
  }, [reset]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
        reset();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen, reset]);

  // Reset search when city changes
  const cityIdRef = useRef(selectedCity.id);
  useEffect(() => {
    if (cityIdRef.current !== selectedCity.id) {
      cityIdRef.current = selectedCity.id;
      handleClose();
    }
  }, [selectedCity.id, handleClose]);

  const handleClear = useCallback(() => {
    setQuery("");
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  }, [setQuery]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      window.dispatchEvent(
        new CustomEvent("navigate-and-open-popup", {
          detail: {
            lat: result.lat,
            lon: result.lon,
            placeId: result.placeId,
            placeType: result.placeType,
            data: result.data,
          },
        }),
      );
      setIsOpen(false);
      setHighlightedIndex(-1);
      reset();
    },
    [reset],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        handleClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1,
        );
        return;
      }
      if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < results.length) {
        e.preventDefault();
        handleSelect(results[highlightedIndex]);
      }
    },
    [handleClose, handleSelect, highlightedIndex, results],
  );

  // Scroll highlighted result into view
  useEffect(() => {
    if (highlightedIndex >= 0 && resultsRef.current) {
      const items = resultsRef.current.querySelectorAll("[data-search-result]");
      items[highlightedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  const groupedResults = useMemo(
    () =>
      results.reduce<{ type: string; items: SearchResult[] }[]>(
        (groups, result) => {
          const lastGroup = groups[groups.length - 1];
          if (lastGroup && lastGroup.type === result.type) {
            lastGroup.items.push(result);
          } else {
            groups.push({ type: result.type, items: [result] });
          }
          return groups;
        },
        [],
      ),
    [results],
  );

  let flatIndex = 0;

  // Collapsed state: pill button matching CitySelector's exact size and shape
  if (!isOpen) {
    return (
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="glass flex items-center justify-center p-2.5 rounded-2xl md:px-3 md:py-2 md:rounded-xl border border-white/40 hover:bg-white/20 transition-all"
        aria-label="Search locations"
      >
        <Search className="w-5 h-5 md:w-4 md:h-4 text-zinc-500" />
      </button>
    );
  }

  // Expanded state: fixed overlay on left with backdrop fade
  return (
    <>
      {/* Spacer to keep flex row from collapsing */}
      <div className="p-2.5 md:px-3 md:py-2 invisible">
        <Search className="w-5 h-5 md:w-4 md:h-4" />
      </div>

      {/* Backdrop fade */}
      <div
        className="fixed inset-0 z-[65] pointer-events-none transition-opacity duration-150"
        style={{ background: "rgba(0, 0, 0, 0.25)" }}
      />

      {/* Fixed search overlay */}
      <div
        ref={containerRef}
        className={`fixed top-6 z-[70] ${
          isMobile ? "left-6 right-4" : "w-[420px]"
        }`}
        style={isMobile ? undefined : { left: `${expandedLeft}px` }}
      >
        {/* Search input bar */}
        <div className="glass flex items-center gap-3 px-4 h-12 rounded-2xl border border-white/40">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search addresses, places..."
            className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 outline-none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            onClick={query ? handleClear : handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors shrink-0"
            aria-label={query ? "Clear search" : "Close search"}
          >
            <X className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* Results dropdown */}
        {query.length >= 2 && (
          <div
            ref={resultsRef}
            className="mt-2 glass rounded-2xl border border-white/40 overflow-hidden"
            style={{
              maxHeight: isMobile ? "calc(100vh - 120px)" : "400px",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">
                No places found
              </div>
            ) : (
              <div className="py-1">
                {groupedResults.map((group) => (
                  <div key={group.type}>
                    <div className="px-4 pt-2 pb-1">
                      <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                        {TYPE_LABELS[group.type] || group.type}
                      </span>
                    </div>
                    {group.items.map((result) => {
                      const currentFlatIndex = flatIndex++;
                      const isHighlighted = currentFlatIndex === highlightedIndex;
                      const config = TYPE_ICONS[result.type] || {
                        icon: MapPin,
                        color: "text-zinc-500",
                      };
                      const Icon = config.icon;

                      return (
                        <button
                          key={result.placeId}
                          data-search-result
                          onClick={() => handleSelect(result)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isHighlighted ? "bg-zinc-100" : "hover:bg-zinc-50"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-lg bg-zinc-50 flex items-center justify-center shrink-0">
                            <Icon className={`w-4 h-4 ${config.color}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-zinc-700 truncate">
                              <HighlightedText text={result.name} query={query} />
                            </div>
                            {result.address && result.address !== result.name && (
                              <div className="text-xs text-zinc-400 truncate">
                                <HighlightedText text={result.address} query={query} />
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hint when query is too short */}
        {query.length === 1 && (
          <div className="mt-2 glass rounded-2xl border border-white/40 px-4 py-3 text-center text-sm text-zinc-500">
            Type at least 2 characters
          </div>
        )}
      </div>
    </>
  );
}
