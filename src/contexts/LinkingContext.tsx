"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { LinkedItem } from '@/types/scouting';

// Context for managing map linking mode
interface LinkingContextValue {
  // Whether we're in linking mode
  isLinking: boolean;
  // Currently selected items
  selectedItems: LinkedItem[];
  // Start linking mode with a callback for when done
  startLinking: (onComplete: (items: LinkedItem[]) => void) => void;
  // Cancel linking mode
  cancelLinking: () => void;
  // Confirm and finish linking
  confirmLinking: () => void;
  // Add an item to selection
  addItem: (item: LinkedItem) => void;
  // Remove an item from selection
  removeItem: (itemId: string) => void;
  // Clear all selections
  clearSelection: () => void;
}

const LinkingContext = createContext<LinkingContextValue | undefined>(undefined);

export function LinkingProvider({ children }: { children: React.ReactNode }) {
  const [isLinking, setIsLinking] = useState(false);
  const [selectedItems, setSelectedItems] = useState<LinkedItem[]>([]);
  const [onCompleteCallback, setOnCompleteCallback] = useState<((items: LinkedItem[]) => void) | null>(null);

  const startLinking = useCallback((onComplete: (items: LinkedItem[]) => void) => {
    setIsLinking(true);
    setSelectedItems([]);
    setOnCompleteCallback(() => onComplete);
  }, []);

  const cancelLinking = useCallback(() => {
    setIsLinking(false);
    setSelectedItems([]);
    setOnCompleteCallback(null);
  }, []);

  const confirmLinking = useCallback(() => {
    if (onCompleteCallback) {
      onCompleteCallback(selectedItems);
    }
    setIsLinking(false);
    setSelectedItems([]);
    setOnCompleteCallback(null);
  }, [selectedItems, onCompleteCallback]);

  const addItem = useCallback((item: LinkedItem) => {
    setSelectedItems(prev => {
      // Don't add duplicates
      if (prev.some(i => i.id === item.id)) {
        return prev;
      }
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setSelectedItems(prev => prev.filter(i => i.id !== itemId));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItems([]);
  }, []);

  return (
    <LinkingContext.Provider
      value={{
        isLinking,
        selectedItems,
        startLinking,
        cancelLinking,
        confirmLinking,
        addItem,
        removeItem,
        clearSelection,
      }}
    >
      {children}
    </LinkingContext.Provider>
  );
}

export function useLinking() {
  const context = useContext(LinkingContext);
  if (!context) {
    throw new Error('useLinking must be used within a LinkingProvider');
  }
  return context;
}
