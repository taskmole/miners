"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PointCategory,
  DEFAULT_CATEGORIES
} from '@/types/point-categories';
import { apiFetch } from '@/lib/api-client';
import { getCurrentUserId } from '@/lib/browser-session';

function generateCategoryId(): string {
  return `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function fetchFromApi(): Promise<PointCategory[]> {
  try {
    const currentId = getCurrentUserId();
    const data = await apiFetch<Array<{ id: string; name: string; is_system: boolean; created_at: string }>>(
      `/api/db/categories?user_id=${encodeURIComponent(currentId)}`
    );

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      isSystem: row.is_system,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

async function syncCreateToApi(category: PointCategory): Promise<void> {
  const userId = getCurrentUserId();

  try {
    await apiFetch('/api/db/categories', {
      method: 'POST',
      body: JSON.stringify({
        id: category.id,
        name: category.name,
        is_system: category.isSystem,
        created_by: userId,
        created_at: category.createdAt,
      }),
    });
  } catch (error) {
    console.error('Error syncing category:', error);
  }
}

async function syncDeleteToApi(categoryId: string): Promise<void> {
  try {
    await apiFetch(`/api/db/categories?id=${encodeURIComponent(categoryId)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Error deleting category:', error);
  }
}

export function usePointCategories() {
  const [categories, setCategories] = useState<PointCategory[]>(DEFAULT_CATEGORIES);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadCategories() {
      const apiCats = await fetchFromApi();

      const apiIds = new Set(apiCats.map(c => c.id));
      const missingDefaults = DEFAULT_CATEGORIES.filter(d => !apiIds.has(d.id));
      const mergedCats = [...apiCats, ...missingDefaults];

      setCategories(mergedCats);
      setIsLoaded(true);
    }

    loadCategories();
  }, []);

  const getCategoryPointCount = useCallback((_categoryId: string): number => {
    return 0;
  }, []);

  const canDeleteCategory = useCallback((categoryId: string): { canDelete: boolean; reason?: string } => {
    const category = categories.find(c => c.id === categoryId);

    if (!category) {
      return { canDelete: false, reason: 'Category not found' };
    }

    if (category.isSystem) {
      return { canDelete: false, reason: 'System categories cannot be deleted' };
    }

    const pointCount = getCategoryPointCount(categoryId);
    if (pointCount > 0) {
      return {
        canDelete: false,
        reason: `${pointCount} point${pointCount > 1 ? 's' : ''} use this category`
      };
    }

    return { canDelete: true };
  }, [categories, getCategoryPointCount]);

  const createCategory = useCallback((name: string): PointCategory | null => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return null;
    }

    const exists = categories.some(
      c => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (exists) {
      return null;
    }

    const newCategory: PointCategory = {
      id: generateCategoryId(),
      name: trimmedName,
      isSystem: false,
      createdAt: new Date().toISOString(),
    };

    setCategories(prev => [...prev, newCategory]);
    syncCreateToApi(newCategory);

    return newCategory;
  }, [categories]);

  const deleteCategory = useCallback((categoryId: string): boolean => {
    const { canDelete } = canDeleteCategory(categoryId);

    if (!canDelete) {
      return false;
    }

    setCategories(prev => prev.filter(c => c.id !== categoryId));
    syncDeleteToApi(categoryId);

    return true;
  }, [canDeleteCategory]);

  const getCategoryById = useCallback((categoryId: string): PointCategory | undefined => {
    return categories.find(c => c.id === categoryId);
  }, [categories]);

  return {
    categories,
    isLoaded,
    createCategory,
    deleteCategory,
    canDeleteCategory,
    getCategoryPointCount,
    getCategoryById,
  };
}
