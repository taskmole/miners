// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * The map-data routes start their read alongside the sign-in check
 * (authenticateAlongside). These pin down that nothing leaks to someone who
 * fails the check, and that every answer is the one the old one-after-the-
 * other order gave.
 */

const state = {
  signedIn: true,
  mayView: true as boolean | null,
  rows: [] as unknown[],
  queryError: null as { message: string } | null,
  // Resolve getUser by hand, to prove the read did not wait for it.
  holdAuth: false,
  releaseAuth: () => {},
  calls: [] as string[],
};

function fakeClient() {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    then: (resolve: (v: unknown) => void) => {
      state.calls.push("query");
      resolve({ data: state.queryError ? null : state.rows, error: state.queryError });
    },
  };
  return {
    auth: {
      getUser: () => {
        state.calls.push("getUser");
        const answer = () => (state.signedIn
          ? { data: { user: { id: "user-1" } }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } });
        if (!state.holdAuth) return Promise.resolve(answer());
        return new Promise((resolve) => { state.releaseAuth = () => resolve(answer()); });
      },
    },
    rpc: async (name: string) => {
      state.calls.push(`rpc:${name}`);
      return { data: state.mayView, error: null };
    },
    from: () => query,
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeClient() }));

const { GET: getData } = await import("../route");
const { GET: getPlaces } = await import("../../db/places/route");

function req(path: string, token: string | null = "token") {
  return new NextRequest(`http://localhost${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  Object.assign(state, { signedIn: true, mayView: true, rows: [], queryError: null, holdAuth: false, calls: [] });
});

describe("/api/data answers in the same order as before", () => {
  it("401 with no token, without asking the database anything", async () => {
    const res = await getData(req("/api/data?type=cafes", null));
    expect(res.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("401 beats every other answer when the sign-in check fails", async () => {
    state.signedIn = false;
    for (const path of ["/api/data?type=nope", "/api/data?type=gravity", "/api/data?type=cafes"]) {
      expect((await getData(req(path))).status).toBe(401);
    }
    state.mayView = false;
    expect((await getData(req("/api/data?type=cafes"))).status).toBe(401);
  });

  it("400 for a malformed request, but only once signed in", async () => {
    const unknown = await getData(req("/api/data?type=nope"));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "Invalid type" });
    const noCity = await getData(req("/api/data?type=gravity"));
    expect(noCity.status).toBe(400);
    expect(await noCity.json()).toEqual({ error: "city required" });
  });

  it("403 without the city grant, including a fail-closed grant check", async () => {
    state.mayView = false;
    expect((await getData(req("/api/data?type=cafes"))).status).toBe(403);
    expect((await getData(req("/api/data?type=metro&city=prague"))).status).toBe(403);
    expect((await getData(req("/api/data?type=gravity&city=madrid"))).status).toBe(403);
    state.mayView = null;
    expect((await getData(req("/api/data?type=cafes"))).status).toBe(403);
  });

  it("gravity checks the grant before the city's spelling, as before", async () => {
    state.mayView = false;
    expect((await getData(req("/api/data?type=gravity&city=..%2Fx"))).status).toBe(403);
    state.mayView = true;
    const res = await getData(req("/api/data?type=gravity&city=..%2Fx"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid city" });
  });

  it("serves the file when signed in and granted", async () => {
    const res = await getData(req("/api/data?type=cafes"));
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("starts the grant check before the sign-in check has answered", async () => {
    state.holdAuth = true;
    const pending = getData(req("/api/data?type=cafes"));
    await new Promise((r) => setTimeout(r, 0));
    expect(state.calls).toEqual(["getUser", "rpc:has_city_level"]);
    state.releaseAuth();
    expect((await pending).status).toBe(200);
  });
});

describe("/api/db/places", () => {
  const row = {
    name: "Local", address: "Calle 1", location: "0101000020E6100000000000000000F03F0000000000000040",
    source: "idealista", metadata: { price: 900 }, photos: ["a.jpg"], updated_at: null, created_at: null,
    ai_score: null, ai_reason: null,
  };

  it("never returns rows to someone who fails the sign-in check", async () => {
    state.signedIn = false;
    state.rows = [row];
    const res = await getPlaces(req("/api/db/places?city_id=madrid"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("runs the query alongside the sign-in check and returns the mapped rows", async () => {
    state.rows = [row];
    state.holdAuth = true;
    const pending = getPlaces(req("/api/db/places?city_id=madrid"));
    await new Promise((r) => setTimeout(r, 0));
    expect(state.calls).toEqual(["getUser", "query"]);
    state.releaseAuth();
    const res = await pending;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ name: "Local", price: 900, latitude: 2, longitude: 1, image_url: "a.jpg" });
  });

  it("500 on a query error once signed in, 400 without a city", async () => {
    state.queryError = { message: "boom" };
    expect((await getPlaces(req("/api/db/places?city_id=madrid"))).status).toBe(500);
    expect((await getPlaces(req("/api/db/places"))).status).toBe(400);
  });
});

describe("authenticateAlongside when the read itself throws", async () => {
  const { authenticateAlongside } = await import("@/lib/supabase-server");
  const boom = async () => { throw new Error("read failed"); };

  it("still answers 401 to someone who fails the sign-in check", async () => {
    state.signedIn = false;
    const auth = await authenticateAlongside(req("/x"), boom);
    expect(auth.error?.status).toBe(401);
  });

  it("hands the error to the route's own catch once signed in", async () => {
    await expect(authenticateAlongside(req("/x"), boom)).rejects.toThrow("read failed");
  });
});
