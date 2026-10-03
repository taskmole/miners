import { describe, it, expect, vi, beforeEach } from "vitest";

const readFile = vi.fn();
vi.mock("fs/promises", () => ({ default: { readFile: (...a: unknown[]) => readFile(...a) }, readFile: (...a: unknown[]) => readFile(...a) }));

const grid = JSON.stringify({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { normalizedScore: 0.5 }, geometry: { type: "Point", coordinates: [-3.7, 40.4] } }],
});

describe("getGravityIndex", () => {
    beforeEach(() => { readFile.mockReset(); vi.resetModules(); });

    it("returns null without reading anything for a city with no grid", async () => {
        const { getGravityIndex } = await import("@/lib/gravity-server");
        expect(await getGravityIndex("prague")).toBeNull();
        expect(await getGravityIndex("constructor")).toBeNull();
        expect(await getGravityIndex("__proto__")).toBeNull();
        expect(readFile).not.toHaveBeenCalled();
    });

    it("reads the grid once and reuses it", async () => {
        readFile.mockResolvedValue(grid);
        const { getGravityIndex } = await import("@/lib/gravity-server");
        const [a, b] = await Promise.all([getGravityIndex("madrid"), getGravityIndex("madrid")]);
        expect(a).not.toBeNull();
        expect(a).toBe(b);
        await getGravityIndex("madrid");
        expect(readFile).toHaveBeenCalledTimes(1);
    });

    it("forgets a failed load so the next request tries again", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        readFile.mockRejectedValueOnce(new Error("disk")).mockResolvedValueOnce(grid);
        const { getGravityIndex } = await import("@/lib/gravity-server");
        expect(await getGravityIndex("madrid")).toBeNull();
        expect(await getGravityIndex("madrid")).not.toBeNull();
        expect(readFile).toHaveBeenCalledTimes(2);
    });
});
