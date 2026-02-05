"use client";

import React, { createContext, useContext, type ReactNode } from 'react';
import { useLists } from '@/hooks/useLists';
import type { LocationList, PlaceInfo, VisitLog } from '@/types/lists';

// Define the context value type based on what useLists returns
interface ListsContextValue {
  lists: LocationList[];
  isLoaded: boolean;
  createList: (name: string) => LocationList;
  addToList: (listId: string, place: PlaceInfo) => void;
  removeFromList: (listId: string, placeId: string) => void;
  toggleInList: (listId: string, place: PlaceInfo) => boolean;
  isPlaceInList: (placeId: string, listId: string) => boolean;
  getListsContainingPlace: (placeId: string) => string[];
  updateVisitPlan: (listId: string, visitPlan: VisitLog) => void;
  reorderItems: (listId: string, fromIndex: number, toIndex: number) => void;
  deleteList: (listId: string) => void;
  renameList: (listId: string, newName: string) => void;
  addDrawnArea: (listId: string, areaId: string, areaType: 'polygon' | 'line', name: string) => void;
  removeDrawnArea: (listId: string, areaId: string) => void;
  removeItem: (listId: string, itemId: string) => void;
}

const ListsContext = createContext<ListsContextValue | null>(null);

/**
 * Provider component that wraps the app and provides lists context
 * Use this at the root level (layout.tsx or page.tsx)
 */
export function ListsProvider({ children }: { children: ReactNode }) {
  const listsHook = useLists();

  return (
    <ListsContext.Provider value={listsHook}>
      {children}
    </ListsContext.Provider>
  );
}

/**
 * Hook to access the lists context from any component
 * Must be used within a ListsProvider
 */
export function useListsContext(): ListsContextValue {
  const context = useContext(ListsContext);
  if (!context) {
    throw new Error('useListsContext must be used within a ListsProvider');
  }
  return context;
}
