"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/lib/supabase';
import { cities } from '@/lib/cities';
import {
  canAccessDashboard as computeDashboard,
  canSeeRevenue as computeRevenue,
  canApprove,
  canContribute,
  approvesIn,
  visibleCityIds,
  toGrants,
  NO_ACCESS,
  type Access,
  type CityGrant,
  type CityGrantRow,
  type CityLevel,
} from '@/lib/permissions';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

/**
 * Legacy role names. Still present on the row because the column survives
 * until step 7 of the permissions migration, where it is dropped. Nothing in
 * the app should branch on it any more: what a person may do is decided by
 * the Super Admin switch and their per-city grants.
 */
type UserRole = 'super_admin' | 'head_office_exec' | 'finance_reviewer' | 'area_coordinator' | 'franchisee';

interface AddUserData {
  display_name?: string;
  email: string;
  city_id?: string;
  is_active?: boolean;
  team_id?: string | null;
}

/** The two extra fields POST adds to say what the invite email did. */
interface InviteOutcome {
  invite_sent?: boolean;
  invite_redirected?: boolean;
}

/**
 * What the Add User form gets back: the new person, plus whether they were
 * actually emailed. The form says different things for sent, redirected to
 * the test inbox, and failed.
 */
interface AddUserResult {
  profile: UserProfile;
  inviteSent: boolean;
  inviteRedirected: boolean;
}

interface UpdateUserData {
  display_name?: string | null;
  team_id?: string | null;
  is_active?: boolean;
}

/** One person's grants as the server sends them, with the owner attached. */
type GrantRowWithUser = CityGrantRow & { user_id: string };

const ALL_CITY_IDS = cities.map((c) => c.id);

export function useUserProfiles() {
  const { userId, isReady } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);

  /**
   * What this session is allowed to do. The whole permission surface of the
   * app is derived from this one object.
   */
  const [access, setAccess] = useState<Access>(NO_ACCESS);

  /**
   * False until the server has told us this session's access. Permission
   * gates must treat "unknown" as "no", not as "franchisee" and not as
   * "everything".
   */
  const [accessResolved, setAccessResolved] = useState(false);

  /** Every user's grants, keyed by user id, for the user list. */
  const [grantsByUser, setGrantsByUser] = useState<Record<string, CityGrant[]>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const [profiles, grantRows] = await Promise.all([
        apiFetch<UserProfile[]>('/api/db/user-profiles?mode=all'),
        apiFetch<GrantRowWithUser[]>('/api/db/user-grants?mode=all'),
      ]);

      setUsers(profiles || []);

      const byUser: Record<string, CityGrant[]> = {};
      for (const row of grantRows || []) {
        (byUser[row.user_id] ??= []).push(...toGrants([row]));
      }
      setGrantsByUser(byUser);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    }
  }, []);

  /**
   * Resolve this session's access from the server, every time.
   *
   * This used to prime state from a sessionStorage entry keyed 'mls-user-role'
   * with no user id in it, and nothing ever cleared it - not signOut(), not an
   * account switch. Signing in as a franchisee in a tab that had held an admin
   * session restored 'super_admin' before the fetch resolved, so the franchisee
   * got the admin action set (Assign, Pre-reject, Create trip on a property
   * that was never theirs). Access is a permission, not a preference, so it is
   * not worth caching to save one request.
   *
   * On failure access is cleared rather than left alone. The old catch only
   * logged, so a 401 during a token refresh left the previous role in place.
   */
  const fetchAccess = useCallback(async () => {
    try {
      const data = await apiFetch<{
        isSuperAdmin: boolean;
        grants: CityGrantRow[];
      }>('/api/db/user-grants?mode=current');

      setAccess({
        isSuperAdmin: data?.isSuperAdmin === true,
        grants: toGrants(data?.grants),
      });
    } catch (err) {
      console.error('Error fetching access:', err);
      setAccess(NO_ACCESS);
    } finally {
      setAccessResolved(true);
    }
  }, []);

  /** Replace one person's city grants wholesale. Super admins only. */
  const updateGrants = useCallback(
    async (targetUserId: string, grants: CityGrant[]): Promise<boolean> => {
      try {
        const saved = await apiFetch<GrantRowWithUser[]>('/api/db/user-grants', {
          method: 'PUT',
          body: JSON.stringify({
            user_id: targetUserId,
            grants: grants.map((g) => ({
              city_id: g.cityId,
              level: g.level,
              can_see_financials: g.canSeeFinancials,
              receives_alerts: g.receivesAlerts,
            })),
          }),
        });
        setGrantsByUser((prev) => ({ ...prev, [targetUserId]: toGrants(saved) }));
        // Editing your own access changes what this session may do, so re-read
        // it rather than waiting for a reload to notice.
        if (targetUserId === userId) await fetchAccess();
        return true;
      } catch (err) {
        console.error('Error updating grants:', err);
        return false;
      }
    },
    [userId, fetchAccess],
  );

  /** Turn the Super Admin switch on or off. Super admins only. */
  const setSuperAdmin = useCallback(
    async (targetUserId: string, isSuperAdmin: boolean): Promise<boolean> => {
      try {
        await apiFetch('/api/db/user-profiles', {
          method: 'PATCH',
          body: JSON.stringify({ id: targetUserId, is_super_admin: isSuperAdmin }),
        });
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, is_super_admin: isSuperAdmin } : u)),
        );
        if (targetUserId === userId) await fetchAccess();
        return true;
      } catch (err) {
        console.error('Error updating super admin flag:', err);
        return false;
      }
    },
    [userId, fetchAccess],
  );

  const toggleActive = useCallback(async (targetUserId: string, isActive: boolean): Promise<boolean> => {
    try {
      await apiFetch('/api/db/user-profiles', {
        method: 'PATCH',
        body: JSON.stringify({ id: targetUserId, is_active: isActive }),
      });
      setUsers(prev => prev.map(u =>
        u.id === targetUserId ? { ...u, is_active: isActive } : u
      ));
      return true;
    } catch (err) {
      console.error('Error toggling active status:', err);
      return false;
    }
  }, []);

  /**
   * Invite somebody. A super admin creates them with no cities and inactive;
   * an Approver must name one of their own cities and the person is created at
   * Contribute and active. The server decides which of those applies, and
   * refuses anything else.
   */
  const addUser = useCallback(async (data: AddUserData): Promise<AddUserResult | null> => {
    try {
      const result = await apiFetch<UserProfile & InviteOutcome>('/api/db/user-profiles', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result) {
        // The two invite fields describe what the send did, not who the
        // person is, so they are stripped before the row joins the list.
        const { invite_sent, invite_redirected, ...profile } = result;
        setUsers(prev => [profile as UserProfile, ...prev]);
        return { profile: profile as UserProfile, inviteSent: invite_sent === true, inviteRedirected: invite_redirected === true };
      }
      return null;
    } catch (err) {
      console.error('Error adding user:', err);
      throw err;
    }
  }, []);

  const updateUser = useCallback(async (targetUserId: string, data: UpdateUserData): Promise<boolean> => {
    try {
      const result = await apiFetch<UserProfile>('/api/db/user-profiles', {
        method: 'PATCH',
        body: JSON.stringify({ id: targetUserId, ...data }),
      });
      if (result) {
        setUsers(prev => prev.map(u => u.id === targetUserId ? result : u));
      }
      return true;
    } catch (err) {
      console.error('Error updating user:', err);
      return false;
    }
  }, []);

  // ---------------------------------------------------------------------
  // The gates. Each one mirrors a database function of the same meaning, so
  // that a greyed-out button and a 403 always agree about why.
  // ---------------------------------------------------------------------

  /** The Super Admin switch. Mirrors is_super_admin(). */
  const isSuperAdmin = access.isSuperAdmin;

  /** Approve somewhere, or the switch. Mirrors is_admin() and is_dashboard_role(). */
  const canAccessDashboard = useMemo(() => computeDashboard(access), [access]);

  /**
   * Deciding on submissions is the same door as the dashboard now: Approve is
   * what opens both. It used to be a narrower list of roles than the dashboard
   * because finance_reviewer and area_coordinator could see the dashboard
   * without deciding anything, and neither role has an active holder.
   */
  const canReviewSubmissions = canAccessDashboard;

  /** Mirrors is_finance_plus(). */
  const canSeeRevenue = useMemo(() => computeRevenue(access), [access]);

  /** Every city this session can open at all. */
  const visibleCities = useMemo(() => visibleCityIds(access, ALL_CITY_IDS), [access]);

  /** Every city this session approves in. The dashboard's real scope. */
  const approverCities = useMemo(() => approvesIn(access, ALL_CITY_IDS), [access]);

  const canApproveIn = useCallback((cityId: string) => canApprove(access, cityId), [access]);
  const canContributeIn = useCallback((cityId: string) => canContribute(access, cityId), [access]);

  /** One person's grants from the list, for the access pill. */
  const grantsFor = useCallback(
    (targetUserId: string): CityGrant[] => grantsByUser[targetUserId] ?? [],
    [grantsByUser],
  );

  // Keyed on userId so switching accounts in the same tab re-resolves instead
  // of carrying the previous user's access in React state.
  useEffect(() => {
    if (!isReady) return;

    setAccess(NO_ACCESS);
    setAccessResolved(false);
    // The users list carries every profile's email, so it must not survive a
    // sign-out or account switch any more than the access does.
    setUsers([]);
    setGrantsByUser({});

    if (!userId) {
      setAccessResolved(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchAccess(), fetchUsers()]).finally(() => setLoading(false));
  }, [userId, isReady, fetchAccess, fetchUsers]);

  return {
    users,
    access,
    accessResolved,
    isSuperAdmin,
    canAccessDashboard,
    canReviewSubmissions,
    canSeeRevenue,
    visibleCities,
    approverCities,
    canApproveIn,
    canContributeIn,
    grantsFor,
    grantsByUser,
    loading,
    error,
    updateGrants,
    setSuperAdmin,
    toggleActive,
    addUser,
    updateUser,
    refetch: fetchUsers,
  };
}

export type { UserProfile, UserRole, CityGrant, CityLevel, Access, AddUserResult };
