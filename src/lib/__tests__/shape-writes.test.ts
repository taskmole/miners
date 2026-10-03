import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const shape = (id: string, x = 0): GeoJSON.Feature => ({
    type: "Feature",
    id,
    properties: {},
    geometry: { type: "Point", coordinates: [x, 0] },
});

// What each request asked for: saved ids (with their x) or deleted ids.
const sent = () => apiFetch.mock.calls.map(([url, init]) =>
    init.method === "POST"
        ? { save: JSON.parse(init.body).rows.map((r: { id: string; geojson: GeoJSON.Feature }) =>
            `${r.id}@${(r.geojson.geometry as GeoJSON.Point).coordinates[0]}`) }
        : { remove: decodeURIComponent(url.split("ids=")[1]).split(",") });

describe("shape writes", () => {
    let w: typeof import("@/lib/shape-writes");
    beforeEach(async () => {
        apiFetch.mockReset().mockResolvedValue({});
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.resetModules();
        w = await import("@/lib/shape-writes");
    });

    it("saves and deletes only the shapes named, never a keep-list", async () => {
        await w.saveShapes([shape("a")]);
        await w.removeShapes(["b"]);
        expect(sent()).toEqual([{ save: ["a@0"] }, { remove: ["b"] }]);
        expect(apiFetch.mock.calls.some(([url]) => url.includes("keep_ids"))).toBe(false);
    });

    it("never sends a delete ahead of the save it follows", async () => {
        let release!: () => void;
        apiFetch.mockImplementationOnce(() => new Promise((r) => { release = () => r({}); }));
        const first = w.saveShapes([shape("a")]);
        await Promise.resolve();
        const second = w.removeShapes(["a"]);
        await Promise.resolve();
        expect(apiFetch).toHaveBeenCalledTimes(1);
        release();
        await Promise.all([first, second]);
        expect(sent()).toEqual([{ save: ["a@0"] }, { remove: ["a"] }]);
    });

    it("draw then delete before anything went out sends only the delete", async () => {
        const a = w.saveShapes([shape("a")]);
        const b = w.removeShapes(["a"]);
        await Promise.all([a, b]);
        expect(sent()).toEqual([{ remove: ["a"] }]);
    });

    it("retries a failed save with the next change, sending the latest version", async () => {
        apiFetch.mockRejectedValueOnce(new Error("offline"));
        await w.saveShapes([shape("a", 1)]);
        await w.saveShapes([shape("a", 2), shape("b")]);
        expect(sent()).toEqual([{ save: ["a@1"] }, { save: ["a@2", "b@0"] }]);
        await w.saveShapes([]);
        expect(apiFetch).toHaveBeenCalledTimes(2);
    });

    it("retries a failed delete, and a failed save does not block a delete", async () => {
        // Saves fail twice, then the server recovers; the first delete fails once.
        let saveFails = 2, deleteFails = 1;
        apiFetch.mockImplementation(async (_url: string, init: RequestInit) => {
            if (init.method === "POST" && saveFails-- > 0) throw new Error("save down");
            if (init.method === "DELETE" && deleteFails-- > 0) throw new Error("delete down");
            return {};
        });
        await w.saveShapes([shape("a")]);
        await w.removeShapes(["b"]);
        await w.removeShapes(["c"]);
        expect(sent()).toEqual([
            { save: ["a@0"] },
            { save: ["a@0"] },
            { remove: ["b"] },
            { save: ["a@0"] },
            { remove: ["b", "c"] },
        ]);
    });

    it("keeps a shape queued when it was edited again while its save was in flight", async () => {
        let release!: () => void;
        apiFetch.mockImplementationOnce(() => new Promise((r) => { release = () => r({}); }));
        const first = w.saveShapes([shape("a", 1)]);
        await Promise.resolve();
        const second = w.saveShapes([shape("a", 2)]);
        release();
        await Promise.all([first, second]);
        expect(sent()).toEqual([{ save: ["a@1"] }, { save: ["a@2"] }]);
    });
});
