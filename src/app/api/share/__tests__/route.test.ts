// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// What the fake database was asked, and what it should answer.
const state = {
  authed: true,
  mayView: true as boolean | null,
  rpcError: null as unknown,
  insertError: null as unknown,
  rpcArgs: [] as unknown[],
  inserted: [] as unknown[],
  // What the database says the listing is; null = no such listing, "error" = lookup failed.
  listing: null as { title: string; address: string | null; photoUrl: string | null } | null | "error",
  listingUrls: [] as unknown[],
};

const LISTING = { title: "Local en Žižkov", address: "Bořivojova 1, Praha", photoUrl: "https://d18-a.sdn.cz/real.png" };

vi.mock("@/lib/share-place", () => ({
  findListing: async (_db: unknown, _cityId: string, _placeId: string, listingUrl: unknown) => {
    state.listingUrls.push(listingUrl);
    if (state.listing === "error") throw new Error("boom");
    return state.listing;
  },
}));

vi.mock("@/lib/supabase-server", () => ({
  authenticateRequest: async () =>
    state.authed
      ? {
          userId: "user-1",
          supabase: {},
        }
      : { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
  mayViewCity: async (_supabase: unknown, cityId: string) => {
    state.rpcArgs.push(cityId);
    return state.rpcError ? null : state.mayView;
  },
  createServiceSupabase: () => ({
    from: () => ({
      insert: async (row: unknown) => {
        state.inserted.push(row);
        return { error: state.insertError };
      },
    }),
  }),
}));

// Work scheduled to run after the response (the preview warm-up).
const afterTasks: unknown[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: unknown) => afterTasks.push(task),
}));

const { POST } = await import("../route");

const PRAGUE_PROPERTY = "property-50.08353-14.45230-1a2b3c4d";
const body = (overrides: Record<string, unknown> = {}) => ({
  code: "Abc123XYZ9",
  placeId: PRAGUE_PROPERTY,
  placeType: "property",
  title: "Pronájem obchodního prostoru 24 m²",
  address: "Bořivojova, Žižkov, Praha",
  photoUrl: "https://d18-a.sdn.cz/x.png?fl=res,749,562,3",
  listingUrl: "https://www.sreality.cz/detail/123",
  ...overrides,
});
const post = (json: unknown) =>
  POST(new NextRequest("http://localhost/api/share", { method: "POST", body: JSON.stringify(json) }));

describe("POST /api/share", () => {
  beforeEach(() => {
    Object.assign(state, {
      authed: true, mayView: true, rpcError: null, insertError: null, rpcArgs: [], inserted: [], listing: LISTING, listingUrls: [],
    });
    afterTasks.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves a share with the city worked out from the place id", async () => {
    const res = await post(body({ cityId: "madrid" })); // a city from the browser is ignored
    expect(res.status).toBe(201);
    expect(state.rpcArgs).toEqual(["prague"]);
    expect(state.inserted).toEqual([
      expect.objectContaining({ code: "Abc123XYZ9", city_id: "prague", created_by: "user-1", place_type: "property" }),
    ]);
    expect(afterTasks).toHaveLength(1); // preview warm-up scheduled
  });

  it("needs a signed-in caller", async () => {
    state.authed = false;
    expect((await post(body())).status).toBe(401);
    expect(state.inserted).toEqual([]);
  });

  it("refuses a city the caller cannot view", async () => {
    state.mayView = false;
    expect((await post(body())).status).toBe(403);
    expect(state.inserted).toEqual([]);
  });

  it("fails closed when the access check errors", async () => {
    state.rpcError = { message: "boom" };
    expect((await post(body())).status).toBe(503);
    expect(state.inserted).toEqual([]);
  });

  it("refuses a malformed share", async () => {
    expect((await post(body({ code: "short" }))).status).toBe(400);
    expect((await post(body({ placeId: "nonsense" }))).status).toBe(400);
    expect((await post("not an object")).status).toBe(400);
    expect(state.inserted).toEqual([]);
  });

  it("refuses a place nowhere near a known city", async () => {
    expect((await post(body({ placeId: "property-0.00000-0.00000-1a2b3c4d" }))).status).toBe(400);
  });

  it("never repoints a code that already exists", async () => {
    state.insertError = { code: "23505", message: "duplicate key" };
    expect((await post(body())).status).toBe(409);
    expect(afterTasks).toEqual([]); // nothing to warm for a link that was not saved
  });

  it("stores no photo from a host that is not allowed", async () => {
    state.listing = { ...LISTING, photoUrl: "https://evil.com/x.jpg" };
    await post(body());
    expect(state.inserted).toEqual([expect.objectContaining({ photo_url: null })]);
  });

  it("stores a listing's real name, address and photo, not the browser's", async () => {
    await post(body({ title: "Made up", address: "Nowhere", photoUrl: null, placeType: "cafe" }));
    expect(state.listingUrls).toEqual(["https://www.sreality.cz/detail/123"]);
    expect(state.inserted).toEqual([
      expect.objectContaining({ title: LISTING.title, address: LISTING.address, photo_url: LISTING.photoUrl, place_type: "property" }),
    ]);
  });

  it("refuses a listing the database does not have", async () => {
    state.listing = null;
    expect((await post(body())).status).toBe(404);
    expect(state.inserted).toEqual([]);
  });

  it("fails closed when the listing lookup errors", async () => {
    state.listing = "error";
    expect((await post(body())).status).toBe(503);
    expect(state.inserted).toEqual([]);
  });

  it("never lets another kind of place pass as a listing", async () => {
    expect((await post(body({ placeId: "gym-50.08353-14.45230", placeType: "property" }))).status).toBe(400);
    await post(body({ placeId: "Property-50.08353-14.45230-1a2b3c4d", title: "Made up" }));
    expect(state.inserted).toEqual([expect.objectContaining({ title: LISTING.title })]);
  });

  it("keeps what the browser sent for places that are not listings", async () => {
    await post(body({ placeId: "gym-50.08353-14.45230", placeType: "gym", title: "Gym Žižkov", listingUrl: undefined }));
    expect(state.listingUrls).toEqual([]);
    expect(state.inserted).toEqual([expect.objectContaining({ title: "Gym Žižkov", place_type: "gym" })]);
  });

  describe("preview warm-up", () => {
    const page = (image: string) =>
      new Response(`<meta property="og:image" content="${image}"/>`, { headers: { "content-type": "text/html" } });
    const warm = async (fetchMock: ReturnType<typeof vi.fn>) => {
      vi.stubGlobal("fetch", fetchMock);
      await post(body());
      await (afterTasks[0] as () => Promise<void>)();
    };

    it("renders the image the page points at", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(page("http://localhost/s/Abc123XYZ9/opengraph-image?a=1&amp;b=2"))
        .mockResolvedValueOnce(new Response("jpeg"));
      await warm(fetchMock);
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "http://localhost/s/Abc123XYZ9",
        "http://localhost/s/Abc123XYZ9/opengraph-image?a=1&b=2",
      ]);
    });

    it("never fetches an image somewhere else", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(page("https://evil.example/s/Abc123XYZ9/opengraph-image"));
      await warm(fetchMock);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("swallows a failed fetch", async () => {
      await warm(vi.fn().mockRejectedValue(new Error("offline")));
    });
  });
});
