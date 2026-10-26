// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type DbResult = { data: unknown; error: { code?: string; message: string } | null };

// What the fake database answers, in order, and what it was asked.
const state = {
  authed: true,
  reads: [] as DbResult[],
  insert: { data: [], error: null } as DbResult,
  update: { data: [], error: null } as DbResult,
  calls: [] as string[],
  inserted: [] as unknown[],
  updated: [] as unknown[],
};

// A row list as .maybeSingle() hands it back: the one row, or null.
const single = (r: DbResult): DbResult => ({
  data: Array.isArray(r.data) ? r.data[0] ?? null : r.data,
  error: r.error,
});

const fakeSupabase = {
  from: (table: string) => {
    expect(table).toBe("pitches");
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.calls.push("read");
            return state.reads.shift() ?? { data: null, error: null };
          },
        }),
      }),
      insert: (row: unknown) => ({
        select: () => ({
          maybeSingle: async () => {
            state.calls.push("insert");
            state.inserted.push(row);
            return single(state.insert);
          },
        }),
      }),
      update: (row: unknown) => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => {
              state.calls.push("update");
              state.updated.push(row);
              return single(state.update);
            },
          }),
        }),
      }),
    };
  },
};

vi.mock("@/lib/supabase-server", () => ({
  authenticateRequest: async () =>
    state.authed
      ? { userId: "caller-1", supabase: fakeSupabase }
      : { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) },
  untypedDb: (s: unknown) => s,
  accessFor: async () => null,
  createServerSupabase: () => fakeSupabase,
  getTokenFromRequest: () => "token",
  getUserTeamIds: async () => [],
}));

const sendSubmissionEmails = vi.fn(async () => {});
vi.mock("@/lib/submission-email", () => ({
  sendSubmissionEmails: (...args: unknown[]) => sendSubmissionEmails(...(args as [])),
}));
vi.mock("@/lib/team-notify-server", () => ({ sendTeamEmails: async () => ({ sent: 0 }) }));

// Run work scheduled after the response straight away.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => task(),
}));

const { POST } = await import("../route");

const savedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "pitch-1",
  status: "submitted",
  city_id: "madrid",
  created_by: "owner-1",
  team_id: "team-1",
  trip_name: "Real trip",
  address: "Calle Real 1",
  author_name: "Real Author",
  submitted_at: "2026-10-26T10:00:00.000Z",
  ...overrides,
});

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/db/pitches", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

const found = (status: string): DbResult => ({ data: { status }, error: null });
const notFound: DbResult = { data: null, error: null };

beforeEach(() => {
  state.authed = true;
  state.reads = [];
  state.insert = { data: [], error: null };
  state.update = { data: [], error: null };
  state.calls = [];
  state.inserted = [];
  state.updated = [];
  sendSubmissionEmails.mockClear();
});

describe("POST /api/db/pitches", () => {
  it("refuses without a login", async () => {
    state.authed = false;
    const res = await post({ id: "pitch-1" });
    expect(res.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("needs an id", async () => {
    const res = await post({ status: "draft" });
    expect(res.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("updates a pitch that already exists", async () => {
    state.reads = [found("draft")];
    state.update = { data: [savedRow({ status: "draft" })], error: null };
    const res = await post({ id: "pitch-1", status: "draft" });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual(["read", "update"]);
  });

  it("inserts a new pitch", async () => {
    state.reads = [notFound];
    state.insert = { data: [savedRow({ status: "draft" })], error: null };
    const res = await post({ id: "pitch-1", status: "draft" });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual(["read", "insert"]);
  });

  it("falls back to an update when the insert finds the id taken", async () => {
    state.reads = [notFound, found("draft")];
    state.insert = { data: null, error: { code: "23505", message: "duplicate key" } };
    state.update = { data: [savedRow({ status: "draft" })], error: null };
    const res = await post({ id: "pitch-1", status: "draft" });
    expect(res.status).toBe(200);
    expect(state.calls).toEqual(["read", "insert", "read", "update"]);
  });

  it("refuses when the taken id stays invisible", async () => {
    state.reads = [notFound, notFound];
    state.insert = { data: null, error: { code: "23505", message: "duplicate key" } };
    const res = await post({ id: "pitch-1" });
    expect(res.status).toBe(403);
    expect(state.calls).toEqual(["read", "insert", "read"]);
  });

  it("refuses when the update after a taken id matches nothing", async () => {
    state.reads = [notFound, found("submitted")];
    state.insert = { data: null, error: { code: "23505", message: "duplicate key" } };
    const res = await post({ id: "pitch-1" });
    expect(res.status).toBe(403);
  });

  it("answers a database refusal (42501) with 403", async () => {
    state.reads = [found("returned")];
    state.update = { data: null, error: { code: "42501", message: "needs contribute" } };
    const res = await post({ id: "pitch-1" });
    expect(res.status).toBe(403);
  });

  it("answers an update that matches no row with 403", async () => {
    state.reads = [found("approved")];
    const res = await post({ id: "pitch-1" });
    expect(res.status).toBe(403);
  });

  it("answers any other database error with 500", async () => {
    state.reads = [notFound];
    state.insert = { data: null, error: { code: "XX000", message: "boom" } };
    const res = await post({ id: "pitch-1" });
    expect(res.status).toBe(500);
  });

  describe("submission email", () => {
    it("is sent for a new pitch saved as submitted", async () => {
      state.reads = [notFound];
      state.insert = { data: [savedRow()], error: null };
      await post({ id: "pitch-1", status: "submitted" });
      expect(sendSubmissionEmails).toHaveBeenCalledTimes(1);
    });

    it.each(["draft", "returned"])("is sent when a %s pitch becomes submitted", async (from) => {
      state.reads = [found(from)];
      state.update = { data: [savedRow()], error: null };
      await post({ id: "pitch-1", status: "submitted" });
      expect(sendSubmissionEmails).toHaveBeenCalledTimes(1);
    });

    it("uses the old status read after a taken id", async () => {
      state.reads = [notFound, found("submitted")];
      state.insert = { data: null, error: { code: "23505", message: "duplicate key" } };
      state.update = { data: [savedRow()], error: null };
      await post({ id: "pitch-1", status: "submitted" });
      expect(sendSubmissionEmails).not.toHaveBeenCalled();
    });

    it("is not sent for a save that stays submitted", async () => {
      state.reads = [found("submitted")];
      state.update = { data: [savedRow()], error: null };
      await post({ id: "pitch-1", status: "submitted" });
      expect(sendSubmissionEmails).not.toHaveBeenCalled();
    });

    it("is not sent for a draft save", async () => {
      state.reads = [found("draft")];
      state.update = { data: [savedRow({ status: "draft" })], error: null };
      await post({ id: "pitch-1", status: "draft" });
      expect(sendSubmissionEmails).not.toHaveBeenCalled();
    });

    it("is not sent for a refused save", async () => {
      state.reads = [found("returned")];
      state.update = { data: null, error: { code: "42501", message: "needs contribute" } };
      await post({ id: "pitch-1", status: "submitted" });
      expect(sendSubmissionEmails).not.toHaveBeenCalled();
    });

    it("is built from the saved row, never the request body", async () => {
      state.reads = [found("draft")];
      state.update = { data: [savedRow()], error: null };
      await post({
        id: "pitch-1",
        status: "submitted",
        trip_name: "FAKE TITLE",
        address: "FAKE ADDRESS",
        author_name: "FAKE AUTHOR",
        team_id: "fake-team",
      });
      expect(sendSubmissionEmails).toHaveBeenCalledWith(
        fakeSupabase,
        expect.objectContaining({
          trip_name: "Real trip",
          address: "Calle Real 1",
          team_id: "team-1",
        }),
        "caller-1",
      );
    });
  });
});
