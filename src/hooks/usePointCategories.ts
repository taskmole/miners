"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PointCategory,
  DEFAULT_CATEGORIES
} from '@/types/point-categories';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { withSupabase } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

function generateCategoryId(): string {
  return `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function fetchFromSupabase(): Promise<PointCategory[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const currentId = getCurrentUserId();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, is_system, created_at')
    .or(`is_system.eq.true,created_by.eq.${currentId}`);

  if (error) {
    console.error('Error fetching categories from Supabase:', error);
    return [];
  }

  return data?.map((row) => ({
    id: row.id,
    name: row.name,
    isSystem: row.is_system,
    createdAt: row.created_at,
  })) || [];
}

async function syncCreateToSupabase(category: PointCategory): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getCurrentUserId();

  try {
    await supabase.from('categories').upsert({
      id: category.id,
      name: category.name,
      is_system: category.isSystem,
      created_by: userId,
      created_at: category.createdAt,
    }, { onConflict: 'id' });
  } catch (error) {
    console.error('Error syncing category to Supabase:', error);
  }
}

async function syncDeleteToSupabase(categoryId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId);
  } catch (error) {
    console.error('Error deleting category from Supabase:', error);
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
      const supabaseCats = await withSupabase(
        () => fetchFromSupabase(),
        [],
        'fetch categories'
      );

      const supabaseIds = new Set(supabaseCats.map(c => c.id));
      const missingDefaults = DEFAULT_CATEGORIES.filter(d => !supabaseIds.has(d.id));
      const mergedCats = [...supabaseCats, ...missingDefaults];

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
    syncCreateToSupabase(newCategory);

    return newCategory;
  }, [categories]);

  const deleteCategory = useCallback((categoryId: string): boolean => {
    const { canDelete } = canDeleteCategory(categoryId);

    if (!canDelete) {
      return false;
    }

    setCategories(prev => prev.filter(c => c.id !== categoryId));
    syncDeleteToSupabase(categoryId);

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
