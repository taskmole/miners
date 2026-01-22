"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MapPopup } from '@/components/ui/map';
import { useMapDraw } from '@/hooks/useMapDraw';
import { Pencil, X, Trash2, Users, Scan, Link, ExternalLink, Paperclip, ChevronDown, MessageSquare, Banknote, ListPlus, FolderOpen, Plus, Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { AddToListButton } from '@/components/AddToListButton';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/contexts/ToastContext';
import { AttachmentGallery } from '@/components/attachments';
import type { Attachment } from '@/types/attachments';
import { validateFile, IMAGE_COMPRESSION, getFileCategory } from '@/types/attachments';
import type { ShapeComment, ShapeMetadata } from '@/types/draw';
import type { Feature, Polygon } from 'geojson';
import { getCachedStats, invalidateStatsCache, formatArea, formatPopulation, formatIncome } from '@/lib/area-calculations';
import { useGeoData } from '@/contexts/GeoDataContext';
import { useLinking } from '@/contexts/LinkingContext';
import { usePointCategoriesContext } from '@/contexts/PointCategoriesContext';
import { reverseGeocode, formatShortAddress } from '@/lib/geocoding';

// Storage keys
const COMMENTS_STORAGE_KEY = 'miners-drawn-comments';
const METADATA_STORAGE_KEY = 'miners-shape-metadata';

// Load/save comments from localStorage
function loadComments(): Record<string, ShapeComment[]> {
  try {
    const saved = localStorage.getItem(COMMENTS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveComments(comments: Record<string, ShapeComment[]>) {
  try {
    localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(comments));
  } catch (error) {
    console.error('Error saving comments:', error);
  }
}

// Load/save metadata (name, color, tags) from localStorage
function loadMetadata(): Record<string, ShapeMetadata> {
  try {
    const saved = localStorage.getItem(METADATA_STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveMetadata(metadata: Record<string, ShapeMetadata>) {
  try {
    localStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error('Error saving metadata:', error);
  }
}

// Get center point of a geometry for popup placement
function getGeometryCenter(geometry: GeoJSON.Geometry): [number, number] | null {
  switch (geometry.type) {
    case 'Polygon': {
      const ring = (geometry.coordinates as number[][][])[0];
      let sumLng = 0, sumLat = 0;
      for (const [lng, lat] of ring) {
        sumLng += lng;
        sumLat += lat;
      }
      return [sumLng / ring.length, sumLat / ring.length];
    }
    case 'LineString': {
      const coords = geometry.coordinates as number[][];
      const midIndex = Math.floor(coords.length / 2);
      return coords[midIndex] as [number, number];
    }
    case 'Point':
      return geometry.coordinates as [number, number];
    default:
      return null;
  }
}

// Format relative time (e.g., "2h ago")
function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Extract root domain from URL (e.g., "app.tesla.com" → "tesla.com")
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    let domain = urlObj.hostname.replace(/^www\./, '');
    const parts = domain.split('.');
    if (parts.length > 2) {
      domain = parts.slice(-2).join('.');
    }
    return domain;
  } catch {
    return url;
  }
}

// Image compression helper for shape attachments
async function compressImageForShape(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

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
      const compressed = canvas.toDataURL('image/jpeg', IMAGE_COMPRESSION.quality);
      resolve(compressed);
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Thumbnail generator for shape attachments
async function generateThumbnailForShape(file: File): Promise<string> {
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

// File reader helper
async function readFileAsBase64ForShape(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Tag input with portal dropdown (renders outside popup to avoid clipping)
function TagInput({
  value,
  onChange,
  onAdd,
  onFocus,
  onBlur,
  showSuggestions,
  suggestions,
  onSelectSuggestion,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
  showSuggestions: boolean;
  suggestions: string[];
  onSelectSuggestion: (tag: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (showSuggestions && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.top - 4, // Position above input
        left: rect.left,
      });
    }
  }, [showSuggestions, value]);

  return (
    <div className="flex-1 min-w-[80px]">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          onAdd(e);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="Add tag..."
        className="w-full text-xs bg-transparent outline-none placeholder:text-zinc-400"
      />
      {showSuggestions && suggestions.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed bg-white border border-zinc-200 rounded-lg shadow-lg py-1 z-[9999] min-w-[120px]"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            transform: 'translateY(-100%)',
          }}
        >
          {suggestions.map(tag => (
            <button
              key={tag}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelectSuggestion(tag);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 transition-colors"
            >
              {tag}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// Main component - renders popup for selected shape
export function ShapeComments() {
  const { features, selectedFeatureIds, deleteFeatureById, clearSelection } = useMapDraw();
  const { showToast } = useToast();
  const { isLinking, addItem: addLinkingItem } = useLinking();
  const [allComments, setAllComments] = useState<Record<string, ShapeComment[]>>(loadComments);
  const [allMetadata, setAllMetadata] = useState<Record<string, ShapeMetadata>>(loadMetadata);

  // Track active popup independently from MapboxDraw selection
  // This prevents the popup from closing when MapboxDraw deselects
  const [activeShapeId, setActiveShapeId] = useState<string | null>(null);

  // Local state for popup editing
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [newComment, setNewComment] = useState('');
  const [newTag, setNewTag] = useState('');
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);

  // Category dropdown state
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Address fetching state (for Points only)
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);

  // Shared geo data from context (loaded once at app level)
  const { densityData, incomeData } = useGeoData();

  // Point categories context
  const {
    categories,
    createCategory,
    deleteCategory,
    canDeleteCategory,
    getCategoryPointCount,
    getCategoryById
  } = usePointCategoriesContext();

  // Collect all unique tags from all shapes for suggestions
  const allUniqueTags = useMemo(() => {
    const tags = new Set<string>();
    Object.values(allMetadata).forEach(meta => {
      meta.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags);
  }, [allMetadata]);

  // Listen for external select-drawn-shape events (from ScoutingTripDetail navigation)
  useEffect(() => {
    const handleSelectShape = (e: CustomEvent<{ shapeId: string }>) => {
      const { shapeId } = e.detail;
      // Check if the shape exists
      const feature = features.features.find(f => f.id === shapeId);
      if (feature) {
        setActiveShapeId(shapeId);
      }
    };

    window.addEventListener('select-drawn-shape', handleSelectShape as EventListener);
    return () => {
      window.removeEventListener('select-drawn-shape', handleSelectShape as EventListener);
    };
  }, [features.features]);

  // When MapboxDraw selection changes, open popup for newly selected shape
  // Or add to linking items if in linking mode
  const latestSelectedId = selectedFeatureIds[0];
  useEffect(() => {
    if (latestSelectedId) {
      if (isLinking) {
        // In linking mode, add shape to linking items instead of showing popup
        const feature = features.features.find(f => f.id === latestSelectedId);
        const metadata = allMetadata[latestSelectedId];
        const shapeName = metadata?.name || (feature?.geometry.type === 'Polygon' ? 'Drawn Area' : 'Drawn Point');

        addLinkingItem({
          type: 'area',
          id: latestSelectedId,
          name: shapeName,
        });

        // Clear selection immediately so user can select more
        clearSelection();
      } else {
        setActiveShapeId(latestSelectedId);
      }
    }
  }, [latestSelectedId, isLinking, features.features, allMetadata, addLinkingItem, clearSelection]);

  // Use activeShapeId for rendering (persists even when MapboxDraw deselects)
  const selectedId = activeShapeId;
  const selectedFeature = selectedId
    ? features.features.find(f => f.id === selectedId)
    : null;

  // Load and sync data when features change
  useEffect(() => {
    // Skip cleanup on initial empty state - features not loaded yet
    if (features.features.length === 0) return;

    const currentIds = new Set(features.features.map(f => f.id as string));

    // Clean up orphaned comments
    const comments = loadComments();
    const cleanedComments: Record<string, ShapeComment[]> = {};
    let commentsChanged = false;
    for (const [id, cmts] of Object.entries(comments)) {
      if (currentIds.has(id)) {
        cleanedComments[id] = cmts;
      } else {
        commentsChanged = true;
      }
    }
    if (commentsChanged) saveComments(cleanedComments);
    setAllComments(cleanedComments);

    // Clean up orphaned metadata
    const metadata = loadMetadata();
    const cleanedMetadata: Record<string, ShapeMetadata> = {};
    let metadataChanged = false;
    for (const [id, meta] of Object.entries(metadata)) {
      if (currentIds.has(id)) {
        cleanedMetadata[id] = meta;
      } else {
        metadataChanged = true;
      }
    }
    if (metadataChanged) saveMetadata(cleanedMetadata);
    setAllMetadata(cleanedMetadata);
  }, [features]);

  // Reset editing state when selection changes
  useEffect(() => {
    if (selectedId) {
      const metadata = allMetadata[selectedId];
      setNameValue(metadata?.name || '');
      setLinkValue(metadata?.link || '');
    }
    setEditingName(false);
    setEditingLink(false);
    setNewComment('');
    setNewTag('');
    // Reset category dropdown state
    setCategoryDropdownOpen(false);
    setIsAddingCategory(false);
    setNewCategoryName('');
  }, [selectedId, allMetadata]);

  // Auto-fetch address for Points that don't have one yet
  useEffect(() => {
    if (!selectedId || !selectedFeature) return;

    // Only for Points, not Polygons
    if (selectedFeature.geometry.type !== 'Point') return;

    // Skip if already has an address
    const metadata = allMetadata[selectedId];
    if (metadata?.address) return;

    // Get coordinates from the point geometry
    const coords = selectedFeature.geometry.coordinates as [number, number];
    const [lon, lat] = coords;

    setIsFetchingAddress(true);

    reverseGeocode(lat, lon)
      .then((address) => {
        // Save address to metadata
        const newMetadata = { ...allMetadata[selectedId], address };
        const updated = { ...allMetadata, [selectedId]: newMetadata };
        setAllMetadata(updated);
        saveMetadata(updated);
      })
      .catch((error) => {
        console.error('Failed to fetch address:', error);
      })
      .finally(() => {
        setIsFetchingAddress(false);
      });
  }, [selectedId, selectedFeature, allMetadata]);

  // Handlers
  const handleSaveName = useCallback(() => {
    if (!selectedId) return;
    const newMetadata = { ...allMetadata[selectedId], name: nameValue.trim() || undefined };
    const updated = { ...allMetadata, [selectedId]: newMetadata };
    setAllMetadata(updated);
    saveMetadata(updated);
    setEditingName(false);
    showToast('Saved');
  }, [selectedId, nameValue, allMetadata, showToast]);

  const handleSaveLink = useCallback(() => {
    if (!selectedId) return;
    const trimmed = linkValue.trim();
    const newMetadata = { ...allMetadata[selectedId], link: trimmed || undefined };
    const updated = { ...allMetadata, [selectedId]: newMetadata };
    setAllMetadata(updated);
    saveMetadata(updated);
    setEditingLink(false);
    showToast('Saved');
  }, [selectedId, linkValue, allMetadata, showToast]);

  const handleAddTag = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTag.trim() && selectedId) {
      e.preventDefault();
      const tags = allMetadata[selectedId]?.tags || [];
      if (!tags.includes(newTag.trim())) {
        const newMetadata = { ...allMetadata[selectedId], tags: [...tags, newTag.trim()] };
        const updated = { ...allMetadata, [selectedId]: newMetadata };
        setAllMetadata(updated);
        saveMetadata(updated);
        showToast('Saved');
      }
      setNewTag('');
    }
  }, [selectedId, newTag, allMetadata, showToast]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    if (!selectedId) return;
    const tags = allMetadata[selectedId]?.tags || [];
    const newMetadata = { ...allMetadata[selectedId], tags: tags.filter(t => t !== tagToRemove) };
    const updated = { ...allMetadata, [selectedId]: newMetadata };
    setAllMetadata(updated);
    saveMetadata(updated);
    showToast('Saved');
  }, [selectedId, allMetadata, showToast]);

  const handleAddComment = useCallback(() => {
    if (!newComment.trim() || !selectedId) return;
    const comment: ShapeComment = {
      id: `comment-${Date.now()}`,
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = {
      ...allComments,
      [selectedId]: [...(allComments[selectedId] || []), comment]
    };
    setAllComments(updated);
    saveComments(updated);
    setNewComment('');
    showToast('Saved');
  }, [selectedId, newComment, allComments, showToast]);

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!selectedId) return;
    const updated = {
      ...allComments,
      [selectedId]: (allComments[selectedId] || []).filter(c => c.id !== commentId)
    };
    setAllComments(updated);
    saveComments(updated);
    showToast('Deleted');
  }, [selectedId, allComments, showToast]);

  // Attachment handlers for shapes
  const handleAddAttachment = useCallback(async (file: File): Promise<{ success: boolean; error?: string }> => {
    if (!selectedId) return { success: false, error: 'No shape selected' };

    const validation = validateFile(file);
    if (!validation.valid) {
      showToast(validation.error || 'Invalid file', 'error');
      return { success: false, error: validation.error };
    }

    try {
      const category = getFileCategory(file.type);
      let data: string;
      let thumbnailData: string | undefined;

      if (category === 'image') {
        // Compress and generate thumbnail
        data = await compressImageForShape(file);
        thumbnailData = await generateThumbnailForShape(file);
      } else {
        data = await readFileAsBase64ForShape(file);
      }

      const attachment: Attachment = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        data,
        thumbnailData,
        size: file.size,
        addedAt: new Date().toISOString(),
        uploadedByName: 'Guest',
      };

      const currentAttachments = allMetadata[selectedId]?.attachments || [];
      const newMetadata = { ...allMetadata[selectedId], attachments: [...currentAttachments, attachment] };
      const updated = { ...allMetadata, [selectedId]: newMetadata };
      setAllMetadata(updated);
      saveMetadata(updated);
      showToast('Saved');
      return { success: true };
    } catch (error) {
      console.error('Error adding attachment:', error);
      showToast('Failed to add attachment', 'error');
      return { success: false, error: 'Failed to process file' };
    }
  }, [selectedId, allMetadata, showToast]);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    if (!selectedId) return;
    const currentAttachments = allMetadata[selectedId]?.attachments || [];
    const newMetadata = { ...allMetadata[selectedId], attachments: currentAttachments.filter(a => a.id !== attachmentId) };
    const updated = { ...allMetadata, [selectedId]: newMetadata };
    setAllMetadata(updated);
    saveMetadata(updated);
    showToast('Deleted');
  }, [selectedId, allMetadata, showToast]);

  // Handle popup close
  const handleClosePopup = useCallback((e?: React.MouseEvent) => {
    // Stop propagation to prevent click from reaching map and re-selecting
    e?.stopPropagation();
    setActiveShapeId(null);
    setEditingName(false);
    setNewComment('');
    setNewTag('');
    // Clear selection so hover tooltip can show again
    clearSelection();
  }, [clearSelection]);

  // Handle delete shape
  const handleDeleteShape = useCallback(() => {
    if (!selectedId) return;
    deleteFeatureById(selectedId);
    setActiveShapeId(null);
    showToast('Deleted');
  }, [selectedId, deleteFeatureById, showToast]);

  // Calculate area, population, and income for polygons (must be before early returns - React hooks rule)
  // Uses cached stats to avoid recalculating on every render
  const areaStats = useMemo(() => {
    if (!selectedFeature || selectedFeature.geometry.type !== 'Polygon' || !selectedId) return null;
    const feature = selectedFeature as Feature<Polygon>;
    const stats = getCachedStats(selectedId, feature, densityData, incomeData);
    return { areaKm2: stats.area, population: stats.population, avgIncome: stats.income };
  }, [selectedFeature, selectedId, densityData, incomeData]);

  // Don't render if nothing selected
  if (!selectedFeature || !selectedId) {
    return null;
  }

  const center = getGeometryCenter(selectedFeature.geometry);
  if (!center) return null;

  const metadata = allMetadata[selectedId] || {};
  const comments = allComments[selectedId] || [];
  const isPolygon = selectedFeature.geometry.type === 'Polygon';
  const placeholderName = isPolygon ? 'Untitled Area' : 'Untitled Point';

  return (
    <MapPopup
      longitude={center[0]}
      latitude={center[1]}
      closeButton={false}
      offset={16}
      anchor="top"
      onClose={handleClosePopup}
    >
      <div className="popup-base" style={{ width: '320px' }}>

          {/* Header - Name with action buttons */}
          <div className="popup-header" style={{ padding: '16px 20px 12px' }}>
            {/* Action buttons - top right (matching POI popup style) */}
            <div className="absolute top-2.5 right-3 z-20 flex items-center gap-1.5">
              <button
                onClick={handleDeleteShape}
                className="h-[27px] w-[27px] rounded-full bg-white/90 hover:bg-gray-100 hover:scale-110 shadow-md flex items-center justify-center transition-all duration-200"
                title="Delete shape"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-500" />
              </button>
              <button
                onClick={handleClosePopup}
                className="h-[27px] w-[27px] rounded-full bg-white/90 hover:bg-gray-100 hover:scale-110 shadow-md flex items-center justify-center transition-all duration-200"
                aria-label="Close popup"
              >
                <X className="w-3.5 h-3.5 text-zinc-700" />
              </button>
            </div>
            <div className="w-full">
              {/* Name - editable */}
              {editingName ? (
                <input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') {
                      setNameValue(metadata.name || '');
                      setEditingName(false);
                    }
                  }}
                  onBlur={handleSaveName}
                  className="text-base font-semibold text-zinc-900 bg-transparent outline-none w-full"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => setEditingName(true)}
                  className="text-left group flex items-center gap-2"
                >
                  <span className={cn(
                    "text-base font-semibold",
                    metadata.name ? "text-zinc-900" : "text-zinc-400"
                  )}>
                    {metadata.name || placeholderName}
                  </span>
                  <Pencil className="w-3.5 h-3.5 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              {/* Creator info */}
              <div className="text-[10px] text-zinc-400 mt-1" title="jzapletal1@gmail.com">
                Created by <span className="font-semibold">Jaroslav</span>
              </div>
            </div>
          </div>

          {/* Link section */}
          <div className="border-t border-zinc-100" style={{ padding: '10px 20px' }}>
            {editingLink ? (
              <div className="flex items-center gap-2">
                <Link className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                <input
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') handleSaveLink();
                    if (e.key === 'Escape') {
                      setLinkValue(metadata.link || '');
                      setEditingLink(false);
                    }
                  }}
                  onBlur={handleSaveLink}
                  placeholder="Paste URL..."
                  className="flex-1 text-sm text-zinc-600 bg-transparent outline-none"
                  autoFocus
                />
              </div>
            ) : metadata.link ? (
              <div className="flex items-center gap-2">
                <a
                  href={metadata.link.startsWith('http') ? metadata.link : `https://${metadata.link}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {extractDomain(metadata.link)}
                </a>
                <button
                  onClick={() => setEditingLink(true)}
                  className="p-1 hover:bg-zinc-100 rounded transition-colors"
                >
                  <Pencil className="w-3 h-3 text-zinc-400" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingLink(true)}
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600"
              >
                <Link className="w-3.5 h-3.5" />
                <span>Add link</span>
              </button>
            )}
          </div>

          {/* Address section - only for Points, not Polygons */}
          {!isPolygon && (
            <div className="border-t border-zinc-100" style={{ padding: '10px 20px' }}>
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                {isFetchingAddress ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 border-[1.5px] border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
                    <span className="text-sm text-zinc-400">Loading</span>
                  </div>
                ) : metadata.address ? (
                  <span className="text-sm text-zinc-600" title={metadata.address}>
                    {formatShortAddress(metadata.address)}
                  </span>
                ) : (
                  <span className="text-sm text-zinc-400 italic">Address unavailable</span>
                )}
              </div>
            </div>
          )}

          {/* Category section - only for Points, not Polygons */}
          {!isPolygon && (
            <div className="border-t border-zinc-100" style={{ padding: '12px 20px' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Category</span>
              </div>

              {isAddingCategory ? (
                // Add new category inline form
                <div className="flex items-center gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter' && newCategoryName.trim()) {
                        const created = createCategory(newCategoryName.trim());
                        if (created && selectedId) {
                          const newMetadata = { ...allMetadata[selectedId], categoryId: created.id };
                          const updated = { ...allMetadata, [selectedId]: newMetadata };
                          setAllMetadata(updated);
                          saveMetadata(updated);
                          showToast('Category created');
                        }
                        setNewCategoryName('');
                        setIsAddingCategory(false);
                      }
                      if (e.key === 'Escape') {
                        setNewCategoryName('');
                        setIsAddingCategory(false);
                      }
                    }}
                    placeholder="Category name..."
                    className="h-8 text-sm flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => {
                      if (newCategoryName.trim()) {
                        const created = createCategory(newCategoryName.trim());
                        if (created && selectedId) {
                          const newMetadata = { ...allMetadata[selectedId], categoryId: created.id };
                          const updated = { ...allMetadata, [selectedId]: newMetadata };
                          setAllMetadata(updated);
                          saveMetadata(updated);
                          showToast('Category created');
                        }
                      }
                      setNewCategoryName('');
                      setIsAddingCategory(false);
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => {
                      setNewCategoryName('');
                      setIsAddingCategory(false);
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                // Category popover dropdown
                <Popover open={categoryDropdownOpen} onOpenChange={setCategoryDropdownOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryDropdownOpen}
                      className="w-full justify-between h-9 text-sm font-normal"
                    >
                      <span className={cn(
                        metadata.categoryId ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {metadata.categoryId
                          ? getCategoryById(metadata.categoryId)?.name || 'Unknown'
                          : 'Select category...'}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[240px] p-0" align="start" side="top" sideOffset={4}>
                    <div className="max-h-[300px] overflow-y-auto">
                      {/* None option */}
                      <button
                        onClick={() => {
                          if (selectedId) {
                            const newMetadata = { ...allMetadata[selectedId], categoryId: undefined };
                            const updated = { ...allMetadata, [selectedId]: newMetadata };
                            setAllMetadata(updated);
                            saveMetadata(updated);
                            showToast('Saved');
                          }
                          setCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2",
                          !metadata.categoryId && "bg-accent"
                        )}
                      >
                        <Check className={cn(
                          "h-4 w-4",
                          !metadata.categoryId ? "opacity-100" : "opacity-0"
                        )} />
                        <span className="text-muted-foreground italic">None</span>
                      </button>

                      {/* Separator */}
                      <div className="h-px bg-border my-1" />

                      {/* Category options */}
                      {categories.map((cat) => {
                        const isSelected = metadata.categoryId === cat.id;
                        const { canDelete, reason } = canDeleteCategory(cat.id);

                        return (
                          <div
                            key={cat.id}
                            className={cn(
                              "flex items-center px-3 py-2 hover:bg-accent transition-colors group",
                              isSelected && "bg-accent"
                            )}
                          >
                            <button
                              onClick={() => {
                                if (selectedId) {
                                  const newMetadata = { ...allMetadata[selectedId], categoryId: cat.id };
                                  const updated = { ...allMetadata, [selectedId]: newMetadata };
                                  setAllMetadata(updated);
                                  saveMetadata(updated);
                                  showToast('Saved');
                                }
                                setCategoryDropdownOpen(false);
                              }}
                              className="flex-1 text-left text-sm flex items-center gap-2"
                            >
                              <Check className={cn(
                                "h-4 w-4",
                                isSelected ? "opacity-100" : "opacity-0"
                              )} />
                              {cat.name}
                            </button>

                            {/* Delete button - only for user-created categories */}
                            {!cat.isSystem && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (canDelete) {
                                    deleteCategory(cat.id);
                                    showToast('Category deleted');
                                  } else {
                                    showToast(reason || 'Cannot delete', 'error');
                                  }
                                }}
                                className={cn(
                                  "p-1 rounded transition-all",
                                  canDelete
                                    ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                                    : "text-muted-foreground/30 cursor-not-allowed opacity-0 group-hover:opacity-100"
                                )}
                                title={canDelete ? 'Delete category' : reason}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Separator */}
                      <div className="h-px bg-border my-1" />

                      {/* Add new option */}
                      <button
                        onClick={() => {
                          setCategoryDropdownOpen(false);
                          setIsAddingCategory(true);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add new category...</span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}

          {/* Stats section - Area, Population, and Income (only for polygons) */}
          {areaStats && (
            <div className="border-t border-zinc-100" style={{ padding: '12px 20px' }}>
              <div className="flex items-center gap-4">
                {/* Area stat with tooltip */}
                <div className="relative group flex items-center gap-1.5 cursor-default">
                  <Scan className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-700">
                    {formatArea(areaStats.areaKm2)}
                  </span>
                  {/* Black tooltip */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                    Total area
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-zinc-900" />
                  </div>
                </div>

                <div className="w-px h-4 bg-zinc-200" />

                {/* Population stat with tooltip */}
                <div className="relative group flex items-center gap-1.5 cursor-default">
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-sm text-zinc-600">
                    {formatPopulation(areaStats.population)}
                  </span>
                  {/* Black tooltip */}
                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                    Population density per km²
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-zinc-900" />
                  </div>
                </div>

                {areaStats.avgIncome > 0 && (
                  <>
                    <div className="w-px h-4 bg-zinc-200" />

                    {/* Income stat with tooltip */}
                    <div className="relative group flex items-center gap-1.5 cursor-default">
                      <Banknote className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="text-sm text-zinc-600">
                        {formatIncome(areaStats.avgIncome)}
                      </span>
                      {/* Black tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                        Average income
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-zinc-900" />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Body - Tags */}
          <div className="border-t border-zinc-100" style={{ padding: '12px 20px' }}>
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Tags</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(metadata.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="popup-chip type inline-flex items-center gap-1 leading-none"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center hover:bg-zinc-600 transition-colors"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <TagInput
                value={newTag}
                onChange={setNewTag}
                onAdd={handleAddTag}
                onFocus={() => setShowTagSuggestions(true)}
                onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                showSuggestions={showTagSuggestions}
                suggestions={(() => {
                  const currentTags = metadata.tags || [];
                  return allUniqueTags.filter(tag =>
                    !currentTags.includes(tag) &&
                    tag.toLowerCase().includes(newTag.toLowerCase())
                  ).slice(0, 3);
                })()}
                onSelectSuggestion={(tag) => {
                  if (!selectedId) return;
                  const tags = metadata.tags || [];
                  if (!tags.includes(tag)) {
                    const newMetadata = { ...allMetadata[selectedId], tags: [...tags, tag] };
                    const updated = { ...allMetadata, [selectedId]: newMetadata };
                    setAllMetadata(updated);
                    saveMetadata(updated);
                    showToast('Saved');
                  }
                  setNewTag('');
                  setShowTagSuggestions(false);
                }}
              />
            </div>
          </div>

          {/* Attachments section - collapsible */}
          <div
            className="border-t border-zinc-100 group/attachments hover:bg-zinc-100 transition-colors duration-150 cursor-pointer rounded-md -mx-2 px-2"
            style={{ padding: '12px 22px' }}
            onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}
          >
            {/* Header row */}
            <div className="flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Attachments</span>
              {(metadata.attachments?.length || 0) > 0 && (
                <span className="w-4 h-4 flex items-center justify-center bg-zinc-100 group-hover/attachments:bg-zinc-200 text-zinc-500 text-[9px] font-medium rounded-full transition-colors duration-150">
                  {metadata.attachments?.length}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-300 ml-auto opacity-0 group-hover/attachments:opacity-100 transition-all duration-200 ${attachmentsExpanded ? 'rotate-180' : ''}`}
              />
            </div>
            {attachmentsExpanded && (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                <AttachmentGallery
                  attachments={metadata.attachments || []}
                  onUpload={handleAddAttachment}
                  onRemove={handleRemoveAttachment}
                />
              </div>
            )}
          </div>

          {/* Comments section - collapsible */}
          <div
            className="border-t border-zinc-100 group/comments hover:bg-zinc-100 transition-colors duration-150 cursor-pointer rounded-md -mx-2 px-2"
            style={{ padding: '12px 22px' }}
            onClick={() => setCommentsExpanded(!commentsExpanded)}
          >
            {/* Header row */}
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Comments</span>
              <span className="w-4 h-4 flex items-center justify-center bg-zinc-100 group-hover/comments:bg-zinc-200 text-zinc-500 text-[9px] font-medium rounded-full transition-colors duration-150">
                {comments.length}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-300 ml-auto opacity-0 group-hover/comments:opacity-100 transition-all duration-200 ${commentsExpanded ? 'rotate-180' : ''}`}
              />
            </div>
            {commentsExpanded && (
              <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                {/* Comments list */}
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {comments.length > 0 && (
                    [...comments].reverse().map((comment) => (
                      <div key={comment.id} className="bg-white rounded-lg p-2 group relative">
                        <p className="text-xs text-zinc-700 leading-relaxed pr-6">{comment.text}</p>
                        <div className="text-[10px] text-zinc-400 mt-1">
                          <span className="font-medium">Jaroslav</span>
                          <span className="mx-1">·</span>
                          <span>{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        {/* Delete button - appears on hover */}
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="absolute top-2 right-2 p-1 rounded hover:bg-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete comment"
                        >
                          <Trash2 className="w-3 h-3 text-zinc-400 hover:text-red-500" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                {/* Add comment input */}
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && newComment.trim()) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  placeholder="Add a comment..."
                  className="w-full text-xs bg-transparent outline-none placeholder:text-zinc-400 mt-3 border-t border-zinc-100 pt-3"
                />
              </div>
            )}
          </div>

          {/* Add to list button - bottom right */}
          <div className="border-t border-zinc-100 flex justify-end" style={{ padding: '12px 20px' }}>
            <AddToListButton
              shape={{
                shapeId: selectedId,
                shapeType: isPolygon ? 'polygon' : 'point',
                shapeName: metadata.name || placeholderName,
              }}
            />
          </div>

        </div>
    </MapPopup>
  );
}
