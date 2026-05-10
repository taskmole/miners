"use client";

import React, { useState, useEffect } from "react";
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
    Funnel,
    X,
    Dumbbell,
} from "lucide-react";
import { useHiddenPoisContext } from "@/contexts/HiddenPoisContext";
import { useSheetState } from "@/contexts/SheetContext";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobilePanel } from "@/components/ui/mobile-panel";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import type { EuctFilter, PropertyPostedFilter, PropertyTransferFilter, PropertyPriceChangeFilter } from "@/types/filters";

interface SidebarProps {
    cityId?: string;
    counts?: {
        cafe: number;
        euCoffeeTrip: number;
        regularCafe: number;
        premiumEuCoffeeTrip: number;
        newEuCoffeeTrip: number;
        property: number;
        propertyLast7d: number;
        propertyWithTransfer: number;
        propertyPriceChanged: number;
        transit: number;
        metro: number;
        office: number;
        shopping: number;
        high_street: number;
        dorm: number;
        university: number;
        gym: number;
        newPois: number;
    };
    activeFilters: Set<string>;
    onFilterChange: (filters: Set<string>) => void;
    ratingFilter?: number;
    onRatingChange?: (rating: number) => void;
    scoreFilter?: number;
    onScoreChange?: (score: number) => void;
    euctFilter?: EuctFilter;
    onEuctFilterChange?: (filter: EuctFilter) => void;
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
    showHiddenPois?: boolean;
    onShowHiddenPoisToggle?: (show: boolean) => void;
    // Gravity model / Location Score
    gravityEnabled?: boolean;
    onGravityToggle?: (enabled: boolean) => void;
    // Property sub-filters
    propertyPostedFilter?: PropertyPostedFilter;
    onPropertyPostedFilterChange?: (filter: PropertyPostedFilter) => void;
    propertyTransferFilter?: PropertyTransferFilter;
    onPropertyTransferFilterChange?: (filter: PropertyTransferFilter) => void;
    propertyPriceChangeFilter?: PropertyPriceChangeFilter;
    onPropertyPriceChangeFilterChange?: (filter: PropertyPriceChangeFilter) => void;
}

const placeCategories = [
    {
        id: "cafe",
        label: "Cafe",
        icon: Coffee,
        hasSubcategories: true,
        subcategories: [
            { id: "eu_coffee_trip", label: "European Coffee Trip", countKey: "euCoffeeTrip" },
            { id: "regular_cafe", label: "Regular Cafe", countKey: "regularCafe" },
        ]
    },
    { id: "property", label: "Places for rent", icon: Home, countKey: "property", hasScoreControls: true },
    { id: "transit", label: "Train Station", icon: Train, countKey: "transit" },
    { id: "metro", label: "Metro Station", icon: TrainFront, countKey: "metro" },
    { id: "office", label: "Office Center", icon: Building2, countKey: "office" },
    { id: "shopping", label: "Shopping Center", icon: ShoppingBag, countKey: "shopping" },
    { id: "high_street", label: "High Street", icon: Users, countKey: "high_street" },
    { id: "dorm", label: "Student Dormitory", icon: GraduationCap, countKey: "dorm" },
    { id: "university", label: "University", icon: GraduationCap, countKey: "university" },
    { id: "gym", label: "Gym", icon: Dumbbell, countKey: "gym" },
];

// Which overlay data layers are available per city
export const DEFAULT_OVERLAYS = { traffic: false, population: false, income: false, locationScore: false };
export type CityOverlays = typeof DEFAULT_OVERLAYS;
export const CITY_OVERLAYS: Record<string, CityOverlays> = {
    madrid: { traffic: true, population: true, income: true, locationScore: true },
    prague: DEFAULT_OVERLAYS,
    barcelona: DEFAULT_OVERLAYS,
    seville: DEFAULT_OVERLAYS,
};

// Options for the EUCT sub-filter segmented toggle
const euctFilterOptions: { value: EuctFilter; label: string; countKey: string }[] = [
    { value: "all", label: "All", countKey: "euCoffeeTrip" },
    { value: "new", label: "New", countKey: "newEuCoffeeTrip" },
    { value: "premium", label: "Premium", countKey: "premiumEuCoffeeTrip" },
];

const propertyAddedOptions: { value: PropertyPostedFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "last7days", label: "Last 7d" },
];

const propertyTransferOptions: { value: PropertyTransferFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
];

const propertyPriceChangeOptions: { value: PropertyPriceChangeFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "yes", label: "Change" },
];

// Reusable segmented toggle row used by property sub-filters
function SegmentedFilterRow<T extends string>({
    label,
    options,
    value,
    onChange,
    counts,
}: {
    label: string;
    options: { value: T; label: string }[];
    value: T;
    onChange?: (v: T) => void;
    counts?: number[];
}) {
    return (
        <div className="pr-3">
            <span className="text-[10px] font-medium text-zinc-500 mb-1 block">{label}</span>
            <div className="flex bg-zinc-300/60 rounded-lg p-1">
                {options.map((opt, i) => (
                    <button
                        key={opt.value}
                        onClick={() => onChange?.(opt.value)}
                        className={cn(
                            "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all whitespace-nowrap text-center",
                            value === opt.value
                                ? "bg-white text-zinc-900 shadow-sm"
                                : "text-zinc-500 hover:text-zinc-700"
                        )}
                    >
                        {opt.label}
                        {counts && counts[i] != null && (
                            <span className={cn(
                                "ml-1.5 text-[10px] font-medium",
                                value === opt.value
                                    ? "text-zinc-400"
                                    : "text-zinc-400/60"
                            )}>
                                {counts[i]}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function Sidebar({
    cityId,
    counts,
    activeFilters,
    onFilterChange,
    ratingFilter = 0,
    onRatingChange,
    scoreFilter = 0,
    onScoreChange,
    euctFilter = "all",
    onEuctFilterChange,
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
    showHiddenPois = false,
    onShowHiddenPoisToggle,
    gravityEnabled = false,
    onGravityToggle,
    propertyPostedFilter = "all",
    onPropertyPostedFilterChange,
    propertyTransferFilter = "all",
    onPropertyTransferFilterChange,
    propertyPriceChangeFilter = "all",
    onPropertyPriceChangeFilterChange,
}: SidebarProps) {
    // Get hidden POIs count from context
    const { hiddenCount } = useHiddenPoisContext();
    // Use SheetContext for coordinated open/close
    const { isOpen, open, close } = useSheetState("filters");
    const isMobile = useMobile();
    // Which main sections are expanded (places, traffic)
    const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());
    // Which place categories are expanded (for cafe subcategories)
    const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());

    // Overlay availability per city
    const overlays = CITY_OVERLAYS[cityId ?? "madrid"] ?? DEFAULT_OVERLAYS;
    const hasTraffic = overlays.traffic;
    const hasPopulation = overlays.population;
    const hasIncome = overlays.income;
    const hasLocationScore = overlays.locationScore;

    // Collapse overlay sections when they become unavailable (e.g. city switch)
    useEffect(() => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (!hasTraffic) next.delete('traffic');
            if (!hasPopulation) next.delete('population');
            if (!hasIncome) next.delete('income');
            return next.size !== prev.size ? next : prev;
        });
    }, [hasTraffic, hasPopulation, hasIncome]);

    // Local state for debounced sliders
    const [localRating, setLocalRating] = useState(ratingFilter);
    const [localScore, setLocalScore] = useState(scoreFilter);
    const [localTrafficHour, setLocalTrafficHour] = useState(trafficHour);
    const [localIncomeFilter, setLocalIncomeFilter] = useState(incomeWealthyFilter);
    const [localDensityFilter, setLocalDensityFilter] = useState(populationDensityFilter);

    // Sync local state when props change externally
    useEffect(() => {
        setLocalRating(ratingFilter);
    }, [ratingFilter]);

    useEffect(() => {
        setLocalScore(scoreFilter);
    }, [scoreFilter]);

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

    // Debounce score changes (150ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localScore !== scoreFilter) {
                onScoreChange?.(localScore);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [localScore, scoreFilter, onScoreChange]);

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

    // Reset EUCT filter to "all" when European Coffee Trip is unchecked
    useEffect(() => {
        if (!activeFilters.has("eu_coffee_trip") && euctFilter !== "all") {
            onEuctFilterChange?.("all");
        }
    }, [activeFilters, euctFilter, onEuctFilterChange]);

    // Reset property sub-filters to "all" when Places for rent is unchecked
    useEffect(() => {
        if (!activeFilters.has("property")) {
            if (propertyPostedFilter !== "all") onPropertyPostedFilterChange?.("all");
            if (propertyTransferFilter !== "all") onPropertyTransferFilterChange?.("all");
            if (propertyPriceChangeFilter !== "all") onPropertyPriceChangeFilterChange?.("all");
        }
    }, [activeFilters, propertyPostedFilter, propertyTransferFilter, propertyPriceChangeFilter, onPropertyPostedFilterChange, onPropertyTransferFilterChange, onPropertyPriceChangeFilterChange]);

    // Click outside handling is now done by MobilePanel

    // Toggle a main section (places, traffic)
    const toggleSection = (section: string) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
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

    const getCount = (key: string) => {
        if (!counts) return 0;
        return counts[key as keyof typeof counts] ?? 0;
    };

    // Only include filter IDs for categories that have data (count > 0)
    const visibleFilterIds = placeCategories.flatMap(cat => {
        if (cat.hasSubcategories && cat.subcategories) {
            return cat.subcategories
                .filter(sub => getCount(sub.countKey) > 0)
                .map(sub => sub.id);
        }
        return getCount(cat.countKey || cat.id) > 0 ? [cat.id] : [];
    });

    const handleSelectAll = () => {
        onFilterChange(new Set(visibleFilterIds));
        onShowHiddenPoisToggle?.(false);
    };

    const handleClearAll = () => {
        onFilterChange(new Set<string>());
        onShowHiddenPoisToggle?.(false);
    };

    const toggleCategoryExpand = (id: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Explicitly expand or collapse a category (used by checkbox to sync state)
    const setCategoryExpanded = (id: string, expanded: boolean) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (expanded) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    };

    const activeCount = activeFilters.size;
    const isAllSelected = visibleFilterIds.length > 0 && visibleFilterIds.every(id => activeFilters.has(id));
    const isNoneSelected = activeFilters.size === 0;

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

    // Collapsed button for desktop
    const collapsedButton = (
        <button
            onClick={open}
            className="glass w-9 h-9 rounded-lg border border-white/40 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-all duration-200"
            title="Open filters"
        >
            <Funnel className="w-[18px] h-[18px] text-zinc-500" />
        </button>
    );

    // Render using MobilePanel
    return (
        <MobilePanel
            isOpen={isOpen}
            onClose={close}
            desktopPosition={{ top: "24px", right: "24px" }}
            title="Filters"
            collapsedButton={collapsedButton}
            zIndex={60}
            snapPoint="full"
        >
            <ScrollArea className={cn("overflow-y-auto", isMobile ? "sidebar-scroll-height" : "max-h-[calc(100vh-48px)]")}>
                {/* Header - only on desktop */}
                {!isMobile && (
                    <div className="p-4 flex items-center justify-between border-b border-white/10">
                        <span className="text-sm font-bold text-zinc-900 font-heading">Filters</span>
                        <button
                            onClick={close}
                            className="w-7 h-7 rounded-md text-zinc-400 flex items-center justify-center bg-[rgba(0,0,0,0.04)] border border-[rgba(0,0,0,0.04)] hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                    {/* ===== PLACES SECTION ===== */}
                    <div className="border-b border-white/10">
                        {/* Places header row */}
                        <button
                            onClick={() => toggleSection('places')}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isPlacesExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900 font-heading">Places</span>
                            </div>
                            <span className="px-2.5 py-1 text-[11px] md:px-2 md:py-0.5 md:text-[10px] bg-zinc-900 text-white font-bold rounded-full">
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
                                        <div className="flex bg-zinc-300/60 rounded-lg p-1">
                                            <button
                                                onClick={handleSelectAll}
                                                className={cn(
                                                    "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all",
                                                    isAllSelected && !showHiddenPois
                                                        ? "bg-white text-zinc-900 shadow-sm"
                                                        : "text-zinc-500 hover:text-zinc-700"
                                                )}
                                            >
                                                Show All
                                            </button>
                                            <button
                                                onClick={handleClearAll}
                                                className={cn(
                                                    "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all",
                                                    isNoneSelected && !showHiddenPois
                                                        ? "bg-white text-zinc-900 shadow-sm"
                                                        : "text-zinc-500 hover:text-zinc-700"
                                                )}
                                            >
                                                Clear
                                            </button>
                                            {hiddenCount > 0 && (
                                                <button
                                                    onClick={() => {
                                                        onFilterChange(new Set<string>());
                                                        onShowHiddenPoisToggle?.(true);
                                                    }}
                                                    className={cn(
                                                        "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all",
                                                        showHiddenPois
                                                            ? "bg-white text-zinc-900 shadow-sm"
                                                            : "text-zinc-500 hover:text-zinc-700"
                                                    )}
                                                >
                                                    Hidden
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Category List */}
                                    <div className="p-3 space-y-1">
                                        {placeCategories.map((cat) => {
                                            const count = cat.hasSubcategories
                                                ? getCount("cafe")
                                                : getCount(cat.countKey || cat.id);

                                            if (count === 0) return null;

                                            const isActive = cat.hasSubcategories && cat.subcategories
                                                ? cat.subcategories.some(sub => activeFilters.has(sub.id))
                                                : activeFilters.has(cat.id);
                                            const isCatExpanded = expandedCategories.has(cat.id);
                                            const isExpandable = cat.hasSubcategories || cat.hasScoreControls;
                                            return (
                                                <div key={cat.id}>
                                                    <div
                                                        className="flex items-center justify-between py-2 md:py-1.5 px-2 rounded-lg hover:bg-black/10 transition-colors cursor-pointer group"
                                                        onClick={() => {
                                                        if (isExpandable) {
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
                                                                    // Toggle all subcategory filters, or single filter
                                                                    if (cat.hasSubcategories && cat.subcategories) {
                                                                        const newFilters = new Set(activeFilters);
                                                                        cat.subcategories.forEach(sub => {
                                                                            if (getCount(sub.countKey) === 0) return;
                                                                            if (checked) {
                                                                                newFilters.add(sub.id);
                                                                            } else {
                                                                                newFilters.delete(sub.id);
                                                                            }
                                                                        });
                                                                        onFilterChange(newFilters);
                                                                        if (checked && cat.id === "cafe") {
                                                                            onEuctFilterChange?.("all");
                                                                        }
                                                                    } else {
                                                                        handleToggle(cat.id, !!checked);
                                                                    }
                                                                    if (checked && cat.id === "property") {
                                                                        onPropertyPostedFilterChange?.("all");
                                                                        onPropertyTransferFilterChange?.("all");
                                                                        onPropertyPriceChangeFilterChange?.("all");
                                                                    }
                                                                    // Expand section when checked, collapse when unchecked
                                                                    if (isExpandable) {
                                                                        setCategoryExpanded(cat.id, !!checked);
                                                                    }
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="size-5 md:size-4 border-zinc-300 data-[state=checked]:bg-zinc-800 data-[state=checked]:border-zinc-800"
                                                            />
                                                            <span className={cn(
                                                                "text-sm font-medium",
                                                                isActive ? "text-zinc-900" : "text-zinc-500"
                                                            )}>
                                                                {cat.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-semibold text-zinc-400 bg-[rgba(0,0,0,0.04)] px-2 py-0.5 rounded-lg">
                                                                {count}
                                                            </span>
                                                            {isExpandable && (
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
                                                                <div className="ml-6 pl-3 border-l border-zinc-200/50 mt-1 mb-2 space-y-2 md:space-y-1">
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
                                                                        const baseCount = getCount(sub.countKey);
                                                                        if (baseCount === 0) return null;

                                                                        const subActive = activeFilters.has(sub.id);
                                                                        const isEuct = sub.id === "eu_coffee_trip";

                                                                        let subCountKey = sub.countKey;
                                                                        if (isEuct && euctFilter === "premium") {
                                                                            subCountKey = "premiumEuCoffeeTrip";
                                                                        } else if (isEuct && euctFilter === "new") {
                                                                            subCountKey = "newEuCoffeeTrip";
                                                                        }
                                                                        const subCount = getCount(subCountKey);

                                                                        return (
                                                                            <React.Fragment key={sub.id}>
                                                                                <div
                                                                                    className="flex items-center justify-between py-1.5 md:py-1 px-2 rounded hover:bg-black/10"
                                                                                >
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Checkbox
                                                                                            id={sub.id}
                                                                                            checked={subActive}
                                                                                            onCheckedChange={(checked) => handleToggle(sub.id, !!checked)}
                                                                                            className="size-5 md:size-3.5"
                                                                                        />
                                                                                        <label htmlFor={sub.id} className="text-[11px] font-medium text-zinc-900/70 cursor-pointer">
                                                                                            {sub.label}
                                                                                        </label>
                                                                                    </div>
                                                                                    <span className="text-[10px] text-zinc-400">
                                                                                        {subCount}
                                                                                    </span>
                                                                                </div>
                                                                                {/* EUCT sub-filter toggle: All / New / Premium */}
                                                                                {isEuct && (
                                                                                    <div
                                                                                        className="grid transition-[grid-template-rows] duration-200 ease-out"
                                                                                        style={{ gridTemplateRows: subActive ? '1fr' : '0fr' }}
                                                                                    >
                                                                                        <div className="overflow-hidden">
                                                                                            <div className="flex bg-zinc-300/60 rounded-lg p-1 mr-2 my-1">
                                                                                                {euctFilterOptions.map((opt) => (
                                                                                                    <button
                                                                                                        key={opt.value}
                                                                                                        onClick={() => onEuctFilterChange?.(opt.value)}
                                                                                                        className={cn(
                                                                                                            "flex-1 text-xs font-semibold px-3 py-1.5 rounded-md transition-all",
                                                                                                            euctFilter === opt.value
                                                                                                                ? "bg-white text-zinc-900 shadow-sm"
                                                                                                                : "text-zinc-500 hover:text-zinc-700"
                                                                                                        )}
                                                                                                    >
                                                                                                        {opt.label}
                                                                                                        <span className={cn(
                                                                                                            "ml-1.5 text-[10px] font-medium",
                                                                                                            euctFilter === opt.value
                                                                                                                ? "text-zinc-400"
                                                                                                                : "text-zinc-400/60"
                                                                                                        )}>
                                                                                                            {getCount(opt.countKey)}
                                                                                                        </span>
                                                                                                    </button>
                                                                                                ))}
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Score slider sub-panel for Places for rent */}
                                                    {cat.hasScoreControls && (
                                                        <div
                                                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                                                            style={{ gridTemplateRows: isCatExpanded ? '1fr' : '0fr' }}
                                                        >
                                                            <div className="overflow-hidden">
                                                                <div className="ml-6 pl-3 border-l border-zinc-200/50 mt-1 mb-2 space-y-2 md:space-y-1">
                                                                    <div className="py-2 pr-3">
                                                                        <div className="flex justify-between text-[10px] font-medium text-zinc-500 mb-2">
                                                                            <span>Min. Score</span>
                                                                            <span>{localScore} / 100</span>
                                                                        </div>
                                                                        <Slider
                                                                            value={[localScore]}
                                                                            onValueChange={([v]) => setLocalScore(v)}
                                                                            max={100}
                                                                            step={5}
                                                                        />
                                                                    </div>

                                                                    {/* Added filter */}
                                                                    <SegmentedFilterRow
                                                                        label="Added"
                                                                        options={propertyAddedOptions}
                                                                        value={propertyPostedFilter}
                                                                        onChange={onPropertyPostedFilterChange}
                                                                        counts={[getCount("property"), getCount("propertyLast7d")]}
                                                                    />

                                                                    {/* Transfer filter - only shown when city has transfer listings */}
                                                                    {getCount("propertyWithTransfer") > 0 && (
                                                                        <SegmentedFilterRow
                                                                            label="Transfer"
                                                                            options={propertyTransferOptions}
                                                                            value={propertyTransferFilter}
                                                                            onChange={onPropertyTransferFilterChange}
                                                                        />
                                                                    )}

                                                                    {/* Price Change filter */}
                                                                    <SegmentedFilterRow
                                                                        label="Price"
                                                                        options={propertyPriceChangeOptions}
                                                                        value={propertyPriceChangeFilter}
                                                                        onChange={onPropertyPriceChangeFilterChange}
                                                                        counts={[getCount("property"), getCount("propertyPriceChanged")]}
                                                                    />
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
                    {hasTraffic && (
                    <div className="border-b border-white/10">
                        <button
                            onClick={() => {
                                if (!isTrafficExpanded) {
                                    toggleSection('traffic');
                                    if (!trafficEnabled) {
                                        onTrafficToggle?.(true);
                                    }
                                } else {
                                    toggleSection('traffic');
                                }
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isTrafficExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900 font-heading">Traffic</span>
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTrafficToggle?.(!trafficEnabled);
                                }}
                                className={cn(
                                    "px-2.5 py-1 text-[11px] md:px-2 md:py-0.5 md:text-[10px] font-bold rounded-full cursor-pointer transition-colors",
                                    trafficEnabled
                                        ? "bg-green-100/50 text-green-700 hover:bg-green-200/50"
                                        : "bg-zinc-200/60 text-zinc-500 hover:bg-zinc-200"
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
                                                "relative inline-flex h-6 w-10 md:h-5 md:w-9 items-center rounded-full transition-colors",
                                                trafficValuesEnabled ? "bg-green-500" : "bg-zinc-300"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-5 w-5 md:h-4 md:w-4 transform rounded-full bg-white shadow-sm transition-transform",
                                                    trafficValuesEnabled ? "translate-x-4 md:translate-x-4" : "translate-x-0.5"
                                                )}
                                            />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    )}

                    {/* ===== POPULATION SECTION ===== */}
                    {hasPopulation && (
                    <div className="border-b border-white/10">
                        <button
                            onClick={() => {
                                if (!isPopulationExpanded) {
                                    toggleSection('population');
                                    if (!populationEnabled) {
                                        onPopulationToggle?.(true);
                                    }
                                } else {
                                    toggleSection('population');
                                }
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isPopulationExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900 font-heading">Population</span>
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPopulationToggle?.(!populationEnabled);
                                }}
                                className={cn(
                                    "px-2.5 py-1 text-[11px] md:px-2 md:py-0.5 md:text-[10px] font-bold rounded-full cursor-pointer transition-colors",
                                    populationEnabled
                                        ? "bg-green-100/50 text-green-700 hover:bg-green-200/50"
                                        : "bg-zinc-200/60 text-zinc-500 hover:bg-zinc-200"
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
                    )}

                    {/* ===== INCOME SECTION ===== */}
                    {hasIncome && (
                    <div>
                        <button
                            onClick={() => {
                                if (!isIncomeExpanded) {
                                    toggleSection('income');
                                    if (!incomeEnabled) {
                                        onIncomeToggle?.(true);
                                    }
                                } else {
                                    toggleSection('income');
                                }
                            }}
                            className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <ChevronRight className={cn(
                                    "w-4 h-4 text-zinc-500 transition-transform duration-200 ease-out",
                                    isIncomeExpanded && "rotate-90"
                                )} />
                                <span className="text-sm font-bold text-zinc-900 font-heading">Income</span>
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
                                    "px-2.5 py-1 text-[11px] md:px-2 md:py-0.5 md:text-[10px] font-bold rounded-full cursor-pointer transition-colors",
                                    incomeEnabled
                                        ? "bg-green-100/50 text-green-700 hover:bg-green-200/50"
                                        : "bg-zinc-200/60 text-zinc-500 hover:bg-zinc-200"
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
                    )}

                    {/* ===== LOCATION SCORE SECTION (only when city supports it) ===== */}
                    {hasLocationScore && (
                    <div className="border-b border-white/10">
                        <div
                            onClick={() => onGravityToggle?.(!gravityEnabled)}
                            className="w-full px-4 py-3 flex items-center justify-between transition-colors hover:bg-white/20 cursor-pointer"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-bold font-heading text-zinc-900">Location Score</span>
                                <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase bg-amber-100 text-amber-700">
                                    Beta
                                </span>
                            </div>
                            <span
                                className={cn(
                                    "px-2.5 py-1 text-[11px] md:px-2 md:py-0.5 md:text-[10px] font-bold rounded-full transition-colors",
                                    gravityEnabled
                                        ? "bg-green-100/50 text-green-700"
                                        : "bg-zinc-200/60 text-zinc-500"
                                )}
                            >
                                {gravityEnabled ? "On" : "Off"}
                            </span>
                        </div>
                    </div>
                    )}
                    {/* Bottom spacer for mobile scroll */}
                    <div className="h-24 md:h-0" />
            </ScrollArea>
        </MobilePanel>
    );
}
