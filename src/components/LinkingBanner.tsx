"use client";

import React from 'react';
import { X, Check, MapPin, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLinking } from '@/contexts/LinkingContext';

// Banner that shows when in linking mode
export function LinkingBanner() {
  const { isLinking, selectedItems, cancelLinking, confirmLinking, removeItem } = useLinking();

  if (!isLinking) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[90] bg-zinc-900 text-white shadow-lg">
      <div className="max-w-4xl mx-auto px-4 py-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <LinkIcon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Link Locations</p>
              <p className="text-xs text-zinc-400">
                Click on markers or drawn areas to add them
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelLinking}
              className="text-white hover:bg-white/10 h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={confirmLinking}
              disabled={selectedItems.length === 0}
              className="bg-white text-zinc-900 hover:bg-zinc-100 h-8 gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Done ({selectedItems.length})
            </Button>
          </div>
        </div>

        {/* Selected items */}
        {selectedItems.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedItems.map(item => (
              <div
                key={item.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-md text-xs"
              >
                <MapPin className="w-3 h-3 text-zinc-400" />
                <span className="max-w-[150px] truncate">{item.name}</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-zinc-400 hover:text-white ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
