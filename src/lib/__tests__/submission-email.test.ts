// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: Array<{ to: string[]; html: string }> = [];
const teamCalls: unknown[] = [];

vi.mock("@/lib/email", () => ({
  sendAppEmails: async (to: string[], message: { html: string }) => {
    sent.push({ to, html: message.html });
    return to.map(() => ({}));
  },
}));
vi.mock("@/lib/team-notify-server", () => ({
  sendTeamEmails: async (_supabase: unknown, opts: unknown) => {
    teamCalls.push(opts);
    return { sent: 1 };
  },
}));

// Profiles the service role can read, by id.
const profiles = { byId: {} as Record<string, string>, error: null as unknown };
// The service-role log behind the hourly limit.
const log = { count: 0, countError: null as unknown, inserted: [] as unknown[], disabled: false };
vi.mock("@/lib/supabase-server", () => ({
  createServiceSupabase: () =>
    log.disabled
      ? null
      : {
          from: (table: string) => {
            if (table === "user_profiles") {
              return {
                select: () => ({
                  eq: (_col: string, id: string) => ({
                    maybeSingle: async () =>
                      profiles.error
                        ? { data: null, error: profiles.error }
                        : { data: profiles.byId[id] ? { display_name: profiles.byId[id] } : null, error: null },
                  }),
                }),
              };
            }
            expect(table).toBe("submission_email_log");
            return {
              select: () => ({
                eq: () => ({ gte: async () => ({ count: log.count, error: log.countError }) }),
              }),
              insert: async (row: unknown) => {
                log.inserted.push(row);
                return { error: null };
              },
            };
          },
        },
}));

const { sendSubmissionEmails, SUBMISSION_REVIEWERS } = await import("../submission-email");

// The caller's session. Only the team email uses it, and that is mocked.
const supabase = {} as never;

const pitch = {
  id: "pitch-1",
  city_id: "madrid",
  created_by: "owner-1",
  team_id: "team-1",
  trip_name: "Trip",
  address: "Calle Real 1",
};

beforeEach(() => {
  sent.length = 0;
  teamCalls.length = 0;
  process.env.RESEND_API_KEY = "test";
  log.count = 0;
  log.countError = null;
  log.inserted.length = 0;
  log.disabled = false;
  profiles.byId = {};
  profiles.error = null;
});

describe("sendSubmissionEmails", () => {
  it("names the owner from their profile, never the saved author text", async () => {
    const row = { ...pitch, author_name: "Somebody Else" };
    profiles.byId = { "owner-1": "Real Owner" };
    await sendSubmissionEmails(supabase, row, "caller-1");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(SUBMISSION_REVIEWERS);
    expect(sent[0].html).toContain("Real Owner");
    expect(sent[0].html).not.toContain("Somebody Else");
    expect(teamCalls[0]).toMatchObject({
      teamId: "team-1",
      kind: "submitted",
      actorName: "Real Owner",
      excludeUserId: "caller-1",
      excludeUserIds: ["owner-1"],
    });
  });

  it("falls back to Scout when the profile cannot be read", async () => {
    profiles.error = { message: "nope" };
    await sendSubmissionEmails(supabase, pitch, "caller-1");
    expect(sent[0].html).toContain("Scout");
  });

  it("cuts a very long place name", async () => {
    await sendSubmissionEmails(supabase, { ...pitch, address: "x".repeat(5000) }, "caller-1");
    expect(sent[0].html).not.toContain("x".repeat(121));
  });

  it("skips the team email for a pitch without a team", async () => {
    await sendSubmissionEmails(supabase, { ...pitch, team_id: null }, "caller-1");
    expect(sent).toHaveLength(1);
    expect(teamCalls).toHaveLength(0);
  });

  describe("hourly limit", () => {
    it("logs each send against the caller", async () => {
      log.count = 9;
      await sendSubmissionEmails(supabase, pitch, "caller-1");
      expect(sent).toHaveLength(1);
      expect(log.inserted).toEqual([{ user_id: "caller-1", pitch_id: "pitch-1" }]);
    });

    it("skips every email once the caller has used the hour's sends", async () => {
      log.count = 10;
      await sendSubmissionEmails(supabase, pitch, "caller-1");
      expect(sent).toHaveLength(0);
      expect(teamCalls).toHaveLength(0);
      expect(log.inserted).toHaveLength(0);
    });

    it("still sends when the limit cannot be checked", async () => {
      log.countError = { message: "down" };
      await sendSubmissionEmails(supabase, pitch, "caller-1");
      expect(sent).toHaveLength(1);
    });

    it("still sends without a service role (local dev)", async () => {
      log.disabled = true;
      await sendSubmissionEmails(supabase, pitch, "caller-1");
      expect(sent).toHaveLength(1);
    });
  });
});
