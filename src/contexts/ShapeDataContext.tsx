"use client";

import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { ShapeMetadata, ShapeComment } from '@/types/draw';

interface ShapeDataContextValue {
  allMetadata: Record<string, ShapeMetadata>;
  allComments: Record<string, ShapeComment[]>;
  setAllMetadata: React.Dispatch<React.SetStateAction<Record<string, ShapeMetadata>>>;
  setAllComments: React.Dispatch<React.SetStateAction<Record<string, ShapeComment[]>>>;
}

const ShapeDataContext = createContext<ShapeDataContextValue | null>(null);

export function ShapeDataProvider({ children }: { children: ReactNode }) {
  const [allMetadata, setAllMetadata] = useState<Record<string, ShapeMetadata>>({});
  const [allComments, setAllComments] = useState<Record<string, ShapeComment[]>>({});

  return (
    <ShapeDataContext.Provider value={{ allMetadata, allComments, setAllMetadata, setAllComments }}>
      {children}
    </ShapeDataContext.Provider>
  );
}

export function useShapeDataContext(): ShapeDataContextValue {
  const context = useContext(ShapeDataContext);
  if (!context) {
    throw new Error('useShapeDataContext must be used within a ShapeDataProvider');
  }
  return context;
}
