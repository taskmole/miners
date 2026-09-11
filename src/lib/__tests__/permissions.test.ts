import { describe, it, expect } from "vitest";
import {
  canAccessDashboard,
  canApprove,
  canContribute,
  canReadHistoryOf,
  canSeeRevenue,
  hasCityLevel,
  historyCityScope,
  strongestLevel,
  toGrants,
  visibleCityIds,
  approvesIn,
  type Access,
  type CityGrant,
} from "../permissions";

const ALL = ["madrid", "barcelona", "prague", "seville"];

const grant = (
  cityId: string,
  level: CityGrant["level"],
  extras: Partial<CityGrant> = {},
): CityGrant => ({
  cityId,
  level,
  receivesAlerts: false,
  ...extras,
});

const person = (
  grants: CityGrant[],
  isSuperAdmin = false,
  extras: Partial<Access> = {},
): Access => ({
  isSuperAdmin,
  isActive: true,
  canSeeFinancials: false,
  grants,
  ...extras,
});

// The five people the migration actually has to get right.
const superAdmin = person([], true);
const kirill = person([grant("madrid", "approve"), grant("prague", "view")]);
const franchisee = person([grant("prague", "contribute")]);
const viewer = person([grant("madrid", "view")]);
const nobody = person([]);

describe("the ladder", () => {
  it("is cumulative within a city", () => {
    expect(hasCityLevel(kirill, "madrid", "view")).toBe(true);
    expect(hasCityLevel(kirill, "madrid", "contribute")).toBe(true);
    expect(hasCityLevel(kirill, "madrid", "approve")).toBe(true);
  });

  it("stops at the level granted", () => {
    expect(hasCityLevel(kirill, "prague", "view")).toBe(true);
    expect(hasCityLevel(kirill, "prague", "contribute")).toBe(false);
    expect(hasCityLevel(kirill, "prague", "approve")).toBe(false);
  });

  it("says no for a city with no grant at all", () => {
    expect(hasCityLevel(kirill, "barcelona", "view")).toBe(false);
    expect(hasCityLevel(nobody, "madrid", "view")).toBe(false);
  });

  it("gives a super admin everything, everywhere, with no grants at all", () => {
    expect(hasCityLevel(superAdmin, "seville", "approve")).toBe(true);
    expect(visibleCityIds(superAdmin, ALL)).toEqual(ALL);
    expect(approvesIn(superAdmin, ALL)).toEqual(ALL);
  });
});

describe("the dashboard door", () => {
  // The failure mode worth a test of its own: defining dashboard access as
  // "View or above" hands it to all nine franchisees, who sit at Contribute.
  it("never opens for a contributor, however many cities they have", () => {
    const busy = person([
      grant("madrid", "contribute"),
      grant("prague", "contribute"),
      grant("barcelona", "contribute"),
    ]);
    expect(canAccessDashboard(busy)).toBe(false);
  });

  it("opens on a single approve grant", () => {
    expect(canAccessDashboard(kirill)).toBe(true);
  });

  it("opens for a super admin holding no grants", () => {
    expect(canAccessDashboard(superAdmin)).toBe(true);
  });

  it("stays shut for a viewer and for someone with nothing", () => {
    expect(canAccessDashboard(viewer)).toBe(false);
    expect(canAccessDashboard(nobody)).toBe(false);
  });
});

describe("financials", () => {
  it("are independent of the level", () => {
    const richViewer = person([grant("madrid", "view")], false, { canSeeFinancials: true });
    const poorApprover = person([grant("madrid", "approve")]);
    expect(canSeeRevenue(richViewer)).toBe(true);
    expect(canSeeRevenue(poorApprover)).toBe(false);
  });

  it("come free with the super admin switch", () => {
    expect(canSeeRevenue(superAdmin)).toBe(true);
  });
});

describe("Kirill, the person this whole migration is for", () => {
  it("approves in Madrid and only looks at Prague", () => {
    expect(canApprove(kirill, "madrid")).toBe(true);
    expect(canApprove(kirill, "prague")).toBe(false);
    expect(canContribute(kirill, "prague")).toBe(false);
    expect(visibleCityIds(kirill, ALL)).toEqual(["madrid", "prague"]);
    expect(approvesIn(kirill, ALL)).toEqual(["madrid"]);
  });
});

describe("who may read whose history", () => {
  it("lets a super admin read everyone", () => {
    expect(canReadHistoryOf(superAdmin, kirill)).toBe(true);
    expect(canReadHistoryOf(superAdmin, superAdmin)).toBe(true);
    expect(canReadHistoryOf(superAdmin, franchisee)).toBe(true);
  });

  it("lets an approver read contributors and viewers", () => {
    expect(canReadHistoryOf(kirill, franchisee)).toBe(true);
    expect(canReadHistoryOf(kirill, viewer)).toBe(true);
  });

  it("refuses an approver a peer reviewer or a super admin", () => {
    const peer = person([grant("barcelona", "approve")]);
    expect(canReadHistoryOf(kirill, peer)).toBe(false);
    expect(canReadHistoryOf(kirill, superAdmin)).toBe(false);
  });

  it("refuses everyone without a dashboard", () => {
    expect(canReadHistoryOf(franchisee, viewer)).toBe(false);
    expect(canReadHistoryOf(nobody, viewer)).toBe(false);
  });

  it("narrows an approver to the cities they approve in, and nobody else", () => {
    expect(historyCityScope(kirill, ALL)).toEqual(["madrid"]);
    expect(historyCityScope(superAdmin, ALL)).toBeNull();
  });
});

describe("summaries and parsing", () => {
  it("reports the strongest level held anywhere", () => {
    expect(strongestLevel(kirill.grants)).toBe("approve");
    expect(strongestLevel(franchisee.grants)).toBe("contribute");
    expect(strongestLevel([])).toBeNull();
  });

  it("reads database rows into the shape the screens use", () => {
    expect(
      toGrants([
        { city_id: "madrid", level: "approve", receives_alerts: false },
      ]),
    ).toEqual([
      { cityId: "madrid", level: "approve", receivesAlerts: false },
    ]);
    expect(toGrants(null)).toEqual([]);
  });
});

/**
 * The switch that was enforced nowhere.
 *
 * Until 20260911000010, is_active hid the app in the browser and locked
 * nothing: a switched-off account with its grants intact read every place,
 * the Madrid CSV and the revenue figure straight from PostgREST. These tests
 * pin the TypeScript half to the same shape as the SQL, including the one
 * exemption that keeps it safe.
 */
describe("an account that is switched off", () => {
  const inactiveApprover = person([grant("madrid", "approve")], false, { isActive: false });
  const inactiveSuperAdmin = person([], true, { isActive: false });

  it("holds no level in any city", () => {
    expect(hasCityLevel(inactiveApprover, "madrid", "view")).toBe(false);
    expect(canContribute(inactiveApprover, "madrid")).toBe(false);
    expect(canApprove(inactiveApprover, "madrid")).toBe(false);
  });

  it("cannot open the dashboard, however strong the grant", () => {
    expect(canAccessDashboard(inactiveApprover)).toBe(false);
  });

  it("cannot see revenue, from either home of the flag", () => {
    expect(
      canSeeRevenue(person([grant("madrid", "approve")], false, { isActive: false, canSeeFinancials: true })),
    ).toBe(false);
    expect(
      canSeeRevenue(person([], false, { isActive: false, canSeeFinancials: true })),
    ).toBe(false);
  });

  /**
   * The exemption, and why it is not an oversight. is_admin() guards the
   * user_profiles UPDATE policy and the field-lock trigger stops a non-admin
   * changing is_active even on their own row. Gating the super admin branch
   * would mean an inactive super admin could never switch themselves or each
   * other back on, and the only way out would be the Supabase dashboard.
   */
  it("still lets a super admin through, so nobody can be locked out for good", () => {
    expect(canAccessDashboard(inactiveSuperAdmin)).toBe(true);
    expect(hasCityLevel(inactiveSuperAdmin, "madrid", "approve")).toBe(true);
    expect(canSeeRevenue(inactiveSuperAdmin)).toBe(true);
  });
});

/**
 * Financials is one switch per person. It was a tick per city until the six
 * finance tables turned out to have no city column to filter on, which made
 * the per-city reading a fiction. Off for everybody today; the user screen
 * shows it as coming soon.
 */
describe("the financials switch", () => {
  it("is true from the person's own flag, whatever their level", () => {
    expect(canSeeRevenue(person([grant("madrid", "view")], false, { canSeeFinancials: true }))).toBe(true);
  });

  it("is true with the flag on and no cities at all, which is a real state", () => {
    expect(canSeeRevenue(person([], false, { canSeeFinancials: true }))).toBe(true);
  });

  it("is false from neither", () => {
    expect(canSeeRevenue(person([grant("madrid", "approve")]))).toBe(false);
    expect(canSeeRevenue(nobody)).toBe(false);
  });
});
