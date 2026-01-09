"use client";

import React from "react";
import {
    Coffee,
    Train,
    Building2,
    ShoppingBag,
    Users,
    GraduationCap,
    Home,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SidebarProps {
    counts?: {
        cafe: number;
        euCoffeeTrip: number;
        regularCafe: number;
        property: number;
        transit: number;
        office: number;
        shopping: number;
        high_street: number;
        dorm: number;
        university: number;
    };
    activeFilters: Set<string>;
    onFilterChange: (filters: Set<string>) => void;
    trafficEnabled?: boolean;
    onTrafficToggle?: (enabled: boolean) => void;
    populationEnabled?: boolean;
    onPopulationToggle?: (enabled: boolean) => void;
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
    { id: "property", label: "Property", icon: Home, countKey: "property" },
    { id: "transit", label: "Train Station", icon: Train, countKey: "transit" },
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
    trafficEnabled = false,
    onTrafficToggle,
    populationEnabled = false,
    onPopulationToggle,
    trafficHour = 12,
    onTrafficHourChange,
}: SidebarProps) {
    const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set(["cafe"]));
    const [ratingFilter, setRatingFilter] = React.useState(0);

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
            ...placeCategories.map(c => c.id),
            "eu_coffee_trip",
            "regular_cafe"
        ]);
        onFilterChange(allFilters);
    };

    const handleClearAll = () => {
        onFilterChange(new Set<string>());
    };

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedCategories(newExpanded);
    };

    const activeCount = activeFilters.size;

    const getCount = (key: string) => {
        if (!counts) return 0;
        return counts[key as keyof typeof counts] ?? 0;
    };

    return (
        <div className="fixed top-6 right-6 z-50 w-80 max-h-[calc(100vh-48px)] flex flex-col gap-3">
            {/* Places Section */}
            <div className="glass rounded-2xl overflow-hidden border border-white/40 flex flex-col">
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-white/10">
                    <h2 className="text-sm font-bold text-zinc-900">Places</h2>
                    <span className="px-2 py-0.5 bg-green-100/50 text-green-700 text-[10px] font-bold rounded-full">
                        {activeCount} active
                    </span>
                </div>

                {/* Controls */}
                <div className="px-4 py-2 flex gap-2 border-b border-white/10">
                    <button
                        onClick={handleSelectAll}
                        className="text-[10px] font-bold px-2.5 py-1 bg-white/30 rounded-lg hover:bg-white/50 transition-colors"
                    >
                        SELECT ALL
                    </button>
                    <button
                        onClick={handleClearAll}
                        className="text-[10px] font-bold px-2.5 py-1 bg-white/30 rounded-lg hover:bg-white/50 transition-colors"
                    >
                        CLEAR ALL
                    </button>
                </div>

                {/* Category List */}
                <ScrollArea className="max-h-[280px]">
                    <div className="p-3 space-y-1">
                        {placeCategories.map((cat) => {
                            const isActive = activeFilters.has(cat.id);
                            const isExpanded = expandedCategories.has(cat.id);
                            const count = cat.hasSubcategories
                                ? getCount("cafe")
                                : getCount(cat.countKey || cat.id);

                            return (
                                <div key={cat.id}>
                                    <div
                                        className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/30 transition-colors cursor-pointer group"
                                        onClick={() => cat.hasSubcategories && toggleExpand(cat.id)}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Checkbox
                                                id={cat.id}
                                                checked={isActive}
                                                onCheckedChange={(checked) => {
                                                    handleToggle(cat.id, !!checked);
                                                    // Also toggle subcategories
                                                    if (cat.hasSubcategories && cat.subcategories) {
                                                        cat.subcategories.forEach(sub => {
                                                            handleToggle(sub.id, !!checked);
                                                        });
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
                                                isExpanded
                                                    ? <ChevronDown className="w-4 h-4 text-zinc-400" />
                                                    : <ChevronRight className="w-4 h-4 text-zinc-400" />
                                            )}
                                        </div>
                                    </div>

                                    {/* Subcategories */}
                                    {cat.hasSubcategories && isExpanded && cat.subcategories && (
                                        <div className="ml-6 pl-3 border-l border-zinc-200/50 mt-1 mb-2 space-y-1">
                                            {/* Rating slider for cafes */}
                                            <div className="py-2 pr-3">
                                                <div className="flex justify-between text-[10px] font-medium text-zinc-500 mb-2">
                                                    <span>Min. Rating</span>
                                                    <span>{ratingFilter.toFixed(1)} ★</span>
                                                </div>
                                                <Slider
                                                    value={[ratingFilter]}
                                                    onValueChange={([v]) => setRatingFilter(v)}
                                                    max={5}
                                                    step={0.5}
                                                    className="[&_[role=slider]]:h-2.5 [&_[role=slider]]:w-2.5"
                                                />
                                            </div>

                                            {cat.subcategories.map((sub) => {
                                                const subActive = activeFilters.has(sub.id);
                                                const subCount = getCount(sub.countKey);

                                                return (
                                                    <div
                                                        key={sub.id}
                                                        className="flex items-center justify-between py-1 px-2 rounded hover:bg-white/20"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                id={sub.id}
                                                                checked={subActive}
                                                                onCheckedChange={(checked) => handleToggle(sub.id, !!checked)}
                                                                className="w-3.5 h-3.5"
                                                            />
                                                            <label htmlFor={sub.id} className="text-[11px] font-medium text-zinc-600 cursor-pointer">
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
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </div>

            {/* Traffic Section */}
            <div className="glass rounded-2xl overflow-hidden border border-white/40">
                <div className="p-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-900">Traffic</h2>
                    <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded-full",
                        trafficEnabled
                            ? "bg-green-100/50 text-green-700"
                            : "text-zinc-400"
                    )}>
                        {trafficEnabled ? "On" : "Off"}
                    </span>
                </div>

                <div className="px-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600">Values</span>
                        <Switch
                            checked={trafficEnabled}
                            onCheckedChange={onTrafficToggle}
                        />
                    </div>

                    {trafficEnabled && (
                        <div className="space-y-2">
                            <div className="flex justify-between text-[10px] font-medium text-zinc-500">
                                <span>Hour of the day</span>
                                <span>{trafficHour}:00</span>
                            </div>
                            <Slider
                                value={[trafficHour]}
                                onValueChange={([v]) => onTrafficHourChange?.(v)}
                                max={23}
                                min={0}
                                step={1}
                                className="[&_[role=slider]]:h-3 [&_[role=slider]]:w-3"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Population Section */}
            <div className="glass rounded-2xl overflow-hidden border border-white/40">
                <div className="p-4 flex items-center justify-between">
                    <h2 className="text-sm font-bold text-zinc-900">Population</h2>
                    <span className={cn(
                        "px-2 py-0.5 text-[10px] font-bold rounded-full",
                        populationEnabled
                            ? "bg-green-100/50 text-green-700"
                            : "text-zinc-400"
                    )}>
                        {populationEnabled ? "On" : "Off"}
                    </span>
                </div>

                <div className="px-4 pb-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600">Density overlay</span>
                        <Switch
                            checked={populationEnabled}
                            onCheckedChange={onPopulationToggle}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
