"use client";

import { useState, useEffect, useCallback } from 'react';
import type { LocationList, ListItem, ListsState, PlaceInfo, VisitLog, ListAttachment, DrawnAreaItem } from '@/types/lists';

// localStorage key for lists data
const STORAGE_KEY = 'miners-location-lists';
const CURRENT_VERSION = 1;

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// Get initial state from localStorage
function getInitialState(): ListsState {
  if (typeof window === 'undefined') {
    return { version: CURRENT_VERSION, lists: [] };
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as ListsState;
      return {
        version: parsed.version || CURRENT_VERSION,
        lists: parsed.lists || [],
      };
    }
  } catch (error) {
    console.error('Error loading lists from localStorage:', error);
  }

  return { version: CURRENT_VERSION, lists: [] };
}

/**
 * Hook for managing location lists with localStorage persistence
 * Provides methods to create lists, add/remove places, and update visit logs
 */
export function useLists() {
  const [lists, setLists] = useState<LocationList[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const initialState = getInitialState();
    setLists(initialState.lists);
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever lists change (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      const state: ListsState = {
        version: CURRENT_VERSION,
        lists,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving lists to localStorage:', error);
    }
  }, [lists, isLoaded]);

  // Create a new list
  const createList = useCallback((name: string): LocationList => {
    const newList: LocationList = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      items: [],
      drawnAreas: [],
      attachments: [],
    };

    setLists(prev => [...prev, newList]);
    return newList;
  }, []);

  // Add a place to a list
  const addToList = useCallback((listId: string, place: PlaceInfo): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      // Check if place already exists in this list
      const exists = list.items.some(item => item.placeId === place.placeId);
      if (exists) return list;

      const newItem: ListItem = {
        id: generateId(),
        placeId: place.placeId,
        placeType: place.placeType,
        placeName: place.placeName,
        placeAddress: place.placeAddress,
        lat: place.lat,
        lon: place.lon,
        addedAt: new Date().toISOString(),
      };

      return {
        ...list,
        items: [...list.items, newItem],
      };
    }));
  }, []);

  // Remove a place from a list
  const removeFromList = useCallback((listId: string, placeId: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      return {
        ...list,
        items: list.items.filter(item => item.placeId !== placeId),
      };
    }));
  }, []);

  // Toggle a place in a list (add if not present, remove if present)
  const toggleInList = useCallback((listId: string, place: PlaceInfo): boolean => {
    let wasAdded = false;

    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const existingIndex = list.items.findIndex(item => item.placeId === place.placeId);

      if (existingIndex >= 0) {
        // Remove from list
        wasAdded = false;
        return {
          ...list,
          items: list.items.filter((_, i) => i !== existingIndex),
        };
      } else {
        // Add to list
        wasAdded = true;
        const newItem: ListItem = {
          id: generateId(),
          placeId: place.placeId,
          placeType: place.placeType,
          placeName: place.placeName,
          placeAddress: place.placeAddress,
          lat: place.lat,
          lon: place.lon,
          addedAt: new Date().toISOString(),
        };

        return {
          ...list,
          items: [...list.items, newItem],
        };
      }
    }));

    return wasAdded;
  }, []);

  // Check if a place is in a specific list
  const isPlaceInList = useCallback((placeId: string, listId: string): boolean => {
    const list = lists.find(l => l.id === listId);
    if (!list) return false;
    return list.items.some(item => item.placeId === placeId);
  }, [lists]);

  // Get all list IDs that contain a place
  const getListsContainingPlace = useCallback((placeId: string): string[] => {
    return lists
      .filter(list => list.items.some(item => item.placeId === placeId))
      .map(list => list.id);
  }, [lists]);

  // Update visit plan for a list (list-level planning)
  const updateVisitPlan = useCallback((listId: string, visitPlan: VisitLog): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        visitPlan: {
          ...list.visitPlan,
          ...visitPlan,
        },
      };
    }));
  }, []);

  // Reorder items in a list (for drag and drop)
  const reorderItems = useCallback((listId: string, fromIndex: number, toIndex: number): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const newItems = [...list.items];
      const [movedItem] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, movedItem);

      return {
        ...list,
        items: newItems,
      };
    }));
  }, []);

  // Delete a list
  const deleteList = useCallback((listId: string): void => {
    setLists(prev => prev.filter(list => list.id !== listId));
  }, []);

  // Rename a list
  const renameList = useCallback((listId: string, newName: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return { ...list, name: newName };
    }));
  }, []);

  // Add a drawn area to a list
  const addDrawnArea = useCallback((listId: string, areaId: string, areaType: 'polygon' | 'line', name: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      // Check if area already exists in this list
      const areas = list.drawnAreas || [];
      const exists = areas.some(area => area.areaId === areaId);
      if (exists) return list;

      const newArea: DrawnAreaItem = {
        id: generateId(),
        areaId,
        areaType,
        name,
        addedAt: new Date().toISOString(),
      };

      return {
        ...list,
        drawnAreas: [...areas, newArea],
      };
    }));
  }, []);

  // Remove a drawn area from a list
  const removeDrawnArea = useCallback((listId: string, areaId: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      const areas = list.drawnAreas || [];
      return {
        ...list,
        drawnAreas: areas.filter(area => area.areaId !== areaId),
      };
    }));
  }, []);

  // Add an attachment to a list
  const addAttachment = useCallback((listId: string, file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const attachment: ListAttachment = {
          id: generateId(),
          name: file.name,
          type: file.type,
          data: base64,
          addedAt: new Date().toISOString(),
        };

        setLists(prev => prev.map(list => {
          if (list.id !== listId) return list;
          const attachments = list.attachments || [];
          return {
            ...list,
            attachments: [...attachments, attachment],
          };
        }));
        resolve();
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  // Remove an attachment from a list
  const removeAttachment = useCallback((listId: string, attachmentId: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      const attachments = list.attachments || [];
      return {
        ...list,
        attachments: attachments.filter(att => att.id !== attachmentId),
      };
    }));
  }, []);

  // Remove an item from a list by its item ID
  const removeItem = useCallback((listId: string, itemId: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        items: list.items.filter(item => item.id !== itemId),
      };
    }));
  }, []);

  return {
    lists,
    isLoaded,
    createList,
    addToList,
    removeFromList,
    toggleInList,
    isPlaceInList,
    getListsContainingPlace,
    updateVisitPlan,
    reorderItems,
    deleteList,
    renameList,
    addDrawnArea,
    removeDrawnArea,
    addAttachment,
    removeAttachment,
    removeItem,
  };
}
