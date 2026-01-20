"use client";

import React, { useState } from 'react';
import { Plus, ListPlus, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useListsContext } from '@/contexts/ListsContext';
import type { PlaceInfo } from '@/types/lists';

// Shape info for drawn areas/points
export interface ShapeInfo {
  shapeId: string;
  shapeType: 'polygon' | 'point';
  shapeName: string;
}

interface AddToListButtonProps {
  place?: PlaceInfo;
  shape?: ShapeInfo;
}

/**
 * AddToListButton - Dropdown button for adding places or shapes to user lists
 * Shows existing lists with checkboxes and option to create new lists
 * Supports both POIs (place prop) and drawn shapes (shape prop)
 */
export function AddToListButton({ place, shape }: AddToListButtonProps) {
  const { lists, toggleInList, isPlaceInList, createList, addToList, addDrawnArea, removeDrawnArea } = useListsContext();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Determine if this is a shape or a place
  const isShape = !!shape;
  const displayName = isShape ? shape.shapeName : place?.placeName || '';

  // Check if a shape is in a specific list
  const isShapeInList = (shapeId: string, listId: string): boolean => {
    const list = lists.find(l => l.id === listId);
    if (!list || !list.drawnAreas) return false;
    return list.drawnAreas.some(area => area.areaId === shapeId);
  };

  // Handle toggling a place/shape in/out of a list
  const handleToggle = (listId: string) => {
    if (isShape) {
      // Toggle shape
      if (isShapeInList(shape.shapeId, listId)) {
        removeDrawnArea(listId, shape.shapeId);
      } else {
        addDrawnArea(listId, shape.shapeId, shape.shapeType === 'polygon' ? 'polygon' : 'line', shape.shapeName);
      }
    } else if (place) {
      // Toggle place (existing behavior)
      toggleInList(listId, place);
    }
  };

  // Handle creating a new list
  const handleCreateList = () => {
    if (!newListName.trim()) return;

    const newList = createList(newListName.trim());
    if (isShape) {
      addDrawnArea(newList.id, shape.shapeId, shape.shapeType === 'polygon' ? 'polygon' : 'line', shape.shapeName);
    } else if (place) {
      addToList(newList.id, place);
    }
    setNewListName('');
    setIsCreateDialogOpen(false);
  };

  // Open create dialog from dropdown
  const handleOpenCreateDialog = () => {
    setIsDropdownOpen(false);
    setIsCreateDialogOpen(true);
  };

  // Count how many lists this place/shape is in
  const listsWithItem = isShape
    ? lists.filter(list => isShapeInList(shape.shapeId, list.id)).length
    : place ? lists.filter(list => isPlaceInList(place.placeId, list.id)).length : 0;

  // Check if item is in a specific list
  const isItemInList = (listId: string): boolean => {
    if (isShape) {
      return isShapeInList(shape.shapeId, listId);
    }
    return place ? isPlaceInList(place.placeId, listId) : false;
  };

  // Get total items count for a list (items + drawnAreas)
  const getListItemCount = (list: { items: unknown[]; drawnAreas?: unknown[] }): number => {
    return list.items.length + (list.drawnAreas?.length || 0);
  };

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-auto py-1 px-2"
          >
            {listsWithItem > 0 ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>In {listsWithItem} list{listsWithItem !== 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <ListPlus className="h-3.5 w-3.5" />
                <span>Add to list</span>
              </>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Show existing lists */}
          {lists.length > 0 ? (
            <>
              {lists.map(list => (
                <DropdownMenuCheckboxItem
                  key={list.id}
                  checked={isItemInList(list.id)}
                  onCheckedChange={() => handleToggle(list.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="truncate">{list.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    ({getListItemCount(list)})
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
            </>
          ) : (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No lists yet
            </div>
          )}

          {/* Create new list option */}
          <DropdownMenuItem onSelect={handleOpenCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Create new list...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create new list dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListPlus className="h-5 w-5" />
              Create New List
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <Input
              placeholder="Enter list name..."
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateList();
                }
              }}
              autoFocus
            />
            <p className="mt-2 text-xs text-muted-foreground">
              "{displayName}" will be added to this list
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateList}
              disabled={!newListName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
