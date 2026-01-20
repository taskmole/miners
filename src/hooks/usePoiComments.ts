"use client";

import { useState, useEffect, useCallback } from 'react';
import type { PoiComment, PoiCommentsState } from '@/types/comments';
import {
  POI_COMMENTS_STORAGE_KEY,
  POI_COMMENTS_VERSION,
} from '@/types/comments';

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
 * Hook for managing POI comments with localStorage persistence
 *
 * Supabase migration:
 * - Replace localStorage with supabase.from('comments')
 * - getComments: .select().eq('entity_type', 'place').eq('entity_id', placeId)
 * - addComment: .insert({ entity_type: 'place', entity_id, content, created_by })
 * - removeComment: .delete().eq('id', commentId)
 */
export function usePoiComments() {
  const [state, setState] = useState<PoiCommentsState>({ version: POI_COMMENTS_VERSION, comments: {} });
  const [isLoaded, setIsLoaded] = useState(false);

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

  // Get comments for a specific POI
  const getComments = useCallback((placeId: string): PoiComment[] => {
    return state.comments[placeId] || [];
  }, [state.comments]);

  // Add a comment to a POI
  const addComment = useCallback((placeId: string, text: string): void => {
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
