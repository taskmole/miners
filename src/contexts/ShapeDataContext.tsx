"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { ShapeMetadata, ShapeComment } from '@/types/draw';
import { apiFetch } from '@/lib/api-client';
import { getCurrentUserId } from '@/lib/browser-session';
import type { Attachment } from '@/types/attachments';

async function loadMetadataFromApi(): Promise<Record<string, ShapeMetadata> | null> {
  try {
    const userId = getCurrentUserId();
    const data = await apiFetch<Array<{
      id: string;
      name: string | null;
      color: string | null;
      tags: string[] | null;
      link: string | null;
      category_id: string | null;
      address: string | null;
      address_coords: [number, number] | null;
      created_by: string | null;
      attachments: Attachment[] | null;
    }>>(`/api/db/drawn-features?user_id=${encodeURIComponent(userId)}`);

    if (!data) return null;

    const result: Record<string, ShapeMetadata> = {};
    for (const row of data) {
      result[row.id] = {
        name: row.name || undefined,
        color: row.color || undefined,
        tags: row.tags || undefined,
        link: row.link || undefined,
        categoryId: row.category_id || undefined,
        address: row.address || undefined,
        addressCoords: row.address_coords as [number, number] | undefined,
        createdBy: row.created_by || undefined,
        attachments: row.attachments as Attachment[] | undefined,
      };
    }
    return result;
  } catch (error) {
    console.error('Error loading metadata from API:', error);
    return null;
  }
}

async function loadCommentsForShape(shapeId: string): Promise<ShapeComment[]> {
  try {
    const data = await apiFetch<any[]>(
      `/api/db/comments?entity_type=drawn_feature&entity_id=${encodeURIComponent(shapeId)}`
    );

    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      text: row.content,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('Error loading comments:', error);
    return [];
  }
}

interface ShapeDataContextValue {
  allMetadata: Record<string, ShapeMetadata>;
  allComments: Record<string, ShapeComment[]>;
  setAllMetadata: React.Dispatch<React.SetStateAction<Record<string, ShapeMetadata>>>;
  setAllComments: React.Dispatch<React.SetStateAction<Record<string, ShapeComment[]>>>;
  isMetadataLoaded: boolean;
  fetchCommentsForShape: (shapeId: string) => void;
}

const ShapeDataContext = createContext<ShapeDataContextValue | null>(null);

export function ShapeDataProvider({ children }: { children: ReactNode }) {
  const [allMetadata, setAllMetadata] = useState<Record<string, ShapeMetadata>>({});
  const [allComments, setAllComments] = useState<Record<string, ShapeComment[]>>({});
  const [isMetadataLoaded, setIsMetadataLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const fetchedCommentShapes = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function load() {
      const sbMetadata = await loadMetadataFromApi();
      if (sbMetadata && Object.keys(sbMetadata).length > 0) {
        setAllMetadata(sbMetadata);
      }
      setIsMetadataLoaded(true);
    }

    load();
  }, []);

  const fetchCommentsForShape = useCallback((shapeId: string) => {
    if (fetchedCommentShapes.current.has(shapeId)) return;
    fetchedCommentShapes.current.add(shapeId);

    loadCommentsForShape(shapeId).then((comments) => {
      if (comments.length > 0) {
        setAllComments(prev => {
          const existing = prev[shapeId] || [];
          const existingIds = new Set(existing.map(c => c.id));
          const newComments = comments.filter(c => !existingIds.has(c.id));
          if (newComments.length === 0) return prev;
          return { ...prev, [shapeId]: [...existing, ...newComments] };
        });
      }
    });
  }, []);

  return (
    <ShapeDataContext.Provider value={{ allMetadata, allComments, setAllMetadata, setAllComments, isMetadataLoaded, fetchCommentsForShape }}>
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
