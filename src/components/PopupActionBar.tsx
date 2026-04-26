"use client";

import React from 'react';
import { X } from 'lucide-react';
import { HideButton } from '@/components/HideButton';

interface PopupActionBarProps {
  onClose?: () => void;
  placeId?: string;
  position: 'image' | 'header';
}

export function PopupActionBar({ onClose, placeId, position }: PopupActionBarProps) {
  const containerClass = position === 'image'
    ? 'popup-image-actions'
    : 'popup-header-buttons';

  return (
    <div className={containerClass}>
      {placeId && (
        <HideButton placeId={placeId} className="popup-action-btn" />
      )}
      {onClose && (
        <button
          onClick={(e) => {
            e.currentTarget.dispatchEvent(new CustomEvent('closePopup', { bubbles: true }));
            onClose();
          }}
          className="popup-action-btn"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
}
