// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// What the fake database was asked, and what it should answer.
const state = {
  authed: true,
  mayView: true as boolean | null,
  rpcError: null as unknown,
  insertError: null as unknown,
  rpcArgs: [] as unknown[],
  inserted: [] as unknown[],
};

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
  ...overrides,
});
const post = (json: unknown) =>
  POST(new NextRequest("http://localhost/api/share", { method: "POST", body: JSON.stringify(json) }));

describe("POST /api/share", () => {
  beforeEach(() => {
    Object.assign(state, { authed: true, mayView: true, rpcError: null, insertError: null, rpcArgs: [], inserted: [] });
    afterTasks.length = 0;
  });

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
    await post(body({ photoUrl: "https://evil.com/x.jpg" }));
    expect(state.inserted).toEqual([expect.objectContaining({ photo_url: null })]);
  });
});
