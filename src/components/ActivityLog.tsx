"use client";

import React, { useCallback } from "react";
import { History, MapPin, Star, MessageSquare, Pencil, Plus, Eye, X, Activity, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSheetState, useSheet } from "@/contexts/SheetContext";
import { MobilePanel } from "@/components/ui/mobile-panel";
import { useMobile } from "@/hooks/useMobile";
import { useActivities, type ActivityType, type ActivityItem } from "@/hooks/useActivities";
import { navigateAndOpenPopup } from "@/components/ListsPanel";

// Icon config by activity type
const ACTIVITY_ICONS: Record<ActivityType | 'default', { icon: typeof Plus; color: string }> = {
    added: { icon: Plus, color: "text-emerald-600" },
    updated: { icon: Pencil, color: "text-blue-600" },
    commented: { icon: MessageSquare, color: "text-purple-600" },
    visited: { icon: Eye, color: "text-cyan-600" },
    rated: { icon: Star, color: "text-amber-600" },
    created: { icon: MapPin, color: "text-pink-600" },
    default: { icon: History, color: "text-zinc-500" },
};

const ActivityIcon = ({ type }: { type: ActivityType }) => {
    const { icon: Icon, color } = ACTIVITY_ICONS[type] || ACTIVITY_ICONS.default;
    return <Icon className={cn("w-3.5 h-3.5", color)} />;
};

// Reusable mark as read button
const MarkAsReadButton = ({ onClick }: { onClick: () => void }) => (
    <button
        onClick={onClick}
        className="px-2 py-1 rounded-md text-zinc-500 text-[10px] font-medium flex items-center gap-1 hover:bg-emerald-100 hover:text-emerald-600 active:bg-emerald-200 transition-colors"
    >
        <Check className="w-3.5 h-3.5" />
        Mark all as read
    </button>
);

// Custom event for map navigation
export const navigateToLocation = (lat: number, lon: number) => {
    window.dispatchEvent(new CustomEvent('navigate-to-location', {
        detail: { lat, lon }
    }));
};

export function ActivityLog() {
    const { isOpen: isExpanded, open, close } = useSheetState("activity");
    const { openSheet } = useSheet();
    const isMobile = useMobile();
    const { activities, isLoading, error, refetch, unreadCount, markAllAsRead } = useActivities();

    // Handle clicking an activity entry — navigate to the relevant location or panel
    const handleActivityClick = useCallback((item: ActivityItem) => {
        // List created → open Lists panel
        if (item.target.type === 'list' && item.type === 'created') {
            close();
            openSheet('lists');
            return;
        }

        // POI comment → search map data by placeId (no lat/lon stored in comments)
        if (item.type === 'commented' && item.entityId && !item.lat) {
            close();
            window.dispatchEvent(new CustomEvent('open-poi-popup', {
                detail: { placeId: item.entityId }
            }));
            return;
        }

        // Activity with lat/lon (from activity_log: list items, attachments, shapes)
        if (item.lat != null && item.lon != null) {
            close();
            if (item.entityId) {
                navigateAndOpenPopup(item.lat, item.lon, item.entityId);
            } else {
                navigateToLocation(item.lat, item.lon);
            }
            return;
        }
    }, [close, openSheet]);

    // Collapsed button
    const collapsedButton = (
        <button
            onClick={open}
            className="glass w-11 h-11 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-all duration-200 relative"
            title="Activity log"
        >
            <Activity className="w-5 h-5 text-zinc-500" />
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );

    return (
        <MobilePanel
            isOpen={isExpanded}
            onClose={close}
            desktopPosition={{ top: "248px", right: "24px" }}
            title="Activity Log"
            collapsedButton={collapsedButton}
            snapPoint="partial"
        >
            {/* Header - only on desktop */}
            {!isMobile && (
                <div className="p-4 flex items-center justify-between border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-zinc-700" />
                        <span className="text-sm font-bold text-zinc-900">Activity Log</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && <MarkAsReadButton onClick={markAllAsRead} />}
                        <button
                            onClick={close}
                            className="w-7 h-7 rounded-md text-zinc-400 flex items-center justify-center hover:bg-zinc-100 active:bg-zinc-200 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Mobile header with mark as read button - only shows when there are unreads */}
            {isMobile && unreadCount > 0 && (
                <div className="p-4 flex items-center justify-end">
                    <MarkAsReadButton onClick={markAllAsRead} />
                </div>
            )}

            {/* Loading state */}
            {isLoading && (
                <div className="p-8 flex flex-col items-center justify-center text-zinc-400">
                    <Loader2 className="w-5 h-5 animate-spin mb-2" />
                    <span className="text-xs">Loading activities...</span>
                </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
                <div className="p-8 flex flex-col items-center justify-center text-zinc-400">
                    <span className="text-xs text-red-500 mb-2">{error}</span>
                    <button onClick={refetch} className="text-xs text-blue-500 hover:underline">
                        Try again
                    </button>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && !error && activities.length === 0 && (
                <div className="p-8 flex flex-col items-center justify-center text-zinc-400">
                    <Activity className="w-8 h-8 mb-2 opacity-50" />
                    <span className="text-xs">No activities yet</span>
                    <span className="text-[10px] mt-1">Comments and lists will appear here</span>
                </div>
            )}

            {/* Log entries - scrollable */}
            {!isLoading && !error && activities.length > 0 && (
                <div className={cn("overflow-y-auto", isMobile ? "flex-1" : "max-h-[400px]")}>
                    {activities.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleActivityClick(item)}
                            className={cn(
                                "px-3 py-2.5 border-b border-zinc-100 transition-colors group cursor-pointer",
                                item.isRead
                                    ? "hover:bg-zinc-50"
                                    : "bg-red-50/50 hover:bg-red-50"
                            )}
                        >
                            <div className="flex items-start gap-2.5">
                                {/* Unread indicator */}
                                {!item.isRead && (
                                    <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                )}

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[12px] text-zinc-600">
                                        <span className="font-semibold text-zinc-900">{item.userName}</span>
                                        {" "}{item.action}{" "}
                                        <span className="font-medium text-zinc-800">
                                            {item.target.name}
                                        </span>
                                    </p>
                                    <span className="text-[10px] font-medium text-zinc-400 mt-0.5 block">
                                        {item.time}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </MobilePanel>
    );
}
