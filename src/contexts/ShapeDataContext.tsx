"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { ShapeMetadata, ShapeComment } from '@/types/draw';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/browser-session';
import type { Attachment } from '@/types/attachments';

async function loadMetadataFromSupabase(): Promise<Record<string, ShapeMetadata> | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const userId = getCurrentUserId();

    const { data, error } = await supabase
      .from('drawn_features')
      .select('id, name, color, tags, link, category_id, address, address_coords, created_by, attachments')
      .eq('user_id', userId);

    if (error || !data) return null;

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
    console.error('Error loading metadata from Supabase:', error);
    return null;
  }
}

async function loadCommentsForShape(shapeId: string): Promise<ShapeComment[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('id, content, created_at')
      .eq('entity_type', 'drawn_feature')
      .eq('entity_id', shapeId);

    if (error || !data) return [];

    return data.map(row => ({
      id: row.id,
      text: row.content,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error('Error loading comments from Supabase:', error);
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
      const sbMetadata = await loadMetadataFromSupabase();
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
