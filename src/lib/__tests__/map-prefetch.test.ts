import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cities } from "@/lib/cities";
import { PENDING_KEY, PENDING_TTL_MS, pendingPlaceCity, savePendingFocus } from "@/lib/share";
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
const MADRID_ID = "property-40.43578--3.70034-184bf122";
const PRAGUE_ID = "property-50.08996-14.42357-87199d31";
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
        ["a link with more in its query (older emails)", () => { storeSession(); window.history.replaceState({}, "", `/?focus=${MADRID_ID}&city=madrid`); }],
        ["a sign-in error", () => { storeSession(); window.history.replaceState({}, "", "/?auth_error=nope"); }],
        ["a link to a place in a city that is not live", () => { storeSession(); window.history.replaceState({}, "", "/?focus=cafe-41.38740-2.17340"); }],
        ["a link to a place in no city", () => { storeSession(); window.history.replaceState({}, "", "/?focus=cafe-52.52000-13.40500"); }],
        ["a link without coordinates", () => { storeSession(); window.history.replaceState({}, "", "/?focus=abc"); }],
        ["a link that cannot be decoded", () => { storeSession(); window.history.replaceState({}, "", "/?focus=%E0%A4%A"); }],
        ["a waiting place in no city", () => { storeSession(); savePendingFocus("cafe-52.52000-13.40500"); }],
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

    it("starts a shared link's city, not the saved one", () => {
        storeSession({ default_city: "prague" });
        window.history.replaceState({}, "", `/?focus=${encodeURIComponent(MADRID_ID)}`);
        runScript();
        expect(requested).toEqual(MAP_DATA_URLS.madrid);
    });

    it("starts a shared link's city for someone with no saved city yet", () => {
        storeSession({});
        window.history.replaceState({}, "", `/?focus=${PRAGUE_ID}`);
        runScript();
        expect(requested).toEqual(MAP_DATA_URLS.prague);
    });

    it("starts a waiting place's city after the sign-in round trip", () => {
        storeSession({ default_city: "prague" });
        savePendingFocus(MADRID_ID);
        runScript();
        expect(requested).toEqual(MAP_DATA_URLS.madrid);
    });

    it("falls back to the saved city for a stale or broken waiting place", () => {
        storeSession({ default_city: "prague" });
        savePendingFocus(MADRID_ID, Date.now() - PENDING_TTL_MS - 1);
        runScript();
        expect(requested).toEqual(MAP_DATA_URLS.prague);
        delete w.__minersMapPrefetch;
        sessionStorage.setItem(PENDING_KEY, "{}");
        recordFetch();
        runScript();
        expect(requested).toEqual(MAP_DATA_URLS.prague);
    });

    it("picks the same city as the app for any place", () => {
        // City centres, the suburbs, both sides of the 150 km line, far away,
        // not-live cities, upper case ids.
        const ids = [
            "property-40.41680--3.70380-abc", "cafe-50.07550-14.43780", "PROPERTY-40.43578--3.70034-184BF122",
            "gym-40.28410--3.77940", "cafe-41.73000--3.70380", "cafe-41.77000--3.70380",
            "cafe-50.07550-16.53000", "cafe-50.07550-16.62000", "cafe-49.40000-14.43780", "cafe-48.70000-14.43780",
            "cafe-41.38740-2.17340", "cafe-37.38910--5.98450", "cafe-39.90000--4.60000", "cafe-0.00000-0.00000",
            "cafe-52.52000-13.40500", "cafe-40.4-3.7", "metro-40.41680--3.70380",
        ];
        for (const id of ids) {
            sessionStorage.clear();
            delete w.__minersMapPrefetch;
            savePendingFocus(id);
            const appCity = pendingPlaceCity()?.id ?? null;
            storeSession({});
            window.history.replaceState({}, "", `/?focus=${encodeURIComponent(id)}`);
            recordFetch();
            runScript();
            const scriptCity = requested.length ? new URL(requested[0], "http://x").searchParams.get("city_id") : null;
            expect(scriptCity, id).toBe(appCity);
        }
    });

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
