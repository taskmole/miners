"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, ThumbsUp } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useToast } from "@/contexts/ToastContext";
import type { AiBreakdown as AiBreakdownData, AiBreakdownPoint, AiVerdict } from "@/types/inbox";

interface AiBreakdownProps {
  /** The listing's places.id (InboxProperty.id), which feedback is filed under. */
  placeId: string;
  breakdown: AiBreakdownData;
  /**
   * Start with "Why" open. Wide screens have the room for it. If the person
   * closes it there, that choice sticks for the next listings too.
   */
  openByDefault?: boolean;
}

type SaveStatus = "saving" | "saved";

const MAX_NOTE = 500;
/** Remembers a closed "Why" panel on wide screens, across listings. */
const WHY_CLOSED_KEY = "miners:triage-why-closed";
const RATINGS = [1, 2, 3, 4, 5] as const;
const VERDICT_CHOICES: { value: AiVerdict; label: string }[] = [
  { value: "too_low", label: "Too low" },
  { value: "right", label: "About right" },
  { value: "too_high", label: "Too high" },
];

function whyClosedByChoice(): boolean {
  try {
    return localStorage.getItem(WHY_CLOSED_KEY) === "1";
  } catch {
    return false; // storage blocked (private mode): just use the default
  }
}

/** Five dots, filled up to the value. Read out as "4 out of 5". */
function DotMeter({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`${value} out of 5`} className="flex items-center gap-[3px]">
      {RATINGS.map((n) => (
        <span
          key={n}
          className={`w-2 h-2 rounded-full ${n <= value ? "bg-emerald-500" : "bg-zinc-200"}`}
        />
      ))}
    </span>
  );
}

function CantTell() {
  return <span className="text-[12px] italic text-zinc-400 whitespace-nowrap">can&apos;t tell</span>;
}

/**
 * The rating column. Fixed width and right-aligned, so dots and "can't tell"
 * line up down the whole list, facts and AI rows alike.
 */
function MeterCell({ value }: { value: number | null }) {
  return (
    <span className="w-14 shrink-0 flex justify-end">
      {value != null ? <DotMeter value={value} /> : <CantTell />}
    </span>
  );
}

/** Width of the trainer's two 44px buttons, reserved on every row. */
const ACTIONS_WIDTH = "w-[88px]";

/** Small inline "Saving..." / "Saved" line. Announced to screen readers. */
function StatusText({ status }: { status: SaveStatus | undefined }) {
  return (
    <span role="status" className="text-[11px] text-emerald-600 inline-flex items-center gap-1">
      {status === "saving" && "Saving..."}
      {status === "saved" && (
        <>
          <Check className="w-3 h-3" aria-hidden="true" />
          Saved
        </>
      )}
    </span>
  );
}

function SectionLabel({ title, hint }: { title: string; hint: string }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
      {title} <span className="font-normal normal-case tracking-normal">({hint})</span>
    </p>
  );
}

/**
 * The AI scout's reasons for its score, and, for people who may train it, the
 * controls to correct it.
 *
 * Facts come from the map and are read-only. AI judgments come from the
 * photos; a trainer can agree with one (thumbs up) or fix it (1 to 5), and say
 * how the overall score felt. Every change saves at once, optimistically, and
 * rolls back with a toast if the server refuses it.
 */
export function AiBreakdown({ placeId, breakdown, openByDefault = false }: AiBreakdownProps) {
  const { showToast } = useToast();
  const panelId = useId();
  const noteId = useId();

  const [open, setOpen] = useState(() => openByDefault && !whyClosedByChoice());
  const [fixing, setFixing] = useState<string | null>(null);
  const [myPoints, setMyPoints] = useState<Record<string, number>>(breakdown.mine.points);
  const [verdict, setVerdict] = useState<AiVerdict | null>(breakdown.mine.verdict);
  const [noteDraft, setNoteDraft] = useState(breakdown.mine.note ?? "");
  const [status, setStatus] = useState<Record<string, SaveStatus | undefined>>({});

  // What the server last confirmed, so a failed save can roll back to it.
  const confirmed = useRef({
    points: { ...breakdown.mine.points } as Record<string, number | undefined>,
    verdict: breakdown.mine.verdict,
    note: breakdown.mine.note ?? "",
  });
  // Per-key counter, so only the newest save for a key may touch the screen.
  const seq = useRef<Record<string, number>>({});

  /**
   * Send one piece of feedback. `onSaved` records the confirmed value;
   * `onFailed` puts the screen back. Both run only if no newer save for the
   * same key has started meanwhile.
   */
  const send = useCallback(
    async (key: string, body: Record<string, unknown>, onSaved: () => void, onFailed: () => void) => {
      const mySeq = (seq.current[key] ?? 0) + 1;
      seq.current[key] = mySeq;
      setStatus((s) => ({ ...s, [key]: "saving" }));
      try {
        await apiFetch("/api/db/ai-feedback", {
          method: "POST",
          body: JSON.stringify({ placeId, ratingId: breakdown.ratingId, ...body }),
        });
        if (seq.current[key] !== mySeq) return;
        onSaved();
        setStatus((s) => ({ ...s, [key]: "saved" }));
      } catch {
        if (seq.current[key] !== mySeq) return;
        onFailed();
        setStatus((s) => ({ ...s, [key]: undefined }));
        showToast("Couldn't save, please try again", "error");
      }
    },
    [placeId, breakdown.ratingId, showToast],
  );

  const savePoint = (point: AiBreakdownPoint, value: number) => {
    setMyPoints((p) => ({ ...p, [point.id]: value }));
    setFixing(null);
    send(
      `point:${point.id}`,
      { kind: "point", pointId: point.id, aiValue: point.value, humanValue: value },
      () => {
        confirmed.current.points[point.id] = value;
      },
      () =>
        setMyPoints((p) => {
          const next = { ...p };
          const back = confirmed.current.points[point.id];
          if (back === undefined) delete next[point.id];
          else next[point.id] = back;
          return next;
        }),
    );
  };

  const saveVerdict = (choice: AiVerdict) => {
    // Pressing the chosen chip again clears it.
    const value = verdict === choice ? null : choice;
    setVerdict(value);
    send(
      "verdict",
      { kind: "overall", verdict: value },
      () => {
        confirmed.current.verdict = value;
      },
      () => setVerdict(confirmed.current.verdict),
    );
  };

  const saveNote = () => {
    const value = noteDraft.trim();
    if (value === confirmed.current.note) return;
    // The text stays in the box on failure, so nothing typed is lost; the
    // next blur tries again because confirmed still holds the old note.
    send(
      "note",
      { kind: "overall", note: value || null },
      () => {
        confirmed.current.note = value;
      },
      () => {},
    );
  };

  const facts = breakdown.points.filter((p) => p.kind === "fact");
  const judgments = breakdown.points.filter((p) => p.kind === "ai");
  const canTrain = breakdown.canTrain;

  return (
    <div className="space-y-3">
      {breakdown.secondLook && (
        <div
          className="rounded-xl px-4 py-3"
          style={{
            backgroundColor: "rgba(255, 251, 235, 0.8)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(245,158,11,0.3)",
          }}
        >
          <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
            Worth a second look
          </p>
          <p className="text-[13px] text-zinc-700 leading-relaxed break-words">
            {breakdown.secondLook}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 overflow-hidden">
        <button
          type="button"
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (openByDefault) {
              try {
                localStorage.setItem(WHY_CLOSED_KEY, next ? "0" : "1");
              } catch {
                // storage blocked: the choice just won't carry over
              }
            }
          }}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full min-h-[44px] flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
        >
          <span
            className="text-[15px] font-semibold text-zinc-900"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            Why {breakdown.blend}?
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div id={panelId} className="border-t border-zinc-100 px-4 pt-4 pb-4 space-y-5">
            {facts.length > 0 && (
              <section className="space-y-2">
                <SectionLabel title="Facts" hint="from the map" />
                <ul className="space-y-1">
                  {facts.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 min-h-[44px]">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-zinc-800 break-words">{p.label}</p>
                        {p.reason && (
                          <p className="text-[11px] text-zinc-400 leading-snug break-words">
                            {p.reason}
                          </p>
                        )}
                      </div>
                      <MeterCell value={p.value} />
                      {canTrain && <span aria-hidden="true" className={`${ACTIONS_WIDTH} shrink-0`} />}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {judgments.length > 0 && (
              <section className="space-y-2">
                <SectionLabel title="AI judgment" hint="from photos" />
                {breakdown.photosChecked === 0 && (
                  <p className="text-[11px] text-zinc-400">No photos checked</p>
                )}
                <ul className="space-y-1">
                  {judgments.map((p) => {
                    const mine = myPoints[p.id];
                    const shown = mine ?? p.value;
                    const agreed = mine != null && mine === p.value;
                    const isFixing = fixing === p.id;
                    const fixPanelId = `${panelId}-fix-${p.id}`;
                    const rowStatus = status[`point:${p.id}`];

                    return (
                      <li
                        key={p.id}
                        className={`rounded-lg -mx-2 px-2 py-1 ${isFixing ? "bg-zinc-50" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0 py-1">
                            <p className="text-[13px] text-zinc-800 break-words">{p.label}</p>
                            {p.reason && (
                              <p className="text-[11px] text-zinc-400 leading-snug break-words">
                                {p.reason}
                              </p>
                            )}
                            {canTrain && mine != null && (
                              <p className="text-[11px] text-zinc-500 flex flex-wrap items-center gap-x-1.5">
                                <span>
                                  {agreed
                                    ? "You agreed."
                                    : `You set ${mine}${p.value != null ? ` (AI said ${p.value})` : ""}.`}
                                </span>
                                <StatusText status={rowStatus} />
                              </p>
                            )}
                          </div>

                          <MeterCell value={shown ?? null} />
                          {canTrain && (
                            <span className={`${ACTIONS_WIDTH} shrink-0 flex justify-end`}>
                              {p.value == null ? (
                                // Nothing to agree with; keep the slot so Fix stays in its column.
                                <span aria-hidden="true" className="w-11 h-11" />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => savePoint(p, p.value as number)}
                                  aria-pressed={agreed}
                                  aria-label={`Agree with the AI: ${p.label} ${p.value} out of 5`}
                                  className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                    agreed ? "text-emerald-600" : "text-zinc-400 hover:text-zinc-600"
                                  }`}
                                >
                                  <ThumbsUp
                                    className="w-4 h-4"
                                    fill={agreed ? "currentColor" : "none"}
                                    aria-hidden="true"
                                  />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setFixing(isFixing ? null : p.id)}
                                aria-expanded={isFixing}
                                aria-controls={fixPanelId}
                                aria-label={`Fix ${p.label}`}
                                className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                  isFixing ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
                                }`}
                              >
                                <Pencil className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </span>
                          )}
                        </div>

                        {canTrain && isFixing && (
                          <div
                            id={fixPanelId}
                            role="group"
                            aria-label={`Set ${p.label}, 1 to 5`}
                            className="flex flex-wrap gap-1.5 pt-1 pb-1"
                          >
                            {RATINGS.map((n) => {
                              const selected = shown === n;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => savePoint(p, n)}
                                  aria-pressed={selected}
                                  className={`w-11 h-11 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                    selected
                                      ? "bg-zinc-900 text-white"
                                      : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                                  }`}
                                >
                                  {n}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {canTrain && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <p
                    id={`${panelId}-feels`}
                    className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide"
                  >
                    The overall score feels
                  </p>
                  <StatusText status={status.verdict} />
                </div>
                <div
                  role="group"
                  aria-labelledby={`${panelId}-feels`}
                  className="flex flex-wrap gap-2"
                >
                  {VERDICT_CHOICES.map((c) => {
                    const selected = verdict === c.value;
                    return (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => saveVerdict(c.value)}
                        aria-pressed={selected}
                        className={`min-h-[44px] px-4 rounded-full text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                          selected
                            ? "bg-zinc-900 text-white"
                            : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1">
                  <div className="flex items-center gap-2 mb-1">
                    <label htmlFor={noteId} className="text-[11px] text-zinc-400">
                      Note (optional)
                    </label>
                    <StatusText status={status.note} />
                  </div>
                  <input
                    id={noteId}
                    type="text"
                    value={noteDraft}
                    maxLength={MAX_NOTE}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={saveNote}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    placeholder="e.g. Entrance is down stairs"
                    autoComplete="off"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-zinc-200 text-base sm:text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
