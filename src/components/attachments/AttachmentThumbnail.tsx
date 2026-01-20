"use client";

import React, { useState } from 'react';
import { FileSpreadsheet, FileText, File, X } from 'lucide-react';
import type { Attachment } from '@/types/attachments';
import { getFileCategory, formatUploadDate } from '@/types/attachments';

interface AttachmentThumbnailProps {
  attachment: Attachment;
  onClick?: () => void;
  onRemove?: () => void;
  showRemove?: boolean;
}

/**
 * 64x64 thumbnail preview for an attachment
 * Shows image preview for images, file type icon for others
 * Tooltip on hover shows uploader name and date
 */
export function AttachmentThumbnail({
  attachment,
  onClick,
  onRemove,
  showRemove = true,
}: AttachmentThumbnailProps) {
  const [isHovered, setIsHovered] = useState(false);
  const category = getFileCategory(attachment.type);

  // Get icon for non-image files
  const getIcon = () => {
    switch (category) {
      case 'pdf':
        return <FileText className="w-6 h-6 text-red-500" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="w-6 h-6 text-green-600" />;
      default:
        return <File className="w-6 h-6 text-zinc-500" />;
    }
  };

  // Get file extension for display
  const getExtension = () => {
    const parts = attachment.name.split('.');
    return parts.length > 1 ? parts.pop()!.toUpperCase() : '';
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <div
      className="attachment-thumb group"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Content based on file type */}
      {category === 'image' && attachment.thumbnailData ? (
        <img
          src={attachment.thumbnailData}
          alt={attachment.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="attachment-thumb-icon">
          {getIcon()}
          <span>{getExtension()}</span>
        </div>
      )}

      {/* Remove button (appears on hover) */}
      {showRemove && onRemove && (
        <button
          className="attachment-thumb-remove"
          onClick={handleRemoveClick}
          title="Remove attachment"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Tooltip on hover */}
      {isHovered && (
        <div className="attachment-tooltip">
          <div className="attachment-tooltip-content">
            <span className="attachment-tooltip-name">{attachment.name}</span>
            <span className="attachment-tooltip-meta">
              Uploaded by {attachment.uploadedByName} on {formatUploadDate(attachment.addedAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
