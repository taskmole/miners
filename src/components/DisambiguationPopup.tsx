"use client";

import React from "react";
import {
    Coffee,
    Building2,
    Train,
    TrainFront,
    ShoppingBag,
    Users,
    GraduationCap,
    Home,
    ChevronRight,
} from "lucide-react";
import type { CafeData, PropertyData, OtherPoiData, LocationData } from "@/hooks/useMapData";

// Icon config matching EnhancedMapContainer
const iconConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
    cafe: { icon: Coffee, color: "text-sky-600", bg: "bg-sky-100" },
    eu_coffee_trip: { icon: Coffee, color: "text-blue-900", bg: "bg-blue-200" },
    property: { icon: Home, color: "text-[#78C500]", bg: "bg-[#78C500]/20" },
    transit: { icon: Train, color: "text-sky-700", bg: "bg-sky-50" },
    metro: { icon: TrainFront, color: "text-sky-600", bg: "bg-sky-100" },
    office: { icon: Building2, color: "text-purple-800", bg: "bg-purple-50" },
    shopping: { icon: ShoppingBag, color: "text-fuchsia-700", bg: "bg-fuchsia-50" },
    high_street: { icon: Users, color: "text-orange-700", bg: "bg-orange-50" },
    dorm: { icon: GraduationCap, color: "text-cyan-700", bg: "bg-cyan-50" },
    university: { icon: GraduationCap, color: "text-rose-700", bg: "bg-rose-50" },
};

// Get display info for a POI
function getPoiDisplayInfo(poi: LocationData): {
    icon: React.ElementType;
    bgColor: string;
    iconColor: string;
    typeLabel: string;
    name: string;
} {
    if (poi.type === "cafe") {
        const isEuCoffeeTrip = (poi as CafeData).link?.includes("europeancoffeetrip");
        const config = isEuCoffeeTrip ? iconConfig.eu_coffee_trip : iconConfig.cafe;
        return {
            icon: config.icon,
            bgColor: config.bg,
            iconColor: config.color,
            typeLabel: isEuCoffeeTrip ? "EU Coffee Trip" : "Cafe",
            name: poi.name,
        };
    }

    if (poi.type === "property") {
        const config = iconConfig.property;
        const prop = poi as PropertyData;
        return {
            icon: config.icon,
            bgColor: config.bg,
            iconColor: config.color,
            typeLabel: "Property",
            name: prop.title || prop.address,
        };
    }

    // Other POI types
    const otherPoi = poi as OtherPoiData;
    const config = iconConfig[otherPoi.type] || iconConfig.cafe;
    return {
        icon: config.icon,
        bgColor: config.bg,
        iconColor: config.color,
        typeLabel: otherPoi.category,
        name: otherPoi.name,
    };
}

interface DisambiguationItemProps {
    poi: LocationData;
    onClick: () => void;
    delay: number;
}

function DisambiguationItem({ poi, onClick, delay }: DisambiguationItemProps) {
    const { icon: Icon, bgColor, iconColor, typeLabel, name } = getPoiDisplayInfo(poi);

    return (
        <button
            onClick={onClick}
            style={{ animationDelay: `${delay}ms` }}
            className="disambiguation-item flex items-center gap-3 p-2.5 rounded-lg
                       hover:bg-zinc-100 active:bg-zinc-200
                       transition-colors duration-150 w-full text-left
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
            {/* Icon */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bgColor}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-zinc-900 truncate">{name}</div>
                <div className="text-xs text-zinc-500">{typeLabel}</div>
            </div>

            {/* Arrow */}
            <ChevronRight className="w-4 h-4 text-zinc-300 shrink-0" />
        </button>
    );
}

interface DisambiguationPopupProps {
    pois: LocationData[];
    onSelect: (poi: LocationData) => void;
}

export function DisambiguationPopup({ pois, onSelect }: DisambiguationPopupProps) {
    return (
        <div className="popup-base" style={{ width: 350 }}>
            {/* Header */}
            <div className="popup-header flex items-center justify-between">
                <span className="popup-name">Multiple places here</span>
                <span className="text-zinc-400 text-sm">{pois.length} places</span>
            </div>

            {/* Selectable list */}
            <div className="flex flex-col gap-1 p-3 pt-0">
                {pois.map((poi, index) => (
                    <DisambiguationItem
                        key={`${poi.type}-${index}`}
                        poi={poi}
                        onClick={() => onSelect(poi)}
                        delay={index * 50}
                    />
                ))}
            </div>
        </div>
    );
}
