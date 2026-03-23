"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LocationList, ListItem, ListsState, PlaceInfo, VisitLog, DrawnAreaItem } from '@/types/lists';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAnonymousUserId, withSupabase, logActivity } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

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
 * Fetch lists from Supabase (including items)
 */
async function fetchListsFromSupabase(): Promise<LocationList[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const currentId = getCurrentUserId();
  const anonId = getAnonymousUserId();

  // Fetch lists — query both current user ID and legacy anonymous ID
  // so existing lists (created before auth fix) are still found
  const { data: listsData, error: listsError } = await supabase
    .from('lists')
    .select('id, name, created_at')
    .or(`created_by.eq.${currentId},created_by.eq.${anonId}`);

  if (listsError) {
    console.error('Error fetching lists from Supabase:', listsError);
    return [];
  }

  if (!listsData || listsData.length === 0) return [];

  // Fetch all items for these lists
  const listIds = listsData.map(l => l.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from('list_items')
    .select('id, list_id, place_id, place_type, place_name, place_address, lat, lon, added_at')
    .in('list_id', listIds);

  if (itemsError) {
    console.error('Error fetching list items from Supabase:', itemsError);
  }

  // Group items by list_id
  const itemsByList: Record<string, ListItem[]> = {};
  (itemsData || []).forEach((row) => {
    if (!itemsByList[row.list_id]) {
      itemsByList[row.list_id] = [];
    }
    itemsByList[row.list_id].push({
      id: row.id,
      placeId: row.place_id,
      placeType: row.place_type || 'cafe',
      placeName: row.place_name || '',
      placeAddress: row.place_address || '',
      lat: row.lat || 0,
      lon: row.lon || 0,
      addedAt: row.added_at || new Date().toISOString(),
    });
  });

  return listsData.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    items: itemsByList[row.id] || [],
    drawnAreas: [],
  }));
}

/**
 * Sync list create to Supabase
 */
async function syncCreateToSupabase(list: LocationList): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getCurrentUserId();

  try {
    await supabase.from('lists').upsert({
      id: list.id,
      name: list.name,
      created_by: userId,
      created_at: list.createdAt,
    }, { onConflict: 'id' });
  } catch (error) {
    console.error('Error syncing list to Supabase:', error);
  }
}

/**
 * Sync list rename to Supabase
 */
async function syncRenameToSupabase(listId: string, newName: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('lists')
      .update({ name: newName })
      .eq('id', listId);
  } catch (error) {
    console.error('Error renaming list in Supabase:', error);
  }
}

/**
 * Sync list delete to Supabase
 */
async function syncDeleteToSupabase(listId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    // Delete list items first (if any in Supabase)
    await supabase
      .from('list_items')
      .delete()
      .eq('list_id', listId);

    // Then delete the list
    await supabase
      .from('lists')
      .delete()
      .eq('id', listId);
  } catch (error) {
    console.error('Error deleting list from Supabase:', error);
  }
}

/**
 * Sync list item add to Supabase
 */
async function syncAddItemToSupabase(listId: string, item: ListItem): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase.from('list_items').upsert({
      id: item.id,
      list_id: listId,
      place_id: item.placeId,
      place_type: item.placeType,
      place_name: item.placeName,
      place_address: item.placeAddress,
      lat: item.lat,
      lon: item.lon,
      added_at: item.addedAt,
    }, { onConflict: 'id' });
  } catch (error) {
    console.error('Error syncing list item to Supabase:', error);
  }
}

/**
 * Sync list item remove to Supabase
 */
async function syncRemoveItemToSupabase(itemId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('list_items')
      .delete()
      .eq('id', itemId);
  } catch (error) {
    console.error('Error removing list item from Supabase:', error);
  }
}

/**
 * Sync list item remove by place_id to Supabase
 */
async function syncRemoveItemByPlaceIdToSupabase(listId: string, placeId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('list_items')
      .delete()
      .eq('list_id', listId)
      .eq('place_id', placeId);
  } catch (error) {
    console.error('Error removing list item from Supabase:', error);
  }
}

/**
 * Hook for managing location lists with Supabase + localStorage persistence
 *
 * Dual-write pattern:
 * - Lists metadata: synced to Supabase
 * - List items: stored in localStorage only (rich metadata not in Supabase schema)
 *
 * Provides methods to create lists, add/remove places, and update visit logs
 */
export function useLists() {
  const [lists, setLists] = useState<LocationList[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load from Supabase + localStorage on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadLists() {
      // Start with localStorage (has full data including items and drawnAreas)
      const localState = getInitialState();
      const localLists = localState.lists;

      // Fetch lists with items from Supabase
      const supabaseLists = await withSupabase(
        () => fetchListsFromSupabase(),
        [],
        'fetch lists'
      );

      // Build a map of local lists for merging
      const localListsMap = new Map(localLists.map(l => [l.id, l]));
      const supabaseListsMap = new Map(supabaseLists.map(l => [l.id, l]));

      // Merge strategy: Supabase wins for lists and items, keep local drawnAreas
      const mergedLists: LocationList[] = [];

      // Add all Supabase lists (with their items), preserving local drawnAreas
      supabaseLists.forEach(supabaseList => {
        const localList = localListsMap.get(supabaseList.id);
        mergedLists.push({
          ...supabaseList,
          drawnAreas: localList?.drawnAreas || [],
        });
      });

      // Add local-only lists that don't exist in Supabase
      localLists.forEach(localList => {
        if (!supabaseListsMap.has(localList.id)) {
          mergedLists.push(localList);
          // Sync this local-only list to Supabase
          syncCreateToSupabase(localList);
          localList.items.forEach(item => {
            syncAddItemToSupabase(localList.id, item);
          });
        }
      });

      setLists(mergedLists);
      setIsLoaded(true);

      // Save merged state back to localStorage
      try {
        const state: ListsState = {
          version: CURRENT_VERSION,
          lists: mergedLists,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error('Error saving merged lists to localStorage:', error);
      }
    }

    loadLists();
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
    };

    setLists(prev => [...prev, newList]);

    // Sync to Supabase in background
    syncCreateToSupabase(newList);

    return newList;
  }, []);

  // Add a place to a list
  const addToList = useCallback((listId: string, place: PlaceInfo): void => {
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

    setLists(prev => {
      const list = prev.find(l => l.id === listId);
      if (!list) return prev;

      // Check if place already exists in this list
      const exists = list.items.some(item => item.placeId === place.placeId);
      if (exists) return prev;

      // Sync to Supabase in background
      syncAddItemToSupabase(listId, newItem);

      // Log to activity feed
      logActivity('added_to_list', {
        placeName: place.placeName,
        placeId: place.placeId,
        listName: list.name,
        lat: place.lat,
        lon: place.lon,
      });

      return prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: [...l.items, newItem] };
      });
    });
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

    // Sync to Supabase in background
    syncRemoveItemByPlaceIdToSupabase(listId, placeId);
  }, []);

  // Toggle a place in a list (add if not present, remove if present)
  const toggleInList = useCallback((listId: string, place: PlaceInfo): boolean => {
    let wasAdded = false;
    let removedItemId: string | null = null;
    let addedItem: ListItem | null = null;

    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const existingItem = list.items.find(item => item.placeId === place.placeId);

      if (existingItem) {
        // Remove from list
        wasAdded = false;
        removedItemId = existingItem.id;
        return {
          ...list,
          items: list.items.filter(item => item.id !== existingItem.id),
        };
      } else {
        // Add to list
        wasAdded = true;
        addedItem = {
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
          items: [...list.items, addedItem],
        };
      }
    }));

    // Sync to Supabase in background
    if (addedItem) {
      syncAddItemToSupabase(listId, addedItem);
    } else if (removedItemId) {
      syncRemoveItemToSupabase(removedItemId);
    }

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

    // Sync to Supabase in background
    syncDeleteToSupabase(listId);
  }, []);

  // Rename a list
  const renameList = useCallback((listId: string, newName: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return { ...list, name: newName };
    }));

    // Sync to Supabase in background
    syncRenameToSupabase(listId, newName);
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

  // Remove an item from a list by its item ID
  const removeItem = useCallback((listId: string, itemId: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        items: list.items.filter(item => item.id !== itemId),
      };
    }));

    // Sync to Supabase in background
    syncRemoveItemToSupabase(itemId);
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
    removeItem,
  };
}
