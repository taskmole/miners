"use client";

import { useState, useRef, useCallback, useEffect, type ChangeEvent, type KeyboardEvent } from "react";
import { MessageSquareText, Paperclip, X, Loader2 } from "lucide-react";
import { useMobile } from "@/hooks/useMobile";
import { useToast } from "@/contexts/ToastContext";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";
import type { City } from "@/components/CitySelector";

interface FeedbackButtonProps {
  selectedCity: City;
  user: User | null;
  onExposeOpen?: (openFn: () => void) => void;
}

const MAX_CHARS = 1000;
const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function FeedbackButton({ selectedCity, user, onExposeOpen }: FeedbackButtonProps) {
  const isMobile = useMobile();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const reset = useCallback(() => {
    setText("");
    setFiles([]);
    setPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
  }, []);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimating(true));
    });
  }, []);

  useEffect(() => {
    onExposeOpen?.(handleOpen);
  }, [onExposeOpen, handleOpen]);

  const handleClose = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsOpen(false);
      reset();
    }, 200);
  }, [reset]);

  // Close on click outside (desktop only)
  useEffect(() => {
    if (!isOpen || isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, isMobile, handleClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, handleClose]);

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      const remaining = MAX_FILES - files.length;
      const toAdd = selected.slice(0, remaining);

      const oversized = toAdd.filter((f) => f.size > MAX_FILE_SIZE);
      if (oversized.length > 0) {
        showToast("Max file size is 5MB", "error");
        return;
      }

      setFiles((prev) => [...prev, ...toAdd]);
      setPreviews((prev) => [
        ...prev,
        ...toAdd.map((f) => URL.createObjectURL(f)),
      ]);

      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [files.length, showToast]
  );

  const removeFile = useCallback(
    (index: number) => {
      URL.revokeObjectURL(previews[index]);
      setFiles((prev) => prev.filter((_, i) => i !== index));
      setPreviews((prev) => prev.filter((_, i) => i !== index));
    },
    [previews]
  );

  const handleSubmit = useCallback(async () => {
    if (!text.trim() || sending) return;
    setSending(true);

    try {
      const formData = new FormData();
      formData.append("text", text.trim());
      formData.append("city", selectedCity.name);
      formData.append("device", isMobile ? "mobile" : "desktop");
      formData.append("timestamp", new Date().toISOString());
      if (user?.id) formData.append("userId", user.id);
      if (user?.email) formData.append("userEmail", user.email);
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/feedback", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Send failed");

      showToast("Feedback sent, thank you!");
      handleClose();
    } catch {
      showToast("Failed to send feedback", "error");
    } finally {
      setSending(false);
    }
  }, [text, files, selectedCity, user, isMobile, sending, showToast, handleClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const canSend = text.trim().length > 0 && !isOverLimit && !sending;

  function charCountColor(): string {
    if (isOverLimit) return "text-red-500 font-semibold";
    if (charCount > 900) return "text-amber-500";
    return "text-zinc-300";
  }

  const formContent = (
    <div className="flex flex-col gap-3 p-4">
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write something..."
          className="w-full p-3 rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-900 placeholder:text-zinc-400 resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 transition-all"
          style={{ minHeight: isMobile ? "24vh" : "120px" }}
          autoFocus={!isMobile}
        />
        <span
          className={`absolute bottom-2 right-3 text-xs tabular-nums ${charCountColor()}`}
        >
          {charCount}/{MAX_CHARS}
        </span>
      </div>

      {previews.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previews.map((src, i) => (
            <div key={src} className="relative group">
              <img
                src={src}
                alt={`Attachment ${i + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-zinc-200"
              />
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-zinc-800 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={files.length >= MAX_FILES}
          className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Paperclip className="w-4 h-4" />
          <span>
            {files.length >= MAX_FILES
              ? `${MAX_FILES}/${MAX_FILES}`
              : "Add attachment"}
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <Button
          onClick={handleSubmit}
          disabled={!canSend}
          size={isMobile ? "touch" : "default"}
          className="rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-6"
        >
          {sending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {!isMobile && !isOpen && (
        <button
          onClick={handleOpen}
          className="group fixed bottom-4 right-[60px] z-40 grid grid-cols-[36px_0fr] hover:grid-cols-[36px_1fr] h-9 rounded-lg bg-zinc-900 shadow-[0_4px_20px_rgba(0,0,0,0.22)] hover:bg-zinc-800 active:scale-95 transition-all duration-300 ease-in-out"
        >
          <span className="flex items-center justify-center h-full">
            <MessageSquareText className="w-[18px] h-[18px] text-white" />
          </span>
          <span className="overflow-hidden min-w-0 flex items-center">
            <span className="text-xs font-medium text-white whitespace-nowrap pl-0.5 pr-3">Feedback</span>
          </span>
        </button>
      )}

      {!isMobile && isOpen && (
        <div
          ref={panelRef}
          className="fixed bottom-4 right-4 z-50 w-[380px] origin-bottom-right transition-all duration-200 ease-out"
          style={{
            opacity: isAnimating ? 1 : 0,
            transform: isAnimating
              ? "scale(1) translateY(0)"
              : "scale(0.9) translateY(8px)",
          }}
        >
          <div
            className="rounded-2xl border overflow-hidden"
            style={{
              background: "rgba(255, 255, 255, 0.75)",
              borderColor: "rgba(255, 255, 255, 0.4)",
              backdropFilter: "blur(16px) saturate(180%)",
              boxShadow:
                "0 0 0 1px rgba(0, 0, 0, 0.08), 0 8px 32px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-0">
              <h2 className="text-base font-semibold text-zinc-900 font-heading">
                Feedback
              </h2>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            {formContent}
          </div>
        </div>
      )}

      {isMobile && (
        <BottomSheet
          isOpen={isOpen}
          onClose={handleClose}
          title="Feedback"
          snapPoint="auto"
        >
          {formContent}
        </BottomSheet>
      )}
    </>
  );
}
