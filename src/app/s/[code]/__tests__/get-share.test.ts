// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// What each lookup answers, in order; the last answer repeats.
let answers: { data: unknown; error: unknown }[] = [];
let lookups = 0;

vi.mock("@/lib/supabase-server", () => ({
  createServiceSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => answers[Math.min(lookups++, answers.length - 1)],
        }),
      }),
    }),
  }),
}));

const { getShare } = await import("../get-share");

const ROW = { place_id: "gym-40.4-3.7-abc", place_type: "gym", title: "Gym", address: null, photo_url: null };

describe("getShare", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lookups = 0;
  });
  afterEach(() => vi.useRealTimers());

  it("waits for a link that is still being saved", async () => {
    answers = [{ data: null, error: null }, { data: null, error: null }, { data: ROW, error: null }];
    const share = getShare("Abc123XYZ9");
    await vi.runAllTimersAsync();
    expect(await share).toMatchObject({ placeId: ROW.place_id, title: "Gym" });
    expect(lookups).toBe(3);
  });

  it("gives up on a code that never appears after about 6 seconds", async () => {
    answers = [{ data: null, error: null }];
    const share = getShare("Zzz123XYZ9");
    await vi.advanceTimersByTimeAsync(5999);
    expect(lookups).toBe(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(await share).toBeNull();
    expect(lookups).toBe(6);
  });

  it("does not wait on a database error or a malformed code", async () => {
    answers = [{ data: null, error: { message: "boom" } }];
    expect(await getShare("Err123XYZ9")).toBeNull();
    expect(await getShare("short")).toBeNull();
    expect(lookups).toBe(1);
  });
});
