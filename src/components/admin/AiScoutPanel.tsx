"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, RefreshCw } from "lucide-react";
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
import { UNLOCK_RATINGS, soFarLine } from "@/lib/ai-scout-unlock";
import { cn } from "@/lib/utils";
import { Chips, EmptyRow, ListCard, PageIntro, StatusBadge, formatShortDate } from "@/components/admin/admin-ui";
import type {
  AiScoutOverview,
  AiScoutPoint,
  AiScoutSuggestion,
  AiScoutVersion,
} from "@/app/api/db/ai-scout/route";

/**
 * Admin "AI scout" tab: head office reads and adds the rules the AI follows,
 * reviews what the weekly learner suggests, sees how the score is weighted,
 * and can switch back to an earlier version. One of the four at a time.
 *
 * The admin page has no ToastProvider of its own, so this panel brings one.
 */

type View = "rules" | "suggestions" | "score" | "history";

/** Your own rule, still being tested: shown under Rules, not Suggestions. */
const isPendingRule = (s: AiScoutSuggestion) => s.source === "user" && s.status === "testing";

const RULE_MIN = 5;
const RULE_MAX = 300;

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

/** "listing" for 1, "listings" otherwise. */
const listingWord = (n: number) => (n === 1 ? "listing" : "listings");

function pct(v: number | null): string {
  return v === null ? "-" : `${Math.round(v * 100)}%`;
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
  /** Which of the four views is open. Picked by the first load, then by chips. */
  const [view, setView] = useState<View | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await apiFetch<AiScoutOverview>("/api/db/ai-scout");
      setData(next);
      // First load picks the view: Suggestions when one is ready to keep
      // (the weekly email links here), otherwise Rules. Later loads keep it.
      setView((v) => v ?? (next.suggestions.some((s) => s.status === "ready") ? "suggestions" : "rules"));
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
      showToast(accept ? "Kept. The AI uses it from now on." : isPendingRule(suggestion) ? "Removed" : "Skipped");
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

  // Your own rules wait under Rules, marked "Testing", until they are
  // tested; everything else needing a decision sits under Suggestions.
  const pendingRules = data.suggestions.filter(isPendingRule);
  const toReview = data.suggestions.filter((s) => !isPendingRule(s));
  const shown: View = view ?? "rules";
  const rules = data.profile?.rules ?? [];
  const ruleLength = ruleText.replace(/\s+/g, " ").trim().length;
  const rated = Math.min(data.ratedSinceSuggestions, UNLOCK_RATINGS);
  const ratingsLeft = UNLOCK_RATINGS - rated;
  const soFar = soFarLine(data.soFar);

  return (
    <div className="space-y-6">
      <PageIntro title="AI scout" description="Scores every new listing. Rate listings on the map to teach it." />

      {/* Progress towards the next suggestions */}
      <section className="bg-white rounded-xl border border-zinc-200 px-4 py-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900">
            {ratingsLeft > 0
              ? `Rate ${ratingsLeft} more ${listingWord(ratingsLeft)} to get new suggestions`
              : "Enough ratings. New suggestions arrive after the Wednesday night check."}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
            <div className="h-full rounded-full bg-zinc-900" style={{ width: `${(rated / UNLOCK_RATINGS) * 100}%` }} />
          </div>
          {data.week.listingsRated > 0 && (
            <p className="text-xs text-zinc-500 mt-2">
              This week: {data.week.listingsRated} {listingWord(data.week.listingsRated)} rated
              {data.week.agreement !== null && `, you agreed with the AI ${pct(data.week.agreement)} of the time`}.
            </p>
          )}
          {soFar && <p className="text-xs text-zinc-500 mt-1">{soFar}</p>}
        </div>
        <Button asChild variant="outline" size="action" className="shrink-0">
          <Link href="/">Open map</Link>
        </Button>
      </section>

      <Chips
        label="Show"
        value={shown}
        onChange={setView}
        options={[
          { id: "rules", label: "Rules", count: rules.length },
          { id: "suggestions", label: "Suggestions", count: toReview.length },
          { id: "score", label: "Score" },
          { id: "history", label: "History" },
        ]}
      />

      {shown === "rules" && (
        <section className="space-y-3">
          <p className="text-sm text-zinc-500">The AI always follows these when it scores a listing.</p>
          {rules.length + pendingRules.length === 0 ? (
            <EmptyRow>No rules yet. Add the first one below.</EmptyRow>
          ) : (
            <ListCard>
              {rules.map((rule, i) => (
                <div key={i} className="px-4 py-3 flex gap-3 text-sm">
                  <span className="shrink-0 w-5 text-zinc-400 tabular-nums">{i + 1}</span>
                  <span className="min-w-0 break-words text-zinc-900">{rule}</span>
                </div>
              ))}
              {pendingRules.map((s) => (
                <div key={s.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                  <span className="shrink-0 w-5" />
                  <span className="flex-1 min-w-0 break-words text-zinc-500">{s.title}</span>
                  {/* Stacked on phones so the rule text keeps its width */}
                  <div className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <StatusBadge status="testing" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => decide(s, false)}
                      disabled={busyId !== null}
                      className="-my-1 -mr-2 text-zinc-500"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </ListCard>
          )}
          <form
            className="flex flex-col sm:flex-row gap-2 pt-1"
            onSubmit={(e) => {
              e.preventDefault();
              propose();
            }}
          >
            <Input
              value={ruleText}
              onChange={(e) => setRuleText(e.target.value)}
              placeholder="Add a rule, e.g. Never above the 2nd floor"
              maxLength={RULE_MAX}
              aria-label="New rule"
              className="h-11 md:h-11 text-base sm:text-sm sm:flex-1 bg-white"
            />
            <Button
              type="submit"
              disabled={ruleLength < RULE_MIN || proposing}
              className="h-11 sm:w-32"
            >
              {proposing ? "Adding..." : "Add rule"}
            </Button>
          </form>
          <p className="text-xs text-zinc-500">
            New rules are first tested on listings you already rated, which takes a few hours. If one helps, it
            shows up under Suggestions for you to keep.
          </p>
        </section>
      )}

      {shown === "suggestions" && (
        <section className="space-y-3">
          <p className="text-sm text-zinc-500">Changes the AI wants to make, based on your ratings. Keep the ones that help.</p>
          {toReview.length === 0 ? (
            <EmptyRow>
              {ratingsLeft > 0
                ? `Nothing to review. Rate ${ratingsLeft} more ${listingWord(ratingsLeft)} on the map to get suggestions.`
                : "Nothing to review. New suggestions arrive after the Wednesday night check."}
            </EmptyRow>
          ) : (
            toReview.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                busy={busyId === s.id}
                disabled={busyId !== null}
                onDecide={(accept) => decide(s, accept)}
              />
            ))
          )}
        </section>
      )}

      {shown === "score" && (
        <section className="space-y-3">
          <p className="text-sm text-zinc-500 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>How much each thing adds to the score.</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" />Judged by AI</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-400" />From data</span>
          </p>
          {!data.profile || data.profile.points.length === 0 ? (
            <EmptyRow>The score is not set up yet.</EmptyRow>
          ) : (
            <ScoreBars points={data.profile.points} />
          )}
        </section>
      )}

      {shown === "history" && (
        <section className="space-y-3">
          <p className="text-sm text-zinc-500">Every change makes a new version. You can switch back to an earlier one.</p>
          {data.versions.length === 0 ? (
            <EmptyRow>No versions yet.</EmptyRow>
          ) : (
            <ListCard>
              {data.versions.map((v) => (
                <div key={v.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900">Version {v.version}</span>
                      {v.isActive && <StatusBadge status="in-use" />}
                    </div>
                    {v.note && <p className="text-sm text-zinc-500 break-words">{v.note}</p>}
                    <p className="text-xs text-zinc-400">{formatShortDate(v.createdAt)}</p>
                  </div>
                  {!v.isActive && (
                    <Button
                      variant="outline"
                      size="action"
                      onClick={() => setConfirmVersion(v)}
                      disabled={busyId !== null}
                      className="sm:w-32 shrink-0"
                    >
                      {busyId === v.id ? "Switching..." : "Switch back"}
                    </Button>
                  )}
                </div>
              ))}
            </ListCard>
          )}
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

const KIND_LABELS: Record<AiScoutSuggestion["kind"], string> = {
  rule: "New rule",
  point: "New thing to score",
  weight: "Weight change",
};

/** Each scored point as a bar, scaled so the biggest weight fills the row. */
function ScoreBars({ points }: { points: AiScoutPoint[] }) {
  const max = Math.max(...points.map((p) => p.weight), 1);
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-2.5">
      {points.map((p) => (
        <div key={p.id} className="flex items-center gap-3 text-sm">
          <span className="w-28 sm:w-40 shrink-0 break-words text-zinc-900">
            {p.label}
            <span className="sr-only">{p.kind === "ai" ? ", judged by AI" : ", from data"}</span>
          </span>
          <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className={cn("h-full rounded-full", p.kind === "ai" ? "bg-violet-500" : "bg-zinc-400")}
              style={{ width: `${(Math.max(p.weight, 0) / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-medium text-zinc-900 tabular-nums">{p.weight}%</span>
        </div>
      ))}
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
      <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">
        {KIND_LABELS[s.kind]}
      </span>
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
        <p className="text-sm text-zinc-700">
          Agrees with you <b className="text-zinc-900">{pct(s.scoreBefore)}</b> of the time now,{" "}
          <b className="text-emerald-600">{pct(s.scoreAfter)}</b> with this change
          {s.sample ? ` (tested on ${s.sample} ${listingWord(s.sample)})` : ""}.
        </p>
      )}

      <div className="flex gap-2 pt-1 sm:justify-end">
        <Button
          variant="outline"
          onClick={() => onDecide(false)}
          disabled={disabled}
          className="flex-1 sm:flex-none sm:w-32 h-11"
        >
          {busy ? "Saving..." : held ? "Dismiss" : "Skip"}
        </Button>
        {s.status === "ready" && (
          <Button
            onClick={() => onDecide(true)}
            disabled={disabled}
            className="flex-1 sm:flex-none sm:w-32 h-11"
          >
            Keep
          </Button>
        )}
      </div>
    </div>
  );
}
