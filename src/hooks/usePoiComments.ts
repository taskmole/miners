"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoiComment, PoiCommentsState } from '@/types/comments';
import {
  POI_COMMENTS_STORAGE_KEY,
  POI_COMMENTS_VERSION,
} from '@/types/comments';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAnonymousUserId, withSupabase } from '@/lib/supabaseHelpers';

/**
 * Generate unique ID for comments
 * Uses crypto.randomUUID() which matches Supabase's UUID format
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get initial state from localStorage
 */
function getInitialState(): PoiCommentsState {
  if (typeof window === 'undefined') {
    return { version: POI_COMMENTS_VERSION, comments: {} };
  }

  try {
    const saved = localStorage.getItem(POI_COMMENTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PoiCommentsState;
      return {
        version: parsed.version || POI_COMMENTS_VERSION,
        comments: parsed.comments || {},
      };
    }
  } catch (error) {
    console.error('Error loading POI comments from localStorage:', error);
  }

  return { version: POI_COMMENTS_VERSION, comments: {} };
}

/**
 * Fetch comments for a POI from Supabase
 */
async function fetchCommentsFromSupabase(placeId: string): Promise<PoiComment[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data, error } = await supabase
    .from('comments')
    .select('id, entity_type, entity_id, content, created_by, created_at')
    .eq('entity_type', 'place')
    .eq('entity_id', placeId);

  if (error) {
    console.error('Error fetching comments from Supabase:', error);
    return [];
  }

  return data?.map((row) => ({
    id: row.id,
    entityType: row.entity_type as 'place',
    entityId: row.entity_id,
    content: row.content,
    createdBy: row.created_by || 'guest',
    authorName: 'Guest',
    createdAt: row.created_at,
  })) || [];
}

/**
 * Sync comment add to Supabase
 */
async function syncAddToSupabase(comment: PoiComment, entityName?: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getAnonymousUserId();

  try {
    await supabase.from('comments').upsert({
      id: comment.id,
      entity_type: comment.entityType,
      entity_id: comment.entityId,
      content: comment.content,
      created_by: userId,
      created_at: comment.createdAt,
      entity_name: entityName || null, // POI name for activity feed display
    }, { onConflict: 'id' });
  } catch (error) {
    console.error('Error syncing comment to Supabase:', error);
  }
}

/**
 * Sync comment delete to Supabase
 */
async function syncDeleteToSupabase(commentId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);
  } catch (error) {
    console.error('Error deleting comment from Supabase:', error);
  }
}

/**
 * Hook for managing POI comments with Supabase + localStorage persistence
 *
 * Dual-write pattern:
 * - On load: localStorage first, then lazy-load from Supabase per POI
 * - On add: Write to localStorage first (instant), then Supabase (async)
 *
 * Comments are loaded lazily per-POI to avoid loading all comments at once.
 */
export function usePoiComments() {
  const [state, setState] = useState<PoiCommentsState>({ version: POI_COMMENTS_VERSION, comments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const fetchedFromSupabase = useRef<Set<string>>(new Set());

  // Load from localStorage on mount
  useEffect(() => {
    const initialState = getInitialState();
    setState(initialState);
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever state changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(POI_COMMENTS_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving POI comments to localStorage:', error);
    }
  }, [state, isLoaded]);

  // Get comments for a specific POI (with lazy Supabase fetch)
  const getComments = useCallback((placeId: string): PoiComment[] => {
    // Lazy fetch from Supabase if not already done for this POI
    if (!fetchedFromSupabase.current.has(placeId)) {
      fetchedFromSupabase.current.add(placeId);

      // Async fetch and merge
      withSupabase(
        () => fetchCommentsFromSupabase(placeId),
        [],
        `fetch comments for ${placeId}`
      ).then((supabaseComments) => {
        if (supabaseComments.length > 0) {
          setState(prev => {
            const localComments = prev.comments[placeId] || [];
            const localIds = new Set(localComments.map(c => c.id));
            const newComments = supabaseComments.filter(c => !localIds.has(c.id));

            if (newComments.length > 0) {
              return {
                ...prev,
                comments: {
                  ...prev.comments,
                  [placeId]: [...localComments, ...newComments],
                },
              };
            }
            return prev;
          });
        }
      });
    }

    return state.comments[placeId] || [];
  }, [state.comments]);

  // Add a comment to a POI
  // entityName is optional - used for activity feed display (e.g., "Café Comercial")
  const addComment = useCallback((placeId: string, text: string, entityName?: string): void => {
    if (!text.trim()) return;

    const comment: PoiComment = {
      id: generateId(),
      entityType: 'place',
      entityId: placeId,
      content: text.trim(),
      createdBy: 'guest', // Will be auth.users.id in Supabase
      authorName: 'Guest', // Will be joined from users table in Supabase
      createdAt: new Date().toISOString(),
    };

    setState(prev => ({
      ...prev,
      comments: {
        ...prev.comments,
        [placeId]: [...(prev.comments[placeId] || []), comment],
      },
    }));

    // Sync to Supabase in background (includes entity_name for activity feed)
    syncAddToSupabase(comment, entityName);
  }, []);

  // Remove a comment from a POI
  const removeComment = useCallback((placeId: string, commentId: string): void => {
    setState(prev => ({
      ...prev,
      comments: {
        ...prev.comments,
        [placeId]: (prev.comments[placeId] || []).filter(c => c.id !== commentId),
      },
    }));

    // Sync to Supabase in background
    syncDeleteToSupabase(commentId);
  }, []);

  // Get comment count for a POI
  const getCommentCount = useCallback((placeId: string): number => {
    return (state.comments[placeId] || []).length;
  }, [state.comments]);

  return {
    isLoaded,
    getComments,
    addComment,
    removeComment,
    getCommentCount,
  };
}
