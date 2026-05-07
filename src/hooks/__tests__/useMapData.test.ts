import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/gravity-lookup", () => ({
    preloadGravity: vi.fn(),
    getScoreAt: vi.fn(() => 72),
}));

vi.mock("@/lib/dateUtils", () => ({
    isRecentlyAdded: vi.fn(() => false),
    isNewPoi: vi.fn(() => false),
}));

function buildApiRow(overrides: Record<string, unknown> = {}) {
    return {
        name: "Test Property",
        address: "123 Main St",
        latitude: 40.3,
        longitude: -1.1,
        source: "idealista",
        price: 1200,
        size: 80,
        priceByArea: 15,
        district: "Centro",
        hasAirConditioning: false,
        url: "https://example.com",
        transfer: undefined,
        hasBathroom: false,
        hasStorefront: false,
        image_url: "https://img.example.com/1.jpg",
        priceHistory: undefined,
        updatedAt: "2026-05-01T00:00:00Z",
        photos: ["https://img.example.com/1.jpg"],
        ...overrides,
    };
}

const originalFetch = global.fetch;

function mockFetchResponse(data: unknown[], status = 200) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        json: () => Promise.resolve(data),
    });
}

function mockFetchError(status: number, statusText: string) {
    global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status,
        statusText,
        json: () => Promise.resolve({ error: statusText }),
    });
}

function mockFetchReject(error: Error) {
    global.fetch = vi.fn().mockRejectedValue(error);
}

describe("loadProperties", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("returns properties on successful API response", async () => {
        mockFetchResponse([buildApiRow()]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result.length).toBe(1);
        expect(result[0].type).toBe("property");
        expect(result[0].source).toBe("idealista");
        expect(result[0].price).toBe(1200);
        expect(result[0].address).toBe("123 Main St");
    });

    it("maps sreality source correctly", async () => {
        mockFetchResponse([buildApiRow({ source: "sreality" })]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result[0].source).toBe("sreality");
    });

    it("returns empty array when API returns empty list", async () => {
        mockFetchResponse([]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result).toEqual([]);
    });

    it("throws on non-OK API response (enables SWR retry)", async () => {
        mockFetchError(500, "Internal Server Error");
        const { __test } = await import("@/hooks/useMapData");
        await expect(__test.loadProperties("prague")).rejects.toThrow("Places API 500");
    });

    it("propagates network errors to caller", async () => {
        mockFetchReject(new Error("network timeout"));
        const { __test } = await import("@/hooks/useMapData");
        await expect(__test.loadProperties("prague")).rejects.toThrow("network timeout");
    });

    it("calls gravity scoring for each property", async () => {
        const { getScoreAt } = await import("@/lib/gravity-lookup");
        mockFetchResponse([buildApiRow(), buildApiRow({ latitude: 41.0, longitude: -2.0 })]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result.length).toBe(2);
        expect(getScoreAt).toHaveBeenCalledTimes(2);
        expect(result[0].score).toBe(72);
    });

    it("passes city_id as query parameter", async () => {
        mockFetchResponse([]);
        const { __test } = await import("@/hooks/useMapData");
        await __test.loadProperties("barcelona");
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining("city_id=barcelona"),
            expect.any(Object),
        );
    });

    it.each(["madrid", "barcelona", "prague"])("does not crash for %s", async (city) => {
        mockFetchResponse([buildApiRow()]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties(city);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });

    it("maps all expected fields from API response", async () => {
        mockFetchResponse([buildApiRow()]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        const p = result[0];
        expect(p.type).toBe("property");
        expect(p.latitude).toBe(40.3);
        expect(p.longitude).toBe(-1.1);
        expect(p.size).toBe(80);
        expect(p.priceByArea).toBe(15);
        expect(p.district).toBe("Centro");
        expect(p.title).toBe("Test Property");
        expect(p.image_url).toBe("https://img.example.com/1.jpg");
        expect(p.updatedAt).toBe("2026-05-01T00:00:00Z");
    });
});

describe("loadCafes", () => {
    it("returns empty array for unsupported city", async () => {
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadCafes("vienna");
        expect(result).toEqual([]);
    });
});

describe("loadOtherPois", () => {
    it("returns empty array for non-Madrid city", async () => {
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadOtherPois("prague");
        expect(result).toEqual([]);
    });
});
