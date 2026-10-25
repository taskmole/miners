import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cities } from "@/lib/cities";
import { PENDING_KEY } from "@/lib/share";
import {
    MAP_DATA_URLS,
    buildMapPrefetchScript,
    mapDataUrlsFor,
    sessionStorageKey,
    takePrefetchedResponse,
} from "@/lib/map-prefetch";
import { __test } from "@/hooks/useMapData";

// The map's own requests carry this token, as a signed-in page's would.
vi.mock("@/lib/api-client", () => ({
    getAuthToken: async () => "header.payload.signature-abcdefghijklmnop",
    getRefreshedAuthToken: async () => "header.payload.signature-abcdefghijklmnop",
}));

const SUPABASE_URL = "https://sybuvcpmybdsuduthvom.supabase.co";
const KEY = sessionStorageKey(SUPABASE_URL);
const TOKEN = "header.payload.signature-abcdefghijklmnop";
type W = Window & { __minersMapPrefetch?: { tokenTail: string; startedAt: number; responses: Record<string, Promise<Response | null>> } };
const w = window as W;

const originalFetch = global.fetch;
let requested: string[] = [];
function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function recordFetch(answer: () => Response = () => json([])) {
    requested = [];
    global.fetch = vi.fn((url: string) => { requested.push(url); return Promise.resolve(answer()); }) as unknown as typeof fetch;
}

function storeSession(meta: Record<string, unknown> = { default_city: "prague" }, secondsLeft = 3600) {
    localStorage.setItem(KEY, JSON.stringify({
        access_token: TOKEN,
        expires_at: Math.floor(Date.now() / 1000) + secondsLeft,
        user: { id: "u1", user_metadata: meta },
    }));
}
function runScript() {
    new Function(buildMapPrefetchScript(SUPABASE_URL)!)();
}

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    delete w.__minersMapPrefetch;
    window.history.replaceState({}, "", "/");
    recordFetch();
});
afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
});

describe("the prefetch list matches what the map really asks for", () => {
    for (const city of cities) {
        it(`${city.id}`, async () => {
            await Promise.all([__test.loadCafes(city.id), __test.loadProperties(city.id), __test.loadOtherPois(city.id)]);
            expect([...requested].sort()).toEqual([...mapDataUrlsFor(city.id)].sort());
            expect(mapDataUrlsFor(city.id)[0]).toBe(`/api/db/places?city_id=${city.id}`);
        });
    }

    it("has no entries for cities that do not exist", () => {
        for (const id of Object.keys(MAP_DATA_URLS)) expect(cities.some((c) => c.id === id)).toBe(true);
    });
});

it("reads the session from the same place supabase-js stores it", () => {
    const client = createClient(SUPABASE_URL, "anon", { auth: { persistSession: false, autoRefreshToken: false } });
    expect((client.auth as unknown as { storageKey: string }).storageKey).toBe(KEY);
});

describe("head script", () => {
    it("starts the saved city's requests, listings first, with the session's token", () => {
        storeSession();
        runScript();
        expect(requested).toEqual(MAP_DATA_URLS.prague);
        const init = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(init).toMatchObject({ cache: "no-store", headers: { Authorization: `Bearer ${TOKEN}` } });
        expect(w.__minersMapPrefetch?.tokenTail).toBe(TOKEN.slice(-16));
        expect(JSON.stringify(w.__minersMapPrefetch)).not.toContain(TOKEN);
    });

    const skips: [string, () => void][] = [
        ["signed out", () => {}],
        ["another page", () => { storeSession(); window.history.replaceState({}, "", "/admin"); }],
        ["a shared or email link", () => { storeSession(); window.history.replaceState({}, "", "/?focus=abc"); }],
        ["a shared place waiting to open", () => { storeSession(); sessionStorage.setItem(PENDING_KEY, "{}"); }],
        ["a token about to expire", () => storeSession({ default_city: "prague" }, 120)],
        ["no saved city (the picker shows)", () => storeSession({})],
        ["a city that is not live", () => storeSession({ default_city: "barcelona" })],
        ["a broken stored session", () => localStorage.setItem(KEY, "{not json")],
    ];
    for (const [name, arrange] of skips) {
        it(`does nothing for ${name}`, () => {
            arrange();
            expect(() => runScript()).not.toThrow();
            expect(requested).toEqual([]);
            expect(w.__minersMapPrefetch).toBeUndefined();
        });
    }

    it("is not built without Supabase", () => {
        expect(buildMapPrefetchScript(undefined)).toBeNull();
    });
});

describe("takePrefetchedResponse", () => {
    const batch = (responses: Record<string, Promise<Response | null>>, startedAt = Date.now()) => {
        w.__minersMapPrefetch = { tokenTail: TOKEN.slice(-16), startedAt, responses };
    };

    it("hands each answer over once, then clears the window entry", async () => {
        batch({ "/a": Promise.resolve(json([1])), "/b": Promise.resolve(json([2])) });
        expect(await (await takePrefetchedResponse("/a", TOKEN))!.json()).toEqual([1]);
        expect(takePrefetchedResponse("/a", TOKEN)).toBeNull();
        expect(w.__minersMapPrefetch).toBeDefined();
        await takePrefetchedResponse("/b", TOKEN);
        expect(w.__minersMapPrefetch).toBeUndefined();
    });

    it("drops the batch for a different session or an old answer", () => {
        batch({ "/a": Promise.resolve(json([])) });
        expect(takePrefetchedResponse("/a", "another-token-xxxxxxxxxxxxxxxx")).toBeNull();
        expect(w.__minersMapPrefetch).toBeUndefined();
        batch({ "/a": Promise.resolve(json([])) }, Date.now() - 21_000);
        expect(takePrefetchedResponse("/a", TOKEN)).toBeNull();
        expect(w.__minersMapPrefetch).toBeUndefined();
    });

    it("gives nothing without a token or a batch", () => {
        expect(takePrefetchedResponse("/a", TOKEN)).toBeNull();
        batch({ "/a": Promise.resolve(json([])) });
        expect(takePrefetchedResponse("/a", null)).toBeNull();
    });
});

describe("useMapData uses the early answer only when it is good", () => {
    const places = "/api/db/places?city_id=prague";
    const row = { name: "Early", address: "", latitude: 50, longitude: 14, source: "sreality" };
    const early = (answer: Promise<Response | null>) => {
        w.__minersMapPrefetch = { tokenTail: TOKEN.slice(-16), startedAt: Date.now(), responses: { [places]: answer } };
    };

    it("uses a good early answer instead of asking again", async () => {
        early(Promise.resolve(json([row])));
        recordFetch(() => json([]));
        const result = await __test.loadProperties("prague");
        expect(result.map((p) => p.address)).toEqual([""]);
        expect(requested).toEqual([]);
    });

    it("asks again after an early 401, a failed request or a stale session", async () => {
        for (const answer of [Promise.resolve(json({ error: "Unauthorized" }, 401)), Promise.resolve(null)]) {
            early(answer);
            recordFetch(() => json([row]));
            expect(await __test.loadProperties("prague")).toHaveLength(1);
            expect(requested).toEqual([places]);
        }
        w.__minersMapPrefetch = { tokenTail: "someone-else-xxx", startedAt: Date.now(), responses: { [places]: Promise.resolve(json([])) } };
        recordFetch(() => json([row]));
        expect(await __test.loadProperties("prague")).toHaveLength(1);
        expect(requested).toEqual([places]);
    });
});
