"use client";

import React, { useState } from "react";
import { Check, Plus, Trash2, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChecklistItem } from "@/types/scouting";

interface TripChecklistProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  readOnly?: boolean;
}

// Generate unique ID for new items
function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Individual checklist item component
function ChecklistItemRow({
  item,
  onToggle,
  onNotesChange,
  onDelete,
  readOnly,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onNotesChange: (notes: string) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const [showNotes, setShowNotes] = useState(!!item.notes);

  return (
    <div className="border-b border-zinc-100 last:border-0">
      {/* Main row with checkbox and question */}
      <div className="flex items-start gap-3 py-3">
        {/* Checkbox */}
        <button
          type="button"
          onClick={onToggle}
          disabled={readOnly}
          className={cn(
            "flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all mt-0.5",
            "touch-manipulation",
            item.isChecked
              ? "bg-green-500 border-green-500 text-white"
              : "bg-white border-zinc-300 hover:border-zinc-400",
            readOnly && "opacity-60 cursor-not-allowed"
          )}
        >
          {item.isChecked && <Check className="w-4 h-4" />}
        </button>

        {/* Question text and notes toggle */}
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm leading-snug",
              item.isChecked ? "text-zinc-500 line-through" : "text-zinc-900"
            )}
          >
            {item.question}
          </p>

          {/* Notes toggle button */}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowNotes(!showNotes)}
              className="flex items-center gap-1 mt-2 text-xs text-zinc-500 hover:text-zinc-700"
            >
              {showNotes ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              <MessageSquare className="w-3 h-3" />
              <span>{item.notes ? "Edit notes" : "Add notes"}</span>
            </button>
          )}

          {/* Show notes in read-only mode if they exist */}
          {readOnly && item.notes && (
            <p className="mt-2 text-xs text-zinc-500 bg-zinc-50 rounded p-2">
              {item.notes}
            </p>
          )}
        </div>

        {/* Delete button for custom questions */}
        {!readOnly && !item.isDefault && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expandable notes field */}
      {!readOnly && showNotes && (
        <div className="pb-3 pl-14">
          <textarea
            value={item.notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Add notes about this item..."
            className={cn(
              "w-full px-3 py-2 text-sm rounded-lg border border-zinc-200",
              "focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent",
              "resize-none"
            )}
            rows={2}
          />
        </div>
      )}
    </div>
  );
}

export function TripChecklist({ items, onChange, readOnly = false }: TripChecklistProps) {
  const [newQuestion, setNewQuestion] = useState("");

  // Toggle item checked state
  const handleToggle = (id: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, isChecked: !item.isChecked } : item
      )
    );
  };

  // Update item notes
  const handleNotesChange = (id: string, notes: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, notes } : item
      )
    );
  };

  // Delete custom item
  const handleDelete = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  // Add new custom question
  const handleAddQuestion = () => {
    if (!newQuestion.trim()) return;

    const newItem: ChecklistItem = {
      id: generateId(),
      question: newQuestion.trim(),
      isChecked: false,
      notes: "",
      isDefault: false,
    };

    onChange([...items, newItem]);
    setNewQuestion("");
  };

  // Calculate progress
  const checkedCount = items.filter((item) => item.isChecked).length;
  const totalCount = items.length;

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-600">
          {checkedCount} of {totalCount} completed
        </span>
        <div className="w-24 h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${totalCount > 0 ? (checkedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="divide-y divide-zinc-100">
        {items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            onToggle={() => handleToggle(item.id)}
            onNotesChange={(notes) => handleNotesChange(item.id, notes)}
            onDelete={!item.isDefault ? () => handleDelete(item.id) : undefined}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Add custom question */}
      {!readOnly && (
        <div className="flex gap-2 pt-2">
          <Input
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Add a custom question..."
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddQuestion();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAddQuestion}
            disabled={!newQuestion.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
