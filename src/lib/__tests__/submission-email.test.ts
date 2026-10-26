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

const { sendSubmissionEmails, SUBMISSION_REVIEWERS } = await import("../submission-email");

// The caller's database: only the people directory is read.
const supabase = (directory: unknown, error: unknown = null) =>
  ({ rpc: async () => ({ data: directory, error }) }) as never;

const pitch = {
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
});

describe("sendSubmissionEmails", () => {
  it("names the owner from their profile, never the saved author text", async () => {
    const row = { ...pitch, author_name: "Somebody Else" };
    await sendSubmissionEmails(supabase([{ id: "owner-1", display_name: "Real Owner" }]), row, "caller-1");
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

  it("falls back to Scout when the directory cannot answer", async () => {
    await sendSubmissionEmails(supabase(null, { message: "nope" }), pitch, "caller-1");
    expect(sent[0].html).toContain("Scout");
  });

  it("cuts a very long place name", async () => {
    await sendSubmissionEmails(supabase([]), { ...pitch, address: "x".repeat(5000) }, "caller-1");
    expect(sent[0].html).not.toContain("x".repeat(121));
  });

  it("skips the team email for a pitch without a team", async () => {
    await sendSubmissionEmails(supabase([]), { ...pitch, team_id: null }, "caller-1");
    expect(sent).toHaveLength(1);
    expect(teamCalls).toHaveLength(0);
  });
});
