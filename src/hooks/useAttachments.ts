"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Attachment, PoiAttachmentsState } from '@/types/attachments';
import {
  POI_ATTACHMENTS_STORAGE_KEY,
  POI_ATTACHMENTS_VERSION,
  MAX_TOTAL_STORAGE,
  STORAGE_WARNING_THRESHOLD,
  IMAGE_COMPRESSION,
  validateFile,
  getFileCategory,
} from '@/types/attachments';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getAnonymousUserId } from '@/lib/supabaseHelpers';

const BUCKET_NAME = 'attachments';

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Upload file to Supabase Storage
 * Returns the storage path if successful, null if failed
 */
async function uploadToStorage(placeId: string, file: File, attachmentId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const userId = getAnonymousUserId();
  // Create path: userId/placeId/attachmentId-filename
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
      .createSignedUrl(storagePath, 3600); // 1 hour

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

// Get initial state from localStorage
function getInitialState(): PoiAttachmentsState {
  if (typeof window === 'undefined') {
    return { version: POI_ATTACHMENTS_VERSION, attachments: {} };
  }

  try {
    const saved = localStorage.getItem(POI_ATTACHMENTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PoiAttachmentsState;
      return {
        version: parsed.version || POI_ATTACHMENTS_VERSION,
        attachments: parsed.attachments || {},
      };
    }
  } catch (error) {
    console.error('Error loading POI attachments from localStorage:', error);
  }

  return { version: POI_ATTACHMENTS_VERSION, attachments: {} };
}

// Compress an image using canvas
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if wider than max
      if (width > IMAGE_COMPRESSION.maxWidth) {
        height = (height * IMAGE_COMPRESSION.maxWidth) / width;
        width = IMAGE_COMPRESSION.maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Export as JPEG with compression
      const compressed = canvas.toDataURL('image/jpeg', IMAGE_COMPRESSION.quality);
      resolve(compressed);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Generate a thumbnail for an image
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

// Read file as base64
async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Hook for managing POI attachments with Supabase Storage + localStorage fallback
 *
 * Files are uploaded to Supabase Storage bucket.
 * Metadata stored in localStorage for quick access.
 * Signed URLs are generated for viewing private files.
 */
export function useAttachments() {
  const [state, setState] = useState<PoiAttachmentsState>({ version: POI_ATTACHMENTS_VERSION, attachments: {} });
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const initialState = getInitialState();
    setState(initialState);
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever state changes (after initial load)
  useEffect(() => {
    if (!isLoaded) return;

    try {
      localStorage.setItem(POI_ATTACHMENTS_STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving POI attachments to localStorage:', error);
    }
  }, [state, isLoaded]);

  // Calculate total storage used
  const getTotalStorageUsed = useCallback((): number => {
    let total = 0;
    Object.values(state.attachments).forEach(attachments => {
      attachments.forEach(att => {
        total += att.data.length;
        if (att.thumbnailData) total += att.thumbnailData.length;
      });
    });
    return total;
  }, [state.attachments]);

  // Check if storage warning should be shown
  const getStorageWarning = useCallback((): string | null => {
    const used = getTotalStorageUsed();
    const threshold = MAX_TOTAL_STORAGE * STORAGE_WARNING_THRESHOLD;

    if (used >= MAX_TOTAL_STORAGE) {
      return 'Storage full - delete some attachments';
    }
    if (used >= threshold) {
      return 'Storage almost full';
    }
    return null;
  }, [getTotalStorageUsed]);

  // Get attachments for a specific POI
  const getPoiAttachments = useCallback((placeId: string): Attachment[] => {
    return state.attachments[placeId] || [];
  }, [state.attachments]);

  // Add an attachment to a POI
  const addPoiAttachment = useCallback(async (placeId: string, file: File): Promise<{ success: boolean; error?: string }> => {
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

      // Try uploading to Supabase Storage first
      const storagePath = await uploadToStorage(placeId, file, attachmentId);

      let data = '';
      let signedUrl: string | undefined;

      if (storagePath) {
        // Successfully uploaded to cloud - get signed URL for display
        signedUrl = (await getSignedUrl(storagePath)) || undefined;
      } else {
        // Fallback to base64 in localStorage
        const currentUsage = getTotalStorageUsed();
        if (currentUsage >= MAX_TOTAL_STORAGE) {
          return { success: false, error: 'Storage full - delete some attachments first' };
        }

        if (category === 'image') {
          data = await compressImage(file);
        } else {
          data = await readFileAsBase64(file);
        }
      }

      const attachment: Attachment = {
        id: attachmentId,
        name: file.name,
        type: file.type,
        data,
        storagePath: storagePath || undefined,
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

      return { success: true };
    } catch (error) {
      console.error('Error adding attachment:', error);
      return { success: false, error: 'Failed to process file' };
    }
  }, [getTotalStorageUsed]);

  // Remove an attachment from a POI
  const removePoiAttachment = useCallback((placeId: string, attachmentId: string): void => {
    // Find the attachment to get its storage path (if any)
    const attachments = state.attachments[placeId] || [];
    const attachment = attachments.find(att => att.id === attachmentId);

    // Delete from Supabase Storage if it has a storage path
    if (attachment?.storagePath) {
      deleteFromStorage(attachment.storagePath);
    }

    setState(prev => ({
      ...prev,
      attachments: {
        ...prev.attachments,
        [placeId]: (prev.attachments[placeId] || []).filter(att => att.id !== attachmentId),
      },
    }));
  }, [state.attachments]);

  // Get attachment count for a POI
  const getAttachmentCount = useCallback((placeId: string): number => {
    return (state.attachments[placeId] || []).length;
  }, [state.attachments]);

  // Get display URL for an attachment (refreshes signed URL if needed)
  const getAttachmentUrl = useCallback(async (attachment: Attachment): Promise<string> => {
    // If it has a storage path, get a fresh signed URL
    if (attachment.storagePath) {
      const url = await getSignedUrl(attachment.storagePath);
      if (url) return url;
    }
    // Fall back to base64 data
    return attachment.data;
  }, []);

  return {
    isLoaded,
    getPoiAttachments,
    addPoiAttachment,
    removePoiAttachment,
    getAttachmentCount,
    getAttachmentUrl,
    getTotalStorageUsed,
    getStorageWarning,
  };
}
