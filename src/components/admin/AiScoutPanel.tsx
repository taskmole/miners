"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
  AiScoutOverview,
  AiScoutSuggestion,
  AiScoutVersion,
} from "@/app/api/db/ai-scout/route";

/**
 * Admin "AI scout" tab: head office reviews what the weekly learner
 * suggests, adds their own rules, sees how the score is weighted, and can
 * switch back to an earlier version.
 *
 * The admin page has no ToastProvider of its own, so this panel brings one.
 */

const RULE_MIN = 5;
const RULE_MAX = 300;

/** Suggestions only start once this many listings are rated in a week. */
const UNLOCK_RATINGS = 5;

/**
 * apiFetch throws "API 400: {"error":"..."}". Pull out the server's own
 * sentence, which is written for people, and fall back to a plain one.
 */
function friendlyError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  const json = message.match(/^API \d+: ([\s\S]*)$/)?.[1];
  if (json) {
    try {
      const parsed = JSON.parse(json) as { error?: unknown };
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  return fallback;
}

function pct(v: number | null): string {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AiScoutPanel() {
  return (
    <ToastProvider>
      <AiScoutPanelInner />
    </ToastProvider>
  );
}

function AiScoutPanelInner() {
  const { showToast } = useToast();
  const [data, setData] = useState<AiScoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The suggestion or version a request is in flight for. One at a time. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ruleText, setRuleText] = useState("");
  const [proposing, setProposing] = useState(false);
  const [confirmVersion, setConfirmVersion] = useState<AiScoutVersion | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await apiFetch<AiScoutOverview>("/api/db/ai-scout");
      setData(next);
    } catch (err) {
      setLoadError(friendlyError(err, "Could not load the AI scout. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const post = (body: Record<string, unknown>) =>
    apiFetch<unknown>("/api/db/ai-scout", { method: "POST", body: JSON.stringify(body) });

  /** Accept or skip. The card leaves at once and comes back if the call fails. */
  const decide = async (suggestion: AiScoutSuggestion, accept: boolean) => {
    if (busyId) return;
    setBusyId(suggestion.id);
    const before = data;
    setData((d) =>
      d ? { ...d, suggestions: d.suggestions.filter((s) => s.id !== suggestion.id) } : d,
    );
    try {
      const result = (await post({ action: "decide", id: suggestion.id, accept })) as
        | { status?: string }
        | undefined;
      if (result?.status === "retesting") {
        // The instructions changed since this was tested, so the database
        // sent it back to 'testing' instead of applying it.
        showToast(
          "The AI's instructions changed since this was tested, so we're re-testing it. Check back in a few hours.",
        );
        await load();
        return;
      }
      showToast(accept ? "Accepted. The AI uses it from now on." : "Skipped");
      // Accepting writes a new version with new weights, so re-read it.
      if (accept) await load();
    } catch (err) {
      setData(before);
      showToast(friendlyError(err, "That did not save. Please try again."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const propose = async () => {
    const text = ruleText.replace(/\s+/g, " ").trim();
    if (text.length < RULE_MIN || proposing) return;
    setProposing(true);
    try {
      const created = (await post({ action: "propose", text })) as AiScoutSuggestion;
      setData((d) => (d ? { ...d, suggestions: [created, ...d.suggestions] } : d));
      setRuleText("");
      showToast("Rule added. Testing it now.");
    } catch (err) {
      showToast(friendlyError(err, "Could not add the rule. Please try again."), "error");
    } finally {
      setProposing(false);
    }
  };

  const rollback = async (version: AiScoutVersion) => {
    setConfirmVersion(null);
    if (busyId) return;
    setBusyId(version.id);
    try {
      await post({ action: "rollback", profileId: version.id });
      showToast(`Switched back to version ${version.version}`);
      await load();
    } catch (err) {
      showToast(friendlyError(err, "Could not switch versions. Please try again."), "error");
    } finally {
      setBusyId(null);
    }
  };

  // ---- loading and error --------------------------------------------------

  if (loading) {
    return <div className="text-center py-8 text-zinc-500">Loading AI scout...</div>;
  }

  if (loadError || !data) {
    return (
      <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3">
        <span>{loadError || "Could not load the AI scout."}</span>
        <Button
          variant="outline"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="h-11 shrink-0 border-red-200 text-red-600 hover:bg-red-100"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  // The newest tested suggestion says how many listings the scoreboard used.
  // Before any test has run, fall back to how many ratings exist at all.
  const testedOn = data.suggestions.find((s) => s.status !== "testing" && s.sample)?.sample ?? 0;
  const ruleLength = ruleText.replace(/\s+/g, " ").trim().length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="bg-white rounded-xl border border-zinc-200 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Improve your AI scout</h2>
        <p className="text-sm text-zinc-500">
          {testedOn > 0
            ? `Tested on the ${testedOn} ${testedOn === 1 ? "listing" : "listings"} you've rated`
            : data.ratingsSaved > 0
              ? `${data.ratingsSaved} ${data.ratingsSaved === 1 ? "rating" : "ratings"} saved so far`
              : "No listings rated yet"}
        </p>
        {data.week.listingsRated > 0 && (
          <p className="text-sm text-zinc-500 mt-2">
            This week: {data.week.listingsRated}{" "}
            {data.week.listingsRated === 1 ? "listing" : "listings"} rated
            {data.week.agreement !== null &&
              `, you agreed with the AI ${pct(data.week.agreement)} of the time`}
            .
          </p>
        )}
      </section>

      {/* Suggestions */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          Suggestions
        </h2>
        {data.suggestions.length === 0 ? (
          <div className="bg-white rounded-xl px-4 py-8 text-center text-sm text-zinc-500">
            No suggestions yet. They arrive every Friday once head office has rated at least{" "}
            {UNLOCK_RATINGS} listings that week.
          </div>
        ) : (
          <div className="space-y-3">
            {data.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                busy={busyId === s.id}
                disabled={busyId !== null}
                onDecide={(accept) => decide(s, accept)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Add your own rule */}
      <section className="bg-white rounded-xl border border-dashed border-zinc-300 p-4 space-y-3">
        <div>
          <h3 className="font-medium text-zinc-900">Add your own rule</h3>
          <p className="text-sm text-zinc-500">
            We test it on the listings you&apos;ve rated. Results show up here within a few hours.
          </p>
        </div>
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            propose();
          }}
        >
          <Input
            value={ruleText}
            onChange={(e) => setRuleText(e.target.value)}
            placeholder="e.g. Never above the 2nd floor"
            maxLength={RULE_MAX}
            aria-label="Your rule"
            className="h-11 text-base sm:text-sm flex-1"
          />
          <Button
            type="submit"
            disabled={ruleLength < RULE_MIN || proposing}
            className="h-11 sm:px-8 bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            {proposing ? "Adding..." : "Test it"}
          </Button>
        </form>
      </section>

      {/* Weights */}
      {data.profile && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            How the score is weighted
          </h2>
          <div className="bg-white rounded-xl divide-y divide-zinc-100">
            {data.profile.points.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center gap-3">
                <span className="flex-1 min-w-0 text-sm text-zinc-900 break-words">{p.label}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium px-2 py-0.5 rounded-full",
                    p.kind === "ai" ? "bg-violet-50 text-violet-700" : "bg-zinc-100 text-zinc-600",
                  )}
                >
                  {p.kind === "ai" ? "AI" : "Facts"}
                </span>
                <span className="shrink-0 w-12 text-right text-sm font-semibold text-zinc-900 tabular-nums">
                  {p.weight}%
                </span>
              </div>
            ))}
          </div>
          {data.profile.rules.length > 0 && (
            <details className="mt-3 bg-white rounded-xl px-4 py-3 text-sm">
              <summary className="cursor-pointer text-zinc-700 font-medium min-h-[28px]">
                Rules it follows ({data.profile.rules.length})
              </summary>
              <ul className="mt-2 space-y-1.5 list-disc pl-5 text-zinc-600">
                {data.profile.rules.map((rule, i) => (
                  <li key={i} className="break-words">
                    {rule}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* Versions */}
      {data.versions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Versions
          </h2>
          <div className="bg-white rounded-xl divide-y divide-zinc-100">
            {data.versions.map((v) => (
              <div key={v.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">Version {v.version}</span>
                    {v.isActive && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        In use
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-500 break-words">
                    {v.note ? `${v.note} · ` : ""}
                    {formatDate(v.createdAt)}
                  </div>
                </div>
                {!v.isActive && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmVersion(v)}
                    disabled={busyId !== null}
                    className="h-11 shrink-0"
                  >
                    {busyId === v.id ? "Switching..." : "Switch back"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <Dialog open={confirmVersion !== null} onOpenChange={(open) => !open && setConfirmVersion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch back to version {confirmVersion?.version}?</DialogTitle>
            <DialogDescription>
              New listings will be scored with that version from now on. You can switch again at
              any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmVersion(null)} className="h-11">
              Cancel
            </Button>
            <Button
              onClick={() => confirmVersion && rollback(confirmVersion)}
              className="h-11 bg-zinc-900 hover:bg-zinc-800 text-white"
            >
              Switch back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  busy,
  disabled,
  onDecide,
}: {
  suggestion: AiScoutSuggestion;
  busy: boolean;
  disabled: boolean;
  onDecide: (accept: boolean) => void;
}) {
  const held = s.status === "held";
  const testing = s.status === "testing";
  const hasScores = s.scoreBefore !== null && s.scoreAfter !== null;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-2",
        held ? "bg-zinc-50 border-zinc-200" : "bg-white border-zinc-200",
      )}
    >
      <p className={cn("font-medium break-words", held ? "text-zinc-500" : "text-zinc-900")}>
        {s.title}
      </p>
      {s.evidence && <p className="text-sm text-zinc-500 break-words">{s.evidence}</p>}
      {s.source === "user" && !s.evidence && (
        <p className="text-sm text-zinc-500">Your own rule</p>
      )}

      {testing && (
        <p className="flex items-center gap-1.5 text-sm text-zinc-500">
          <Clock className="w-4 h-4 shrink-0" />
          Testing, results within a few hours
        </p>
      )}

      {held && (
        <p className="flex items-start gap-1.5 text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Held back: {s.heldReason || "no better than today"}
            {hasScores && ` (${pct(s.scoreBefore)} → ${pct(s.scoreAfter)})`}
          </span>
        </p>
      )}

      {!testing && !held && hasScores && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Matches you:</span>
          <b className="text-zinc-900">{pct(s.scoreBefore)}</b>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-400" aria-label="to" />
          <b className="text-emerald-600">{pct(s.scoreAfter)}</b>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          onClick={() => onDecide(false)}
          disabled={disabled}
          className="flex-1 h-11"
        >
          {busy ? "Saving..." : held ? "Dismiss" : "Skip"}
        </Button>
        {s.status === "ready" && (
          <Button
            onClick={() => onDecide(true)}
            disabled={disabled}
            className="flex-1 h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Accept
          </Button>
        )}
      </div>
    </div>
  );
}
