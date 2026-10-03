// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Records every filter the route puts on the delete, so the test can check
// exactly which rows it would have removed.
const calls: Array<[string, ...unknown[]]> = [];
const builder = {
    delete: () => { calls.push(["delete"]); return builder; },
    eq: (...a: unknown[]) => { calls.push(["eq", ...a]); return builder; },
    in: (...a: unknown[]) => { calls.push(["in", ...a]); return Promise.resolve({ error: null }); },
    not: (...a: unknown[]) => { calls.push(["not", ...a]); return builder; },
};
vi.mock("@/lib/supabase-server", () => ({
    authenticateRequest: async () => ({ supabase: { from: () => builder }, userId: "user-1" }),
    untypedDb: (s: unknown) => s,
}));

const { DELETE } = await import("../route");
const del = (qs: string) => DELETE(new NextRequest(`http://localhost/api/db/drawn-features${qs}`, { method: "DELETE" }));

describe("DELETE /api/db/drawn-features", () => {
    beforeEach(() => { calls.length = 0; });

    it("deletes only the named shapes, and only the caller's", async () => {
        const res = await del("?ids=" + encodeURIComponent("abc123,def-456"));
        expect(res.status).toBe(204);
        expect(calls).toEqual([["delete"], ["eq", "user_id", "user-1"], ["in", "id", ["abc123", "def-456"]]]);
    });

    it("refuses to delete anything when no shape is named", async () => {
        for (const qs of ["", "?ids=", "?ids=,", "?keep_ids=abc123"]) {
            expect((await del(qs)).status).toBe(400);
        }
        expect(calls).toEqual([]);
    });

    it("drops ids that could break out of the filter", async () => {
        await del("?ids=" + encodeURIComponent("ok1,a)b,c d"));
        expect(calls.at(-1)).toEqual(["in", "id", ["ok1"]]);
    });
});
