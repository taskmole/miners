// Types and constants for POI and shape attachments

// Attachment stored as base64 (localStorage now, Supabase Storage later)
export interface Attachment {
  id: string;                   // UUID
  name: string;                 // Original filename (e.g., "floor-plan.pdf")
  type: string;                 // MIME type (image/jpeg, application/pdf, etc.)
  data: string;                 // Base64-encoded file content
  thumbnailData?: string;       // Base64-encoded thumbnail (200x200 for images)
  size: number;                 // Original file size in bytes
  addedAt: string;              // ISO timestamp
  uploadedBy?: string;          // User ID for attribution (future auth ready)
  uploadedByName: string;       // Display name (e.g., "Jaroslav" or "Guest")
}

// Supported file types by category
export const SUPPORTED_FILE_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  documents: ['application/pdf'],
  spreadsheets: [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
  ],
} as const;

// All supported MIME types as a flat array
export const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_FILE_TYPES.images,
  ...SUPPORTED_FILE_TYPES.documents,
  ...SUPPORTED_FILE_TYPES.spreadsheets,
];

// Storage limits
export const MAX_FILE_SIZE = 5 * 1024 * 1024;           // 5MB per file
export const MAX_TOTAL_STORAGE = 15 * 1024 * 1024;      // 15MB total
export const STORAGE_WARNING_THRESHOLD = 0.8;           // Warn at 80% (12MB)

// Image compression settings
export const IMAGE_COMPRESSION = {
  maxWidth: 1920,
  quality: 0.8,
  thumbnailSize: 200,
};

// File category type for UI rendering
export type FileCategory = 'image' | 'pdf' | 'spreadsheet' | 'unknown';

// Get file category from MIME type
export function getFileCategory(mimeType: string): FileCategory {
  if (SUPPORTED_FILE_TYPES.images.includes(mimeType as any)) return 'image';
  if (SUPPORTED_FILE_TYPES.documents.includes(mimeType as any)) return 'pdf';
  if (SUPPORTED_FILE_TYPES.spreadsheets.includes(mimeType as any)) return 'spreadsheet';
  return 'unknown';
}

// Get file extension from filename
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

// Validate a file before upload
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` };
  }

  // Check type
  if (!ALL_SUPPORTED_TYPES.includes(file.type as any)) {
    return { valid: false, error: 'Unsupported file type' };
  }

  return { valid: true };
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Format date for display in tooltip
export function formatUploadDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// POI Attachments storage structure (for localStorage)
export interface PoiAttachmentsState {
  version: number;
  attachments: Record<string, Attachment[]>; // Keyed by placeId
}

// localStorage key for POI attachments
export const POI_ATTACHMENTS_STORAGE_KEY = 'miners-poi-attachments';
export const POI_ATTACHMENTS_VERSION = 1;
