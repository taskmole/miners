"use client";

/**
 * Small building blocks shared by every admin tab, so the tabs look like one
 * screen instead of seven: the same section heading, the same white list
 * card, the same status badge and the same "add a note, then confirm" panel.
 */

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** "19 Oct", plus the year when it is not this year. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}

/**
 * The top of every tab: a title, one sentence on what the tab is for, and
 * its main button on the right.
 */
export function PageIntro({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  /** The tab's main action, e.g. an "Add cafe" button. */
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-zinc-900 font-[family-name:var(--font-heading)]">{title}</h2>
        <p className="text-sm text-zinc-500 mt-1">{description}</p>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/**
 * A row of pill buttons that picks one of a few views or filters. Scrolls
 * sideways when it does not fit, so nothing is hidden on small phones.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  /** Read out by screen readers, e.g. "City". */
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400",
              active
                ? "bg-zinc-900 text-white"
                : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              // The leading space keeps screen readers from reading "All23".
              <span className={cn("tabular-nums", active ? "text-zinc-300" : "text-zinc-400")}>
                {` ${o.count}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A section that starts folded, e.g. past decisions under the open queue. */
export function FoldedSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      {/* A heading, like SectionHeader, so screen readers can jump to it */}
      <h2 className="mb-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex items-center gap-2 min-h-9 -ml-1 px-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          <ChevronRight className={cn("w-4 h-4 text-zinc-400 transition-transform", open && "rotate-90")} />
          <span className="text-sm font-semibold text-zinc-900">{title}</span>
          {count !== undefined && <span className="text-sm text-zinc-400 tabular-nums">{count}</span>}
        </button>
      </h2>
      {open && children}
    </section>
  );
}

/** Sentence-case section title with a quiet count next to it. */
export function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-3 min-h-9">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {count !== undefined && (
        <span className="text-sm text-zinc-400 tabular-nums">{count}</span>
      )}
    </div>
  );
}

/** White card with divided rows. Every admin list sits in one of these. */
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
      {children}
    </div>
  );
}

/** The message shown in place of an empty list. */
export function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <ListCard>
      <div className="px-4 py-8 text-center text-sm text-zinc-500">{children}</div>
    </ListCard>
  );
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700 border-red-200" },
  returned: { label: "Returned", className: "bg-amber-50 text-amber-800 border-amber-200" },
  testing: { label: "Testing", className: "bg-amber-50 text-amber-800 border-amber-200" },
  "in-use": { label: "In use", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-zinc-50 text-zinc-600 border-zinc-200" };
  return (
    <span className={cn("shrink-0 inline-flex items-center h-6 px-2 rounded-md border text-xs font-medium", style.className)}>
      {style.label}
    </span>
  );
}

/** A red error box shown in place, e.g. when a tab's list failed to load. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
      {children}
    </div>
  );
}

/**
 * An error pinned to the bottom of the screen until dismissed, so it is seen
 * even when the button that failed is far down a long list.
 */
export function ErrorBar({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-20 px-4 pt-2"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 pl-4 pr-2 py-2 text-sm text-red-700 shadow-lg">
        <span className="flex-1">{message}</span>
        <Button variant="ghost" size="sm" onClick={onDismiss} className="text-red-700 hover:bg-red-100 hover:text-red-800">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline "write a note, then confirm" box under a row. Used for reject,
 * return and approve-with-note. The confirm button stays disabled until a
 * note is typed when one is required.
 */
export function DecisionPanel({
  label,
  placeholder,
  confirmLabel,
  destructive = false,
  required = true,
  busy = false,
  locked = false,
  onConfirm,
  onCancel,
}: {
  label: string;
  placeholder: string;
  confirmLabel: string;
  destructive?: boolean;
  required?: boolean;
  /** This decision is saving: shows "Saving..." and locks the buttons. */
  busy?: boolean;
  /** Another decision is saving: locks the buttons without the label. */
  locked?: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const trimmed = note.trim();
  return (
    <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
      <label className="block text-sm font-medium text-zinc-900">
        {label}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="mt-2 block w-full h-20 px-3 py-2 text-sm font-normal bg-white border border-zinc-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="action" onClick={onCancel} disabled={busy || locked}>
          Cancel
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          size="action"
          onClick={() => onConfirm(trimmed)}
          disabled={busy || locked || (required && !trimmed)}
        >
          {busy ? "Saving..." : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
