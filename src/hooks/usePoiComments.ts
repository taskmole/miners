"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PoiComment, PoiCommentsState } from '@/types/comments';
import { POI_COMMENTS_VERSION } from '@/types/comments';
import { apiFetch } from '@/lib/api-client';
import { logActivity } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

function generateId(): string {
  return crypto.randomUUID();
}

async function fetchCommentsFromApi(placeId: string): Promise<PoiComment[]> {
  try {
    const data = await apiFetch<any[]>(
      `/api/db/comments?entity_type=place&entity_id=${encodeURIComponent(placeId)}`
    );

    return (data || []).map((row) => ({
      id: row.id,
      entityType: row.entity_type as 'place',
      entityId: row.entity_id,
      content: row.content,
      createdBy: row.created_by || 'guest',
      authorName: 'Guest',
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching comments:', error);
    return [];
  }
}

async function syncAddToApi(comment: PoiComment, entityName?: string): Promise<void> {
  const userId = getCurrentUserId();

  try {
    await apiFetch('/api/db/comments', {
      method: 'POST',
      body: JSON.stringify({
        id: comment.id,
        entity_type: comment.entityType,
        entity_id: comment.entityId,
        content: comment.content,
        created_by: userId,
        created_at: comment.createdAt,
        entity_name: entityName || null,
      }),
    });
  } catch (error) {
    console.error('Error syncing comment:', error);
  }
}

async function syncDeleteToApi(commentId: string): Promise<void> {
  try {
    await apiFetch(`/api/db/comments?id=${encodeURIComponent(commentId)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    console.error('Error deleting comment:', error);
  }
}

export function usePoiComments() {
  const [state, setState] = useState<PoiCommentsState>({ version: POI_COMMENTS_VERSION, comments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const fetchedFromApi = useRef<Set<string>>(new Set());

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const getComments = useCallback((placeId: string): PoiComment[] => {
    if (!fetchedFromApi.current.has(placeId)) {
      fetchedFromApi.current.add(placeId);

      fetchCommentsFromApi(placeId).then((apiComments) => {
        if (apiComments.length > 0) {
          setState(prev => {
            const existing = prev.comments[placeId] || [];
            const existingIds = new Set(existing.map(c => c.id));
            const newComments = apiComments.filter(c => !existingIds.has(c.id));

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

    syncAddToApi(comment, entityName);
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
    syncDeleteToApi(commentId);
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
