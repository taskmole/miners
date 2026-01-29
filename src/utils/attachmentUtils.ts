/**
 * Shared utilities for processing attachments (images, documents)
 * Used by both POI attachments and trip attachments
 */

import type { Attachment } from '@/types/attachments';
import {
  IMAGE_COMPRESSION,
  validateFile,
  getFileCategory,
} from '@/types/attachments';

// Generate unique ID
export function generateAttachmentId(): string {
  return crypto.randomUUID();
}

// Compress an image using canvas
export async function compressImage(file: File): Promise<string> {
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
export async function generateThumbnail(file: File): Promise<string> {
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
export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Process a file and create an attachment object
export async function processFileToAttachment(
  file: File,
  uploaderName: string = 'Guest'
): Promise<{ success: boolean; attachment?: Attachment; error?: string }> {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
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
      id: generateAttachmentId(),
      name: file.name,
      type: file.type,
      data,
      thumbnailData,
      size: file.size,
      addedAt: new Date().toISOString(),
      uploadedByName: uploaderName,
    };

    return { success: true, attachment };
  } catch (error) {
    console.error('Error processing attachment:', error);
    return { success: false, error: 'Failed to process file' };
  }
}
