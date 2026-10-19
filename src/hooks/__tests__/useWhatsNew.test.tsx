import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import type { Access } from "@/lib/permissions";

const auth = { userId: null as string | null };
const profiles = { access: null as unknown as Access, accessResolved: false };
const saveWhatsNewSeen = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useUserProfiles", () => ({ useUserProfiles: () => profiles }));
vi.mock("@/lib/userPreferences", () => ({
  getWhatsNewSeen: () => null,
  saveWhatsNewSeen: (...a: unknown[]) => saveWhatsNewSeen(...a),
}));

import { useWhatsNew } from "../useWhatsNew";
import { LATEST_WHATS_NEW_ID, WHATS_NEW } from "@/lib/whats-new";

const user = { id: "u1", user_metadata: {} } as unknown as User;
const viewer: Access = {
  isSuperAdmin: false, isActive: true, canSeeFinancials: false,
  grants: [{ cityId: "madrid", level: "view", receivesAlerts: false, canTrainAi: false }],
};
const NOBODY: Access = { isSuperAdmin: false, isActive: false, canSeeFinancials: false, grants: [] };

beforeEach(() => {
  saveWhatsNewSeen.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${WHATS_NEW[WHATS_NEW.length - 1].date}T12:00:00Z`));
});

describe("useWhatsNew", () => {
  it("stays empty while the access on hand is not this user's", () => {
    // AuthContext has not caught up: the resolved access is the signed-out placeholder.
    auth.userId = null;
    profiles.access = NOBODY;
    profiles.accessResolved = true;
    const { result } = renderHook(() => useWhatsNew(user));
    expect(result.current.ready).toBe(false);
    expect(result.current.unseen).toEqual([]);
  });

  it("fills in once access is this user's, and hides at once after markSeen", () => {
    auth.userId = "u1";
    profiles.access = viewer;
    profiles.accessResolved = true;
    const { result } = renderHook(() => useWhatsNew(user));
    expect(result.current.unseen.length).toBeGreaterThan(0);
    expect(result.current.unseen.every((e) => e.audience === "everyone")).toBe(true);

    act(() => result.current.markSeen());
    expect(result.current.unseen).toEqual([]);
    // Up to what a viewer can see, not the trainer-only newest one.
    const viewerMax = Math.max(...WHATS_NEW.filter((e) => e.audience === "everyone").map((e) => e.id));
    expect(saveWhatsNewSeen).toHaveBeenCalledWith(user, viewerMax);
  });

  it("markSeen(true) marks everything, for a brand-new account", () => {
    auth.userId = "u1";
    profiles.access = viewer;
    profiles.accessResolved = true;
    const { result } = renderHook(() => useWhatsNew(user));
    act(() => result.current.markSeen(true));
    expect(saveWhatsNewSeen).toHaveBeenCalledWith(user, LATEST_WHATS_NEW_ID);
  });
});
