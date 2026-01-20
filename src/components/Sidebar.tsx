"use client";

import React, { useRef, useEffect, useState } from "react";
import {
    Coffee,
    Train,
    TrainFront,
    Building2,
    ShoppingBag,
    Users,
    GraduationCap,
    Home,
    ChevronRight,
    SlidersHorizontal,
    Info,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SidebarProps {
    counts?: {
        cafe: number;
        euCoffeeTrip: number;
        regularCafe: number;
        property: number;
        transit: number;
        metro: number;
        office: number;
        shopping: number;
        high_street: number;
        dorm: number;
        university: number;
    };
    activeFilters: Set<string>;
    onFilterChange: (filters: Set<string>) => void;
    ratingFilter?: number;
    onRatingChange?: (rating: number) => void;
    trafficEnabled?: boolean;
    onTrafficToggle?: (enabled: boolean) => void;
    trafficValuesEnabled?: boolean;
    onTrafficValuesToggle?: (enabled: boolean) => void;
    populationEnabled?: boolean;
    onPopulationToggle?: (enabled: boolean) => void;
    populationDensityFilter?: number;
    onPopulationDensityFilterChange?: (filter: number) => void;
    incomeEnabled?: boolean;
    onIncomeToggle?: (enabled: boolean) => void;
    incomeWealthyFilter?: number;
    onIncomeWealthyFilterChange?: (filter: number) => void;
    trafficHour?: number;
    onTrafficHourChange?: (hour: number) => void;
}

const placeCategories = [
    {
        id: "cafe",
        label: "Cafe",
        icon: Coffee,
        hasSubcategories: true,
        subcategories: [
            { id: "eu_coffee_trip", label: "EU Coffee Trip", countKey: "euCoffeeTrip" },
            { id: "regular_cafe", label: "Regular Cafe", countKey: "regularCafe" },
        ]
    },
    { id: "property", label: "Places for rent", icon: Home, countKey: "property" },
    { id: "transit", label: "Train Station", icon: Train, countKey: "transit" },
    { id: "metro", label: "Metro Station", icon: TrainFront, countKey: "metro" },
    { id: "office", label: "Office Center", icon: Building2, countKey: "office" },
    { id: "shopping", label: "Shopping Center", icon: ShoppingBag, countKey: "shopping" },
    { id: "high_street", label: "High Street", icon: Users, countKey: "high_street" },
    { id: "dorm", label: "Student Dormitory", icon: GraduationCap, countKey: "dorm" },
    { id: "university", label: "University", icon: GraduationCap, countKey: "university" },
];

export function Sidebar({
    counts,
    activeFilters,
    onFilterChange,
    ratingFilter = 0,
    onRatingChange,
    trafficEnabled = false,
    onTrafficToggle,
    trafficValuesEnabled = false,
    onTrafficValuesToggle,
    populationEnabled = false,
    onPopulationToggle,
    populationDensityFilter = 0,
    onPopulationDensityFilterChange,
    incomeEnabled = false,
    onIncomeToggle,
    incomeWealthyFilter = 0,
    onIncomeWealthyFilterChange,
    trafficHour = 12,
    onTrafficHourChange,
}: SidebarProps) {
    // Panel open/closed state
    const [isOpen, setIsOpen] = React.useState(false);
    // Which main sections are expanded (places, traffic)
    const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());
    // Which place categories are expanded (for cafe subcategories)
    const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set(["cafe"]));
    const panelRef = useRef<HTMLDivElement>(null);

    // Local state for debounced sliders
    const [localRating, setLocalRating] = useState(ratingFilter);
    const [localTrafficHour, setLocalTrafficHour] = useState(trafficHour);
    const [localIncomeFilter, setLocalIncomeFilter] = useState(incomeWealthyFilter);
    const [localDensityFilter, setLocalDensityFilter] = useState(populationDensityFilter);

    // Sync local state when props change externally
    useEffect(() => {
        setLocalRating(ratingFilter);
    }, [ratingFilter]);

    useEffect(() => {
        setLocalTrafficHour(trafficHour);
    }, [trafficHour]);

    useEffect(() => {
        setLocalIncomeFilter(incomeWealthyFilter);
    }, [incomeWealthyFilter]);

    useEffect(() => {
        setLocalDensityFilter(populationDensityFilter);
    }, [populationDensityFilter]);

    // Debounce rating changes (150ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localRating !== ratingFilter) {
                onRatingChange?.(localRating);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [localRating, ratingFilter, onRatingChange]);

    // Debounce traffic hour changes (150ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localTrafficHour !== trafficHour) {
                onTrafficHourChange?.(localTrafficHour);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [localTrafficHour, trafficHour, onTrafficHourChange]);

    // Debounce income filter changes (150ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localIncomeFilter !== incomeWealthyFilter) {
                onIncomeWealthyFilterChange?.(localIncomeFilter);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [localIncomeFilter, incomeWealthyFilter, onIncomeWealthyFilterChange]);

    // Debounce population density filter changes (150ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localDensityFilter !== populationDensityFilter) {
                onPopulationDensityFilterChange?.(localDensityFilter);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [localDensityFilter, populationDensityFilter, onPopulationDensityFilterChange]);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Toggle a main section (places, traffic)
    const toggleSection = (section: string) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(section)) {
            newExpanded.delete(section);
        } else {
            newExpanded.add(section);
        }
        setExpandedSections(newExpanded);
    };

    const handleToggle = (id: string, checked: boolean) => {
        const newFilters = new Set(activeFilters);
        if (checked) {
            newFilters.add(id);
        } else {
            newFilters.delete(id);
        }
        onFilterChange(newFilters);
    };

    const handleSelectAll = () => {
        const allFilters = new Set([
            ...placeCategories
                .filter(c => !c.hasSubcategories)
                .map(c => c.id),
            "eu_coffee_trip",
            "regular_cafe"
        ]);
        onFilterChange(allFilters);
    };

    const handleClearAll = () => {
        onFilterChange(new Set<string>());
    };

    const toggleCategoryExpand = (id: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedCategories(newExpanded);
    };

    // Count only actual filter IDs (subcategories count individually, parent is just a UI toggle)
    const activeCount = activeFilters.size;

    // Calculate total number of filters for state detection
    const totalFilters = placeCategories.filter(c => !c.hasSubcategories).length + 2; // +2 for cafe subcategories
    const isAllSelected = activeFilters.size >= totalFilters;
    const isNoneSelected = activeFilters.size === 0;

    const getCount = (key: string) => {
        if (!counts) return 0;
        return counts[key as keyof typeof counts] ?? 0;
    };

    // Format density value for display (e.g., 26000 → "26k/km²")
    const formatDensity = (value: number) => {
        if (value === 0) return "0";
        if (value >= 1000) {
            const k = value / 1000;
            return `${k % 1 === 0 ? k : k.toFixed(1)}k/km²`;
        }
        return `${value}/km²`;
    };

    const isPlacesExpanded = expandedSections.has('places');
    const isTrafficExpanded = expandedSections.has('traffic');
    const isPopulationExpanded = expandedSections.has('population');
    const isIncomeExpanded = expandedSections.has('income');

    // Render filter icon button (closed state)
    // Uses z-40 to match other collapsed icon buttons
    if (!isOpen) {
        return (
            <div ref={panelRef} className="fixed top-6 right-6 z-40">
                <button
                    onClick={() => setIsOpen(true)}
                    className="glass w-10 h-10 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 transition-all duration-200"
                    title="Open filters"
                >
                    <SlidersHorizontal className="w-[18px] h-[18px] text-zinc-500" />
                </button>
            </div>
        );
    }

    // Render accordion panel
    // Uses z-[60] to ensure it appears above all collapsed icon buttons (z-40) and other expanded panels (z-50)
    return (
        <div ref={panelRef} className="fixed top-6 right-6 z-[60]">
            <ScrollArea className="max-h-[calc(100vh-48px)]">
                <div className="glass rounded-2xl overflow-hidden border border-white/40 w-80 animate-in fade-in slide-in-from-top-2 duration-200">

                    {/* ===== PLACES SECTION ===== */}
                    <div className="border-b border-white/10">
                        {/* Places header row */}
                        <button
                            onClick={() => toggleSection('places')}
                            className="w-full p-4 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isPlacesExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900">Places</span>
                            </div>
                            <span className="px-2 py-0.5 bg-green-100/50 text-green-700 text-[10px] font-bold rounded-full">
                                {activeCount} active
                            </span>
                        </button>

                        {/* Places expanded content with smooth height animation */}
                        <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isPlacesExpanded ? '1fr' : '0fr' }}
                        >
                            <div className="overflow-hidden">
                                <div className="border-t border-white/10">
                                    {/* Segmented Toggle Controls */}
                                    <div className="px-4 py-2 border-b border-white/10">
                                        <div className="flex bg-zinc-200/50 rounded-lg p-0.5">
                                            <button
                                                onClick={handleSelectAll}
                                                className={cn(
                                                    "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all",
                                                    isAllSelected
                                                        ? "bg-white text-zinc-900 shadow-sm"
                                                        : "text-zinc-500 hover:text-zinc-700"
                                                )}
                                            >
                                                Select All
                                            </button>
                                            <button
                                                onClick={handleClearAll}
                                                className={cn(
                                                    "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all",
                                                    isNoneSelected
                                                        ? "bg-white text-zinc-900 shadow-sm"
                                                        : "text-zinc-500 hover:text-zinc-700"
                                                )}
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                    </div>

                                    {/* Category List */}
                                    <div className="p-3 space-y-1">
                                        {placeCategories.map((cat) => {
                                            // For categories with subcategories, derive checked state from children
                                            const isActive = cat.hasSubcategories && cat.subcategories
                                                ? cat.subcategories.some(sub => activeFilters.has(sub.id))
                                                : activeFilters.has(cat.id);
                                            const isCatExpanded = expandedCategories.has(cat.id);
                                            const count = cat.hasSubcategories
                                                ? getCount("cafe")
                                                : getCount(cat.countKey || cat.id);

                                            return (
                                                <div key={cat.id}>
                                                    <div
                                                        className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/10 transition-colors cursor-pointer group"
                                                        onClick={() => {
                                                        if (cat.hasSubcategories) {
                                                            // Only expand/collapse - checkbox handles toggling
                                                            toggleCategoryExpand(cat.id);
                                                        } else {
                                                            // For non-expandable items, toggle the filter
                                                            handleToggle(cat.id, !isActive);
                                                        }
                                                    }}
                                                    >
                                                        <div className="flex items-center gap-2.5">
                                                            <Checkbox
                                                                id={cat.id}
                                                                checked={isActive}
                                                                onCheckedChange={(checked) => {
                                                                    // Batch all changes into single state update
                                                                    if (cat.hasSubcategories && cat.subcategories) {
                                                                        const newFilters = new Set(activeFilters);
                                                                        cat.subcategories.forEach(sub => {
                                                                            if (checked) {
                                                                                newFilters.add(sub.id);
                                                                            } else {
                                                                                newFilters.delete(sub.id);
                                                                            }
                                                                        });
                                                                        onFilterChange(newFilters);
                                                                    } else {
                                                                        handleToggle(cat.id, !!checked);
                                                                    }
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-4 h-4 border-zinc-300 data-[state=checked]:bg-zinc-800 data-[state=checked]:border-zinc-800"
                                                            />
                                                            <cat.icon className={cn(
                                                                "w-4 h-4",
                                                                isActive ? "text-blue-500" : "text-zinc-400"
                                                            )} />
                                                            <span className={cn(
                                                                "text-sm font-medium",
                                                                isActive ? "text-zinc-900" : "text-zinc-500"
                                                            )}>
                                                                {cat.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100/50 px-1.5 py-0.5 rounded">
                                                                {count}
                                                            </span>
                                                            {cat.hasSubcategories && (
                                                                <ChevronRight className={cn(
                                                                    "w-4 h-4 text-zinc-400 transition-transform duration-200 ease-out",
                                                                    isCatExpanded && "rotate-90"
                                                                )} />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Subcategories with smooth animation */}
                                                    {cat.hasSubcategories && cat.subcategories && (
                                                        <div
                                                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                                                            style={{ gridTemplateRows: isCatExpanded ? '1fr' : '0fr' }}
                                                        >
                                                            <div className="overflow-hidden">
                                                                <div className="ml-6 pl-3 border-l border-zinc-200/50 mt-1 mb-2 space-y-1">
                                                                    {/* Rating slider for cafes */}
                                                                    <div className="py-2 pr-3">
                                                                        <div className="flex justify-between text-[10px] font-medium text-zinc-500 mb-2">
                                                                            <span>Min. Rating</span>
                                                                            <span>{localRating.toFixed(1)} ★</span>
                                                                        </div>
                                                                        <Slider
                                                                            value={[localRating]}
                                                                            onValueChange={([v]) => setLocalRating(v)}
                                                                            max={5}
                                                                            step={0.5}
                                                                        />
                                                                    </div>

                                                                    {cat.subcategories.map((sub) => {
                                                                        const subActive = activeFilters.has(sub.id);
                                                                        const subCount = getCount(sub.countKey);

                                                                        return (
                                                                            <div
                                                                                key={sub.id}
                                                                                className="flex items-center justify-between py-1 px-2 rounded hover:bg-black/10"
                                                                            >
                                                                                <div className="flex items-center gap-2">
                                                                                    <Checkbox
                                                                                        id={sub.id}
                                                                                        checked={subActive}
                                                                                        onCheckedChange={(checked) => handleToggle(sub.id, !!checked)}
                                                                                        className="w-3.5 h-3.5"
                                                                                    />
                                                                                    <label htmlFor={sub.id} className="text-[11px] font-medium text-zinc-900/70 cursor-pointer">
                                                                                        {sub.label}
                                                                                    </label>
                                                                                </div>
                                                                                <span className="text-[10px] text-zinc-400">
                                                                                    {subCount}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ===== TRAFFIC SECTION ===== */}
                    <div className="border-b border-white/10">
                        {/* Traffic header row */}
                        <button
                            onClick={() => {
                                // Clicking the row expands AND enables traffic
                                if (!isTrafficExpanded) {
                                    toggleSection('traffic');
                                    if (!trafficEnabled) {
                                        onTrafficToggle?.(true);
                                    }
                                } else {
                                    toggleSection('traffic');
                                }
                            }}
                            className="w-full p-4 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isTrafficExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900">Traffic</span>
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTrafficToggle?.(!trafficEnabled);
                                }}
                                className={cn(
                                    "px-2 py-0.5 text-[10px] font-bold rounded-full cursor-pointer transition-colors",
                                    trafficEnabled
                                        ? "bg-green-100/50 text-green-700 hover:bg-green-200/50"
                                        : "bg-white/30 text-zinc-400 hover:bg-white/20"
                                )}
                            >
                                {trafficEnabled ? "On" : "Off"}
                            </span>
                        </button>

                        {/* Traffic expanded content with smooth height animation */}
                        <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isTrafficExpanded ? '1fr' : '0fr' }}
                        >
                            <div className="overflow-hidden">
                                <div className="px-4 pb-4 pt-2 border-t border-white/10">
                                    <div className="flex justify-between text-[10px] font-medium text-zinc-500 mb-2">
                                        <span>Hour of the day</span>
                                        <span>{localTrafficHour}:00</span>
                                    </div>
                                    <Slider
                                        value={[localTrafficHour]}
                                        onValueChange={([v]) => setLocalTrafficHour(v)}
                                        max={23}
                                        min={0}
                                        step={1}
                                    />
                                    {/* Show Values toggle */}
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                                        <span className="text-[11px] font-medium text-zinc-600">Show Values</span>
                                        <button
                                            onClick={() => onTrafficValuesToggle?.(!trafficValuesEnabled)}
                                            className={cn(
                                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                                                trafficValuesEnabled ? "bg-green-500" : "bg-zinc-300"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                                                    trafficValuesEnabled ? "translate-x-4" : "translate-x-0.5"
                                                )}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ===== POPULATION SECTION ===== */}
                    <div className="border-b border-white/10">
                        {/* Population header row */}
                        <button
                            onClick={() => {
                                // Clicking the row expands AND enables population
                                if (!isPopulationExpanded) {
                                    toggleSection('population');
                                    if (!populationEnabled) {
                                        onPopulationToggle?.(true);
                                    }
                                } else {
                                    toggleSection('population');
                                }
                            }}
                            className="w-full p-4 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isPopulationExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900">Population</span>
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPopulationToggle?.(!populationEnabled);
                                }}
                                className={cn(
                                    "px-2 py-0.5 text-[10px] font-bold rounded-full cursor-pointer transition-colors",
                                    populationEnabled
                                        ? "bg-green-100/50 text-green-700 hover:bg-green-200/50"
                                        : "bg-white/30 text-zinc-400 hover:bg-white/20"
                                )}
                            >
                                {populationEnabled ? "On" : "Off"}
                            </span>
                        </button>

                        {/* Population expanded content with smooth height animation */}
                        <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isPopulationExpanded ? '1fr' : '0fr' }}
                        >
                            <div className="overflow-hidden">
                                <div className="px-4 pb-4 pt-2 border-t border-white/10">
                                    <div className="flex justify-between text-[10px] font-medium text-zinc-500 mb-2">
                                        <span>Density</span>
                                        <span>{formatDensity(localDensityFilter)} or more</span>
                                    </div>
                                    <Slider
                                        value={[localDensityFilter]}
                                        onValueChange={([v]) => setLocalDensityFilter(v)}
                                        max={30000}
                                        min={0}
                                        step={1000}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ===== INCOME SECTION ===== */}
                    <div>
                        {/* Income header row */}
                        <button
                            onClick={() => {
                                // Clicking the row expands AND enables income
                                if (!isIncomeExpanded) {
                                    toggleSection('income');
                                    if (!incomeEnabled) {
                                        onIncomeToggle?.(true);
                                    }
                                } else {
                                    toggleSection('income');
                                }
                            }}
                            className="w-full p-4 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isIncomeExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900">Income</span>
                                {/* Info tooltip - commented out for now, uncomment to restore
                                <div className="relative group/info" onClick={(e) => e.stopPropagation()}>
                                    <Info className="w-3.5 h-3.5 text-zinc-400 cursor-help" />
                                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-zinc-900 text-white text-xs rounded-lg opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg pointer-events-auto">
                                        Data from the{" "}
                                        <a
                                            href="https://www.ine.es/dyngs/Prensa/ADRH2023.html"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-300 hover:text-blue-200 underline"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            INE ADRH 2023 survey
                                        </a>
                                        <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-zinc-900" />
                                    </div>
                                </div>
                                */}
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onIncomeToggle?.(!incomeEnabled);
                                }}
                                className={cn(
                                    "px-2 py-0.5 text-[10px] font-bold rounded-full cursor-pointer transition-colors",
                                    incomeEnabled
                                        ? "bg-green-100/50 text-green-700 hover:bg-green-200/50"
                                        : "bg-white/30 text-zinc-400 hover:bg-white/20"
                                )}
                            >
                                {incomeEnabled ? "On" : "Off"}
                            </span>
                        </button>

                        {/* Income expanded content with smooth height animation */}
                        <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isIncomeExpanded ? '1fr' : '0fr' }}
                        >
                            <div className="overflow-hidden">
                                <div className="px-4 pb-4 pt-2 border-t border-white/10">
                                    <div className="flex justify-between text-[10px] font-medium text-zinc-500 mb-2">
                                        <span>% of people making 2x average income</span>
                                        <span>{localIncomeFilter}% or more</span>
                                    </div>
                                    <Slider
                                        value={[localIncomeFilter]}
                                        onValueChange={([v]) => setLocalIncomeFilter(v)}
                                        max={60}
                                        min={0}
                                        step={5}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
