"use client";

import { useCallback, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfiles } from "@/hooks/useUserProfiles";
import { LATEST_WHATS_NEW_ID, unseenEntries, visibleEntries } from "@/lib/whats-new";
import { getWhatsNewSeen, saveWhatsNewSeen } from "@/lib/userPreferences";

/**
 * Shared "What's new" state for the map page (popup + menu dot) and the
 * history page. Nothing is returned until permissions have loaded, so nobody
 * briefly looks like "no access" and gets trainer updates skipped.
 */
export function useWhatsNew(user: User | null) {
  const { userId } = useAuth();
  const { access, accessResolved } = useUserProfiles();
  // Set when they close it in this tab, so it hides at once, before the
  // account save (and the USER_UPDATED event that follows) comes back.
  const [closedFor, setClosedFor] = useState<string | null>(null);

  // The access must be this user's, not the "nobody signed in" placeholder
  // that resolves first when the page sets its user before AuthContext does.
  const ready = !!user && accessResolved && userId === user.id;

  const unseen = useMemo(() => {
    if (!ready || !user || closedFor === user.id) return [];
    return unseenEntries(access, getWhatsNewSeen(user));
  }, [ready, user, access, closedFor]);

  const all = useMemo(() => (ready ? visibleEntries(access) : []), [ready, access]);

  /**
   * Marks seen up to the newest update this person can see, not the newest
   * that exists: someone given AI training next week should still get the
   * trainer-only update they were never shown. `everything` is for a brand-new
   * account finishing the city picker: news about an app they have never used
   * is noise, so they start from today.
   */
  const markSeen = useCallback((everything = false) => {
    if (!user) return;
    const upTo = everything ? LATEST_WHATS_NEW_ID : Math.max(0, ...all.map((e) => e.id));
    if (upTo === 0) return;
    setClosedFor(user.id);
    void saveWhatsNewSeen(user, upTo);
  }, [user, all]);

  return { ready, unseen, all, hasUnread: unseen.length > 0, markSeen };
}
