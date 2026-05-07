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

function generateId(): string {
  return crypto.randomUUID();
}

async function uploadToStorage(placeId: string, file: File, attachmentId: string): Promise<string | null> {
  const userId = getCurrentUserId();
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${userId}/${placeId}/${attachmentId}.${ext}`;

  try {
    const urlData = await apiFetch<{ signedUrl: string; path: string; token: string }>('/api/db/attachments', {
      method: 'POST',
      body: JSON.stringify({ action: 'signed_upload_url', path: storagePath }),
    });

    if (!urlData?.signedUrl) {
      console.error('Error getting signed upload URL');
      return null;
    }

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
      data: '',
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

      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      resolve(thumbnail);
    };

    img.onerror = () => reject(new Error('Failed to load image for thumbnail'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useAttachments() {
  const [state, setState] = useState<PoiAttachmentsState>({ version: POI_ATTACHMENTS_VERSION, attachments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);
  const fetchedFromApi = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    setIsLoaded(true);
  }, []);

  const getPoiAttachments = useCallback((placeId: string): Attachment[] => {
    if (!fetchedFromApi.current.has(placeId)) {
      fetchedFromApi.current.add(placeId);
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

  const addPoiAttachment = useCallback(async (
    placeId: string,
    file: File,
    meta?: { placeName?: string; placeType?: string; lat?: number; lon?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    try {
      const category = getFileCategory(file.type);
      const attachmentId = generateId();
      let thumbnailData: string | undefined;

      if (category === 'image') {
        thumbnailData = await generateThumbnail(file);
      }

      const storagePath = await uploadToStorage(placeId, file, attachmentId);

      if (!storagePath) {
        return { success: false, error: 'Upload failed. Please try again.' };
      }

      const signedUrl = (await getSignedUrl(storagePath)) || undefined;

      const attachment: Attachment = {
        id: attachmentId,
        name: file.name,
        type: file.type,
        data: '',
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

      writeMetadataToApi(placeId, attachment).catch((err) => {
        console.error('Failed to write attachment metadata:', err);
      });

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

  const removePoiAttachment = useCallback((
    placeId: string,
    attachmentId: string,
    meta?: { placeName?: string; placeType?: string }
  ): void => {
    const attachments = state.attachments[placeId] || [];
    const attachment = attachments.find(att => att.id === attachmentId);

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

    logActivity('deleted_attachment', { placeId, placeName: meta?.placeName, placeType: meta?.placeType });
  }, [state.attachments]);

  const getAttachmentCount = useCallback((placeId: string): number => {
    return (state.attachments[placeId] || []).length;
  }, [state.attachments]);

  const getAttachmentUrl = useCallback(async (attachment: Attachment): Promise<string> => {
    if (attachment.storagePath) {
      const url = await getSignedUrl(attachment.storagePath);
      if (url) return url;
    }
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
