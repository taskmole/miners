"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Attachment, PoiAttachmentsState } from '@/types/attachments';
import {
  POI_ATTACHMENTS_VERSION,
  IMAGE_COMPRESSION,
  validateFile,
  getFileCategory,
} from '@/types/attachments';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { withRetry, logActivity } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

const BUCKET_NAME = 'attachments';

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Upload file to Supabase Storage.
 * Returns the storage path if successful, null if failed.
 */
async function uploadToStorage(placeId: string, file: File, attachmentId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const userId = getCurrentUserId();
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${userId}/${placeId}/${attachmentId}.${ext}`;

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('Error uploading to storage:', error);
      return null;
    }

    return storagePath;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    return null;
  }
}

/**
 * Get a signed URL for a private file (valid for 1 hour)
 */
async function getSignedUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 3600);

    if (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
}

/**
 * Delete file from Supabase Storage
 */
async function deleteFromStorage(storagePath: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
  } catch (error) {
    console.error('Error deleting from storage:', error);
  }
}

/**
 * Fetch attachment metadata for a single POI from the poi_attachments table.
 */
async function fetchAttachmentsFromSupabase(placeId: string): Promise<Attachment[]> {
  if (!isSupabaseConfigured() || !supabase) return [];

  const { data, error } = await supabase
    .from('poi_attachments')
    .select('id, place_id, name, type, storage_path, size, added_at, uploaded_by, uploaded_by_name')
    .eq('place_id', placeId);

  if (error) {
    console.error('Error fetching attachments from Supabase:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    data: '', // No base64 data; files live in Storage
    storagePath: row.storage_path || undefined,
    size: row.size || 0,
    addedAt: row.added_at,
    uploadedBy: row.uploaded_by || undefined,
    uploadedByName: row.uploaded_by_name || 'Guest',
  }));
}

/**
 * Write attachment metadata to the poi_attachments table (with retry).
 */
async function writeMetadataToSupabase(placeId: string, attachment: Attachment): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const userId = getCurrentUserId();

  await withRetry(async () => {
    const { error } = await supabase!.from('poi_attachments').upsert({
      id: attachment.id,
      place_id: placeId,
      name: attachment.name,
      type: attachment.type,
      storage_path: attachment.storagePath || null,
      size: attachment.size,
      added_at: attachment.addedAt,
      uploaded_by: userId,
      uploaded_by_name: attachment.uploadedByName || 'Guest',
    }, { onConflict: 'id' });

    if (error) throw error;
  }, 'write attachment metadata');
}

/**
 * Delete attachment metadata from the poi_attachments table (with retry).
 */
async function deleteMetadataFromSupabase(attachmentId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  await withRetry(async () => {
    const { error } = await supabase!.from('poi_attachments').delete().eq('id', attachmentId);
    if (error) throw error;
  }, 'delete attachment metadata');
}

// Generate a thumbnail for an image (used in the upload success path)
async function generateThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = IMAGE_COMPRESSION.thumbnailSize;

      // Calculate crop dimensions for square thumbnail
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw cropped and scaled image
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      resolve(thumbnail);
    };

    img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Hook for managing POI attachments.
 *
 * Files are uploaded to Supabase Storage bucket.
 * Metadata is stored in the poi_attachments table.
 * Signed URLs are generated for viewing private files.
 * Attachments are lazy-loaded per place_id from Supabase.
 */
export function useAttachments() {
  const [state, setState] = useState<PoiAttachmentsState>({ version: POI_ATTACHMENTS_VERSION, attachments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const fetchedFromSupabase = useRef<Set<string>>(new Set());

  // On mount: mark as loaded (attachments lazy-load per POI from Supabase)
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    setIsLoaded(true);
  }, []);

  // Get attachments for a specific POI (lazy-loads from Supabase)
  const getPoiAttachments = useCallback((placeId: string): Attachment[] => {
    // Lazy fetch from Supabase if not already done for this POI
    if (!fetchedFromSupabase.current.has(placeId)) {
      fetchedFromSupabase.current.add(placeId);

      // Async fetch and merge (same pattern as usePoiComments)
      fetchAttachmentsFromSupabase(placeId).then((supabaseAttachments) => {
        if (supabaseAttachments.length > 0) {
          setState(prev => {
            const localAttachments = prev.attachments[placeId] || [];
            const localIds = new Set(localAttachments.map(a => a.id));
            const newAttachments = supabaseAttachments.filter(a => !localIds.has(a.id));

            if (newAttachments.length > 0) {
              return {
                ...prev,
                attachments: {
                  ...prev.attachments,
                  [placeId]: [...localAttachments, ...newAttachments],
                },
              };
            }
            return prev;
          });
        }
      });
    }

    return state.attachments[placeId] || [];
  }, [state.attachments]);

  // Add an attachment to a POI
  const addPoiAttachment = useCallback(async (
    placeId: string,
    file: File,
    meta?: { placeName?: string; placeType?: string; lat?: number; lon?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const category = getFileCategory(file.type);
      const attachmentId = generateId();
      let thumbnailData: string | undefined;

      // Generate thumbnail for images
      if (category === 'image') {
        thumbnailData = await generateThumbnail(file);
      }

      // Upload to Supabase Storage
      const storagePath = await uploadToStorage(placeId, file, attachmentId);

      if (!storagePath) {
        // Storage upload failed. No base64 fallback. Show a clear error.
        return { success: false, error: 'Upload failed. Please try again.' };
      }

      // Get a signed URL for display
      const signedUrl = (await getSignedUrl(storagePath)) || undefined;

      const attachment: Attachment = {
        id: attachmentId,
        name: file.name,
        type: file.type,
        data: '', // No base64 data stored
        storagePath,
        signedUrl,
        thumbnailData,
        size: file.size,
        addedAt: new Date().toISOString(),
        uploadedByName: 'Guest',
      };

      setState(prev => ({
        ...prev,
        attachments: {
          ...prev.attachments,
          [placeId]: [...(prev.attachments[placeId] || []), attachment],
        },
      }));

      // Write metadata to Supabase table (async, non-blocking)
      writeMetadataToSupabase(placeId, attachment).catch((err) => {
        console.error('Failed to write attachment metadata to Supabase:', err);
      });

      // Log to activity feed
      logActivity('added_attachment', {
        placeId,
        placeName: meta?.placeName,
        placeType: meta?.placeType,
        lat: meta?.lat,
        lon: meta?.lon,
      });

      return { success: true };
    } catch (error) {
      console.error('Error adding attachment:', error);
      return { success: false, error: 'Failed to process file' };
    }
  }, []);

  // Remove an attachment from a POI
  const removePoiAttachment = useCallback((
    placeId: string,
    attachmentId: string,
    meta?: { placeName?: string; placeType?: string }
  ): void => {
    // Find the attachment to get its storage path
    const attachments = state.attachments[placeId] || [];
    const attachment = attachments.find(att => att.id === attachmentId);

    // Delete from Supabase Storage if it has a storage path
    if (attachment?.storagePath) {
      deleteFromStorage(attachment.storagePath);
    }

    // Delete metadata from Supabase table
    deleteMetadataFromSupabase(attachmentId).catch((err) => {
      console.error('Failed to delete attachment metadata from Supabase:', err);
    });

    setState(prev => ({
      ...prev,
      attachments: {
        ...prev.attachments,
        [placeId]: (prev.attachments[placeId] || []).filter(att => att.id !== attachmentId),
      },
    }));

    // Log to activity feed
    logActivity('deleted_attachment', { placeId, placeName: meta?.placeName, placeType: meta?.placeType });
  }, [state.attachments]);

  // Get attachment count for a POI
  const getAttachmentCount = useCallback((placeId: string): number => {
    return (state.attachments[placeId] || []).length;
  }, [state.attachments]);

  // Get display URL for an attachment (refreshes signed URL if needed)
  const getAttachmentUrl = useCallback(async (attachment: Attachment): Promise<string> => {
    if (attachment.storagePath) {
      const url = await getSignedUrl(attachment.storagePath);
      if (url) return url;
    }
    // Return empty string if no storage path and no data
    return attachment.data || '';
  }, []);

  return {
    isLoaded,
    getPoiAttachments,
    addPoiAttachment,
    removePoiAttachment,
    getAttachmentCount,
    getAttachmentUrl,
  };
}
