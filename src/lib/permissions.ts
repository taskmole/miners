/**
 * What a person is allowed to do, in one place.
 *
 * Two things define a person and nothing else:
 *
 *   isSuperAdmin  one on/off switch. Everything everywhere, plus users,
 *                 settings, scoring rules and cities.
 *   grants        a level per city, plus an independent "can see financials"
 *                 tick and an alerts tick. No grant means no access.
 *
 * The rule, in one sentence: being in a team means you share and edit
 * together; seeing everything in a city is what Approve means; seeing
 * everything everywhere is what Super Admin means.
 *
 * These functions mirror the database helpers exactly. The database is the
 * truth - every one of these rules is also enforced by RLS - and this module
 * exists so the screens can grey out a button instead of letting somebody
 * press it and collect a 403. If the two ever disagree, the database wins and
 * this file is the bug.
 */

/** What a person may do in one city. Ordered weakest to strongest. */
export type CityLevel = 'view' | 'contribute' | 'approve';

/** One city's access for one person. Absent from the array means no access. */
export interface CityGrant {
  cityId: string;
  level: CityLevel;
  canSeeFinancials: boolean;
  /** Property alert emails, chosen per city rather than once globally. */
  receivesAlerts: boolean;
}

/**
 * The ladder, and the one thing about it that is easy to get wrong.
 *
 * The ranks describe map access only: Approve can do everything Contribute
 * can. They do NOT mean Contribute is a weaker Approve. The admin dashboard
 * is an Approve-only door, so it is tested with `approvesIn`, never with a
 * rank comparison. Defining dashboard access as "View or above" would hand it
 * to all nine franchisees, who sit at Contribute.
 */
export const LEVEL_RANK: Record<CityLevel, number> = {
  view: 0,
  contribute: 1,
  approve: 2,
};

export const LEVEL_LABELS: Record<CityLevel, string> = {
  view: 'View',
  contribute: 'Contribute',
  approve: 'Approve',
};

/** The shape the screens work with, assembled once per session. */
export interface Access {
  isSuperAdmin: boolean;
  grants: CityGrant[];
}

export const NO_ACCESS: Access = { isSuperAdmin: false, grants: [] };

function grantFor(access: Access, cityId: string): CityGrant | undefined {
  return access.grants.find((g) => g.cityId === cityId);
}

/** Does this person hold at least `level` in this city? */
export function hasCityLevel(access: Access, cityId: string, level: CityLevel): boolean {
  if (access.isSuperAdmin) return true;
  const grant = grantFor(access, cityId);
  return !!grant && LEVEL_RANK[grant.level] >= LEVEL_RANK[level];
}

/** Every city this person can open at all. */
export function visibleCityIds(access: Access, allCityIds: string[]): string[] {
  if (access.isSuperAdmin) return allCityIds;
  return access.grants.map((g) => g.cityId).filter((id) => allCityIds.includes(id));
}

/** Every city this person approves in. The dashboard's real scope. */
export function approvesIn(access: Access, allCityIds: string[]): string[] {
  if (access.isSuperAdmin) return allCityIds;
  return access.grants.filter((g) => g.level === 'approve').map((g) => g.cityId);
}

/** Mirrors is_admin() and is_dashboard_role(), which are now the same thing. */
export function canAccessDashboard(access: Access): boolean {
  return access.isSuperAdmin || access.grants.some((g) => g.level === 'approve');
}

/** Mirrors is_finance_plus(). */
export function canSeeRevenue(access: Access): boolean {
  return access.isSuperAdmin || access.grants.some((g) => g.canSeeFinancials);
}

/** Can they act in this city: submit a pitch, request a property, comment, draw. */
export function canContribute(access: Access, cityId: string): boolean {
  return hasCityLevel(access, cityId, 'contribute');
}

/** Can they decide in this city. */
export function canApprove(access: Access, cityId: string): boolean {
  return hasCityLevel(access, cityId, 'approve');
}

/** The strongest level anyone holds anywhere. Null when they hold nothing. */
export function strongestLevel(grants: CityGrant[]): CityLevel | null {
  if (grants.length === 0) return null;
  return grants.reduce<CityLevel>(
    (best, g) => (LEVEL_RANK[g.level] > LEVEL_RANK[best] ? g.level : best),
    'view',
  );
}

/**
 * Who may read whose history.
 *
 *   Super Admin  everyone
 *   Approver     only people whose highest level is Contribute or View, and
 *                only entries in cities the Approver approves in
 *   anyone else  nobody, they have no dashboard
 *
 * So an Approver can review a franchisee's track record and cannot read a peer
 * reviewer's or a Super Admin's. When they are not allowed to look they get a
 * locked panel saying so, never an empty list: "nothing happened" and "you may
 * not see this" must not look the same.
 */
export function canReadHistoryOf(viewer: Access, subject: Access): boolean {
  if (viewer.isSuperAdmin) return true;
  if (!canAccessDashboard(viewer)) return false;
  if (subject.isSuperAdmin) return false;
  return !subject.grants.some((g) => g.level === 'approve');
}

/**
 * Which cities of a person's history an Approver may read. Super Admins get
 * everything; an Approver is narrowed to where they approve, and the screen
 * says so out loud so a short list is never mistaken for a quiet colleague.
 */
export function historyCityScope(viewer: Access, allCityIds: string[]): string[] | null {
  if (viewer.isSuperAdmin) return null; // null means "no narrowing"
  return approvesIn(viewer, allCityIds);
}

/**
 * Rows straight from the database, in the shape the screens want.
 * Kept here rather than in each caller so one spelling of the column names
 * exists.
 */
export interface CityGrantRow {
  city_id: string;
  level: CityLevel;
  can_see_financials: boolean;
  receives_alerts: boolean;
}

export function toGrants(rows: CityGrantRow[] | null | undefined): CityGrant[] {
  return (rows ?? []).map((r) => ({
    cityId: r.city_id,
    level: r.level,
    canSeeFinancials: r.can_see_financials,
    receivesAlerts: r.receives_alerts,
  }));
}
