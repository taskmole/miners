"use client";

import React, { useRef, useEffect, useState } from "react";
import {
    ClipboardList,
    Plus,
    MoreVertical,
    Trash2,
    Pencil,
    Paperclip,
    ChevronDown,
    ChevronRight,
    X,
    FileText,
    Image,
    Download,
    Calendar,
    Cloud,
    Users,
    MessageSquare,
    GripVertical,
    FileSpreadsheet,
    FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useListsContext } from "@/contexts/ListsContext";
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
import type { LocationList, ListItem, ListAttachment, VisitLog } from "@/types/lists";

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

export function ListsPanel() {
    const {
        lists,
        isLoaded,
        createList,
        deleteList,
        renameList,
        addAttachment,
        removeAttachment,
        removeItem,
        removeDrawnArea,
        updateVisitPlan,
        reorderItems,
    } = useListsContext();

    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
    const [expandedVisitPlans, setExpandedVisitPlans] = useState<Set<string>>(new Set());
    const panelRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Dialog states
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [newListName, setNewListName] = useState("");

    // Drag and drop state
    const [draggedItem, setDraggedItem] = useState<{ listId: string; index: number } | null>(null);

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

    // Handle deleting a list
    const handleDeleteList = () => {
        if (!selectedListId) return;
        deleteList(selectedListId);
        setIsDeleteDialogOpen(false);
        setSelectedListId(null);
    };

    // Handle file selection for attachments
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedListId) return;

        try {
            await addAttachment(selectedListId, file);
        } catch (error) {
            console.error('Error adding attachment:', error);
        }
        e.target.value = '';
    };

    // Open file dialog for attachments
    const openAttachmentDialog = (listId: string) => {
        setSelectedListId(listId);
        fileInputRef.current?.click();
    };

    // Handle clicking on a POI item - navigate AND open popup
    // Also passes placeType so the filter can be enabled if not already on
    const handleItemClick = (item: ListItem) => {
        navigateAndOpenPopup(item.lat, item.lon, item.placeId, item.placeType);
        setIsExpanded(false);
    };

    // Download attachment
    const downloadAttachment = (attachment: ListAttachment) => {
        const link = document.createElement('a');
        link.href = attachment.data;
        link.download = attachment.name;
        link.click();
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

    // Collapsed state
    if (!isExpanded) {
        return (
            <div ref={panelRef} className="fixed top-[72px] right-6 z-40">
                <button
                    onClick={() => setIsExpanded(true)}
                    className="glass w-10 h-10 rounded-xl border border-white/40 flex items-center justify-center hover:bg-white/20 transition-all duration-200 relative"
                    title="My Lists"
                >
                    <ClipboardList className="w-[17px] h-[17px] text-zinc-500" />
                </button>
            </div>
        );
    }

    // Expanded state
    return (
        <>
            <div ref={panelRef} className="fixed top-[72px] right-6 z-50">
                <div className="glass rounded-2xl overflow-hidden border border-white/40 w-80 animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Header */}
                    <div className="p-4 flex items-center justify-between border-b border-white/10">
                        <span className="text-sm font-bold text-zinc-900">Lists</span>
                        <button
                            onClick={() => setIsCreateDialogOpen(true)}
                            className="w-6 h-6 rounded-md border border-zinc-300 text-zinc-500 flex items-center justify-center hover:bg-zinc-100 transition-colors"
                            title="Create new list"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Lists - scrollable */}
                    <div className="max-h-[400px] overflow-y-auto">
                        {!isLoaded ? (
                            <div className="p-4 text-center text-zinc-500 text-sm">Loading...</div>
                        ) : lists.length === 0 ? (
                            <div className="p-6 text-center">
                                <ClipboardList className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                                <p className="text-sm text-zinc-500">No lists yet</p>
                                <p className="text-xs text-zinc-400 mt-1">Create one to start saving places</p>
                            </div>
                        ) : (
                            lists.map(list => (
                                <ListSection
                                    key={list.id}
                                    list={list}
                                    isExpanded={expandedLists.has(list.id)}
                                    isVisitPlanExpanded={expandedVisitPlans.has(list.id)}
                                    onToggleExpanded={() => toggleListExpanded(list.id)}
                                    onToggleVisitPlan={() => toggleVisitPlanExpanded(list.id)}
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
                                    onAddAttachment={() => openAttachmentDialog(list.id)}
                                    onRemoveAttachment={(attachmentId) => removeAttachment(list.id, attachmentId)}
                                    onDownloadAttachment={downloadAttachment}
                                    onRemoveItem={(itemId) => removeItem(list.id, itemId)}
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
                    </div>
                </div>
            </div>

            {/* Hidden file input for attachments */}
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.txt"
            />

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
        </>
    );
}

// Sub-component for a single list section
interface ListSectionProps {
    list: LocationList;
    isExpanded: boolean;
    isVisitPlanExpanded: boolean;
    onToggleExpanded: () => void;
    onToggleVisitPlan: () => void;
    onItemClick: (item: ListItem) => void;
    onRename: () => void;
    onDelete: () => void;
    onAddAttachment: () => void;
    onRemoveAttachment: (attachmentId: string) => void;
    onDownloadAttachment: (attachment: ListAttachment) => void;
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
    isExpanded,
    isVisitPlanExpanded,
    onToggleExpanded,
    onToggleVisitPlan,
    onItemClick,
    onRename,
    onDelete,
    onAddAttachment,
    onRemoveAttachment,
    onDownloadAttachment,
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
    const attachments = list.attachments || [];
    const visitPlan = list.visitPlan;
    const totalCount = items.length + areas.length;
    const hasVisitPlan = visitPlan && (visitPlan.visitDate || visitPlan.comments);

    return (
        <div className="border-b border-white/10">
            {/* List header - restructured to separate clickable area from dropdown */}
            <div className="p-3 flex items-center gap-2">
                {/* Clickable expand/collapse area */}
                <div
                    className="flex-1 flex items-center gap-2 hover:bg-white/20 transition-colors cursor-pointer rounded -m-1 p-1"
                    onClick={onToggleExpanded}
                >
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                    )}

                    <span className="text-sm font-semibold text-zinc-900 truncate flex-1">{list.name}</span>

                    {hasVisitPlan && (
                        <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}

                    {attachments.length > 0 && (
                        <Paperclip className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    )}

                    <span className="text-xs text-zinc-500 shrink-0">({totalCount})</span>
                </div>

                {/* Menu - OUTSIDE the clickable area, with controlled state */}
                <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <button className="w-6 h-6 rounded hover:bg-white/30 flex items-center justify-center shrink-0">
                            <MoreVertical className="w-4 h-4 text-zinc-500" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={onToggleVisitPlan}>
                            <Calendar className="w-4 h-4 mr-2" />
                            Plan visit
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onRename}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onAddAttachment}>
                            <Paperclip className="w-4 h-4 mr-2" />
                            Add attachment
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onExportCSV}>
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Export CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onExportPDF}>
                            <FileDown className="w-4 h-4 mr-2" />
                            Export PDF
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={onDelete} className="text-red-600">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete list
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Visit Plan form (list level) */}
            {isVisitPlanExpanded && (
                <div className="px-3 py-3 bg-emerald-50/50 border-b border-white/10 space-y-2">
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
                <div className="bg-white/10">
                    {/* Attachments */}
                    {attachments.length > 0 && (
                        <div className="px-3 py-2 border-b border-white/10">
                            <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-2">Attachments</p>
                            <div className="flex flex-wrap gap-2">
                                {attachments.map(att => (
                                    <div
                                        key={att.id}
                                        className="flex items-center gap-1.5 px-2 py-1 bg-white/50 rounded text-xs group"
                                    >
                                        {att.type.startsWith('image/') ? (
                                            <Image className="w-3 h-3 text-zinc-500" />
                                        ) : (
                                            <FileText className="w-3 h-3 text-zinc-500" />
                                        )}
                                        <span className="text-zinc-700 truncate max-w-[100px]">{att.name}</span>
                                        <button
                                            onClick={() => onDownloadAttachment(att)}
                                            className="opacity-0 group-hover:opacity-100 hover:text-blue-600"
                                        >
                                            <Download className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={() => onRemoveAttachment(att.id)}
                                            className="opacity-0 group-hover:opacity-100 hover:text-red-600"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* POI Items with drag and drop */}
                    {items.map((item, index) => (
                        <div
                            key={item.id}
                            draggable
                            onDragStart={() => onDragStart(index)}
                            onDragOver={(e) => onDragOver(e, index)}
                            onDrop={() => onDrop(index)}
                            onDragEnd={onDragEnd}
                            className={cn(
                                "px-3 py-2 flex items-center gap-2 hover:bg-white/20 cursor-pointer group border-b border-white/5 last:border-b-0",
                                isDragging && draggedIndex === index && "opacity-50 bg-blue-50"
                            )}
                            onClick={() => onItemClick(item)}
                        >
                            {/* Drag handle */}
                            <GripVertical className="w-3 h-3 text-zinc-300 cursor-grab active:cursor-grabbing shrink-0" />

                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-zinc-800 truncate group-hover:text-blue-600">
                                    {item.placeName}
                                </p>
                                <p className="text-[10px] text-zinc-500 truncate">{item.placeAddress}</p>
                            </div>

                            {/* Remove button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveItem(item.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center shrink-0"
                            >
                                <X className="w-3 h-3 text-red-500" />
                            </button>
                        </div>
                    ))}

                    {/* Drawn Areas - same styling as POI items */}
                    {areas.map(area => (
                        <div
                            key={area.id}
                            className="px-3 py-2 flex items-center gap-2 hover:bg-white/20 group border-b border-white/5 last:border-b-0"
                        >
                            {/* Drag handle placeholder for alignment */}
                            <GripVertical className="w-3 h-3 text-zinc-300 shrink-0" />

                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-zinc-800 truncate">
                                    {area.name}
                                </p>
                                <p className="text-[10px] text-zinc-500 truncate">
                                    {area.areaType === 'polygon' ? 'Custom area' : 'Custom point'}
                                </p>
                            </div>

                            {/* Remove button */}
                            <button
                                onClick={() => onRemoveArea(area.areaId)}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded hover:bg-red-100 flex items-center justify-center shrink-0"
                            >
                                <X className="w-3 h-3 text-red-500" />
                            </button>
                        </div>
                    ))}

                    {/* Empty state */}
                    {totalCount === 0 && (
                        <div className="px-3 py-4 text-center text-xs text-zinc-400">
                            No items in this list yet
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
