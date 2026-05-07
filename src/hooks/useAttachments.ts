"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Attachment, PoiAttachmentsState } from '@/types/attachments';
import {
  POI_ATTACHMENTS_VERSION,
  IMAGE_COMPRESSION,
  validateFile,
  getFileCategory,
} from '@/types/attachments';
import { apiFetch } from '@/lib/api-client';
import { logActivity } from '@/lib/supabaseHelpers';
import { getCurrentUserId } from '@/lib/browser-session';

const BUCKET_NAME = 'attachments';

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Upload file to Supabase Storage via a signed upload URL from the API.
 * Returns the storage path if successful, null if failed.
 */
async function uploadToStorage(placeId: string, file: File, attachmentId: string): Promise<string | null> {
  const userId = getCurrentUserId();
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${userId}/${placeId}/${attachmentId}.${ext}`;

  try {
    // Get a signed upload URL from the server
    const urlData = await apiFetch<{ signedUrl: string; path: string; token: string }>('/api/db/attachments', {
      method: 'POST',
      body: JSON.stringify({ action: 'signed_upload_url', path: storagePath }),
    });

    if (!urlData?.signedUrl) {
      console.error('Error getting signed upload URL');
      return null;
    }

    // Upload directly to Storage using the signed URL
    const uploadRes = await fetch(urlData.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadRes.ok) {
      console.error('Error uploading to storage:', uploadRes.statusText);
      return null;
    }

    return storagePath;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    return null;
  }
}

/**
 * Get a signed URL for a private file (valid for 1 hour) via the API.
 */
async function getSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const data = await apiFetch<{ signedUrl: string }>('/api/db/attachments', {
      method: 'POST',
      body: JSON.stringify({ action: 'signed_read_url', path: storagePath }),
    });

    return data?.signedUrl || null;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return null;
  }
}

/**
 * Delete file metadata and storage via the API.
 */
async function deleteAttachment(attachmentId: string, storagePath?: string): Promise<void> {
  try {
    await apiFetch('/api/db/attachments', {
      method: 'DELETE',
      body: JSON.stringify({ id: attachmentId, storage_path: storagePath || null }),
    });
  } catch (error) {
    console.error('Error deleting attachment:', error);
  }
}

/**
 * Fetch attachment metadata for a single POI from the API.
 */
async function fetchAttachmentsFromApi(placeId: string): Promise<Attachment[]> {
  try {
    const data = await apiFetch<Array<{
      id: string;
      place_id: string;
      name: string;
      type: string;
      storage_path: string | null;
      size: number | null;
      added_at: string;
      uploaded_by: string | null;
      uploaded_by_name: string | null;
    }>>(`/api/db/attachments?place_id=${encodeURIComponent(placeId)}`);

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
  } catch (error) {
    console.error('Error fetching attachments:', error);
    return [];
  }
}

/**
 * Write attachment metadata to the API (with retry built into apiFetch).
 */
async function writeMetadataToApi(placeId: string, attachment: Attachment): Promise<void> {
  const userId = getCurrentUserId();

  await apiFetch('/api/db/attachments', {
    method: 'POST',
    body: JSON.stringify({
      action: 'upsert_metadata',
      row: {
        id: attachment.id,
        place_id: placeId,
        name: attachment.name,
        type: attachment.type,
        storage_path: attachment.storagePath || null,
        size: attachment.size,
        added_at: attachment.addedAt,
        uploaded_by: userId,
        uploaded_by_name: attachment.uploadedByName || 'Guest',
      },
    }),
  });
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
 * Files are uploaded to Supabase Storage via signed upload URLs from the API.
 * Metadata is stored via the /api/db/attachments route.
 * Signed URLs are generated via the API for viewing private files.
 * Attachments are lazy-loaded per place_id from the API.
 */
export function useAttachments() {
  const [state, setState] = useState<PoiAttachmentsState>({ version: POI_ATTACHMENTS_VERSION, attachments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const fetchedFromApi = useRef<Set<string>>(new Set());

  // On mount: mark as loaded (attachments lazy-load per POI from API)
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    setIsLoaded(true);
  }, []);

  // Get attachments for a specific POI (lazy-loads from API)
  const getPoiAttachments = useCallback((placeId: string): Attachment[] => {
    // Lazy fetch from API if not already done for this POI
    if (!fetchedFromApi.current.has(placeId)) {
      fetchedFromApi.current.add(placeId);

      // Async fetch and merge (same pattern as usePoiComments)
      fetchAttachmentsFromApi(placeId).then((apiAttachments) => {
        if (apiAttachments.length > 0) {
          setState(prev => {
            const localAttachments = prev.attachments[placeId] || [];
            const localIds = new Set(localAttachments.map(a => a.id));
            const newAttachments = apiAttachments.filter(a => !localIds.has(a.id));

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

      // Upload to Supabase Storage via signed URL
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

      // Write metadata to API (async, non-blocking)
      writeMetadataToApi(placeId, attachment).catch((err) => {
        console.error('Failed to write attachment metadata:', err);
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

    // Delete metadata and storage via API
    deleteAttachment(attachmentId, attachment?.storagePath).catch((err) => {
      console.error('Failed to delete attachment:', err);
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
