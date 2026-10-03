import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "u1", isReady: true }) }));

import { useUserProfiles } from "@/hooks/useUserProfiles";

function respond(url: string) {
    if (url.includes("mode=current")) return Promise.resolve({ isSuperAdmin: false, isActive: true, canSeeFinancials: false, grants: [] });
    return Promise.resolve([]);
}

describe("useUserProfiles request sharing", () => {
    beforeEach(() => {
        apiFetch.mockReset();
        apiFetch.mockImplementation((url: string) => respond(url));
    });

    it("five instances mounting together make one request per URL", async () => {
        const hooks = Array.from({ length: 5 }, () => renderHook(() => useUserProfiles()));
        await waitFor(() => hooks.forEach(h => expect(h.result.current.accessResolved).toBe(true)));
        const urls = apiFetch.mock.calls.map(c => c[0]);
        expect(urls.filter(u => u.includes("user-grants?mode=current"))).toHaveLength(1);
        expect(urls.filter(u => u.includes("user-profiles?mode=all"))).toHaveLength(1);
        expect(urls.filter(u => u.includes("user-grants?mode=all"))).toHaveLength(1);
    });

    it("a later mount asks the server again (nothing is cached)", async () => {
        const first = renderHook(() => useUserProfiles());
        await waitFor(() => expect(first.result.current.accessResolved).toBe(true));
        const second = renderHook(() => useUserProfiles());
        await waitFor(() => expect(second.result.current.accessResolved).toBe(true));
        const current = apiFetch.mock.calls.filter(c => String(c[0]).includes("mode=current"));
        expect(current).toHaveLength(2);
    });

    it("an explicit refetch always makes its own request", async () => {
        const h = renderHook(() => useUserProfiles());
        await waitFor(() => expect(h.result.current.accessResolved).toBe(true));
        const before = apiFetch.mock.calls.length;
        await act(async () => { await h.result.current.refetch(); });
        expect(apiFetch.mock.calls.length).toBe(before + 2);
    });
});
