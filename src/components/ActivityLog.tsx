"use client";

import React, { useRef, useEffect } from "react";
import { History, MapPin, Star, MessageSquare, Pencil, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

// Activity types for different actions
type ActivityType = "added" | "updated" | "commented" | "visited" | "rated" | "created";

interface ActivityItem {
    id: number;
    type: ActivityType;
    userName: string;
    action: string;
    target: {
        name: string;
        type: "cafe" | "property" | "area" | "poi";
        lat?: number;
        lon?: number;
    };
    time: string;
}

// Dummy data with Spanish names and clickable targets
const logs: ActivityItem[] = [
    {
        id: 1,
        type: "added",
        userName: "María García",
        action: "added new cafe",
        target: { name: "Café Comercial", type: "cafe", lat: 40.4268, lon: -3.7025 },
        time: "2m ago"
    },
    {
        id: 2,
        type: "visited",
        userName: "Carlos Rodríguez",
        action: "visited",
        target: { name: "Local Gran Vía 45", type: "property", lat: 40.4203, lon: -3.7058 },
        time: "15m ago"
    },
    {
        id: 3,
        type: "commented",
        userName: "Ana Martínez",
        action: "commented on",
        target: { name: "Toma Café", type: "cafe", lat: 40.4245, lon: -3.7067 },
        time: "32m ago"
    },
    {
        id: 4,
        type: "rated",
        userName: "Pablo Sánchez",
        action: "rated",
        target: { name: "HanSo Café", type: "cafe", lat: 40.4198, lon: -3.7012 },
        time: "1h ago"
    },
    {
        id: 5,
        type: "created",
        userName: "Lucía Fernández",
        action: "created area",
        target: { name: "Zona Malasaña Norte", type: "area", lat: 40.4280, lon: -3.7045 },
        time: "2h ago"
    },
    {
        id: 6,
        type: "updated",
        userName: "Diego López",
        action: "updated price for",
        target: { name: "Calle Fuencarral 78", type: "property", lat: 40.4256, lon: -3.7012 },
        time: "3h ago"
    },
    {
        id: 7,
        type: "visited",
        userName: "Elena Torres",
        action: "visited",
        target: { name: "Federal Café", type: "cafe", lat: 40.4231, lon: -3.7089 },
        time: "4h ago"
    },
    {
        id: 8,
        type: "commented",
        userName: "Javier Ruiz",
        action: "left feedback on",
        target: { name: "Misión Café", type: "cafe", lat: 40.4215, lon: -3.6998 },
        time: "5h ago"
    },
];

// Icon for each activity type
const ActivityIcon = ({ type }: { type: ActivityType }) => {
    const iconClass = "w-3.5 h-3.5";
    switch (type) {
        case "added":
            return <Plus className={cn(iconClass, "text-emerald-600")} />;
        case "updated":
            return <Pencil className={cn(iconClass, "text-blue-600")} />;
        case "commented":
            return <MessageSquare className={cn(iconClass, "text-purple-600")} />;
        case "visited":
            return <Eye className={cn(iconClass, "text-cyan-600")} />;
        case "rated":
            return <Star className={cn(iconClass, "text-amber-600")} />;
        case "created":
            return <MapPin className={cn(iconClass, "text-pink-600")} />;
        default:
            return <History className={cn(iconClass, "text-zinc-500")} />;
    }
};

// Custom event for map navigation
export const navigateToLocation = (lat: number, lon: number) => {
    window.dispatchEvent(new CustomEvent('navigate-to-location', {
        detail: { lat, lon }
    }));
};

export function ActivityLog() {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handle clicking on an activity row - navigates to location on map
    const handleActivityClick = (item: ActivityItem) => {
        if (item.target.lat && item.target.lon) {
            navigateToLocation(item.target.lat, item.target.lon);
            setIsExpanded(false); // Close panel after clicking
        }
    };

    // Collapsed state - just the history icon button (below pencil icon)
    // Uses z-40 so it appears below expanded filter panels (which use z-50)
    if (!isExpanded) {
        return (
            <div ref={panelRef} className="fixed top-[216px] right-6 z-40">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="glass w-10 h-10 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 transition-all duration-200 relative"
                    title="Activity log"
                >
                    <History className="w-5 h-5 text-zinc-700" />
                    {logs.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-900 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                            {logs.length}
                        </span>
                    )}
                </button>
            </div>
        );
    }

    // Expanded state - full panel with glassmorphism (light style like other panels)
    // Uses z-50 to appear above other collapsed icons
    return (
        <div ref={panelRef} className="fixed top-[216px] right-6 z-50">
            <div className="glass rounded-2xl overflow-hidden border border-white/40 w-80 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-zinc-700" />
                        <span className="text-sm font-bold text-zinc-900">Activity Log</span>
                    </div>
                    <span className="px-2 py-0.5 bg-zinc-100/50 text-zinc-600 text-[10px] font-bold rounded-full">
                        {logs.length} updates
                    </span>
                </div>

                {/* Log entries - scrollable */}
                <div className="max-h-[400px] overflow-y-auto">
                    {logs.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleActivityClick(item)}
                            className="p-3 border-b border-white/10 hover:bg-white/30 transition-colors cursor-pointer group"
                        >
                            <div className="flex items-start gap-2.5">
                                {/* Activity icon */}
                                <div className="mt-0.5">
                                    <ActivityIcon type={item.type} />
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] text-zinc-600">
                                        <span className="font-semibold text-zinc-900">{item.userName}</span>
                                        {" "}{item.action}{" "}
                                        <span className="font-medium text-zinc-800 group-hover:text-blue-600 transition-colors">
                                            {item.target.name}
                                        </span>
                                    </p>
                                    <span className="text-[10px] font-medium text-zinc-400 mt-0.5 block">
                                        {item.time}
                                    </span>
                                </div>

                                {/* Location indicator */}
                                {item.target.lat && (
                                    <MapPin className="w-3.5 h-3.5 text-zinc-300 group-hover:text-blue-500 transition-colors shrink-0 mt-0.5" />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
