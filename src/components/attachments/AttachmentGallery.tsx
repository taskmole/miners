"use client";

import React, { useState } from 'react';
import type { Attachment } from '@/types/attachments';
import { AttachmentThumbnail } from './AttachmentThumbnail';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentViewer } from './AttachmentViewer';

interface AttachmentGalleryProps {
  attachments: Attachment[];
  onUpload: (file: File) => Promise<{ success: boolean; error?: string }>;
  onRemove: (attachmentId: string) => void;
  disabled?: boolean;
}

/**
 * Grid display of attachment thumbnails with upload button
 * Opens viewer modal when thumbnail is clicked
 */
export function AttachmentGallery({
  attachments,
  onUpload,
  onRemove,
  disabled = false,
}: AttachmentGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const handleThumbnailClick = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const handleViewerClose = () => {
    setViewerOpen(false);
  };

  const handleViewerNavigate = (newIndex: number) => {
    setViewerIndex(newIndex);
  };

  return (
    <>
      <div className="attachment-grid">
        {attachments.map((attachment, index) => (
          <AttachmentThumbnail
            key={attachment.id}
            attachment={attachment}
            onClick={() => handleThumbnailClick(index)}
            onRemove={() => onRemove(attachment.id)}
            showRemove={!disabled}
          />
        ))}
        <AttachmentUploader
          onUpload={onUpload}
          disabled={disabled}
        />
      </div>

      {/* Fullscreen viewer modal */}
      {viewerOpen && (
        <AttachmentViewer
          attachments={attachments}
          currentIndex={viewerIndex}
          onClose={handleViewerClose}
          onNavigate={handleViewerNavigate}
        />
      )}
    </>
  );
}
