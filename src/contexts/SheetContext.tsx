"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

// Context for coordinating bottom sheets - only one sheet can be open at a time
// This prevents multiple sheets from stacking on mobile

interface SheetContextType {
  // The ID of the currently open sheet (null if none)
  activeSheet: string | null;
  // Open a sheet by ID - automatically closes any existing sheet
  openSheet: (sheetId: string) => void;
  // Close the current sheet
  closeSheet: () => void;
  // Check if a specific sheet is open
  isSheetOpen: (sheetId: string) => boolean;
}

const SheetContext = createContext<SheetContextType | null>(null);

export function SheetProvider({ children }: { children: React.ReactNode }) {
  const [activeSheet, setActiveSheet] = useState<string | null>(null);

  // Open a sheet - closes any existing one first
  const openSheet = useCallback((sheetId: string) => {
    setActiveSheet(sheetId);
  }, []);

  // Close the current sheet
  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  // Check if a specific sheet is open
  const isSheetOpen = useCallback(
    (sheetId: string) => activeSheet === sheetId,
    [activeSheet]
  );

  return (
    <SheetContext.Provider
      value={{ activeSheet, openSheet, closeSheet, isSheetOpen }}
    >
      {children}
    </SheetContext.Provider>
  );
}

// Hook to use the sheet context
export function useSheet() {
  const context = useContext(SheetContext);
  if (!context) {
    throw new Error("useSheet must be used within a SheetProvider");
  }
  return context;
}

// Hook for a specific sheet - returns isOpen and toggle functions
export function useSheetState(sheetId: string) {
  const { activeSheet, openSheet, closeSheet } = useSheet();

  const isOpen = activeSheet === sheetId;

  const open = useCallback(() => {
    openSheet(sheetId);
  }, [openSheet, sheetId]);

  const close = useCallback(() => {
    if (activeSheet === sheetId) {
      closeSheet();
    }
  }, [activeSheet, sheetId, closeSheet]);

  const toggle = useCallback(() => {
    if (isOpen) {
      closeSheet();
    } else {
      openSheet(sheetId);
    }
  }, [isOpen, openSheet, closeSheet, sheetId]);

  return { isOpen, open, close, toggle };
}
