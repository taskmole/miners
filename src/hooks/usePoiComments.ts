"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoiComment, PoiCommentsState } from '@/types/comments';
import { POI_COMMENTS_VERSION } from '@/types/comments';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { withSupabase, logActivity } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

function generateId(): string {
  return crypto.randomUUID();
}

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

async function syncAddToSupabase(comment: PoiComment, entityName?: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getCurrentUserId();

  try {
    await supabase.from('comments').upsert({
      id: comment.id,
      entity_type: comment.entityType,
      entity_id: comment.entityId,
      content: comment.content,
      created_by: userId,
      created_at: comment.createdAt,
      entity_name: entityName || null,
    }, { onConflict: 'id' });
  } catch (error) {
    console.error('Error syncing comment to Supabase:', error);
  }
}

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

export function usePoiComments() {
  const [state, setState] = useState<PoiCommentsState>({ version: POI_COMMENTS_VERSION, comments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const fetchedFromSupabase = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const getComments = useCallback((placeId: string): PoiComment[] => {
    if (!fetchedFromSupabase.current.has(placeId)) {
      fetchedFromSupabase.current.add(placeId);

      withSupabase(
        () => fetchCommentsFromSupabase(placeId),
        [],
        `fetch comments for ${placeId}`
      ).then((supabaseComments) => {
        if (supabaseComments.length > 0) {
          setState(prev => {
            const existing = prev.comments[placeId] || [];
            const existingIds = new Set(existing.map(c => c.id));
            const newComments = supabaseComments.filter(c => !existingIds.has(c.id));

            if (newComments.length > 0) {
              return {
                ...prev,
                comments: {
                  ...prev.comments,
                  [placeId]: [...existing, ...newComments],
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

  const addComment = useCallback((placeId: string, text: string, entityName?: string): void => {
    if (!text.trim()) return;

    const comment: PoiComment = {
      id: generateId(),
      entityType: 'place',
      entityId: placeId,
      content: text.trim(),
      createdBy: 'guest',
      authorName: 'Guest',
      createdAt: new Date().toISOString(),
    };

    setState(prev => ({
      ...prev,
      comments: {
        ...prev.comments,
        [placeId]: [...(prev.comments[placeId] || []), comment],
      },
    }));

    syncAddToSupabase(comment, entityName);
  }, []);

  const removeComment = useCallback((placeId: string, commentId: string, meta?: { placeName?: string }): void => {
    setState(prev => ({
      ...prev,
      comments: {
        ...prev.comments,
        [placeId]: (prev.comments[placeId] || []).filter(c => c.id !== commentId),
      },
    }));

    logActivity('deleted_comment', { placeId, placeName: meta?.placeName });
    syncDeleteToSupabase(commentId);
  }, []);

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
