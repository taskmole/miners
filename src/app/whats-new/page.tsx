"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useWhatsNew } from "@/hooks/useWhatsNew";
import type { WhatsNewEntry } from "@/lib/whats-new";
import { WhatsNewPicture } from "@/components/WhatsNewPicture";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
/** Midday, so "2026-10-03" never shows as the 2nd west of UTC. */
const noonOf = (date: string) => new Date(`${date}T12:00:00`);

/** Every update this person may see, newest first, grouped by month. */
export default function WhatsNewPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const { ready, all, hasUnread, markSeen } = useWhatsNew(user);

  // Signed out: back to the map, which shows the sign-in page.
  useEffect(() => {
    if (!supabase) {
      router.replace("/");
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
      else router.replace("/");
    });
  }, [router]);

  // Reading the page counts as reading the popup.
  useEffect(() => {
    if (hasUnread) markSeen();
  }, [hasUnread, markSeen]);

  const months = useMemo(() => {
    const groups = new Map<string, WhatsNewEntry[]>();
    for (const entry of all) {
      const key = MONTH.format(noonOf(entry.date));
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return [...groups];
  }, [all]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10" style={{ paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-2 -ml-2 hover:bg-zinc-100 rounded-lg transition-colors"
            aria-label="Back to map"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <Sparkles className="w-5 h-5 text-zinc-400" />
          <h1 className="text-lg font-bold text-zinc-900">What&apos;s new</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
        {ready && months.length === 0 && (
          <p className="text-sm text-zinc-500">No updates yet. New features will show up here.</p>
        )}
        {months.map(([month, entries]) => (
          <section key={month}>
            <h2 className="text-base font-semibold text-zinc-900 mb-3">{month}</h2>
            <div className="space-y-4">
              {entries.map((entry) => (
                <article key={entry.id} className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                  <div className="w-full aspect-[16/10]">
                    <WhatsNewPicture visual={entry.visual} />
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-zinc-400">{DAY.format(noonOf(entry.date))}</p>
                    <h3 className="font-heading text-lg font-semibold text-zinc-900 mt-0.5">{entry.title}</h3>
                    <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{entry.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
