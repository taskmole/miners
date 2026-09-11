"use client";

/**
 * A person's history on their profile page: what they submitted, and, if they
 * approve anywhere, what they decided.
 *
 * Who may look is a permission question in its own right:
 *   - Super Admins see everyone's history.
 *   - Approvers see the history of people who only contribute or view, and only
 *     for cities they approve in. They cannot read another Approver's or a
 *     Super Admin's history.
 *
 * The list is filtered on the server; this component only renders what it is
 * given, plus the locked state when the viewer is not allowed to look.
 */

import { FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export type HistoryKind = "pitch" | "request";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  /** Property address or name. */
  title: string;
  cityId: string;
  status: string;
  date: string;
}

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
  pending: "bg-amber-50 text-amber-700",
  returned: "bg-amber-50 text-amber-700",
  draft: "bg-zinc-100 text-zinc-600",
  submitted: "bg-blue-50 text-blue-700",
};

const KIND_LABELS: Record<HistoryKind, string> = {
  pitch: "Pitch",
  request: "Request",
};

function EntryList({ entries, cityNames }: { entries: HistoryEntry[]; cityNames: Record<string, string> }) {
  return (
    <div className="divide-y divide-zinc-100">
      {entries.map((entry) => (
        <div key={entry.id} className="py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-900 truncate">{entry.title}</div>
            <div className="text-xs text-zinc-500">
              {KIND_LABELS[entry.kind]} · {cityNames[entry.cityId] ?? entry.cityId} ·{" "}
              {new Date(entry.date).toLocaleDateString()}
            </div>
          </div>
          <span
            className={cn(
              "px-2 py-1 text-xs font-semibold rounded-full shrink-0",
              STATUS_STYLES[entry.status] ?? "bg-zinc-100 text-zinc-600",
            )}
          >
            {entry.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-sm text-zinc-400 py-8 text-center">
      <FileText className="w-8 h-8 mx-auto mb-2 text-zinc-300" />
      {text}
    </div>
  );
}

interface UserHistoryProps {
  /** Pitches and property requests this person created. */
  submitted: HistoryEntry[];
  /** Requests and pitches this person approved, rejected or returned. */
  decided: HistoryEntry[];
  cityNames: Record<string, string>;
  /** False when the viewer is an Approver looking at a peer or a Super Admin. */
  canSee: boolean;
  /** Shown under the heading so a narrowed list does not look like a short one. */
  scopeNote?: string;
}

export function UserHistory({
  submitted,
  decided,
  cityNames,
  canSee,
  scopeNote,
}: UserHistoryProps) {
  if (!canSee) {
    return (
      <section className="bg-white rounded-xl border border-zinc-200 p-5">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          History
        </h2>
        <div className="flex items-start gap-3 text-sm text-zinc-500">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" />
          <p>
            Only a Super Admin can see another reviewer&apos;s history. You can see
            the history of people who contribute or view.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-zinc-200 p-5 space-y-5">
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide">
            Submitted ({submitted.length})
          </h2>
        </div>
        {scopeNote && <p className="text-xs text-zinc-400 mb-2">{scopeNote}</p>}
        {submitted.length === 0 ? (
          <Empty text="Nothing submitted yet" />
        ) : (
          <EntryList entries={submitted} cityNames={cityNames} />
        )}
      </div>

      {/* Only meaningful for someone who approves somewhere. Hidden entirely
          rather than shown empty, so a franchisee's page stays short. */}
      {decided.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Decided ({decided.length})
          </h2>
          <EntryList entries={decided} cityNames={cityNames} />
        </div>
      )}
    </section>
  );
}
