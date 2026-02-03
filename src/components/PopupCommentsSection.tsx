"use client";

import React, { useState, useCallback } from 'react';
import { Trash2, MessageSquare, ChevronDown } from 'lucide-react';
import { usePoiComments } from '@/hooks/usePoiComments';
import { formatRelativeTime } from '@/types/comments';
import { useToast } from '@/contexts/ToastContext';

interface PopupCommentsSectionProps {
  placeId: string;
}

/**
 * Comments section for POI popups
 * Uses same Tailwind classes as ShapeComments.tsx for consistency
 * Memoized to prevent unnecessary re-renders
 */
export const PopupCommentsSection = React.memo(function PopupCommentsSection({ placeId }: PopupCommentsSectionProps) {
  const { getComments, addComment, removeComment } = usePoiComments();
  const { showToast } = useToast();
  const [newComment, setNewComment] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const comments = getComments(placeId);

  // Handle adding a new comment
  const handleAddComment = useCallback(() => {
    if (!newComment.trim()) return;
    addComment(placeId, newComment);
    setNewComment('');
    showToast('Comment added');
  }, [placeId, newComment, addComment, showToast]);

  // Handle deleting a comment
  const handleDeleteComment = useCallback((commentId: string) => {
    removeComment(placeId, commentId);
    showToast('Comment deleted');
  }, [placeId, removeComment, showToast]);

  // Handle keydown (Enter to submit)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation(); // Prevent map interactions
    if (e.key === 'Enter' && newComment.trim()) {
      e.preventDefault();
      handleAddComment();
    }
  }, [newComment, handleAddComment]);

  return (
    <div
      className="border-t border-zinc-100 group/section hover:bg-zinc-100 transition-colors duration-150 cursor-pointer rounded-md -mx-2 px-2"
      style={{ padding: '12px 22px' }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Comments</span>
        <span className="w-4 h-4 flex items-center justify-center bg-zinc-100 group-hover/section:bg-zinc-200 text-zinc-500 text-[9px] font-medium rounded-full transition-colors duration-150">
          {comments.length}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-300 ml-auto opacity-0 group-hover/section:opacity-100 transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          {/* Comments list */}
          <div className="max-h-40 overflow-y-auto space-y-2">
            {comments.length > 0 && (
              [...comments].reverse().map((comment) => (
                <div key={comment.id} className="bg-zinc-100 rounded-lg p-2 group relative">
                  <p className="text-xs text-zinc-700 leading-relaxed pr-6">{comment.content}</p>
                  <div className="text-[10px] text-zinc-400 mt-1">
                    <span className="font-medium">{comment.authorName}</span>
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
            onKeyDown={handleKeyDown}
            placeholder="Add a comment..."
            className="w-full text-xs bg-transparent outline-none placeholder:text-zinc-400 mt-3 border-t border-zinc-100 pt-3"
          />
        </div>
      )}
    </div>
  );
});
