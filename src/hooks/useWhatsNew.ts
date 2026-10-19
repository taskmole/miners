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

  const markSeen = useCallback(() => {
    if (!user) return;
    setClosedFor(user.id);
    void saveWhatsNewSeen(user, LATEST_WHATS_NEW_ID);
  }, [user]);

  return { ready, unseen, all, hasUnread: unseen.length > 0, markSeen };
}
