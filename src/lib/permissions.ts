/**
 * What a person is allowed to do, in one place.
 *
 * Four things define a person and nothing else:
 *
 *   isSuperAdmin  one on/off switch. Everything everywhere, plus users,
 *                 settings, scoring rules and cities.
 *   isActive      is the account switched on at all. Off means no access, no
 *                 matter what the grants say. A super admin is exempt, so that
 *                 an accidental switch-off cannot lock the founders out.
 *   canSeeFinancials  the money switch, one per person rather than per city.
 *   grants        a level per city, plus an alerts tick. No grant means no
 *                 access.
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
  /**
   * Is the account switched on? An account that is off keeps its cities and
   * its history, and can do nothing with them.
   *
   * Required, not optional, on purpose. If it were optional then every place
   * that forgot to set it would read as `undefined`, which is falsy, which
   * would lock a legitimate person out with no compiler complaint. A missing
   * field is a build error instead.
   */
  isActive: boolean;
  /**
   * The financials switch, which lives on the person rather than on any one
   * city. `grants[].canSeeFinancials` is the old home of the same idea and is
   * still read until the grant column is dropped.
   */
  canSeeFinancials: boolean;
  grants: CityGrant[];
}

export const NO_ACCESS: Access = {
  isSuperAdmin: false,
  isActive: false,
  canSeeFinancials: false,
  grants: [],
};

function grantFor(access: Access, cityId: string): CityGrant | undefined {
  return access.grants.find((g) => g.cityId === cityId);
}

/**
 * Does this person hold at least `level` in this city?
 *
 * The `isActive` test sits below the super admin switch, exactly as the SQL
 * does in 20260911000010. Gating the super admin branch too would let an
 * inactive super admin lock every super admin out with no way back.
 */
export function hasCityLevel(access: Access, cityId: string, level: CityLevel): boolean {
  if (access.isSuperAdmin) return true;
  if (!access.isActive) return false;
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
  if (access.isSuperAdmin) return true;
  if (!access.isActive) return false;
  return access.grants.some((g) => g.level === 'approve');
}

/**
 * Mirrors is_finance_plus(), which reads both homes of the flag: the one on
 * the person, and the old per-city ticks, until the grant column goes.
 */
export function canSeeRevenue(access: Access): boolean {
  if (access.isSuperAdmin) return true;
  if (!access.isActive) return false;
  return access.canSeeFinancials || access.grants.some((g) => g.canSeeFinancials);
}

/** Can they act in this city: submit a pitch, request a property, comment, draw. */
export function canContribute(access: Access, cityId: string): boolean {
  return hasCityLevel(access, cityId, 'contribute');
}

/** Can they decide in this city. */
export function canApprove(access: Access, cityId: string): boolean {
  return hasCityLevel(access, cityId, 'approve');
}

/**
 * "Madrid", "Madrid and Prague", "Madrid, Prague and Seville".
 * Written out rather than comma-joined so a two-city line does not read as a
 * truncated list.
 */
function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * What somebody can do, in one line: "Contribute in Madrid and Prague".
 *
 * Lives here rather than in the email that uses it because the user-change
 * alerts have to describe the same thing, and two places writing their own
 * version is how the app ended up with three disagreeing city lists.
 *
 * Takes a city-name lookup rather than importing one, so this module stays
 * free of every other import. Ids are used as-is for anything not in it.
 *
 * Takes only the two fields it reads, not a whole Access. The alert emails
 * describe access from a grants query that never looked at the profile, and
 * making them invent an `isActive` they do not know would be a lie in a type.
 */
export function accessSummary(
  { isSuperAdmin, grants }: Pick<Access, 'isSuperAdmin' | 'grants'>,
  cityNames: Record<string, string> = {},
): string {
  if (isSuperAdmin) return 'Super admin, every city';

  const level = strongestLevel(grants);
  if (!level) return 'No cities yet';

  const names = grants
    .map((g) => cityNames[g.cityId] ?? g.cityId)
    .sort();

  return `${LEVEL_LABELS[level]} in ${joinNames(names)}`;
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
