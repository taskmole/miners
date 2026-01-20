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

interface AddToListButtonProps {
  place: PlaceInfo;
}

/**
 * AddToListButton - Dropdown button for adding places to user lists
 * Shows existing lists with checkboxes and option to create new lists
 */
export function AddToListButton({ place }: AddToListButtonProps) {
  const { lists, toggleInList, isPlaceInList, createList, addToList } = useListsContext();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Handle toggling a place in/out of a list
  const handleToggle = (listId: string) => {
    toggleInList(listId, place);
  };

  // Handle creating a new list
  const handleCreateList = () => {
    if (!newListName.trim()) return;

    const newList = createList(newListName.trim());
    addToList(newList.id, place);
    setNewListName('');
    setIsCreateDialogOpen(false);
  };

  // Open create dialog from dropdown
  const handleOpenCreateDialog = () => {
    setIsDropdownOpen(false);
    setIsCreateDialogOpen(true);
  };

  // Count how many lists this place is in
  const listsWithPlace = lists.filter(list => isPlaceInList(place.placeId, list.id)).length;

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-auto py-1 px-2"
          >
            {listsWithPlace > 0 ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span>In {listsWithPlace} list{listsWithPlace !== 1 ? 's' : ''}</span>
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
                  checked={isPlaceInList(place.placeId, list.id)}
                  onCheckedChange={() => handleToggle(list.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="truncate">{list.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    ({list.items.length})
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
              "{place.placeName}" will be added to this list
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
