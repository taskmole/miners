import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockIsConfigured } = vi.hoisted(() => ({
    mockFrom: vi.fn(),
    mockIsConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/supabase", () => ({
    isSupabaseConfigured: mockIsConfigured,
    dataSupabase: { from: mockFrom },
}));

vi.mock("@/lib/gravity-lookup", () => ({
    preloadGravity: vi.fn(),
    getScoreAt: vi.fn(() => 72),
}));

vi.mock("@/lib/dateUtils", () => ({
    isRecentlyAdded: vi.fn(() => false),
    isNewPoi: vi.fn(() => false),
}));

const VALID_WKB_HEX =
    "0101000020E6100000" +
    "9A9999999999F1BF" +
    "CDCCCCCCCC4C4440";

function buildRow(overrides: Record<string, unknown> = {}) {
    return {
        name: "Test Property",
        address: "123 Main St",
        location: VALID_WKB_HEX,
        source: "idealista",
        metadata: {
            price: 1200,
            size: 80,
            priceByArea: 15,
            district: "Centro",
            url: "https://example.com",
        },
        photos: ["https://img.example.com/1.jpg"],
        updated_at: "2026-05-01T00:00:00Z",
        ...overrides,
    };
}

function mockQuery(data: unknown[] | null) {
    const result = Promise.resolve({ data, error: null });
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: any, reject: any) => result.then(resolve, reject);
    mockFrom.mockReturnValue(chain);
    return chain;
}

function mockQueryRejection(error: Error) {
    const rejection = Promise.reject(error);
    const chain: Record<string, any> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.then = (resolve: any, reject: any) => rejection.then(resolve, reject);
    mockFrom.mockReturnValue(chain);
    return chain;
}

describe("loadProperties", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockIsConfigured.mockReturnValue(true);
    });

    it("returns empty array when Supabase is not configured", async () => {
        mockIsConfigured.mockReturnValue(false);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result).toEqual([]);
    });

    it("returns properties on successful query", async () => {
        mockQuery([buildRow()]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result.length).toBe(1);
        expect(result[0].type).toBe("property");
        expect(result[0].source).toBe("idealista");
        expect(result[0].price).toBe(1200);
        expect(result[0].address).toBe("123 Main St");
    });

    it("filters out rows with unparseable WKB coordinates", async () => {
        mockQuery([buildRow(), buildRow({ location: "bad_hex" }), buildRow({ location: "" })]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("madrid");
        expect(result.length).toBe(1);
    });

    it("returns empty array when query returns null data", async () => {
        mockQuery(null);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result).toEqual([]);
    });

    it("maps sreality source correctly", async () => {
        mockQuery([buildRow({ source: "sreality" })]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties("prague");
        expect(result[0].source).toBe("sreality");
    });

    it("propagates query errors to caller (enables SWR retry)", async () => {
        mockQueryRejection(new Error("connection failed"));
        const { __test } = await import("@/hooks/useMapData");
        await expect(__test.loadProperties("prague")).rejects.toThrow("connection failed");
    });

    it.each(["madrid", "barcelona", "prague"])("does not crash for %s", async (city) => {
        mockQuery([buildRow()]);
        const { __test } = await import("@/hooks/useMapData");
        const result = await __test.loadProperties(city);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
    });
});

describe("parseWkbPoint", () => {
    it("returns null for empty input", async () => {
        const { __test } = await import("@/hooks/useMapData");
        expect(__test.parseWkbPoint("")).toBeNull();
    });

    it("returns null for short hex", async () => {
        const { __test } = await import("@/hooks/useMapData");
        expect(__test.parseWkbPoint("0101000020")).toBeNull();
    });

    it("parses valid WKB hex to lat/lon", async () => {
        const { __test } = await import("@/hooks/useMapData");
        const result = __test.parseWkbPoint(VALID_WKB_HEX);
        expect(result).not.toBeNull();
        expect(typeof result!.lat).toBe("number");
        expect(typeof result!.lon).toBe("number");
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
