"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/lib/supabase';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type UserRole = 'super_admin' | 'head_office_exec' | 'finance_reviewer' | 'area_coordinator' | 'franchisee';

interface AddUserData {
  display_name?: string;
  email: string;
  role?: string;
  city_ids?: string[];
  team_id?: string | null;
  receives_scraper_emails?: boolean;
}

interface UpdateUserData {
  display_name?: string | null;
  city_ids?: string[] | null;
  team_id?: string | null;
  receives_scraper_emails?: boolean;
}

const ADMIN_ROLES: UserRole[] = ['super_admin'];
const DASHBOARD_ROLES: UserRole[] = ['super_admin', 'head_office_exec', 'finance_reviewer', 'area_coordinator'];
const REVIEW_ROLES: UserRole[] = ['super_admin', 'head_office_exec'];
const FINANCE_ROLES: UserRole[] = ['super_admin', 'head_office_exec', 'finance_reviewer'];

export function useUserProfiles() {
  const { userId, isReady } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  // False until the server has told us this session's role. Permission gates
  // must treat "unknown" as "no", not as "franchisee".
  const [roleResolved, setRoleResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch<UserProfile[]>('/api/db/user-profiles?mode=all');
      setUsers(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    }
  }, []);

  /**
   * Resolve this session's role from the server, every time.
   *
   * This used to prime state from a sessionStorage entry keyed 'mls-user-role'
   * with no user id in it, and nothing ever cleared it - not signOut(), not an
   * account switch. Signing in as a franchisee in a tab that had held an admin
   * session restored 'super_admin' before the fetch resolved, so the franchisee
   * got the admin action set (Assign, Pre-reject, Create trip on a property
   * that was never theirs). A role is a permission, not a preference, so it is
   * not worth caching to save one request.
   *
   * On failure the role is cleared rather than left alone. The old catch only
   * logged, so a 401 during a token refresh left the previous role in place.
   */
  const fetchCurrentUserRole = useCallback(async () => {
    try {
      const data = await apiFetch<{ role: string }>('/api/db/user-profiles?mode=current');
      setCurrentUserRole((data?.role as UserRole) || 'franchisee');
    } catch (err) {
      console.error('Error fetching current user role:', err);
      setCurrentUserRole(null);
    } finally {
      setRoleResolved(true);
    }
  }, []);

  const updateRole = useCallback(async (userId: string, newRole: UserRole): Promise<boolean> => {
    try {
      await apiFetch('/api/db/user-profiles', {
        method: 'PATCH',
        body: JSON.stringify({ id: userId, role: newRole }),
      });
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ));
      return true;
    } catch (err) {
      console.error('Error updating role:', err);
      return false;
    }
  }, []);

  const toggleActive = useCallback(async (userId: string, isActive: boolean): Promise<boolean> => {
    try {
      await apiFetch('/api/db/user-profiles', {
        method: 'PATCH',
        body: JSON.stringify({ id: userId, is_active: isActive }),
      });
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_active: isActive } : u
      ));
      return true;
    } catch (err) {
      console.error('Error toggling active status:', err);
      return false;
    }
  }, []);

  const addUser = useCallback(async (data: AddUserData): Promise<UserProfile | null> => {
    try {
      const result = await apiFetch<UserProfile>('/api/db/user-profiles', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (result) {
        setUsers(prev => [result, ...prev]);
      }
      return result;
    } catch (err) {
      console.error('Error adding user:', err);
      throw err;
    }
  }, []);

  const updateUser = useCallback(async (userId: string, data: UpdateUserData): Promise<boolean> => {
    try {
      const result = await apiFetch<UserProfile>('/api/db/user-profiles', {
        method: 'PATCH',
        body: JSON.stringify({ id: userId, ...data }),
      });
      if (result) {
        setUsers(prev => prev.map(u => u.id === userId ? result : u));
      }
      return true;
    } catch (err) {
      console.error('Error updating user:', err);
      return false;
    }
  }, []);

  const isAdmin = currentUserRole ? ADMIN_ROLES.includes(currentUserRole) : false;
  const canAccessDashboard = currentUserRole ? DASHBOARD_ROLES.includes(currentUserRole) : false;
  const canReviewSubmissions = currentUserRole ? REVIEW_ROLES.includes(currentUserRole) : false;
  const canSeeRevenue = currentUserRole ? FINANCE_ROLES.includes(currentUserRole) : false;

  // Keyed on userId so switching accounts in the same tab re-resolves instead
  // of carrying the previous user's role in React state.
  useEffect(() => {
    if (!isReady) return;

    setCurrentUserRole(null);
    setRoleResolved(false);
    // The users list carries every profile's email and role, so it must not
    // survive a sign-out or account switch any more than the role does.
    setUsers([]);

    if (!userId) {
      setRoleResolved(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([fetchCurrentUserRole(), fetchUsers()]).finally(() => setLoading(false));
  }, [userId, isReady, fetchCurrentUserRole, fetchUsers]);

  return {
    users,
    currentUserRole,
    roleResolved,
    isAdmin,
    canAccessDashboard,
    canReviewSubmissions,
    canSeeRevenue,
    loading,
    error,
    updateRole,
    toggleActive,
    addUser,
    updateUser,
    refetch: fetchUsers,
  };
}

export type { UserProfile, UserRole };
export { ADMIN_ROLES, FINANCE_ROLES };
