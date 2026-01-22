"use client";

import React, { createContext, useContext, type ReactNode } from 'react';
import { usePointCategories } from '@/hooks/usePointCategories';
import type { PointCategory } from '@/types/point-categories';

// Define the context value type based on what usePointCategories returns
interface PointCategoriesContextValue {
  categories: PointCategory[];
  isLoaded: boolean;
  createCategory: (name: string) => PointCategory | null;
  deleteCategory: (categoryId: string) => boolean;
  canDeleteCategory: (categoryId: string) => { canDelete: boolean; reason?: string };
  getCategoryPointCount: (categoryId: string) => number;
  getCategoryById: (categoryId: string) => PointCategory | undefined;
}

const PointCategoriesContext = createContext<PointCategoriesContextValue | null>(null);

/**
 * Provider component that wraps the app and provides point categories context
 * Use this at the root level alongside other providers
 */
export function PointCategoriesProvider({ children }: { children: ReactNode }) {
  const pointCategoriesHook = usePointCategories();

  return (
    <PointCategoriesContext.Provider value={pointCategoriesHook}>
      {children}
    </PointCategoriesContext.Provider>
  );
}

/**
 * Hook to access the point categories context from any component
 * Must be used within a PointCategoriesProvider
 */
export function usePointCategoriesContext(): PointCategoriesContextValue {
  const context = useContext(PointCategoriesContext);
  if (!context) {
    throw new Error('usePointCategoriesContext must be used within a PointCategoriesProvider');
  }
  return context;
}
