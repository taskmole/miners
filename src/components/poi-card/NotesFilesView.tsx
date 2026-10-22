"use client";

/**
 * Notes (comments) and files for one place, as one step of the map card.
 *
 * The card calls usePlaceNotes once and hands the result to both the quiet
 * counts on the card and this step. Each hook instance keeps its own copy of
 * the data, so calling it twice would mean two fetches and counts that drift.
 */
import React from "react";
import { ArrowUp, Paperclip, Trash2 } from "lucide-react";
import { usePoiComments } from "@/hooks/usePoiComments";
import { useAttachments } from "@/hooks/useAttachments";
import { useToast } from "@/contexts/ToastContext";
import { formatRelativeTime, type PoiComment } from "@/types/comments";
import type { Attachment } from "@/types/attachments";
import { ALL_SUPPORTED_TYPES } from "@/types/attachments";
import { AttachmentGallery } from "@/components/attachments";

export interface PlaceNotesMeta {
  placeName?: string;
  /** "property", "cafe", or the POI type, for the activity feed. */
  placeType?: string;
  lat?: number;
  lon?: number;
}

export interface PlaceNotes {
  comments: PoiComment[];
  files: Attachment[];
  count: number;
  addComment: (text: string) => void;
  removeComment: (id: string) => void;
  upload: (file: File) => Promise<{ success: boolean; error?: string }>;
  removeFile: (id: string) => Promise<void>;
}

/** Comments and files for a place, with the same toasts as before. */
export function usePlaceNotes(placeId: string, meta: PlaceNotesMeta): PlaceNotes {
  const { getComments, addComment, removeComment } = usePoiComments();
  const { getPoiAttachments, addPoiAttachment, removePoiAttachment } = useAttachments();
  const { showToast } = useToast();
  // Reading starts the one-time fetch for this place.
  const comments = getComments(placeId);
  const files = getPoiAttachments(placeId);

  return {
    comments,
    files,
    count: comments.length + files.length,
    addComment: (text) => {
      addComment(placeId, text, meta.placeName);
      showToast("Comment added");
    },
    removeComment: (id) => {
      removeComment(placeId, id, { placeName: meta.placeName });
      showToast("Comment deleted");
    },
    upload: async (file) => {
      const result = await addPoiAttachment(placeId, file, meta);
      if (result.success) showToast("Saved");
      else showToast(result.error || "Upload failed", "error");
      return result;
    },
    removeFile: async (id) => {
      const result = await removePoiAttachment(placeId, id, { placeName: meta.placeName, placeType: meta.placeType });
      // Nothing was there to remove, usually a double tap. Stay quiet.
      if (result.noop) return;
      if (result.success) showToast("Deleted");
      else showToast(result.error || "Could not delete that file", "error");
    },
  };
}

/** The list: newest note first, then the files. */
export function NotesFilesBody({ notes }: { notes: PlaceNotes }) {
  if (notes.count === 0) {
    return <p className="poi-empty">No notes or files yet.</p>;
  }
  return (
    <div className="poi-notes">
      {[...notes.comments].reverse().map((c) => (
        <div key={c.id} className="poi-note">
          <p>{c.content}</p>
          <div className="poi-note-meta">
            {/* Comments load without names today; "Guest" says nothing. */}
            {c.authorName && c.authorName !== "Guest" && <span>{c.authorName} · </span>}
            <span>{formatRelativeTime(c.createdAt)}</span>
          </div>
          <button type="button" className="poi-note-del" onClick={() => notes.removeComment(c.id)} aria-label="Delete note">
            <Trash2 aria-hidden />
          </button>
        </div>
      ))}
      {notes.files.length > 0 && (
        <div className="poi-files">
          <AttachmentGallery
            attachments={notes.files}
            onUpload={notes.upload}
            onRemove={(id) => void notes.removeFile(id)}
            showUploader={false}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Attach, write, send. Enter sends; keys never reach the map. The text lives
 * in the card, so it survives Back on the same pin.
 */
export function NotesComposer({ notes, text, setText }: { notes: PlaceNotes; text: string; setText: (t: string) => void }) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const send = () => {
    if (!text.trim()) return;
    notes.addComment(text);
    setText("");
  };

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await notes.upload(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="poi-composer">
      <input ref={fileRef} type="file" accept={ALL_SUPPORTED_TYPES.join(",")} onChange={pick} hidden />
      <button
        type="button"
        className="poi-ib"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-label={uploading ? "Uploading file" : "Attach a file"}
      >
        <Paperclip aria-hidden />
      </button>
      <input
        type="text"
        className="poi-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); send(); }
        }}
        placeholder="Write a note…"
        aria-label="Write a note"
        // On a phone the keyboard would cover the notes you came to read.
        autoFocus={typeof window !== "undefined" && !window.matchMedia("(pointer: coarse)").matches}
      />
      <button type="button" className="poi-send" onClick={send} disabled={!text.trim()} aria-label="Send note">
        <ArrowUp aria-hidden />
      </button>
    </div>
  );
}
