import { describe, it, expect } from "vitest";
import { keepIfSame } from "@/lib/keep-if-same";

describe("keepIfSame", () => {
    it("keeps the old reference when the content is identical", () => {
        const prev = { a: { status: "approved" } };
        expect(keepIfSame(prev, { a: { status: "approved" } })).toBe(prev);
    });
    it("takes the new value when anything changed", () => {
        const next = [{ id: "1", status: "pending" }];
        expect(keepIfSame([{ id: "1", status: "approved" }], next)).toBe(next);
    });
});
