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
import { uploadToStorage, getSignedUrl } from '@/lib/attachment-storage';
import { logActivity } from '@/lib/supabaseHelpers';

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Deletes the row and the file. Throws when the server refuses, so the caller
 * can put the attachment back on screen: the server now answers 403 when the
 * signed-in person did not upload the file and is not an admin, and swallowing
 * that would leave the screen claiming a deletion that never happened.
 */
/**
 * apiFetch throws `API <status>: <body>`, where the body is the route's JSON.
 * The route now answers 403 with a sentence meant for the person reading the
 * screen, so dig it out rather than showing a guessed reason for every failure
 * - a dropped connection is not a permission problem.
 */
function serverMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : '';
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) return fallback;
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    return typeof parsed?.error === 'string' ? parsed.error : fallback;
  } catch {
    return fallback;
  }
}

async function deleteAttachment(attachmentId: string): Promise<void> {
  // No storage path is sent any more. The server reads it off the row it
  // actually deleted, because a path taken from the browser was never checked
  // against that row and could name somebody else's file.
  await apiFetch('/api/db/attachments', {
    method: 'DELETE',
    body: JSON.stringify({ id: attachmentId }),
  });
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

/**
 * Records the attachment. uploaded_by and uploaded_by_name are deliberately not
 * sent: the server stamps both from the verified session, because the row's
 * uploader decides who may later change or delete it. Returns the display name
 * the server stored, so the screen can drop the "Guest" placeholder.
 */
async function writeMetadataToApi(placeId: string, attachment: Attachment): Promise<string | null> {
  const result = await apiFetch<{ ok: boolean; uploaded_by_name?: string | null }>(
    '/api/db/attachments',
    {
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
        },
      }),
    },
  );

  return result?.uploaded_by_name || null;
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

      // This used to be fire-and-forget. It was survivable while the insert
      // could not be refused, but it is policy-checked now, so a refusal or an
      // expired token would leave the file in storage and on screen with no
      // record of it, and it would vanish on the next reload with no
      // explanation.
      try {
        const uploadedByName = await writeMetadataToApi(placeId, attachment);
        if (uploadedByName) {
          setState(prev => ({
            ...prev,
            attachments: {
              ...prev.attachments,
              [placeId]: (prev.attachments[placeId] || []).map(att =>
                att.id === attachmentId ? { ...att, uploadedByName } : att
              ),
            },
          }));
        }
      } catch (err) {
        console.error('Failed to write attachment metadata:', err);
        setState(prev => ({
          ...prev,
          attachments: {
            ...prev.attachments,
            [placeId]: (prev.attachments[placeId] || []).filter(att => att.id !== attachmentId),
          },
        }));
        return { success: false, error: serverMessage(err, 'Could not save that file. Please try again.') };
      }

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

  /**
   * Removes an attachment optimistically, and puts it back if the server says
   * no. Only the uploader or an admin may delete one, so "refused" is now a
   * normal answer rather than a bug, and the screen has to tell the truth
   * about it. The activity entry is only written once the delete has actually
   * happened, or the feed records deletions that never took place.
   */
  const removePoiAttachment = useCallback(async (
    placeId: string,
    attachmentId: string,
    meta?: { placeName?: string; placeType?: string }
  ): Promise<{ success: boolean; error?: string; noop?: boolean }> => {
    const attachments = state.attachments[placeId] || [];
    const attachment = attachments.find(att => att.id === attachmentId);
    // Already gone, usually a double tap on the remove button. Nothing to do,
    // and nothing worth putting a red toast on screen for.
    if (!attachment) return { success: true, noop: true };

    setState(prev => ({
      ...prev,
      attachments: {
        ...prev.attachments,
        [placeId]: (prev.attachments[placeId] || []).filter(att => att.id !== attachmentId),
      },
    }));

    try {
      await deleteAttachment(attachmentId);
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      // Put it back exactly where it was, rather than appending, so the list
      // does not reshuffle itself under a failed delete.
      setState(prev => {
        const current = prev.attachments[placeId] || [];
        if (current.some(att => att.id === attachmentId)) return prev;
        const restored = [...current];
        const originalIndex = attachments.findIndex(att => att.id === attachmentId);
        restored.splice(originalIndex === -1 ? restored.length : originalIndex, 0, attachment);
        return { ...prev, attachments: { ...prev.attachments, [placeId]: restored } };
      });
      return { success: false, error: serverMessage(error, 'Could not delete that file.') };
    }

    logActivity('deleted_attachment', { placeId, placeName: meta?.placeName, placeType: meta?.placeType });
    return { success: true };
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
