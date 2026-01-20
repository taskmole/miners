"use client";

import React, { useRef, useState, useCallback } from 'react';
import { Plus, Upload } from 'lucide-react';
import { ALL_SUPPORTED_TYPES, validateFile } from '@/types/attachments';

interface AttachmentUploaderProps {
  onUpload: (file: File) => Promise<{ success: boolean; error?: string }>;
  variant?: 'button' | 'dropzone';
  disabled?: boolean;
}

/**
 * File upload component with drag-drop support
 * Validates files before upload
 */
export function AttachmentUploader({
  onUpload,
  variant = 'button',
  disabled = false,
}: AttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = useCallback(async (file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      // Let the parent handle the error via toast
      await onUpload(file);
      return;
    }

    setIsUploading(true);
    try {
      await onUpload(file);
    } finally {
      setIsUploading(false);
    }
  }, [onUpload]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
    // Reset input so the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleClick = () => {
    if (!disabled && !isUploading) {
      inputRef.current?.click();
    }
  };

  // Accept string for file input
  const acceptTypes = ALL_SUPPORTED_TYPES.join(',');

  if (variant === 'dropzone') {
    return (
      <div
        className={`attachment-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
        <Upload className="w-8 h-8 text-zinc-400 mb-2" />
        <p className="text-sm text-zinc-500">
          {isUploading ? 'Uploading...' : 'Drop file here or click to browse'}
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Images, PDFs, CSV, Excel (max 5MB)
        </p>
      </div>
    );
  }

  // Button variant (default)
  return (
    <button
      className={`attachment-add ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={handleClick}
      disabled={disabled || isUploading}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes}
        onChange={handleInputChange}
        className="hidden"
        disabled={disabled}
      />
      {isUploading ? (
        <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
      ) : (
        <Plus className="w-5 h-5" />
      )}
      <span>{isUploading ? 'Adding' : 'Add'}</span>
    </button>
  );
}
