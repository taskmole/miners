"use client";

import { useState, useEffect, useCallback } from 'react';
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

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
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
 * Hook for managing POI attachments with localStorage persistence
 */
export function useAttachments() {
  const [state, setState] = useState<PoiAttachmentsState>({ version: POI_ATTACHMENTS_VERSION, attachments: {} });
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

    // Check storage limit
    const currentUsage = getTotalStorageUsed();
    if (currentUsage >= MAX_TOTAL_STORAGE) {
      return { success: false, error: 'Storage full - delete some attachments first' };
    }

    try {
      const category = getFileCategory(file.type);
      let data: string;
      let thumbnailData: string | undefined;

      // Process based on file type
      if (category === 'image') {
        // Compress image and generate thumbnail
        data = await compressImage(file);
        thumbnailData = await generateThumbnail(file);
      } else {
        // Read as-is for other file types
        data = await readFileAsBase64(file);
      }

      const attachment: Attachment = {
        id: generateId(),
        name: file.name,
        type: file.type,
        data,
        thumbnailData,
        size: file.size,
        addedAt: new Date().toISOString(),
        uploadedByName: 'Guest', // Will be replaced with actual user name when auth is added
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
    setState(prev => ({
      ...prev,
      attachments: {
        ...prev.attachments,
        [placeId]: (prev.attachments[placeId] || []).filter(att => att.id !== attachmentId),
      },
    }));
  }, []);

  // Get attachment count for a POI
  const getAttachmentCount = useCallback((placeId: string): number => {
    return (state.attachments[placeId] || []).length;
  }, [state.attachments]);

  return {
    isLoaded,
    getPoiAttachments,
    addPoiAttachment,
    removePoiAttachment,
    getAttachmentCount,
    getTotalStorageUsed,
    getStorageWarning,
  };
}
