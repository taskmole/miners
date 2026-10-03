import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ userId: "u1", isReady: true }) }));

import { usePropertyRequests } from "@/hooks/usePropertyRequests";

describe("requestProperty double tap", () => {
    it("sends one request when tapped twice before the first answers", async () => {
        let resolvePost: (v: unknown) => void = () => {};
        apiFetch.mockImplementation((url: string, init?: { method?: string }) => {
            if (init?.method === "POST") return new Promise((r) => { resolvePost = r; });
            return Promise.resolve([]);
        });
        const { result } = renderHook(() => usePropertyRequests());
        let a: Promise<unknown>, b: Promise<unknown>;
        act(() => {
            a = result.current.requestProperty("place-1");
            b = result.current.requestProperty("place-1");
        });
        await act(async () => {
            resolvePost({ id: "r1", property_place_id: "place-1", status: "pending" });
            await Promise.all([a!, b!]);
        });
        const posts = apiFetch.mock.calls.filter((c) => c[1]?.method === "POST");
        expect(posts).toHaveLength(1);
    });
});
