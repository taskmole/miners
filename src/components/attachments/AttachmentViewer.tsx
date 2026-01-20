"use client";

import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, File } from 'lucide-react';
import type { Attachment } from '@/types/attachments';
import { getFileCategory, formatUploadDate, formatFileSize } from '@/types/attachments';

interface AttachmentViewerProps {
  attachments: Attachment[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

// Convert base64 data URL to blob URL for better browser support (PDFs especially)
function base64ToBlobUrl(base64Data: string, mimeType: string): string {
  // Remove data URL prefix (e.g., "data:application/pdf;base64,")
  const base64 = base64Data.split(',')[1];
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Fullscreen modal for viewing attachments
 * Supports images (full view), PDFs (embedded), and other files (download prompt)
 */
export function AttachmentViewer({
  attachments,
  currentIndex,
  onClose,
  onNavigate,
}: AttachmentViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const attachment = attachments[currentIndex];
  const category = getFileCategory(attachment?.type || '');
  const hasMultiple = attachments.length > 1;

  // Only render portal after mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Create blob URL for PDFs (browsers block base64 data URLs in iframes)
  useEffect(() => {
    if (category === 'pdf' && attachment?.data) {
      const blobUrl = base64ToBlobUrl(attachment.data, 'application/pdf');
      setPdfBlobUrl(blobUrl);

      // Cleanup: revoke the blob URL when component unmounts or attachment changes
      return () => {
        URL.revokeObjectURL(blobUrl);
      };
    } else {
      setPdfBlobUrl(null);
    }
  }, [attachment?.data, attachment?.id, category]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        if (currentIndex > 0) onNavigate(currentIndex - 1);
        break;
      case 'ArrowRight':
        if (currentIndex < attachments.length - 1) onNavigate(currentIndex + 1);
        break;
      case 'd':
      case 'D':
        handleDownload();
        break;
    }
  }, [currentIndex, attachments.length, onClose, onNavigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Download the current attachment
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle overlay click (close if clicking outside content)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Get icon for non-image/pdf files
  const getFileIcon = () => {
    switch (category) {
      case 'spreadsheet':
        return <FileSpreadsheet className="w-24 h-24 text-green-500" />;
      case 'pdf':
        return <FileText className="w-24 h-24 text-red-500" />;
      default:
        return <File className="w-24 h-24 text-zinc-400" />;
    }
  };

  if (!mounted || !attachment) return null;

  const viewerContent = (
    <div
      className="attachment-viewer-overlay"
      onClick={handleOverlayClick}
    >
      {/* Close button */}
      <button
        className="attachment-viewer-close"
        onClick={onClose}
        title="Close (Escape)"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Navigation arrows */}
      {hasMultiple && currentIndex > 0 && (
        <button
          className="attachment-viewer-nav left"
          onClick={() => onNavigate(currentIndex - 1)}
          title="Previous (←)"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}
      {hasMultiple && currentIndex < attachments.length - 1 && (
        <button
          className="attachment-viewer-nav right"
          onClick={() => onNavigate(currentIndex + 1)}
          title="Next (→)"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}

      {/* Content area */}
      <div className="attachment-viewer-content">
        {/* Filename header */}
        <div className="attachment-viewer-header">
          <span className="attachment-viewer-filename">{attachment.name}</span>
          <span className="attachment-viewer-meta">
            {formatFileSize(attachment.size)} · Uploaded by {attachment.uploadedByName} on {formatUploadDate(attachment.addedAt)}
          </span>
        </div>

        {/* Main content based on type */}
        <div className="attachment-viewer-main">
          {category === 'image' ? (
            <img
              src={attachment.data}
              alt={attachment.name}
              className="attachment-viewer-image"
            />
          ) : category === 'pdf' ? (
            pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                className="attachment-viewer-pdf"
                title={attachment.name}
              />
            ) : (
              <div className="attachment-viewer-file">
                <FileText className="w-24 h-24 text-red-500" />
                <p className="attachment-viewer-file-name">Loading PDF...</p>
              </div>
            )
          ) : (
            <div className="attachment-viewer-file">
              {getFileIcon()}
              <p className="attachment-viewer-file-name">{attachment.name}</p>
              <p className="attachment-viewer-file-hint">Download to view this file</p>
            </div>
          )}
        </div>
      </div>

      {/* Download button - glassmorphism style */}
      <button
        className="attachment-viewer-download"
        onClick={handleDownload}
        title="Download (D)"
      >
        <Download className="w-5 h-5" />
        <span>Download</span>
      </button>

      {/* Dot indicators */}
      {hasMultiple && (
        <div className="attachment-viewer-dots">
          {attachments.map((_, index) => (
            <button
              key={index}
              className={`attachment-viewer-dot ${index === currentIndex ? 'active' : ''}`}
              onClick={() => onNavigate(index)}
            />
          ))}
        </div>
      )}
    </div>
  );

  return createPortal(viewerContent, document.body);
}
