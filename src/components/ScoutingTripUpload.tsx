"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Upload,
  FileText,
  Link as LinkIcon,
  MapPin,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useScoutingTrips } from "@/hooks/useScoutingTrips";
import { useMobile } from "@/hooks/useMobile";
import type { LinkedItem, UploadedDocument } from "@/types/scouting";

// Props for the upload modal
interface ScoutingTripUploadProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
  pendingLinkedItems?: LinkedItem[];
  onStartLinking?: () => void;
}

// Linked item badge
function LinkedItemBadge({
  item,
  onRemove,
}: {
  item: LinkedItem;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-100 rounded-md text-xs">
      <MapPin className="w-3 h-3 text-zinc-500" />
      <span className="text-zinc-700 max-w-[150px] truncate">{item.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-400 hover:text-zinc-600"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScoutingTripUpload({
  isOpen,
  onClose,
  cityId,
  pendingLinkedItems = [],
  onStartLinking,
}: ScoutingTripUploadProps) {
  const isMobile = useMobile();
  const { createUploadTrip, updateTrip } = useScoutingTrips();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([]);
  const [uploadedFile, setUploadedFile] = useState<UploadedDocument | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Merge pending linked items from map selection
  useEffect(() => {
    if (pendingLinkedItems.length > 0) {
      setLinkedItems(prev => {
        const newItems = pendingLinkedItems.filter(
          item => !prev.some(existing => existing.id === item.id)
        );
        return [...prev, ...newItems];
      });
    }
  }, [pendingLinkedItems]);

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a PDF or Word document');
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    setIsUploading(true);

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setUploadedFile({
          id: `doc_${Date.now()}`,
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64,
          uploadedAt: new Date().toISOString(),
        });
        setIsUploading(false);

        // Use filename (without extension) as default trip name
        if (!name) {
          const baseName = file.name.replace(/\.[^/.]+$/, '');
          setName(baseName);
        }
      };
      reader.onerror = () => {
        alert('Error reading file');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file');
      setIsUploading(false);
    }

    // Reset input
    e.target.value = '';
  };

  // Handle removing uploaded file
  const handleRemoveFile = () => {
    setUploadedFile(null);
  };

  // Handle adding a linked item
  const handleRemoveLinkedItem = (itemId: string) => {
    setLinkedItems(prev => prev.filter(i => i.id !== itemId));
  };

  // Handle submit
  const handleSubmit = () => {
    if (!uploadedFile) {
      alert('Please upload a document');
      return;
    }

    if (!name.trim()) {
      alert('Please enter a trip name');
      return;
    }

    // Create the trip
    const newTrip = createUploadTrip(cityId, name.trim(), uploadedFile, 'Guest');

    // Update with additional data
    updateTrip(newTrip.id, {
      relatedPlaces: linkedItems,
      address: address.trim() || undefined,
      neighbourhoodProfile: notes.trim() || undefined,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    });

    // Reset form and close
    setName('');
    setAddress('');
    setNotes('');
    setLinkedItems([]);
    setUploadedFile(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] flex ${isMobile ? 'items-end' : 'items-center justify-center'}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - anchored to bottom on mobile, centered on desktop */}
      <div className={`relative w-full bg-white shadow-2xl overflow-hidden ${
        isMobile
          ? 'max-h-[90vh] rounded-t-2xl'
          : 'max-w-md mx-4 rounded-2xl'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200" style={isMobile ? { paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" } : undefined}>
          <h2 className="text-lg font-bold text-zinc-900">Upload Document</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* File upload area */}
          <div>
            <label className="text-xs font-medium text-zinc-700 mb-1.5 block">
              Document <span className="text-red-500">*</span>
            </label>
            {uploadedFile ? (
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{uploadedFile.name}</p>
                  <p className="text-xs text-zinc-500">{formatFileSize(uploadedFile.size)}</p>
                </div>
                <button
                  onClick={handleRemoveFile}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full p-6 border-2 border-dashed border-zinc-300 rounded-lg hover:border-zinc-400 hover:bg-zinc-50 transition-colors text-center"
              >
                <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                <p className="text-sm text-zinc-600">
                  {isUploading ? 'Uploading...' : 'Click to upload PDF or Word document'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Max 10MB</p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileSelect}
            />
          </div>

          {/* Trip name */}
          <div>
            <label className="text-xs font-medium text-zinc-700 mb-1.5 block">
              Trip Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Gran Via Location"
            />
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-medium text-zinc-700 mb-1.5 block">
              Address
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional location address"
            />
          </div>

          {/* Linked Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-700">Linked Locations</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onStartLinking}
                className="h-6 text-[10px] gap-1 px-2"
              >
                <LinkIcon className="w-3 h-3" />
                Add Link
              </Button>
            </div>
            {linkedItems.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {linkedItems.map(item => (
                  <LinkedItemBadge
                    key={item.id}
                    item={item}
                    onRemove={() => handleRemoveLinkedItem(item.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-400">
                Optionally link POIs or areas from the map.
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-zinc-700 mb-1.5 block">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
              className="w-full h-20 px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!uploadedFile || !name.trim()}
            className="gap-1.5"
          >
            <Send className="w-4 h-4" />
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
