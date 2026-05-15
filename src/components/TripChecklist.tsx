"use client";

import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChecklistItem } from "@/types/scouting";

interface TripChecklistProps {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  readOnly?: boolean;
}

function generateId(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function ChecklistItemRow({
  item,
  onToggle,
  onDelete,
  readOnly,
}: {
  item: ChecklistItem;
  onToggle: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-zinc-100 last:border-0">
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

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-snug",
            item.isChecked ? "text-zinc-500 line-through" : "text-zinc-900"
          )}
        >
          {item.question}
        </p>
        {readOnly && item.notes && (
          <p className="mt-2 text-xs text-zinc-500 bg-zinc-50 rounded p-2">
            {item.notes}
          </p>
        )}
      </div>

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
  );
}

export function TripChecklist({ items, onChange, readOnly = false }: TripChecklistProps) {
  const [newQuestion, setNewQuestion] = useState("");

  const handleToggle = (id: string) => {
    onChange(
      items.map((item) =>
        item.id === id ? { ...item, isChecked: !item.isChecked } : item
      )
    );
  };

  const handleDelete = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

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

  return (
    <div className="space-y-2">
      <div>
        {items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            onToggle={() => handleToggle(item.id)}
            onDelete={!item.isDefault ? () => handleDelete(item.id) : undefined}
            readOnly={readOnly}
          />
        ))}
      </div>

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
