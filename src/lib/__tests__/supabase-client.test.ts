import { describe, it, expect, vi } from "vitest";

const createClient = vi.fn(() => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
await import("../supabase");

describe("browser Supabase client", () => {
  // Without it the cross-tab auth lock waits for ever, and one stuck tab
  // leaves every other tab blank. See the comment in supabase.ts.
  it("caps the auth lock wait at 5 seconds", () => {
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient.mock.calls[0]).toMatchObject([
      "https://example.supabase.co",
      "anon",
      { auth: { lockAcquireTimeout: 5000 } },
    ]);
  });
});
