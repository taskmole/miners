import { describe, it, expect } from "vitest";
import {
  buildWeeklySummary,
  formatRangeLabel,
  dueSummaryFriday,
  type RawWeeklyRows,
} from "../weekly-summary-queries";
import { AUTO_REJECT_REASON } from "../property-requests";

/**
 * All against the counting, with made-up rows and no database.
 *
 * Every case here is a number that would be wrong in a way nobody could spot
 * by reading the email: a draft counted as a pitch, a gym counted as a
 * property, an auto-rejected rival counted as somebody saying no.
 */

const END = new Date("2026-09-11T12:00:00Z");
const START = new Date("2026-09-04T12:00:00Z");
const INSIDE = "2026-09-08T10:00:00Z";
const JUST_BEFORE = "2026-09-04T11:59:00Z";

function rows(partial: Partial<RawWeeklyRows> = {}): RawWeeklyRows {
  return {
    places: [],
    inboxReads: [],
    requests: [],
    pitches: [],
    activity: [],
    comments: [],
    lists: [],
    pendingRequests: [],
    profiles: [],
    grantUserIds: [],
    ...partial,
  };
}

const build = (partial: Partial<RawWeeklyRows> = {}) =>
  buildWeeklySummary(rows(partial), START, END, "https://example.com");

describe("what counts as pipeline", () => {
  it("does not count a draft as pitched", () => {
    const summary = build({
      pitches: [
        { city_id: "madrid", status: "draft", submitted_at: null, final_reviewed_at: null, created_by: "u1" },
        { city_id: "madrid", status: "approved", submitted_at: INSIDE, final_reviewed_at: null, created_by: "u1" },
      ],
    });
    expect(summary.cities[0].pitched).toBe(1);
  });

  it("does not count a cafe or a gym as a property added", () => {
    const summary = build({
      places: [
        { city_id: "prague", source: "sreality", created_at: INSIDE },
        { city_id: "prague", source: "cafe", created_at: INSIDE },
        { city_id: "prague", source: "gym", created_at: INSIDE },
        { city_id: "prague", source: "miners", created_at: INSIDE },
      ],
    });
    expect(summary.cities[0].propertiesAdded).toBe(1);
  });

  it("keeps an auto-rejected duplicate out of the rejection count", () => {
    const summary = build({
      requests: [
        {
          city_id: "prague", created_at: INSIDE, status: "rejected",
          decided_at: INSIDE, decision_reason: AUTO_REJECT_REASON, requested_by: "u1",
        },
        {
          city_id: "prague", created_at: INSIDE, status: "rejected",
          decided_at: INSIDE, decision_reason: "Bad corner", requested_by: "u2",
        },
      ],
    });
    expect(summary.cities[0].requestsRejected).toBe(1);
    expect(summary.cities[0].requestsClosedAsDuplicate).toBe(1);
  });

  it("excludes a decision made just before the window opens", () => {
    const summary = build({
      requests: [
        {
          city_id: "prague", created_at: JUST_BEFORE, status: "approved",
          decided_at: JUST_BEFORE, decision_reason: null, requested_by: "u1",
        },
        {
          city_id: "prague", created_at: INSIDE, status: "approved",
          decided_at: INSIDE, decision_reason: null, requested_by: "u1",
        },
      ],
    });
    expect(summary.cities[0].requestsApproved).toBe(1);
    expect(summary.cities[0].requested).toBe(1);
  });

  it("drops cities where nothing happened", () => {
    const summary = build({
      places: [{ city_id: "prague", source: "sreality", created_at: INSIDE }],
    });
    expect(summary.cities.map((c) => c.cityId)).toEqual(["prague"]);
  });

  it("still produces an email for a week with nothing in it", () => {
    const summary = build();
    expect(summary.cities).toEqual([]);
    expect(summary.headline.totalActions).toBe(0);
    expect(summary.rangeLabel).toBe("Sep 4 - 11");
  });
});

describe("the people", () => {
  it("counts somebody once however many kinds of thing they did", () => {
    const summary = build({
      activity: [{ user_id: "u1", action_type: "added_to_list", created_at: INSIDE }],
      inboxReads: [{ user_id: "u1", city_id: "prague", created_at: INSIDE }],
      requests: [
        { city_id: "prague", created_at: INSIDE, status: "pending", decided_at: null, decision_reason: null, requested_by: "u1" },
      ],
      pitches: [
        { city_id: "prague", status: "approved", submitted_at: INSIDE, final_reviewed_at: null, created_by: "u1" },
      ],
    });
    expect(summary.headline.activePeople).toBe(1);
  });

  it("groups an action with no matching profile as Unknown, and still adds up", () => {
    const summary = build({
      activity: [
        { user_id: "u1", action_type: "added_to_list", created_at: INSIDE },
        { user_id: "ghost", action_type: "added_to_list", created_at: INSIDE },
      ],
      profiles: [
        { id: "u1", display_name: "Ana", email: "ana@x.eu", created_at: JUST_BEFORE, is_active: true, is_super_admin: false },
      ],
    });
    const names = summary.people.all.map((p) => p.name);
    expect(names).toContain("Unknown");
    const total = summary.people.all.reduce((sum, p) => sum + p.actions, 0);
    expect(total).toBe(summary.headline.totalActions);
  });

  it("counts inbox triage as work, since it is never in the activity log", () => {
    const summary = build({
      inboxReads: [
        { user_id: "u1", city_id: "prague", created_at: INSIDE },
        { user_id: "u1", city_id: "prague", created_at: INSIDE },
      ],
    });
    expect(summary.headline.propertiesReviewed).toBe(2);
    expect(summary.people.all[0].actions).toBe(2);
  });

  it("counts only people who are switched on and have access", () => {
    const summary = build({
      profiles: [
        { id: "u1", display_name: "Ana", email: null, created_at: JUST_BEFORE, is_active: true, is_super_admin: false },
        { id: "u2", display_name: "Off", email: null, created_at: JUST_BEFORE, is_active: false, is_super_admin: false },
        { id: "u3", display_name: "Boss", email: null, created_at: JUST_BEFORE, is_active: true, is_super_admin: true },
        { id: "u4", display_name: "NoCities", email: null, created_at: JUST_BEFORE, is_active: true, is_super_admin: false },
      ],
      grantUserIds: ["u1"],
    });
    expect(summary.people.withAccessCount).toBe(2);
  });
});

describe("one tally per person", () => {
  const ana = { id: "u1", display_name: "Ana", email: null, created_at: JUST_BEFORE, is_active: true, is_super_admin: false };
  const bo = { id: "u2", display_name: "Bo", email: null, created_at: JUST_BEFORE, is_active: true, is_super_admin: false };

  it("counts a request once, even when it is also in the log", () => {
    const summary = build({
      activity: [{ user_id: "u1", action_type: "requested_property", created_at: INSIDE }],
      requests: [
        { city_id: "prague", created_at: INSIDE, status: "pending", decided_at: null, decision_reason: null, requested_by: "u1" },
      ],
      profiles: [ana],
    });
    expect(summary.people.all).toEqual([{ name: "Ana", actions: 1 }]);
    expect(summary.headline.requestsMade).toBe(1);
  });

  it("counts an inbox request that never reached the log", () => {
    const summary = build({
      requests: [
        { city_id: "prague", created_at: INSIDE, status: "pending", decided_at: null, decision_reason: null, requested_by: "u1" },
      ],
      profiles: [ana],
    });
    expect(summary.people.all).toEqual([{ name: "Ana", actions: 1 }]);
  });

  it("counts lists and comments as work", () => {
    const summary = build({
      lists: [{ created_at: INSIDE, created_by: "u1" }],
      comments: [{ created_at: INSIDE, created_by: "u1" }],
      profiles: [ana],
      grantUserIds: ["u1"],
    });
    expect(summary.people.all).toEqual([{ name: "Ana", actions: 2 }]);
    expect(summary.people.quiet).toEqual([]);
  });

  it("lists as quiet only people with access who did nothing", () => {
    const summary = build({
      inboxReads: [{ user_id: "u1", city_id: "prague", created_at: INSIDE }],
      profiles: [bo, ana],
      grantUserIds: ["u1", "u2"],
    });
    expect(summary.people.quiet).toEqual(["Bo"]);
    expect(summary.headline.activePeople).toBe(1);
  });
});

describe("waiting for an answer", () => {
  it("lists every pending request, oldest first, in whole days", () => {
    const summary = build({
      pendingRequests: [
        { city_id: "prague", property_name: "New", requested_by: "u1", created_at: "2026-09-11T08:00:00Z" },
        { city_id: "prague", property_name: "Old", requested_by: "u1", created_at: "2026-08-31T12:00:00Z" },
      ],
      profiles: [{ id: "u1", display_name: "Ana", email: null, created_at: JUST_BEFORE, is_active: true, is_super_admin: false }],
    });
    expect(summary.waiting).toEqual([
      { cityId: "prague", name: "Old", requestedBy: "Ana", days: 11 },
      { cityId: "prague", name: "New", requestedBy: "Ana", days: 0 },
    ]);
  });
});

describe("research and admin counts", () => {
  it("counts points and areas from the log, never from drawn_features", () => {
    const summary = build({
      activity: [
        { user_id: "u1", action_type: "created_point", created_at: INSIDE },
        { user_id: "u1", action_type: "created_point", created_at: INSIDE },
        { user_id: "u1", action_type: "created_area", created_at: INSIDE },
        { user_id: "u1", action_type: "assigned_property", created_at: INSIDE },
      ],
    });
    expect(summary.research.customPoints).toBe(2);
    expect(summary.research.areasDrawn).toBe(1);
    expect(summary.admin.assignmentsMade).toBe(1);
  });

  it("counts comments from the comments table, which the log never sees", () => {
    const summary = build({
      comments: [
        { created_at: INSIDE, created_by: "u1" },
        { created_at: JUST_BEFORE, created_by: "u1" },
      ],
      activity: [{ user_id: "u1", action_type: "commented_on_shape", created_at: INSIDE }],
    });
    expect(summary.research.comments).toBe(2);
  });
});

describe("the date range", () => {
  it("says the month once when both ends share it", () => {
    expect(formatRangeLabel(new Date("2026-09-05T00:00:00Z"), new Date("2026-09-12T00:00:00Z")))
      .toBe("Sep 5 - 12");
  });

  it("names both months across a month end", () => {
    expect(formatRangeLabel(new Date("2026-08-29T00:00:00Z"), new Date("2026-09-05T00:00:00Z")))
      .toBe("Aug 29 - Sep 5");
  });
});

describe("the send window", () => {
  // 2026-09-25 is a Friday. Prague is UTC+2 in September, UTC+1 in January.
  it("is due from 4pm Prague on Friday, summer and winter", () => {
    expect(dueSummaryFriday(new Date("2026-09-25T14:07:00Z"))).toBe("2026-09-25");
    expect(dueSummaryFriday(new Date("2026-01-09T15:07:00Z"))).toBe("2026-01-09");
  });

  it("is not due before 4pm Friday, or on a Thursday", () => {
    expect(dueSummaryFriday(new Date("2026-09-25T13:59:00Z"))).toBeNull();
    expect(dueSummaryFriday(new Date("2026-01-09T14:59:00Z"))).toBeNull();
    expect(dueSummaryFriday(new Date("2026-09-24T15:00:00Z"))).toBeNull();
  });

  it("still sends when the timer starts hours late", () => {
    expect(dueSummaryFriday(new Date("2026-09-25T19:30:00Z"))).toBe("2026-09-25");
  });

  it("counts Saturday morning as the Friday before, and stops at noon", () => {
    expect(dueSummaryFriday(new Date("2026-09-25T22:30:00Z"))).toBe("2026-09-25");
    expect(dueSummaryFriday(new Date("2026-09-26T09:00:00Z"))).toBe("2026-09-25");
    expect(dueSummaryFriday(new Date("2026-09-26T11:00:00Z"))).toBeNull();
  });

  it("gives the Friday across a month end", () => {
    expect(dueSummaryFriday(new Date("2026-10-31T08:00:00Z"))).toBe("2026-10-30");
  });
});
