"use client";

import React, { useMemo, useState } from "react";
import {
    Bookmark,
    MoreHorizontal,
    Plus,
    Trash2,
    Pencil,
    ChevronRight,
    X,
    Calendar,
    Cloud,
    Users,
    MessageSquare,
    GripVertical,
    FileSpreadsheet,
    FileDown,
    Route,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useListsContext } from "@/contexts/ListsContext";
import { useScoutingTripsContext } from "@/contexts/ScoutingTripsContext";
import { useSheetState } from "@/contexts/SheetContext";
import { useToast } from "@/contexts/ToastContext";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";
import { usePitchStatusContext } from "@/contexts/PitchStatusContext";
import { useTeamsContext } from "@/contexts/TeamsContext";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { evaluatePropertyActions } from "@/lib/property-actions";
import { parseCoordinatesFromPlaceId } from "@/lib/place-id";
import { cityForCoordinates } from "@/lib/notify-routing";
import { MobilePanel, MobilePanelHeader, PanelEmpty } from "@/components/ui/mobile-panel";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import type { LinkedItem, ScoutingTrip } from "@/types/scouting";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { LocationList, ListItem, VisitLog } from "@/types/lists";

// Custom event to navigate to location AND open popup
// Also includes placeType so the filter can be enabled if needed
export const navigateAndOpenPopup = (lat: number, lon: number, placeId: string, placeType?: string) => {
    window.dispatchEvent(new CustomEvent('navigate-and-open-popup', {
        detail: { lat, lon, placeId, placeType }
    }));
};

// Export a list as CSV file
function exportListAsCSV(list: LocationList): void {
    const headers = ['Name', 'Address', 'Type', 'Latitude', 'Longitude', 'Added', 'Visit Date', 'Visit Time', 'Weather', 'Traffic', 'Notes'];
    const visitPlan = list.visitPlan || {};

    const rows = list.items.map(item => [
        `"${item.placeName.replace(/"/g, '""')}"`,
        `"${item.placeAddress.replace(/"/g, '""')}"`,
        item.placeType,
        item.lat.toString(),
        item.lon.toString(),
        item.addedAt.split('T')[0],
        visitPlan.visitDate || '',
        visitPlan.visitTime || '',
        `"${(visitPlan.weather || '').replace(/"/g, '""')}"`,
        `"${(visitPlan.trafficObservation || '').replace(/"/g, '""')}"`,
        `"${(visitPlan.comments || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${list.name.replace(/[^a-z0-9]/gi, '_')}_export.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// Export a list as PDF file (simple text-based PDF without external deps)
async function exportListAsPDF(list: LocationList): Promise<void> {
    // Dynamic import of jspdf to avoid SSR issues
    const { default: jsPDF } = await import('jspdf');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Try to add logo
    try {
        const logoImg = new window.Image();
        logoImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            logoImg.onload = () => resolve();
            logoImg.onerror = () => reject();
            logoImg.src = '/logo-black.png';
        });
        const logoWidth = 40;
        const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
        doc.addImage(logoImg, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
        y += logoHeight + 10;
    } catch {
        // Logo failed to load, continue without it
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('THE MINERS', pageWidth / 2, y, { align: 'center' });
        y += 10;
    }

    // List name
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`List: ${list.name}`, pageWidth / 2, y, { align: 'center' });
    y += 8;

    // Date
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' });
    y += 15;

    // Locations header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('LOCATIONS', 20, y);
    y += 2;
    doc.setLineWidth(0.5);
    doc.line(20, y, pageWidth - 20, y);
    y += 8;

    // Table header
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Name', 20, y);
    doc.text('Address', 80, y);
    doc.text('Type', 160, y);
    y += 6;

    // Items
    doc.setFont('helvetica', 'normal');
    for (const item of list.items) {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }
        const name = item.placeName.length > 25 ? item.placeName.substring(0, 25) + '...' : item.placeName;
        const address = item.placeAddress.length > 35 ? item.placeAddress.substring(0, 35) + '...' : item.placeAddress;
        doc.text(name, 20, y);
        doc.text(address, 80, y);
        doc.text(item.placeType, 160, y);
        y += 6;
    }

    // Visit plan section if exists
    const visitPlan = list.visitPlan;
    if (visitPlan && (visitPlan.visitDate || visitPlan.comments)) {
        y += 10;
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('VISIT PLAN', 20, y);
        y += 2;
        doc.line(20, y, pageWidth - 20, y);
        y += 8;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        if (visitPlan.visitDate) {
            const dateStr = visitPlan.visitTime
                ? `${visitPlan.visitDate} at ${visitPlan.visitTime}`
                : visitPlan.visitDate;
            doc.text(`Date: ${dateStr}`, 20, y);
            y += 6;
        }
        if (visitPlan.weather) {
            doc.text(`Weather: ${visitPlan.weather}`, 20, y);
            y += 6;
        }
        if (visitPlan.trafficObservation) {
            doc.text(`Traffic: ${visitPlan.trafficObservation}`, 20, y);
            y += 6;
        }
        if (visitPlan.comments) {
            const lines = doc.splitTextToSize(`Notes: ${visitPlan.comments}`, pageWidth - 40);
            doc.text(lines, 20, y);
        }
    }

    doc.save(`${list.name.replace(/[^a-z0-9]/gi, '_')}_export.pdf`);
}

interface ListsPanelProps {
    cityId?: string;
    onCreateTripFromList?: (trip: ScoutingTrip) => void;
}

/**
 * Your own lists first, then your team's, then anyone else's. Without this the
 * server order interleaves them and the panel becomes exactly the confusing
 * mess that showing other people's lists is meant to avoid.
 */
const ACCESS_ORDER: Record<string, number> = { own: 0, team: 1, readonly: 2 };

export function ListsPanel({ cityId, onCreateTripFromList }: ListsPanelProps) {
    const {
        lists,
        isLoaded,
        createList,
        deleteList,
        renameList,
        removeItem,
        removeDrawnArea,
        updateVisitPlan,
        reorderItems,
    } = useListsContext();

    const {
        createTrip,
        updateTrip,
        addLinkedItem,
    } = useScoutingTripsContext();

    const { showToast } = useToast();
    const { canApproveIn, users } = useUserProfiles();
    const { teams } = useTeamsContext();
    const { getAssignment, isAssignedToMe } = usePropertyAssignmentContext();
    const { getPitchStatus } = usePitchStatusContext();

    /**
     * Starting a trip from a list has to obey the same rules as starting one
     * from the property popup. Without this, "add to list" would be a way
     * around them: bookmark a property you may not scout, then create the trip
     * from the list instead. Non-property list entries are unaffected.
     */
    const blockedReason = (item: ListItem | null): string | null => {
        if (!item || item.placeType !== "property") return null;
        const a = getAssignment(item.placeId);
        // Approving is per city now, so "am I an admin here" has to be asked
        // of this property's city rather than of the person in general. A
        // saved list can hold properties from anywhere, which is precisely
        // why this call site is easy to get wrong: an Approver in Madrid
        // would otherwise get admin treatment on a Prague property they
        // cannot act on. The city comes from the coordinates in the place id,
        // the same source the notification routing uses.
        const coords = parseCoordinatesFromPlaceId(item.placeId);
        const cityId = coords ? cityForCoordinates(coords.lat, coords.lon) : null;
        const actions = evaluatePropertyActions({
            isAdmin: cityId ? canApproveIn(cityId) : false,
            isPreRejected: a?.status === "pre_rejected",
            rejectionReason: a?.rejection_reason ?? null,
            hasAssignment: !!a && a.status !== "pre_rejected",
            isAssignedToMe: isAssignedToMe(item.placeId),
            assigneeLabel: null,
            pitchStatus: getPitchStatus(item.placeId),
            hasPendingRequest: false,
            wasRejectedForMe: false,
        });
        return actions.showCreateTrip ? null : (actions.caption || "You can't scout this property");
    };

    // Use SheetContext for coordinated open/close
    const { isOpen: isExpanded, close } = useSheetState("lists");

    const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
    const [expandedVisitPlans, setExpandedVisitPlans] = useState<Set<string>>(new Set());

    // Dialog states
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isPropertyPickerOpen, setIsPropertyPickerOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [selectedListForTrip, setSelectedListForTrip] = useState<LocationList | null>(null);
    const [newListName, setNewListName] = useState("");

    // Drag and drop state
    const [draggedItem, setDraggedItem] = useState<{ listId: string; index: number } | null>(null);

    // Toggle list expansion
    const toggleListExpanded = (listId: string) => {
        setExpandedLists(prev => {
            const next = new Set(prev);
            if (next.has(listId)) {
                next.delete(listId);
            } else {
                next.add(listId);
            }
            return next;
        });
    };

    const sortedLists = useMemo(
        // Stable sort, so the server's order survives inside each group.
        () => [...lists].sort(
            (a, b) => (ACCESS_ORDER[a.access ?? 'own'] ?? 0) - (ACCESS_ORDER[b.access ?? 'own'] ?? 0)
        ),
        [lists],
    );

    /** Whose list this is, using the app-wide name convention. */
    const ownerLabel = (list: LocationList): string | null => {
        if (list.access !== 'readonly' || !list.createdBy) return null;
        const owner = users.find(u => u.id === list.createdBy);
        return owner?.display_name || owner?.email || list.createdBy.slice(0, 8);
    };

    /** The team's own name, rather than the word "Team". */
    const teamLabel = (list: LocationList): string | null => {
        if (!list.teamId) return null;
        return teams.find(t => t.id === list.teamId)?.name ?? null;
    };

    // Toggle visit plan expansion for a list
    const toggleVisitPlanExpanded = (listId: string) => {
        setExpandedVisitPlans(prev => {
            const next = new Set(prev);
            if (next.has(listId)) {
                next.delete(listId);
            } else {
                next.add(listId);
            }
            return next;
        });
    };

    // Handle creating a new list
    const handleCreateList = () => {
        if (!newListName.trim()) return;
        createList(newListName.trim());
        setNewListName("");
        setIsCreateDialogOpen(false);
    };

    // Handle renaming a list
    const handleRenameList = () => {
        if (!selectedListId || !newListName.trim()) return;
        renameList(selectedListId, newListName.trim());
        setNewListName("");
        setIsRenameDialogOpen(false);
        setSelectedListId(null);
    };

    const handleDeleteList = () => {
        if (!selectedListId) return;
        const targetId = selectedListId;
        setIsDeleteDialogOpen(false);
        setSelectedListId(null);
        const ok = deleteList(targetId);
        if (!ok) {
            showToast("Couldn't delete this list. Please refresh and try again.", 'error');
        }
    };

    // Handle creating a scouting trip from a list
    const handleCreateTripFromList = (list: LocationList) => {
        if (!cityId) return;

        const totalItems = list.items.length + (list.drawnAreas?.length || 0);

        // If only one item, use it directly as the property
        if (totalItems === 1) {
            createTripWithProperty(list, list.items[0] || null, list.drawnAreas?.[0] || null);
        } else if (totalItems > 1) {
            // Multiple items - show picker to select main property
            setSelectedListForTrip(list);
            setIsPropertyPickerOpen(true);
        } else {
            // Empty list - just create trip with list name
            const trip = createTrip(cityId);
            updateTrip(trip.id, { name: list.name });
            if (onCreateTripFromList) {
                onCreateTripFromList(trip);
            }
        }
    };

    // Create trip with selected property
    const createTripWithProperty = (
        list: LocationList,
        selectedItem: ListItem | null,
        selectedArea: { areaId: string; areaType: string; name: string } | null
    ) => {
        if (!cityId) return;

        const blocked = blockedReason(selectedItem);
        if (blocked) {
            showToast(blocked, 'error');
            setIsPropertyPickerOpen(false);
            setSelectedListForTrip(null);
            return;
        }

        // Create the main property LinkedItem
        let propertyLinkedItem: LinkedItem | null = null;
        if (selectedItem) {
            propertyLinkedItem = {
                type: 'place',
                id: selectedItem.placeId,
                name: selectedItem.placeName,
                address: selectedItem.placeAddress,
                data: {
                    lat: selectedItem.lat,
                    lon: selectedItem.lon,
                    placeType: selectedItem.placeType,
                },
            };
        } else if (selectedArea) {
            propertyLinkedItem = {
                type: 'area',
                id: selectedArea.areaId,
                name: selectedArea.name,
            };
        }

        // Create related places from other items
        const relatedPlaces: LinkedItem[] = [];
        for (const item of list.items) {
            if (selectedItem && item.placeId === selectedItem.placeId) continue;
            relatedPlaces.push({
                type: 'place',
                id: item.placeId,
                name: item.placeName,
                address: item.placeAddress,
                data: {
                    lat: item.lat,
                    lon: item.lon,
                    placeType: item.placeType,
                },
            });
        }
        for (const area of list.drawnAreas || []) {
            if (selectedArea && area.areaId === selectedArea.areaId) continue;
            relatedPlaces.push({
                type: 'area',
                id: area.areaId,
                name: area.name,
            });
        }

        // Create new trip with property and related places
        const trip = createTrip(cityId);
        updateTrip(trip.id, {
            name: propertyLinkedItem?.name || list.name,
            property: propertyLinkedItem,
            relatedPlaces,
            address: propertyLinkedItem?.address || '',
        });

        // Close picker and open the scouting form
        setIsPropertyPickerOpen(false);
        setSelectedListForTrip(null);
        if (onCreateTripFromList) {
            onCreateTripFromList(trip);
        }
    };

    // Handle property selection from picker
    const handlePropertySelected = (item: ListItem | null, area: { areaId: string; areaType: string; name: string } | null) => {
        if (!selectedListForTrip) return;
        createTripWithProperty(selectedListForTrip, item, area);
    };

    // Handle clicking on a POI item - navigate AND open popup
    // Also passes placeType so the filter can be enabled if not already on
    const handleItemClick = (item: ListItem) => {
        navigateAndOpenPopup(item.lat, item.lon, item.placeId, item.placeType);
        close();
    };

    // Drag handlers
    const handleDragStart = (listId: string, index: number) => {
        setDraggedItem({ listId, index });
    };

    const handleDragOver = (e: React.DragEvent, listId: string, index: number) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.listId !== listId) return;
    };

    const handleDrop = (listId: string, toIndex: number) => {
        if (!draggedItem || draggedItem.listId !== listId) return;
        if (draggedItem.index !== toIndex) {
            reorderItems(listId, draggedItem.index, toIndex);
        }
        setDraggedItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    // Panel content (same for mobile and desktop)
    const panelContent = (
        <>
            <MobilePanelHeader title="Saved lists" onClose={close} />

            {/* Lists - scrollable */}
            <div className="mt-body">
                {!isLoaded ? (
                    <LoadingSkeleton />
                ) : sortedLists.length === 0 ? (
                    <PanelEmpty
                        icon={Bookmark}
                        title="No lists yet"
                        hint="Create one to start saving places"
                    />
                ) : (
                    sortedLists.map(list => (
                        <ListSection
                            key={list.id}
                            list={list}
                            isReadOnly={list.access === 'readonly'}
                            ownerLabel={ownerLabel(list)}
                            teamLabel={teamLabel(list)}
                            isExpanded={expandedLists.has(list.id)}
                            isVisitPlanExpanded={expandedVisitPlans.has(list.id)}
                            onToggleExpanded={() => toggleListExpanded(list.id)}
                            onCreateTrip={() => handleCreateTripFromList(list)}
                            onItemClick={handleItemClick}
                            onRename={() => {
                                setSelectedListId(list.id);
                                setNewListName(list.name);
                                setIsRenameDialogOpen(true);
                            }}
                            onDelete={() => {
                                setSelectedListId(list.id);
                                setIsDeleteDialogOpen(true);
                            }}
                            onRemoveItem={(itemId) => {
                                const ok = removeItem(list.id, itemId);
                                if (!ok) {
                                    showToast("Couldn't remove this place. Please refresh and try again.", 'error');
                                }
                            }}
                            onRemoveArea={(areaId) => removeDrawnArea(list.id, areaId)}
                            onUpdateVisitPlan={(plan) => updateVisitPlan(list.id, plan)}
                            onExportCSV={() => exportListAsCSV(list)}
                            onExportPDF={() => exportListAsPDF(list)}
                            onDragStart={(index) => handleDragStart(list.id, index)}
                            onDragOver={(e, index) => handleDragOver(e, list.id, index)}
                            onDrop={(index) => handleDrop(list.id, index)}
                            onDragEnd={handleDragEnd}
                            isDragging={draggedItem?.listId === list.id}
                            draggedIndex={draggedItem?.listId === list.id ? draggedItem.index : null}
                        />
                    ))
                )}
                {isLoaded && (
                    <button
                        type="button"
                        onClick={() => {
                            setNewListName("");
                            setIsCreateDialogOpen(true);
                        }}
                        className="mt-btn mt-btn-grey w-full mt-2"
                    >
                        <Plus aria-hidden />
                        New list
                    </button>
                )}
            </div>
        </>
    );

    return (
        <>
            <MobilePanel
                isOpen={isExpanded}
                onClose={close}
                title="Saved lists"
                snapPoint="partial"
            >
                {panelContent}
            </MobilePanel>

            {/* Create List Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Create New List</DialogTitle>
                    </DialogHeader>
                    <Input
                        placeholder="Enter list name..."
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateList} disabled={!newListName.trim()}>Create</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rename List Dialog */}
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Rename List</DialogTitle>
                    </DialogHeader>
                    <Input
                        placeholder="Enter new name..."
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameList()}
                        autoFocus
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleRenameList} disabled={!newListName.trim()}>Rename</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete List?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-600">
                        This will permanently delete the list and all its items. This action cannot be undone.
                    </p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteList}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Property Picker Dialog - for selecting main property when creating trip from list */}
            <Dialog open={isPropertyPickerOpen} onOpenChange={(open) => {
                setIsPropertyPickerOpen(open);
                if (!open) setSelectedListForTrip(null);
            }}>
                <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Select Property to Scout</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-600 mb-4">
                        Which location is the main property you're scouting? Other places will be saved as related context.
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {selectedListForTrip?.items.map((item) => (
                            <button
                                key={item.placeId}
                                onClick={() => handlePropertySelected(item, null)}
                                className="w-full flex items-start gap-3 p-3 rounded-lg border border-zinc-200 hover:border-amber-400 hover:bg-amber-50 transition-colors text-left"
                            >
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Route className="w-4 h-4 text-amber-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-900 truncate">{item.placeName}</p>
                                    <p className="text-xs text-zinc-500 truncate">{item.placeAddress}</p>
                                </div>
                            </button>
                        ))}
                        {selectedListForTrip?.drawnAreas?.map((area) => (
                            <button
                                key={area.areaId}
                                onClick={() => handlePropertySelected(null, area)}
                                className="w-full flex items-start gap-3 p-3 rounded-lg border border-zinc-200 hover:border-amber-400 hover:bg-amber-50 transition-colors text-left"
                            >
                                <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Route className="w-4 h-4 text-zinc-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-900 truncate">{area.name}</p>
                                    <p className="text-xs text-zinc-500">Custom area</p>
                                </div>
                            </button>
                        ))}
                    </div>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => {
                            setIsPropertyPickerOpen(false);
                            setSelectedListForTrip(null);
                        }}>Cancel</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// Sub-component for a single list section
interface ListSectionProps {
    list: LocationList;
    /** Somebody else's list: visible and exportable, but not editable. */
    isReadOnly: boolean;
    /** Whose list it is. Null for own and team lists. */
    ownerLabel: string | null;
    /** The team's name. Null when the list is not shared with a team. */
    teamLabel: string | null;
    isExpanded: boolean;
    isVisitPlanExpanded: boolean;
    onToggleExpanded: () => void;
    onCreateTrip: () => void;
    onItemClick: (item: ListItem) => void;
    onRename: () => void;
    onDelete: () => void;
    onRemoveItem: (itemId: string) => void;
    onRemoveArea: (areaId: string) => void;
    onUpdateVisitPlan: (plan: VisitLog) => void;
    onExportCSV: () => void;
    onExportPDF: () => void;
    onDragStart: (index: number) => void;
    onDragOver: (e: React.DragEvent, index: number) => void;
    onDrop: (index: number) => void;
    onDragEnd: () => void;
    isDragging: boolean;
    draggedIndex: number | null;
}

function ListSection({
    list,
    isReadOnly,
    ownerLabel,
    teamLabel,
    isExpanded,
    isVisitPlanExpanded,
    onToggleExpanded,
    onCreateTrip,
    onItemClick,
    onRename,
    onDelete,
    onRemoveItem,
    onRemoveArea,
    onUpdateVisitPlan,
    onExportCSV,
    onExportPDF,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    isDragging,
    draggedIndex,
}: ListSectionProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const items = list.items || [];
    const areas = list.drawnAreas || [];
    const visitPlan = list.visitPlan;
    const totalCount = items.length + areas.length;
    const hasVisitPlan = visitPlan && (visitPlan.visitDate || visitPlan.comments);

    return (
        <div>
            {/* List header - restructured to separate clickable area from dropdown */}
            <div className="flex items-center gap-1 rounded-xl transition-colors hover:bg-black/5">
                {/* Clickable expand/collapse area */}
                <button
                    type="button"
                    className="flex-1 min-w-0 flex items-center gap-3 px-2 py-2.5 text-left rounded-xl"
                    onClick={onToggleExpanded}
                    aria-expanded={isExpanded}
                >
                    <span className="mt-tile" aria-hidden>
                        <Bookmark />
                    </span>

                    <span className="flex-1 min-w-0">
                        <span className="mt-t1 block truncate">{list.name}</span>
                        {/* Your own list says only how many places. A team list
                            names the team. Somebody else's names them, always,
                            because the name is the entire point of it. */}
                        <span className="mt-t2 flex items-center gap-1 min-w-0">
                            <span className="shrink-0">{totalCount} {totalCount === 1 ? "place" : "places"}</span>
                            {isReadOnly && ownerLabel && (
                                <span className="truncate">· {ownerLabel}</span>
                            )}
                            {!isReadOnly && list.teamId && (
                                <span className="inline-flex items-center gap-1 min-w-0 text-blue-700">
                                    · <Users className="w-3 h-3 shrink-0" aria-hidden />
                                    <span className="truncate">{teamLabel || "Team"}</span>
                                </span>
                            )}
                        </span>
                    </span>

                    {hasVisitPlan && (
                        <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Has a visit plan" />
                    )}
                    <ChevronRight
                        className={cn("w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200", isExpanded && "rotate-90")}
                        aria-hidden
                    />
                </button>

                {/* Menu - OUTSIDE the clickable area, with controlled state */}
                <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className="w-8 h-8 mr-1 rounded-full grid place-items-center shrink-0 text-zinc-500 hover:bg-black/5 hover:text-zinc-900 transition-colors focus-visible:outline-2 focus-visible:outline-zinc-900 focus-visible:outline-offset-2"
                            aria-label={`More for ${list.name}`}
                        >
                            <MoreHorizontal className="w-4 h-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {/* Read-only keeps the two exports and nothing else.
                            Create trip goes too, even though it would work: a
                            trip started from somebody else's saved place is a
                            surprise, and one fewer state to reason about. */}
                        {!isReadOnly && (
                            <>
                                <DropdownMenuItem onSelect={onCreateTrip}>
                                    <Route className="w-4 h-4 mr-2" />
                                    Create trip
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setTimeout(onRename, 0)}>
                                    <Pencil className="w-4 h-4 mr-2" />
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuItem onSelect={() => setTimeout(onExportCSV, 0)}>
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Export CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setTimeout(onExportPDF, 0)}>
                            <FileDown className="w-4 h-4 mr-2" />
                            Export PDF
                        </DropdownMenuItem>
                        {!isReadOnly && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => setTimeout(onDelete, 0)} className="text-red-600">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete list
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Visit Plan form (list level). Every field writes, so a
                read-only list never opens it. */}
            {isVisitPlanExpanded && !isReadOnly && (
                <div className="mx-2 my-1 px-3 py-3 rounded-xl bg-emerald-50/60 space-y-2">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase">Visit Plan</p>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                                <Calendar className="w-3 h-3" /> Date
                            </label>
                            <input
                                type="date"
                                value={visitPlan?.visitDate || ''}
                                onChange={(e) => onUpdateVisitPlan({ visitDate: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-xs px-2 py-1 rounded border border-zinc-200 bg-white"
                            />
                        </div>
                        <div className="w-20">
                            <label className="text-[10px] text-zinc-500 mb-1 block">Time</label>
                            <input
                                type="time"
                                value={visitPlan?.visitTime || ''}
                                onChange={(e) => onUpdateVisitPlan({ visitTime: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-xs px-2 py-1 rounded border border-zinc-200 bg-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                            <Cloud className="w-3 h-3" /> Weather
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Sunny, 22C"
                            value={visitPlan?.weather || ''}
                            onChange={(e) => onUpdateVisitPlan({ weather: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-xs px-2 py-1 rounded border border-zinc-200 bg-white"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                            <Users className="w-3 h-3" /> Traffic observation
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. High foot traffic"
                            value={visitPlan?.trafficObservation || ''}
                            onChange={(e) => onUpdateVisitPlan({ trafficObservation: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-xs px-2 py-1 rounded border border-zinc-200 bg-white"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] text-zinc-500 flex items-center gap-1 mb-1">
                            <MessageSquare className="w-3 h-3" /> Notes
                        </label>
                        <textarea
                            placeholder="Add notes..."
                            value={visitPlan?.comments || ''}
                            onChange={(e) => onUpdateVisitPlan({ comments: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full text-xs px-2 py-1 rounded border border-zinc-200 bg-white resize-none"
                            rows={2}
                        />
                    </div>
                </div>
            )}

            {/* Expanded content */}
            {isExpanded && (
                <div className="pb-1">
                    {/* POI Items with drag and drop */}
                    {items.map((item, index) => (
                        <div
                            key={item.id}
                            draggable={!isReadOnly}
                            onDragStart={isReadOnly ? undefined : () => onDragStart(index)}
                            onDragOver={isReadOnly ? undefined : (e) => onDragOver(e, index)}
                            onDrop={isReadOnly ? undefined : () => onDrop(index)}
                            onDragEnd={isReadOnly ? undefined : onDragEnd}
                            className={cn(
                                "pl-4 pr-2 py-2 flex items-center gap-2 rounded-xl hover:bg-black/5 cursor-pointer group transition-colors",
                                isDragging && draggedIndex === index && "opacity-50 bg-blue-50"
                            )}
                            onClick={() => onItemClick(item)}
                        >
                            {/* Drag handle. Reordering is a write, so a
                                read-only list keeps the spacer without it. */}
                            <GripVertical
                                className={cn(
                                    "w-3 h-3 shrink-0",
                                    isReadOnly
                                        ? "text-zinc-200"
                                        : "text-zinc-300 cursor-grab active:cursor-grabbing"
                                )}
                            />

                            <div className="flex-1 min-w-0">
                                <p className="text-[13.5px] font-medium text-zinc-900 truncate">
                                    {item.placeName}
                                </p>
                                <p className="text-[12px] text-zinc-500 truncate">{item.placeAddress}</p>
                            </div>

                            {/* Remove button */}
                            {!isReadOnly && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRemoveItem(item.id);
                                    }}
                                    className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center shrink-0 text-zinc-500 hover:text-red-600 transition-colors"
                                    aria-label={`Remove ${item.placeName}`}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    ))}

                    {/* Drawn Areas - same styling as POI items */}
                    {areas.map(area => (
                        <div
                            key={area.id}
                            className="pl-4 pr-2 py-2 flex items-center gap-2 rounded-xl hover:bg-black/5 group transition-colors"
                        >
                            {/* Drag handle placeholder for alignment */}
                            <GripVertical className="w-3 h-3 text-zinc-300 shrink-0" />

                            <div className="flex-1 min-w-0">
                                <p className="text-[13.5px] font-medium text-zinc-900 truncate">
                                    {area.name}
                                </p>
                                <p className="text-[12px] text-zinc-500 truncate">
                                    {area.areaType === 'polygon' ? 'Custom area' : 'Custom point'}
                                </p>
                            </div>

                            {/* Remove button */}
                            <button
                                onClick={() => onRemoveArea(area.areaId)}
                                className="w-7 h-7 rounded-full hover:bg-red-50 flex items-center justify-center shrink-0 text-zinc-500 hover:text-red-600 transition-colors"
                                aria-label={`Remove ${area.name}`}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}

                    {/* Empty state */}
                    {totalCount === 0 && (
                        <div className="px-4 py-3 text-[12.5px] text-zinc-500">
                            No places in this list yet
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
