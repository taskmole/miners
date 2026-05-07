"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LocationList, ListItem, ListsState, PlaceInfo, VisitLog, DrawnAreaItem } from '@/types/lists';
import { apiFetch } from '@/lib/api-client';
import { logActivity } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

const STORAGE_KEY = 'miners-location-lists';
const CURRENT_VERSION = 1;

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

async function fetchListsFromServer(): Promise<LocationList[]> {
  try {
    const { lists: listsData, listItems: itemsData } = await apiFetch<{
      lists: any[];
      listItems: any[];
    }>('/api/db/lists');

    if (!listsData || listsData.length === 0) return [];

    // Group items by list_id
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

    return listsData.map((row: any) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      items: itemsByList[row.id] || [],
      drawnAreas: [],
    }));
  } catch (error) {
    console.error('Error fetching lists from server:', error);
    return [];
  }
}

async function syncCreateToServer(list: LocationList): Promise<void> {
  const userId = getCurrentUserId();

  try {
    await apiFetch('/api/db/lists', {
      method: 'POST',
      body: JSON.stringify({
        action: 'upsert_list',
        id: list.id,
        name: list.name,
        created_by: userId,
        created_at: list.createdAt,
      }),
    });
  } catch (error) {
    console.error('Error syncing list to server:', error);
  }
}

async function syncRenameToServer(listId: string, newName: string): Promise<void> {
  try {
    await apiFetch('/api/db/lists', {
      method: 'POST',
      body: JSON.stringify({
        action: 'upsert_list',
        id: listId,
        name: newName,
        created_by: getCurrentUserId(),
      }),
    });
  } catch (error) {
    console.error('Error renaming list on server:', error);
  }
}

// Returns false on failure so the caller can roll back the optimistic UI update
async function deleteViaServer(
  type: 'list' | 'item',
  id: string,
): Promise<boolean> {
  try {
    await apiFetch(`/api/db/lists?type=${type}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return true;
  } catch (error) {
    console.error(`Error deleting ${type} on server:`, error);
    return false;
  }
}

async function syncDeleteListOnServer(listId: string): Promise<boolean> {
  return deleteViaServer('list', listId);
}

async function syncAddItemToServer(listId: string, item: ListItem): Promise<void> {
  try {
    await apiFetch('/api/db/lists', {
      method: 'POST',
      body: JSON.stringify({
        action: 'upsert_item',
        id: item.id,
        list_id: listId,
        place_id: item.placeId,
        place_type: item.placeType,
        place_name: item.placeName,
        place_address: item.placeAddress,
        lat: item.lat,
        lon: item.lon,
        added_at: item.addedAt,
      }),
    });
  } catch (error) {
    console.error('Error syncing list item to server:', error);
  }
}

async function syncRemoveItemOnServer(itemId: string): Promise<boolean> {
  return deleteViaServer('item', itemId);
}

async function syncRemoveItemByPlaceIdOnServer(listId: string, placeId: string): Promise<void> {
  try {
    await apiFetch(
      `/api/db/lists?type=item_by_place&id=_&list_id=${encodeURIComponent(listId)}&place_id=${encodeURIComponent(placeId)}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    console.error('Error removing list item from server:', error);
  }
}

// Lists and items sync to server via /api/db/lists.
// drawnAreas and visit plans are localStorage-only.
export function useLists() {
  const [lists, setLists] = useState<LocationList[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Tombstones prevent merge-on-load from reviving items whose cloud delete is pending
  const pendingDeletedListIds = useRef<Set<string>>(new Set());
  const pendingDeletedItemIds = useRef<Set<string>>(new Set());
  const retriedListIds = useRef<Set<string>>(new Set());
  const retriedItemIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadLists() {
      const localState = getInitialState();
      const localLists = localState.lists;
      const serverLists = await fetchListsFromServer();

      const localListsMap = new Map(localLists.map(l => [l.id, l]));
      const serverListsMap = new Map(serverLists.map(l => [l.id, l]));

      // Server wins for lists and items; keep local drawnAreas
      const mergedLists: LocationList[] = [];

      serverLists.forEach(serverList => {
        if (pendingDeletedListIds.current.has(serverList.id)) {
          if (!retriedListIds.current.has(serverList.id)) {
            retriedListIds.current.add(serverList.id);
            syncDeleteListOnServer(serverList.id).then(ok => {
              if (ok) pendingDeletedListIds.current.delete(serverList.id);
            });
          }
          return;
        }

        const localList = localListsMap.get(serverList.id);
        const filteredItems = serverList.items.filter(item => {
          if (pendingDeletedItemIds.current.has(item.id)) {
            if (!retriedItemIds.current.has(item.id)) {
              retriedItemIds.current.add(item.id);
              syncRemoveItemOnServer(item.id).then(ok => {
                if (ok) pendingDeletedItemIds.current.delete(item.id);
              });
            }
            return false;
          }
          return true;
        });

        mergedLists.push({
          ...serverList,
          items: filteredItems,
          drawnAreas: localList?.drawnAreas || [],
        });
      });

      localLists.forEach(localList => {
        if (!serverListsMap.has(localList.id)) {
          mergedLists.push(localList);
          syncCreateToServer(localList);
          localList.items.forEach(item => {
            syncAddItemToServer(localList.id, item);
          });
        }
      });

      setLists(mergedLists);
      setIsLoaded(true);

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

  const createList = useCallback((name: string): LocationList => {
    const newList: LocationList = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      items: [],
      drawnAreas: [],
    };

    setLists(prev => [...prev, newList]);
    syncCreateToServer(newList);

    return newList;
  }, []);

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
      if (list.items.some(item => item.placeId === place.placeId)) return prev;

      didAdd = true;
      listName = list.name;

      return prev.map(l => {
        if (l.id !== listId) return l;
        return { ...l, items: [...l.items, newItem] };
      });
    });

    if (didAdd) {
      syncAddItemToServer(listId, newItem);

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

    syncRemoveItemByPlaceIdOnServer(listId, placeId);
  }, []);

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
          wasAdded = false;
          removedItemId = existingItem.id;
          return {
            ...list,
            items: list.items.filter(item => item.id !== existingItem.id),
          };
        } else {
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

    if (addedItem) {
      syncAddItemToServer(listId, addedItem);
      logActivity('added_to_list', {
        placeName: place.placeName,
        placeType: place.placeType,
        placeId: place.placeId,
        listName,
        lat: place.lat,
        lon: place.lon,
      });
    } else if (removedItemId) {
      syncRemoveItemOnServer(removedItemId);
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

    const ok = await syncDeleteListOnServer(listId);

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

  const renameList = useCallback((listId: string, newName: string): void => {
    setLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return { ...list, name: newName };
    }));

    syncRenameToServer(listId, newName);
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

    const ok = await syncRemoveItemOnServer(itemId);

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
