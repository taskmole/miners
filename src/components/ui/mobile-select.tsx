"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobile } from "@/hooks/useMobile";
import { BottomSheet } from "./bottom-sheet";

export interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface MobileSelectProps {
  // The currently selected value
  value: string;
  // Called when value changes
  onChange: (value: string) => void;
  // Available options
  options: SelectOption[];
  // Placeholder text when no value selected
  placeholder?: string;
  // Label shown above the select
  label?: string;
  // Whether the select is disabled
  disabled?: boolean;
  // Custom class name
  className?: string;
  // Whether to show search in the mobile sheet
  searchable?: boolean;
  // Search placeholder
  searchPlaceholder?: string;
}

export function MobileSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  label,
  disabled = false,
  className,
  searchable = true,
  searchPlaceholder = "Search...",
}: MobileSelectProps) {
  const isMobile = useMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get the selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  // Focus search input when sheet opens
  useEffect(() => {
    if (isOpen && isMobile && searchable) {
      // Small delay to let the sheet animate in
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMobile, searchable]);

  // Reset search when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Handle option selection
  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  // Desktop: render native-like select
  if (!isMobile) {
    return (
      <div className={cn("relative", className)}>
        {label && (
          <label className="block text-xs font-medium text-zinc-700 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(
              "w-full h-10 px-3 pr-10 rounded-lg border border-zinc-200 bg-white",
              "text-sm text-zinc-900",
              "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400",
              "disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed",
              "appearance-none cursor-pointer"
            )}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        </div>
      </div>
    );
  }

  // Mobile: render trigger button + bottom sheet
  return (
    <div className={cn("relative", className)}>
      {label && (
        <label className="block text-xs font-medium text-zinc-700 mb-1.5">
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        className={cn(
          "w-full h-12 px-4 pr-10 rounded-xl border border-zinc-200 bg-white",
          "text-left text-base",
          "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400",
          "disabled:bg-zinc-100 disabled:text-zinc-500 disabled:cursor-not-allowed",
          "active:bg-zinc-50 transition-colors",
          !selectedOption && "text-zinc-400"
        )}
      >
        <span className="flex items-center gap-2">
          {selectedOption?.icon}
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
      </button>

      {/* Bottom sheet with options */}
      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={label || "Select"}
        snapPoint="partial"
      >
        {/* Search input */}
        {searchable && (
          <div className="p-4 border-b border-zinc-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={cn(
                  "w-full h-12 pl-11 pr-4 rounded-xl border border-zinc-200 bg-zinc-50",
                  "text-base text-zinc-900 placeholder:text-zinc-400",
                  "focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400"
                )}
                inputMode="search"
              />
            </div>
          </div>
        )}

        {/* Options list */}
        <div className="overflow-y-auto max-h-[50vh]">
          {filteredOptions.length === 0 ? (
            <div className="p-6 text-center text-zinc-500">
              No options found
            </div>
          ) : (
            filteredOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "w-full h-14 px-4 flex items-center gap-3 text-left",
                  "border-b border-zinc-100 last:border-b-0",
                  "active:bg-zinc-100 transition-colors",
                  opt.value === value && "bg-zinc-50"
                )}
              >
                {/* Icon if provided */}
                {opt.icon && (
                  <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                    {opt.icon}
                  </span>
                )}

                {/* Label */}
                <span className="flex-1 text-base text-zinc-900">
                  {opt.label}
                </span>

                {/* Check mark for selected */}
                {opt.value === value && (
                  <Check className="w-5 h-5 text-zinc-900 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

// Helper to create options from simple value/label pairs
export function createSelectOptions(
  items: Array<{ value: string; label: string } | string>
): SelectOption[] {
  return items.map((item) => {
    if (typeof item === "string") {
      return { value: item, label: item };
    }
    return item;
  });
}

// Common option sets used in forms
export const CONDITION_OPTIONS: SelectOption[] = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

export const VISIBILITY_OPTIONS: SelectOption[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export const ACCESS_OPTIONS: SelectOption[] = [
  { value: "easy", label: "Easy" },
  { value: "moderate", label: "Moderate" },
  { value: "difficult", label: "Difficult" },
];

export const PROPERTY_TYPE_OPTIONS: SelectOption[] = [
  { value: "commercial", label: "Commercial Space" },
  { value: "retail", label: "Retail Unit" },
  { value: "kiosk", label: "Kiosk" },
  { value: "food_hall", label: "Food Hall Space" },
  { value: "other", label: "Other" },
];
