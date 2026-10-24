"use client";

import React, { useState, useEffect, useMemo } from "react";
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
    Dumbbell,
} from "lucide-react";
import { useHiddenPoisContext } from "@/contexts/HiddenPoisContext";
import { useSheetState } from "@/contexts/SheetContext";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MobilePanel, MobilePanelHeader } from "@/components/ui/mobile-panel";
import { SegmentedFilterRow } from "@/components/ui/segmented-filter";
import { useMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import type { EuctFilter, PropertyPostedFilter, PropertyTransferFilter, PropertyPriceChangeFilter, PropertyPitchStatusFilter } from "@/types/filters";
import { usePitchStatusContext } from "@/contexts/PitchStatusContext";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { generatePropertyPlaceId } from "@/lib/place-id";
import type { PropertyData } from "@/hooks/useMapData";

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
    propertyPitchStatusFilter?: PropertyPitchStatusFilter;
    /** The properties currently on the map, for the Mine / Scouted counts. */
    properties?: PropertyData[];
    onPropertyPitchStatusFilterChange?: (filter: PropertyPitchStatusFilter) => void;
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

const propertyPitchStatusOptions: { value: PropertyPitchStatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mine", label: "Mine" },
    { value: "scouted", label: "Scouted" },
];

/**
 * Desktop: a plain scrolling div that fills the panel under its header (Radix
 * ScrollArea needs a fixed height, which a screen-capped panel has not got).
 * Phones keep the ScrollArea sized to the sheet.
 */
function FiltersScroller({ isMobile, children }: { isMobile: boolean; children: React.ReactNode }) {
    return isMobile ? (
        <ScrollArea className="overflow-y-auto sidebar-scroll-height">
            <div className="px-2">{children}</div>
        </ScrollArea>
    ) : (
        <div className="mt-body">{children}</div>
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
    propertyPitchStatusFilter = "all",
    properties = [],
    onPropertyPitchStatusFilterChange,
}: SidebarProps) {
    // Get hidden POIs count from context
    const { hiddenCount } = useHiddenPoisContext();
    const { isAssignedToMe } = usePropertyAssignmentContext();
    const { getPitchStatus } = usePitchStatusContext();

    // "Mine" and "Scouted" counted over the properties actually on the map.
    // The contexts' own counters included delisted listings too, so the badge
    // could say "Mine 1" while the filter correctly showed nothing.
    const { mineCount, scoutedCount } = useMemo(() => {
        let mine = 0;
        let scouted = 0;
        for (const property of properties) {
            const placeId = generatePropertyPlaceId(property);
            if (isAssignedToMe(placeId)) mine++;
            if (getPitchStatus(placeId)) scouted++;
        }
        return { mineCount: mine, scoutedCount: scouted };
    }, [properties, isAssignedToMe, getPitchStatus]);

    // Use SheetContext for coordinated open/close
    const { isOpen, close } = useSheetState("filters");
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
            if (propertyPitchStatusFilter !== "all") onPropertyPitchStatusFilterChange?.("all");
        }
    }, [activeFilters, propertyPostedFilter, propertyTransferFilter, propertyPriceChangeFilter, propertyPitchStatusFilter, onPropertyPostedFilterChange, onPropertyTransferFilterChange, onPropertyPriceChangeFilterChange, onPropertyPitchStatusFilterChange]);

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

    // Make sure a map layer is switched on before one of its sub-filters runs.
    // Without this, sub-filter buttons (e.g. "Last 7d") can be clicked while the
    // layer is off, so they appear to do nothing because there's nothing on the
    // map to filter.
    const ensureLayerActive = (layerId: string) => {
        if (!activeFilters.has(layerId)) {
            const newFilters = new Set(activeFilters);
            newFilters.add(layerId);
            onFilterChange(newFilters);
        }
    };

    // Sub-filter handlers: turn the parent layer on, then apply the sub-filter.
    const handlePropertyPostedChange = (v: PropertyPostedFilter) => {
        ensureLayerActive("property");
        onPropertyPostedFilterChange?.(v);
    };
    const handlePropertyTransferChange = (v: PropertyTransferFilter) => {
        ensureLayerActive("property");
        onPropertyTransferFilterChange?.(v);
    };
    const handlePropertyPriceChangeChange = (v: PropertyPriceChangeFilter) => {
        ensureLayerActive("property");
        onPropertyPriceChangeFilterChange?.(v);
    };
    const handlePropertyPitchStatusChange = (v: PropertyPitchStatusFilter) => {
        ensureLayerActive("property");
        onPropertyPitchStatusFilterChange?.(v);
    };
    const handleEuctChange = (v: EuctFilter) => {
        ensureLayerActive("eu_coffee_trip");
        onEuctFilterChange?.(v);
    };

    // The cafe layer is split into sub-categories, so "turning it on" means
    // enabling whichever cafe sub-categories actually have data. Used by the
    // Min. Rating slider so dragging it always shows results.
    const ensureCafeLayerActive = () => {
        const subs = placeCategories.find(c => c.id === "cafe")?.subcategories ?? [];
        if (subs.some(s => activeFilters.has(s.id))) return;
        const newFilters = new Set(activeFilters);
        subs.forEach(s => {
            if (getCount(s.countKey) > 0) newFilters.add(s.id);
        });
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

    // Section header pill: "N active", or a layer's On/Off switch.
    const pillClass = (on: boolean) => cn("mt-pill is-sm", on && "is-on");

    // Render using MobilePanel
    return (
        <MobilePanel
            isOpen={isOpen}
            onClose={close}
            title="Filters"
            snapPoint="full"
        >
            <MobilePanelHeader title="Filters" onClose={close} />
            <FiltersScroller isMobile={isMobile}>
                    {/* ===== PLACES SECTION ===== */}
                    <div>
                        {/* Places header row */}
                        <button
                            onClick={() => toggleSection('places')}
                            className="mt-sec"
                        >
                            <div className="mt-sec-title">
                                <ChevronRight className={cn(isPlacesExpanded && "is-open")} aria-hidden />
                                Places
                            </div>
                            <span className="mt-pill is-sm is-dark">
                                {activeCount} active
                            </span>
                        </button>

                        {/* Places expanded content with smooth height animation */}
                        <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isPlacesExpanded ? '1fr' : '0fr' }}
                        >
                            <div className="overflow-hidden">
                                <div>
                                    {/* Segmented Toggle Controls: clear of the header above, a beat before the list */}
                                    <div className="px-2 pt-2 pb-3">
                                        <div className="mt-seg">
                                            <button
                                                onClick={handleSelectAll}
                                                className={cn(isAllSelected && !showHiddenPois && "is-on")}
                                            >
                                                Show all
                                            </button>
                                            <button
                                                onClick={handleClearAll}
                                                className={cn(isNoneSelected && !showHiddenPois && "is-on")}
                                            >
                                                Clear
                                            </button>
                                            {hiddenCount > 0 && (
                                                <button
                                                    onClick={() => {
                                                        onFilterChange(new Set<string>());
                                                        onShowHiddenPoisToggle?.(true);
                                                    }}
                                                    className={cn(showHiddenPois && "is-on")}
                                                >
                                                    Hidden
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Category List */}
                                    <div className="space-y-0.5 pb-2">
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
                                                        className="flex items-center justify-between min-h-10 px-2 py-1.5 rounded-xl sm:min-h-8 sm:py-1 sm:rounded-[8px] hover:bg-black/5 transition-colors cursor-pointer group"
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
                                                        <div className="flex items-center gap-3">
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
                                                                className="size-5 sm:size-4 border-zinc-300 data-[state=checked]:bg-zinc-800 data-[state=checked]:border-zinc-800"
                                                            />
                                                            <span className={cn(
                                                                "text-[14px] sm:text-[13.5px] font-medium",
                                                                isActive ? "text-zinc-900" : "text-zinc-500"
                                                            )}>
                                                                {cat.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12px] font-semibold text-zinc-500 tabular-nums">
                                                                {count}
                                                            </span>
                                                            {isExpandable && (
                                                                <ChevronRight className={cn(
                                                                    "w-4 h-4 text-zinc-400 transition-transform duration-200 ease-out",
                                                                    isCatExpanded && "rotate-90"
                                                                )} aria-hidden />
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
                                                                <div className="ml-[18px] pl-3 pr-2 border-l border-black/10 mt-1 mb-2 space-y-2">
                                                                    {/* Rating slider for cafes */}
                                                                    <div className="py-2">
                                                                        <div className="flex justify-between text-[12px] font-medium text-zinc-500 mb-2">
                                                                            <span>Min. Rating</span>
                                                                            <span>{localRating.toFixed(1)} ★</span>
                                                                        </div>
                                                                        <Slider
                                                                            value={[localRating]}
                                                                            onValueChange={([v]) => { ensureCafeLayerActive(); setLocalRating(v); }}
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
                                                                                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/5"
                                                                                >
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Checkbox
                                                                                            id={sub.id}
                                                                                            checked={subActive}
                                                                                            onCheckedChange={(checked) => handleToggle(sub.id, !!checked)}
                                                                                            className="size-5 sm:size-3.5"
                                                                                        />
                                                                                        <label htmlFor={sub.id} className="text-[13px] font-medium text-zinc-700 cursor-pointer">
                                                                                            {sub.label}
                                                                                        </label>
                                                                                    </div>
                                                                                    <span className="text-[12px] text-zinc-500 tabular-nums">
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
                                                                                            <div className="my-1">
                                                                                                <SegmentedFilterRow
                                                                                                    label="EU Coffee Trip cafes"
                                                                                                    hideLabel
                                                                                                    options={euctFilterOptions}
                                                                                                    value={euctFilter}
                                                                                                    onChange={handleEuctChange}
                                                                                                    counts={euctFilterOptions.map((opt) => getCount(opt.countKey))}
                                                                                                />
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
                                                                <div className="ml-[18px] pl-3 pr-2 border-l border-black/10 mt-1 mb-2 space-y-2">
                                                                    <div className="py-2">
                                                                        <div className="flex justify-between text-[12px] font-medium text-zinc-500 mb-2">
                                                                            <span>Min. Score</span>
                                                                            <span>{localScore} / 100</span>
                                                                        </div>
                                                                        <Slider
                                                                            value={[localScore]}
                                                                            onValueChange={([v]) => { ensureLayerActive("property"); setLocalScore(v); }}
                                                                            max={100}
                                                                            step={5}
                                                                        />
                                                                    </div>

                                                                    {/* Added filter */}
                                                                    <SegmentedFilterRow
                                                                        label="Added"
                                                                        options={propertyAddedOptions}
                                                                        value={propertyPostedFilter}
                                                                        onChange={handlePropertyPostedChange}
                                                                        counts={[getCount("property"), getCount("propertyLast7d")]}
                                                                    />

                                                                    {/* Transfer filter - only shown when city has transfer listings */}
                                                                    {getCount("propertyWithTransfer") > 0 && (
                                                                        <SegmentedFilterRow
                                                                            label="Transfer"
                                                                            options={propertyTransferOptions}
                                                                            value={propertyTransferFilter}
                                                                            onChange={handlePropertyTransferChange}
                                                                        />
                                                                    )}

                                                                    {/* Price Change filter */}
                                                                    <SegmentedFilterRow
                                                                        label="Price"
                                                                        options={propertyPriceChangeOptions}
                                                                        value={propertyPriceChangeFilter}
                                                                        onChange={handlePropertyPriceChangeChange}
                                                                        counts={[getCount("property"), getCount("propertyPriceChanged")]}
                                                                    />

                                                                    {/* Pitch Status filter */}
                                                                    <SegmentedFilterRow
                                                                        label="Status"
                                                                        options={propertyPitchStatusOptions}
                                                                        value={propertyPitchStatusFilter}
                                                                        onChange={handlePropertyPitchStatusChange}
                                                                        counts={[getCount("property"), mineCount, scoutedCount]}
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
                    <div>
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
                            className="mt-sec"
                        >
                            <div className="mt-sec-title">
                                <ChevronRight className={cn(isTrafficExpanded && "is-open")} aria-hidden />
                                Traffic
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTrafficToggle?.(!trafficEnabled);
                                }}
                                className={cn(pillClass(trafficEnabled), "cursor-pointer")}
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
                                <div className="px-2 pb-3 pt-1">
                                    <div className="flex justify-between text-[12px] font-medium text-zinc-500 mb-2">
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
                                    <div className="flex items-center justify-between mt-3">
                                        <span className="text-[13px] font-medium text-zinc-700">Show values</span>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={trafficValuesEnabled}
                                            aria-label="Show values"
                                            onClick={() => onTrafficValuesToggle?.(!trafficValuesEnabled)}
                                            className={cn(
                                                "relative inline-flex h-6 w-10 sm:h-5 sm:w-9 items-center rounded-full transition-colors",
                                                trafficValuesEnabled ? "bg-zinc-900" : "bg-black/15"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "inline-block h-5 w-5 sm:h-4 sm:w-4 transform rounded-full bg-white shadow-sm transition-transform",
                                                    trafficValuesEnabled ? "translate-x-4" : "translate-x-0.5"
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
                    <div>
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
                            className="mt-sec"
                        >
                            <div className="mt-sec-title">
                                <ChevronRight className={cn(isPopulationExpanded && "is-open")} aria-hidden />
                                Population
                            </div>
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPopulationToggle?.(!populationEnabled);
                                }}
                                className={cn(pillClass(populationEnabled), "cursor-pointer")}
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
                                <div className="px-2 pb-3 pt-1">
                                    <div className="flex justify-between text-[12px] font-medium text-zinc-500 mb-2">
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
                            className="mt-sec"
                        >
                            <div className="mt-sec-title">
                                <ChevronRight className={cn(isIncomeExpanded && "is-open")} aria-hidden />
                                Income
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
                                className={cn(pillClass(incomeEnabled), "cursor-pointer")}
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
                                <div className="px-2 pb-3 pt-1">
                                    <div className="flex justify-between text-[12px] font-medium text-zinc-500 mb-2">
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
                    <div>
                        <div
                            onClick={() => onGravityToggle?.(!gravityEnabled)}
                            className="mt-sec cursor-pointer"
                            role="switch"
                            aria-checked={gravityEnabled}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onGravityToggle?.(!gravityEnabled);
                                }
                            }}
                        >
                            <div className="mt-sec-title">
                                Location Score
                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full uppercase bg-amber-100 text-amber-800 mt-font">
                                    Beta
                                </span>
                            </div>
                            <span className={pillClass(gravityEnabled)}>
                                {gravityEnabled ? "On" : "Off"}
                            </span>
                        </div>
                    </div>
                    )}
                    {/* Bottom spacer for mobile scroll */}
                    <div className="h-24 sm:h-0" />
            </FiltersScroller>
        </MobilePanel>
    );
}
