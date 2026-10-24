"use client";

import React, { useCallback, useMemo } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSheetState, useSheet } from "@/contexts/SheetContext";
import { MobilePanel, MobilePanelHeader, PanelEmpty } from "@/components/ui/mobile-panel";
import { LoadingOrb } from "@/components/LoadingOrb";
import { useActivities, type ActivityItem } from "@/hooks/useActivities";
import { navigateAndOpenPopup } from "@/components/ListsPanel";
import { useShapeDataContext } from "@/contexts/ShapeDataContext";
import { useToast } from "@/contexts/ToastContext";

// Custom event for map navigation
export const navigateToLocation = (lat: number, lon: number) => {
    window.dispatchEvent(new CustomEvent('navigate-to-location', {
        detail: { lat, lon }
    }));
};

export function ActivityLog({ onUnreadCountChange }: { onUnreadCountChange?: (count: number) => void }) {
    const { isOpen: isExpanded, close } = useSheetState("activity");
    const { openSheet } = useSheet();
    const { activities, isLoading, error, refetch, unreadCount, markAllAsRead } = useActivities();
    const { allMetadata, isMetadataLoaded } = useShapeDataContext();
    const { showToast } = useToast();

    // Drives the glow on the Activity button: on while anything is unread.
    React.useEffect(() => {
        onUnreadCountChange?.(unreadCount);
    }, [unreadCount, onUnreadCountChange]);

    // Refetch when panel opens
    React.useEffect(() => {
        if (isExpanded) refetch();
    }, [isExpanded, refetch]);

    const activitiesWithOrphanStatus = useMemo(() => {
        if (!isMetadataLoaded) return activities;
        return activities.map(item => {
            if (
                (item.actionType === 'created_point' || item.actionType === 'created_area') &&
                item.entityId &&
                !(item.entityId in allMetadata)
            ) {
                return { ...item, isOrphaned: true };
            }
            return item;
        });
    }, [activities, allMetadata, isMetadataLoaded]);

    // Check if an activity entry has a navigable target
    const isNavigable = useCallback((item: ActivityItem): boolean => {
        if (item.isOrphaned) return false;
        if (item.target.type === 'list' && item.type === 'created') return true;
        if (item.lat != null && item.lon != null) return true;
        if (item.entityId) return true;
        return false;
    }, []);

    // Handle clicking an activity entry — navigate to the relevant location or panel
    const handleActivityClick = useCallback((item: ActivityItem) => {
        if (item.isOrphaned) {
            showToast('This point has been deleted', 'error');
            return;
        }
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
                // Extract placeType from entityId (format: "type-lat-lon") so the filter auto-enables
                const placeType = item.entityId.split('-')[0];
                navigateAndOpenPopup(item.lat, item.lon, item.entityId, placeType);
            } else {
                navigateToLocation(item.lat, item.lon);
            }
            return;
        }

        // Fallback: any item with a placeId-style entityId — try to find it on the map
        if (item.entityId) {
            close();
            window.dispatchEvent(new CustomEvent('open-poi-popup', {
                detail: { placeId: item.entityId }
            }));
            return;
        }
    }, [close, openSheet, showToast]);

    return (
        <MobilePanel
            isOpen={isExpanded}
            onClose={close}
            title="Activity"
            snapPoint="partial"
        >
            <MobilePanelHeader title="Activity" onClose={close}>
                {unreadCount > 0 && (
                    <button type="button" onClick={markAllAsRead} className="mt-pill">
                        Mark all read
                    </button>
                )}
            </MobilePanelHeader>

            <div className="mt-body">
                {isLoading && activitiesWithOrphanStatus.length === 0 ? (
                    <div className="p-4 flex justify-center"><LoadingOrb label="Loading activity" /></div>
                ) : error && !isLoading ? (
                    <div className="mt-empty">
                        <p className="mt-empty-title">{error}</p>
                        <button type="button" onClick={refetch} className="mt-pill mt-2">
                            Try again
                        </button>
                    </div>
                ) : activitiesWithOrphanStatus.length === 0 ? (
                    <PanelEmpty
                        icon={History}
                        title="No activity yet"
                        hint="Comments and lists will appear here"
                    />
                ) : (
                    activitiesWithOrphanStatus.map((item) => {
                        const navigable = isNavigable(item);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => handleActivityClick(item)}
                                className={cn(
                                    "mt-act",
                                    navigable && "is-link",
                                    item.isOrphaned && "opacity-50",
                                    !item.isRead && !item.isOrphaned && "is-unread",
                                )}
                            >
                                <b>{item.userName}</b> {item.action} <b>{item.target.name}</b>
                                {item.isOrphaned && <span className="ml-1 text-red-600">(deleted)</span>}
                                <span className="mt-when">{item.time}</span>
                            </button>
                        );
                    })
                )}
            </div>
        </MobilePanel>
    );
}
