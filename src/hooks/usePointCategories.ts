"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  PointCategory,
  POINT_CATEGORIES_STORAGE_KEY,
  DEFAULT_CATEGORIES
} from '@/types/point-categories';
import type { ShapeMetadata } from '@/types/draw';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAnonymousUserId, withSupabase } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

// Storage key for shape metadata (to count points using a category)
const METADATA_STORAGE_KEY = 'miners-shape-metadata';

// State structure for localStorage
interface CategoriesState {
  version: number;
  categories: PointCategory[];
}

const CURRENT_VERSION = 1;

// Generate unique ID for new categories
function generateCategoryId(): string {
  return `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get initial state from localStorage or use defaults
function getInitialState(): CategoriesState {
  if (typeof window === 'undefined') {
    return { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES };
  }

  try {
    const saved = localStorage.getItem(POINT_CATEGORIES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as CategoriesState;
      // Merge with defaults to ensure system categories always exist
      const savedCatIds = new Set(parsed.categories.map(c => c.id));
      const missingDefaults = DEFAULT_CATEGORIES.filter(d => !savedCatIds.has(d.id));
      return {
        version: parsed.version || CURRENT_VERSION,
        categories: [...parsed.categories, ...missingDefaults],
      };
    }
  } catch (error) {
    console.error('Error loading point categories from localStorage:', error);
  }

  return { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES };
}

// Load shape metadata to count points using a category
function loadShapeMetadata(): Record<string, ShapeMetadata> {
  if (typeof window === 'undefined') return {};

  try {
    const saved = localStorage.getItem(METADATA_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

/**
 * Fetch categories from Supabase
 */
async function fetchFromSupabase(): Promise<PointCategory[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const currentId = getCurrentUserId();
  const anonId = getAnonymousUserId();

  // Fetch system categories + user's custom categories (both current and legacy anon ID)
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, is_system, created_at')
    .or(`is_system.eq.true,created_by.eq.${currentId},created_by.eq.${anonId}`);

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

/**
 * Sync a category create to Supabase
 */
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

/**
 * Sync a category delete to Supabase
 */
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

/**
 * Hook for managing point categories with Supabase + localStorage persistence
 *
 * Dual-write pattern:
 * - On load: Fetch from Supabase, merge with localStorage (Supabase wins)
 * - On change: Write to localStorage first (instant), then Supabase (async)
 *
 * Categories can be assigned to custom drawn points (not areas/polygons)
 */
export function usePointCategories() {
  const [categories, setCategories] = useState<PointCategory[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load from Supabase + localStorage on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function loadCategories() {
      // Start with localStorage (instant)
      const localState = getInitialState();
      const localCats = localState.categories;

      // Fetch from Supabase (async)
      const supabaseCats = await withSupabase(
        () => fetchFromSupabase(),
        [],
        'fetch categories'
      );

      // Merge: Supabase wins for existing IDs, but include local-only categories
      const supabaseIds = new Set(supabaseCats.map(c => c.id));
      const localOnlyCats = localCats.filter(c => !supabaseIds.has(c.id));

      // Also ensure DEFAULT_CATEGORIES are always present
      const mergedIds = new Set([...supabaseCats.map(c => c.id), ...localOnlyCats.map(c => c.id)]);
      const missingDefaults = DEFAULT_CATEGORIES.filter(d => !mergedIds.has(d.id));

      const mergedCats = [...supabaseCats, ...localOnlyCats, ...missingDefaults];

      setCategories(mergedCats);
      setIsLoaded(true);

      // Save merged state back to localStorage
      try {
        const state: CategoriesState = {
          version: CURRENT_VERSION,
          categories: mergedCats,
        };
        localStorage.setItem(POINT_CATEGORIES_STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.error('Error saving merged categories to localStorage:', error);
      }
    }

    loadCategories();
  }, []);

  // Save to localStorage whenever categories change (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      const state: CategoriesState = {
        version: CURRENT_VERSION,
        categories,
      };
      localStorage.setItem(POINT_CATEGORIES_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving point categories to localStorage:', error);
    }
  }, [categories, isLoaded]);

  // Count how many points use a specific category
  const getCategoryPointCount = useCallback((categoryId: string): number => {
    const metadata = loadShapeMetadata();
    let count = 0;
    for (const meta of Object.values(metadata)) {
      if (meta.categoryId === categoryId) {
        count++;
      }
    }
    return count;
  }, []);

  // Check if a category can be deleted
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

  // Create a new category
  const createCategory = useCallback((name: string): PointCategory | null => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return null;
    }

    // Check if category with same name already exists (case-insensitive)
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

    // Sync to Supabase in background
    syncCreateToSupabase(newCategory);

    return newCategory;
  }, [categories]);

  // Delete a category (only if allowed)
  const deleteCategory = useCallback((categoryId: string): boolean => {
    const { canDelete } = canDeleteCategory(categoryId);

    if (!canDelete) {
      return false;
    }

    setCategories(prev => prev.filter(c => c.id !== categoryId));

    // Sync to Supabase in background
    syncDeleteToSupabase(categoryId);

    return true;
  }, [canDeleteCategory]);

  // Get a category by ID
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
