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
    Dumbbell,
    ChevronRight,
} from "lucide-react";
import type { CafeData, PropertyData, OtherPoiData, LocationData } from "@/hooks/useMapData";
import { scoreTier, SCORE_TIER_COLORS, SCORE_TIER_LABELS } from "@/lib/gravity-lookup";

function formatRent(price: number, source: string): string {
    if (price <= 0) return "";
    if (source === "sreality") {
        return price >= 1000 ? `${Math.round(price / 1000)}k Kč` : `${price} Kč`;
    }
    return price >= 1000 ? `€${(price / 1000).toFixed(1).replace(/\.0$/, "")}k/mo` : `€${price}/mo`;
}

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
    gym: { icon: Dumbbell, color: "text-lime-700", bg: "bg-lime-50" },
};

// Get display info for a POI
function getPoiDisplayInfo(poi: LocationData): {
    icon: React.ElementType;
    bgColor: string;
    iconColor: string;
    typeLabel: string;
    richSubtitle?: { tier: string; tierColor: string; size: string; rent: string };
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
        const hasScore = prop.score != null && prop.score > 0;
        const tier = hasScore ? scoreTier(prop.score!) : null;
        return {
            icon: config.icon,
            bgColor: config.bg,
            iconColor: config.color,
            typeLabel: "Property",
            richSubtitle: {
                tier: tier ? SCORE_TIER_LABELS[tier] : "",
                tierColor: tier ? SCORE_TIER_COLORS[tier] : "",
                size: prop.size > 0 ? `${prop.size} m²` : "",
                rent: formatRent(prop.price, prop.source),
            },
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
    const { icon: Icon, bgColor, iconColor, typeLabel, richSubtitle, name } = getPoiDisplayInfo(poi);

    return (
        <button
            onClick={onClick}
            style={{ animationDelay: `${delay}ms` }}
            className="disambiguation-item flex items-center gap-3 p-3 md:p-2.5 min-h-[48px] md:min-h-0 rounded-lg
                       hover:bg-zinc-100 active:bg-zinc-200
                       transition-colors duration-150 w-full text-left
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bgColor}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-zinc-900 truncate">{name}</div>
                {richSubtitle ? (
                    <div className="flex items-center gap-1.5 text-xs">
                        {richSubtitle.tier && (
                            <span style={{ color: richSubtitle.tierColor }} className="font-medium">
                                {richSubtitle.tier}
                            </span>
                        )}
                        {richSubtitle.size && (
                            <>
                                <span className="text-zinc-300 text-base leading-none font-bold">·</span>
                                <span className="text-zinc-500">{richSubtitle.size}</span>
                            </>
                        )}
                        {richSubtitle.rent && (
                            <>
                                <span className="text-zinc-300 text-base leading-none font-bold">·</span>
                                <span className="text-zinc-500">{richSubtitle.rent}</span>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="text-xs text-zinc-500">{typeLabel}</div>
                )}
            </div>

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
        <div className="popup-base">
            {/* Header */}
            <div className="popup-header flex items-center justify-between !pr-6">
                <span className="popup-name">Multiple places here</span>
                <span className="text-zinc-400 text-sm">{pois.length} places</span>
            </div>

            {/* Selectable list */}
            <div className="flex flex-col gap-1 p-3 pt-1.5">
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
