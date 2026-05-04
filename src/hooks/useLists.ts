"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LocationList, ListItem, ListsState, PlaceInfo, VisitLog, DrawnAreaItem } from '@/types/lists';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { withSupabase, logActivity } from '@/lib/supabaseHelpers';
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

  const { data: listsData, error: listsError } = await supabase
    .from('lists')
    .select('id, name, created_at')
    .eq('created_by', currentId);

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

// Delete a single row by an exact column match. Returns false if the cloud
// rejected the delete or affected 0 rows (treated as a silent RLS rejection
// unless `allowZeroRows` is set). When Supabase is not configured we treat
// the delete as a no-op success so local-only mode keeps working.
async function deleteRowOrFail(
  table: 'lists' | 'list_items',
  column: string,
  value: string,
  opts: { allowZeroRows?: boolean } = {},
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return true;

  try {
    const res = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq(column, value);

    if (res.error) {
      console.error(`Error deleting ${table} row:`, res.error);
      return false;
    }

    if (!opts.allowZeroRows && (res.count ?? 0) === 0) {
      console.error(`Delete on ${table} affected 0 rows (likely RLS):`, value);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error deleting ${table} row:`, error);
    return false;
  }
}

// list_items rows cascade automatically via the FK on list_items.list_id, so
// we only need to delete the list row itself.
async function syncDeleteToSupabase(listId: string): Promise<boolean> {
  return deleteRowOrFail('lists', 'id', listId);
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

// 0 rows affected on item delete is treated as success: the row may simply
// never have been synced to the cloud (local-only item).
async function syncRemoveItemToSupabase(itemId: string): Promise<boolean> {
  return deleteRowOrFail('list_items', 'id', itemId, { allowZeroRows: true });
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

  // Tombstones for IDs whose cloud delete is still pending or failed, so the
  // merge-on-load step can't revive them. Each ID is retried at most once per
  // session to avoid hammering Supabase when RLS keeps rejecting the delete.
  const pendingDeletedListIds = useRef<Set<string>>(new Set());
  const pendingDeletedItemIds = useRef<Set<string>>(new Set());
  const retriedListIds = useRef<Set<string>>(new Set());
  const retriedItemIds = useRef<Set<string>>(new Set());

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

      supabaseLists.forEach(supabaseList => {
        if (pendingDeletedListIds.current.has(supabaseList.id)) {
          if (!retriedListIds.current.has(supabaseList.id)) {
            retriedListIds.current.add(supabaseList.id);
            syncDeleteToSupabase(supabaseList.id).then(ok => {
              if (ok) pendingDeletedListIds.current.delete(supabaseList.id);
            });
          }
          return;
        }

        const localList = localListsMap.get(supabaseList.id);
        const filteredItems = supabaseList.items.filter(item => {
          if (pendingDeletedItemIds.current.has(item.id)) {
            if (!retriedItemIds.current.has(item.id)) {
              retriedItemIds.current.add(item.id);
              syncRemoveItemToSupabase(item.id).then(ok => {
                if (ok) pendingDeletedItemIds.current.delete(item.id);
              });
            }
            return false;
          }
          return true;
        });

        mergedLists.push({
          ...supabaseList,
          items: filteredItems,
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

    let didAdd = false;
    let listName = '';

    setLists(prev => {
      const list = prev.find(l => l.id === listId);
      if (!list) return prev;

      // Check if place already exists in this list
      const exists = list.items.some(item => item.placeId === place.placeId);
      if (exists) return prev;

      didAdd = true;
      listName = list.name;

      return prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: [...l.items, newItem] };
      });
    });

    // Side effects outside the state updater
    if (didAdd) {
      syncAddItemToSupabase(listId, newItem);

      logActivity('added_to_list', {
        placeName: place.placeName,
        placeType: place.placeType,
        placeId: place.placeId,
        listName,
        lat: place.lat,
        lon: place.lon,
      });
    }
  }, []);

  // Remove a place from a list
  const removeFromList = useCallback((listId: string, placeId: string): void => {
    let removedInfo: { placeName?: string; placeType?: string; listName?: string; lat?: number; lon?: number } | null = null;

    setLists(prev => {
      const list = prev.find(l => l.id === listId);
      if (list) {
        const item = list.items.find(i => i.placeId === placeId);
        if (item) {
          removedInfo = { placeName: item.placeName, placeType: item.placeType, listName: list.name, lat: item.lat, lon: item.lon };
        }
      }
      return prev.map(list => {
        if (list.id !== listId) return list;
        return { ...list, items: list.items.filter(item => item.placeId !== placeId) };
      });
    });

    // Log to activity feed
    if (removedInfo) {
      logActivity('removed_from_list', {
        placeName: removedInfo.placeName,
        placeType: removedInfo.placeType,
        placeId,
        listName: removedInfo.listName,
        lat: removedInfo.lat,
        lon: removedInfo.lon,
      });
    }

    // Sync to Supabase in background
    syncRemoveItemByPlaceIdToSupabase(listId, placeId);
  }, []);

  // Toggle a place in a list (add if not present, remove if present)
  const toggleInList = useCallback((listId: string, place: PlaceInfo): boolean => {
    let wasAdded = false;
    let removedItemId: string | null = null;
    let addedItem: ListItem | null = null;
    let listName = '';

    setLists(prev => {
      const list = prev.find(l => l.id === listId);
      if (list) listName = list.name;

      return prev.map(list => {
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
      });
    });

    // Sync to Supabase in background
    if (addedItem) {
      syncAddItemToSupabase(listId, addedItem);
      // Log add to activity feed
      logActivity('added_to_list', {
        placeName: place.placeName,
        placeType: place.placeType,
        placeId: place.placeId,
        listName,
        lat: place.lat,
        lon: place.lon,
      });
    } else if (removedItemId) {
      syncRemoveItemToSupabase(removedItemId);
      // Log removal to activity feed
      logActivity('removed_from_list', {
        placeName: place.placeName,
        placeType: place.placeType,
        placeId: place.placeId,
        listName,
        lat: place.lat,
        lon: place.lon,
      });
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

  const deleteList = useCallback(async (listId: string): Promise<boolean> => {
    let deletedList: LocationList | undefined;
    let deletedIndex = -1;

    setLists(prev => {
      deletedIndex = prev.findIndex(l => l.id === listId);
      if (deletedIndex !== -1) deletedList = prev[deletedIndex];
      return prev.filter(list => list.id !== listId);
    });

    if (!deletedList) return true;

    logActivity('deleted_list', { listName: deletedList.name, listId });
    pendingDeletedListIds.current.add(listId);

    const ok = await syncDeleteToSupabase(listId);

    if (!ok) {
      const restored = deletedList;
      const insertAt = deletedIndex;
      setLists(prev => {
        if (prev.some(l => l.id === restored.id)) return prev;
        const next = [...prev];
        const idx = insertAt >= 0 && insertAt <= next.length ? insertAt : next.length;
        next.splice(idx, 0, restored);
        return next;
      });
      pendingDeletedListIds.current.delete(listId);
    }

    return ok;
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

  const removeItem = useCallback(async (
    listId: string,
    itemId: string,
  ): Promise<boolean> => {
    let removedItem: ListItem | undefined;
    let removedFromIndex = -1;
    let listName = '';

    setLists(prev => {
      const list = prev.find(l => l.id === listId);
      if (list) {
        listName = list.name;
        removedFromIndex = list.items.findIndex(i => i.id === itemId);
        if (removedFromIndex !== -1) removedItem = list.items[removedFromIndex];
      }
      return prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: l.items.filter(item => item.id !== itemId) };
      });
    });

    if (!removedItem) return true;

    logActivity('removed_from_list', {
      placeName: removedItem.placeName,
      placeType: removedItem.placeType,
      placeId: removedItem.placeId,
      listName,
      lat: removedItem.lat,
      lon: removedItem.lon,
    });
    pendingDeletedItemIds.current.add(itemId);

    const ok = await syncRemoveItemToSupabase(itemId);

    if (!ok) {
      const restored = removedItem;
      const insertAt = removedFromIndex;
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        if (l.items.some(i => i.id === restored.id)) return l;
        const next = [...l.items];
        const idx = insertAt >= 0 && insertAt <= next.length ? insertAt : next.length;
        next.splice(idx, 0, restored);
        return { ...l, items: next };
      }));
      pendingDeletedItemIds.current.delete(itemId);
    }

    return ok;
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
