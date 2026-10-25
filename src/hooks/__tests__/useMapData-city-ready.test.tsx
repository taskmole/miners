import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { useMapData } from "../useMapData";

/**
 * The page passes null until it knows which city to load, so that a Prague
 * user never downloads Madrid first. Null must request nothing and still read
 * as "loading", or the map would flash empty before its data arrives.
 */

const originalFetch = global.fetch;
const requested: string[] = [];

// A fresh SWR cache per test, so one test's data cannot answer another's.
const wrapper = ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

beforeEach(() => {
    requested.length = 0;
    global.fetch = vi.fn((url: string) => {
        requested.push(url);
        return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    }) as unknown as typeof fetch;
});

afterEach(() => {
    global.fetch = originalFetch;
});

describe("useMapData before the city is known", () => {
    it("requests nothing and reports loading while the city is null", async () => {
        const { result } = renderHook(() => useMapData(null), { wrapper });
        await new Promise((r) => setTimeout(r, 20));
        expect(result.current.isLoading).toBe(true);
        expect(result.current.error).toBeNull();
        expect(requested).toEqual([]);
    });

    it("then loads only the city it is given", async () => {
        const { result, rerender } = renderHook(({ city }: { city: string | null }) => useMapData(city), {
            wrapper,
            initialProps: { city: null as string | null },
        });
        rerender({ city: "prague" });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(requested.length).toBeGreaterThan(0);
        expect(requested.some((u) => u.includes("prague"))).toBe(true);
        expect(requested.filter((u) => u.includes("madrid") || u === "/api/data?type=cafes" || u === "/api/data?type=other")).toEqual([]);
    });

    it("still means Madrid when no city is passed at all", async () => {
        const { result } = renderHook(() => useMapData(), { wrapper });
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(requested).toContain("/api/db/places?city_id=madrid");
    });
});
