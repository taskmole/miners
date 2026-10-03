import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/supabaseHelpers", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/browser-session", () => ({
    getAuthUserId: vi.fn(() => null),
    getCurrentUserId: vi.fn(() => "user-1"),
}));
const enqueue = vi.fn();
vi.mock("@/lib/list-sync", () => ({
    enqueue: (...args: unknown[]) => enqueue(...args),
    hasPendingCreate: vi.fn(() => false),
    hasPendingItemUpsert: vi.fn(() => false),
    hasPendingDeletion: vi.fn(() => false),
    hasPendingItemDeletion: vi.fn(() => false),
    hasPendingListDeletion: vi.fn(() => false),
    initSyncQueue: vi.fn(),
    setReadOnlyLists: vi.fn(),
    startDraining: vi.fn(),
}));

import { useLists } from "@/hooks/useLists";

const place = {
    placeId: "p1",
    placeType: "property" as const,
    placeName: "Calle Mayor 1",
    placeAddress: "Calle Mayor 1",
    lat: 40.4,
    lon: -3.7,
};

describe("create a list and add to it in the same click", () => {
    it("addToList right after createList actually adds the item", () => {
        const { result } = renderHook(() => useLists());
        act(() => {
            const list = result.current.createList("Saved properties");
            result.current.addToList(list.id, place);
        });
        const list = result.current.lists.find(l => l.name === "Saved properties");
        expect(list?.items.map(i => i.placeId)).toEqual(["p1"]);
        // The create must reach the sync queue before the item that needs it.
        const types = enqueue.mock.calls.map(c => (c[0] as { type: string }).type);
        expect(types.indexOf("create_list")).toBeLessThan(types.indexOf("add_item"));
    });

    it("toggleInList right after createList adds rather than doing nothing", () => {
        const { result } = renderHook(() => useLists());
        let added = false;
        act(() => {
            const list = result.current.createList("New");
            added = result.current.toggleInList(list.id, place);
        });
        expect(added).toBe(true);
        expect(result.current.lists.find(l => l.name === "New")?.items).toHaveLength(1);
    });
});
