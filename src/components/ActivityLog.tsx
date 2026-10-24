"use client";

import React, { useCallback, useMemo } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSheetState, useSheet } from "@/contexts/SheetContext";
import { MobilePanel, MobilePanelHeader, PanelEmpty } from "@/components/ui/mobile-panel";
import { LoadingOrb } from "@/components/LoadingOrb";
import { useActivities, type ActivityItem } from "@/hooks/useActivities";
import { useShapeDataContext } from "@/contexts/ShapeDataContext";
import { useToast } from "@/contexts/ToastContext";
import { goToPlace } from "@/lib/go-to-place";
import { activityDestination } from "@/lib/activity-destination";

export function ActivityLog({
    onUnreadCountChange,
    onOpenTrip,
}: {
    onUnreadCountChange?: (count: number) => void;
    /** Opens the trip and returns true, or explains why not and returns false. */
    onOpenTrip?: (tripId: string) => boolean;
}) {
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
            if (item.shapeId && !(item.shapeId in allMetadata)) {
                return { ...item, isOrphaned: true };
            }
            return item;
        });
    }, [activities, allMetadata, isMetadataLoaded]);

    // Rows that lead somewhere get link styling; the rest explain on click
    const isNavigable = useCallback((item: ActivityItem): boolean =>
        activityDestination(item).kind !== 'message', []);

    // Every click either goes somewhere or says why it can't
    const handleActivityClick = useCallback((item: ActivityItem) => {
        const destination = activityDestination(item);
        switch (destination.kind) {
            case 'message':
                showToast(destination.text, 'error');
                return;
            case 'lists':
                close();
                openSheet('lists');
                return;
            case 'trip':
                if (onOpenTrip?.(destination.tripId)) close();
                return;
            case 'place':
                close();
                goToPlace(destination.request);
        }
    }, [close, openSheet, showToast, onOpenTrip]);

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
