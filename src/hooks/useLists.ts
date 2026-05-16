"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LocationList, ListItem, ListsState, PlaceInfo, VisitLog, DrawnAreaItem } from '@/types/lists';
import { apiFetch } from '@/lib/api-client';
import { logActivity } from '@/lib/supabaseHelpers';
import { getAuthUserId, getCurrentUserId } from '@/lib/browser-session';
import { enqueue, hasPendingCreate, hasPendingItemUpsert, hasPendingDeletion, hasPendingItemDeletion, hasPendingListDeletion, initSyncQueue, startDraining } from '@/lib/list-sync';

const STORAGE_KEY = 'miners-location-lists';
const CURRENT_VERSION = 1;
const POLL_INTERVAL = 60_000;

function generateId(): string {
  return crypto.randomUUID();
}

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

// Returns { ok, lists } - on error, ok=false and current state must be preserved
async function fetchListsFromServer(): Promise<{ ok: boolean; lists: LocationList[] }> {
  try {
    const { lists: listsData, listItems: itemsData } = await apiFetch<{
      lists: any[];
      listItems: any[];
    }>('/api/db/lists');

    if (!listsData || listsData.length === 0) return { ok: true, lists: [] };

    const itemsByList: Record<string, ListItem[]> = {};
    (itemsData || []).forEach((row: any) => {
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

    const lists = listsData.map((row: any) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      createdBy: row.created_by,
      items: itemsByList[row.id] || [],
      drawnAreas: [],
    }));

    return { ok: true, lists };
  } catch (error) {
    console.error('Error fetching lists from server:', error);
    return { ok: false, lists: [] };
  }
}

// Merge server lists with local state. Server is source of truth.
// Local-only lists kept ONLY if they have a pending create in the retry queue.
// Local-only items kept ONLY if they have a pending upsert in the retry queue.
function mergeLists(
  serverLists: LocationList[],
  localLists: LocationList[],
): LocationList[] {
  const localListsMap = new Map(localLists.map(l => [l.id, l]));
  const serverListIds = new Set(serverLists.map(l => l.id));
  const merged: LocationList[] = [];

  // Server lists win. Preserve local drawnAreas (localStorage-only feature)
  for (const serverList of serverLists) {
    // Skip lists that have a pending deletion in the queue
    if (hasPendingListDeletion(serverList.id)) continue;

    const localList = localListsMap.get(serverList.id);

    // Filter out items with pending deletions
    const filteredServerItems = serverList.items.filter(item => {
      return !hasPendingItemDeletion(item.id) && !hasPendingDeletion(serverList.id, item.placeId);
    });

    // Add local items that have pending upserts (not yet on server)
    const serverItemIds = new Set(filteredServerItems.map(i => i.id));
    const pendingLocalItems: ListItem[] = [];

    if (localList) {
      for (const localItem of localList.items) {
        if (!serverItemIds.has(localItem.id) && hasPendingItemUpsert(serverList.id, localItem.id)) {
          pendingLocalItems.push(localItem);
        }
      }
    }

    merged.push({
      ...serverList,
      items: [...filteredServerItems, ...pendingLocalItems],
      drawnAreas: localList?.drawnAreas || [],
    });
  }

  // Keep local-only lists that have a pending create in the retry queue
  for (const localList of localLists) {
    if (!serverListIds.has(localList.id) && hasPendingCreate(localList.id)) {
      merged.push(localList);
    }
  }

  return merged;
}

export function useLists() {
  const [lists, setLists] = useState<LocationList[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref to current lists so mutations can read state without relying on
  // setState updater side effects (broken by React 18 batching)
  const listsRef = useRef(lists);
  listsRef.current = lists;

  // Initial load: localStorage first (instant UI), then server fetch + merge
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    // Initialize the sync queue (restores persisted retries, drains on reconnect)
    initSyncQueue();

    async function loadLists() {
      const localState = getInitialState();
      const localLists = localState.lists;

      // Show local data immediately
      if (localLists.length > 0) {
        setLists(localLists);
      }
      setIsLoaded(true);

      // Skip server fetch for demo users
      if (!getAuthUserId()) {
        startDraining();
        return;
      }

      const result = await fetchListsFromServer();
      if (!result.ok) {
        startDraining();
        return;
      }

      const merged = mergeLists(result.lists, localLists);
      setLists(merged);
      persistToLocalStorage(merged);

      // Start processing queued operations AFTER merge is complete
      startDraining();
    }

    loadLists();
  }, []);

  // Polling: refetch server state every 60s
  useEffect(() => {
    if (!isLoaded) return;
    if (!getAuthUserId()) return; // No polling for demo users

    pollRef.current = setInterval(async () => {
      const result = await fetchListsFromServer();
      if (!result.ok) return; // Keep current state on error

      setLists(prev => {
        const merged = mergeLists(result.lists, prev);
        persistToLocalStorage(merged);
        return merged;
      });
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isLoaded]);

  // Persist to localStorage whenever lists change
  useEffect(() => {
    if (!isLoaded) return;
    persistToLocalStorage(lists);
  }, [lists, isLoaded]);

  const createList = useCallback((name: string): LocationList => {
    const userId = getCurrentUserId();
    const newList: LocationList = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      items: [],
      drawnAreas: [],
    };

    setLists(prev => [...prev, newList]);

    enqueue({
      type: 'create_list',
      listId: newList.id,
      payload: { id: newList.id, name, created_by: userId, created_at: newList.createdAt },
    });

    return newList;
  }, []);

  const addToList = useCallback((listId: string, place: PlaceInfo): void => {
    const current = listsRef.current;
    const list = current.find(l => l.id === listId);
    if (!list) return;
    if (list.items.some(item => item.placeId === place.placeId)) return;

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

    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      if (l.items.some(item => item.placeId === place.placeId)) return l;
      return { ...l, items: [...l.items, newItem] };
    }));

    enqueue({
      type: 'add_item',
      listId,
      payload: {
        id: newItem.id,
        list_id: listId,
        place_id: place.placeId,
        place_type: place.placeType,
        place_name: place.placeName,
        place_address: place.placeAddress,
        lat: place.lat,
        lon: place.lon,
        added_at: newItem.addedAt,
      },
    });

    logActivity('added_to_list', {
      placeName: place.placeName,
      placeType: place.placeType,
      placeId: place.placeId,
      listName: list.name,
      lat: place.lat,
      lon: place.lon,
    });
  }, []);

  const removeFromList = useCallback((listId: string, placeId: string): void => {
    const current = listsRef.current;
    const list = current.find(l => l.id === listId);
    const removedItem = list?.items.find(i => i.placeId === placeId);

    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      return { ...l, items: l.items.filter(item => item.placeId !== placeId) };
    }));

    if (removedItem && list) {
      logActivity('removed_from_list', {
        placeName: removedItem.placeName,
        placeType: removedItem.placeType,
        placeId,
        listName: list.name,
        lat: removedItem.lat,
        lon: removedItem.lon,
      });
    }

    enqueue({
      type: 'remove_item_by_place',
      listId,
      payload: { listId, placeId },
    });
  }, []);

  const toggleInList = useCallback((listId: string, place: PlaceInfo): boolean => {
    const current = listsRef.current;
    const list = current.find(l => l.id === listId);
    if (!list) return false;

    const existingItem = list.items.find(item => item.placeId === place.placeId);

    if (existingItem) {
      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: l.items.filter(item => item.id !== existingItem.id) };
      }));

      enqueue({
        type: 'remove_item',
        listId,
        payload: { itemId: existingItem.id },
      });
      logActivity('removed_from_list', {
        placeName: place.placeName,
        placeType: place.placeType,
        placeId: place.placeId,
        listName: list.name,
        lat: place.lat,
        lon: place.lon,
      });
      return false;
    } else {
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

      setLists(prev => prev.map(l => {
        if (l.id !== listId) return l;
        if (l.items.some(item => item.placeId === place.placeId)) return l;
        return { ...l, items: [...l.items, newItem] };
      }));

      enqueue({
        type: 'add_item',
        listId,
        payload: {
          id: newItem.id,
          list_id: listId,
          place_id: place.placeId,
          place_type: place.placeType,
          place_name: place.placeName,
          place_address: place.placeAddress,
          lat: place.lat,
          lon: place.lon,
          added_at: newItem.addedAt,
        },
      });
      logActivity('added_to_list', {
        placeName: place.placeName,
        placeType: place.placeType,
        placeId: place.placeId,
        listName: list.name,
        lat: place.lat,
        lon: place.lon,
      });
      return true;
    }
  }, []);

  const isPlaceInList = useCallback((placeId: string, listId: string): boolean => {
    const list = lists.find(l => l.id === listId);
    if (!list) return false;
    return list.items.some(item => item.placeId === placeId);
  }, [lists]);

  const getListsContainingPlace = useCallback((placeId: string): string[] => {
    return lists
      .filter(list => list.items.some(item => item.placeId === placeId))
      .map(list => list.id);
  }, [lists]);

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

  const deleteList = useCallback((listId: string): boolean => {
    const current = listsRef.current;
    const deletedList = current.find(l => l.id === listId);

    setLists(prev => prev.filter(list => list.id !== listId));

    if (!deletedList) return true;

    logActivity('deleted_list', { listName: deletedList.name, listId });

    enqueue({
      type: 'delete_list',
      listId,
      payload: { listId },
    });

    return true;
  }, []);

  const renameList = useCallback((listId: string, newName: string): void => {
    const userId = getCurrentUserId();

    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return { ...list, name: newName };
    }));

    enqueue({
      type: 'rename_list',
      listId,
      payload: { id: listId, name: newName, created_by: userId },
    });
  }, []);

  const addDrawnArea = useCallback((listId: string, areaId: string, areaType: 'polygon' | 'line', name: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const areas = list.drawnAreas || [];
      if (areas.some(area => area.areaId === areaId)) return list;

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

  const removeItem = useCallback((listId: string, itemId: string): boolean => {
    const current = listsRef.current;
    const list = current.find(l => l.id === listId);
    const removedItem = list?.items.find(i => i.id === itemId);

    setLists(prev => prev.map(l => {
      if (l.id !== listId) return l;
      return { ...l, items: l.items.filter(item => item.id !== itemId) };
    }));

    if (!removedItem || !list) return true;

    logActivity('removed_from_list', {
      placeName: removedItem.placeName,
      placeType: removedItem.placeType,
      placeId: removedItem.placeId,
      listName: list.name,
      lat: removedItem.lat,
      lon: removedItem.lon,
    });

    enqueue({
      type: 'remove_item',
      listId,
      payload: { itemId },
    });

    return true;
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

// --- Helpers ---

function persistToLocalStorage(lists: LocationList[]): void {
  try {
    const state: ListsState = { version: CURRENT_VERSION, lists };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving lists to localStorage:', error);
  }
}
