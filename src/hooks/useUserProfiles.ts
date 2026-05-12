"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { Database } from '@/lib/supabase';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type UserRole = 'super_admin' | 'head_office_exec' | 'finance_reviewer' | 'area_coordinator' | 'franchisee';

const ADMIN_ROLES: UserRole[] = ['super_admin'];
const DASHBOARD_ROLES: UserRole[] = ['super_admin', 'head_office_exec', 'finance_reviewer', 'area_coordinator'];
const REVIEW_ROLES: UserRole[] = ['super_admin', 'head_office_exec'];

export function useUserProfiles() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
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

  const fetchCurrentUserRole = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('mls-user-role');
      if (cached) setCurrentUserRole(cached as UserRole);
    }
    try {
      const data = await apiFetch<{ role: string }>('/api/db/user-profiles?mode=current');
      const role = (data?.role as UserRole) || 'franchisee';
      setCurrentUserRole(role);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('mls-user-role', role);
      }
    } catch (err) {
      console.error('Error fetching current user role:', err);
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

  const isAdmin = currentUserRole ? ADMIN_ROLES.includes(currentUserRole) : false;
  const canAccessDashboard = currentUserRole ? DASHBOARD_ROLES.includes(currentUserRole) : false;
  const canReviewSubmissions = currentUserRole ? REVIEW_ROLES.includes(currentUserRole) : false;

  useEffect(() => {
    Promise.all([fetchCurrentUserRole(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchCurrentUserRole, fetchUsers]);

  return {
    users,
    currentUserRole,
    isAdmin,
    canAccessDashboard,
    canReviewSubmissions,
    loading,
    error,
    updateRole,
    toggleActive,
    refetch: fetchUsers,
  };
}

export type { UserProfile, UserRole };
export { ADMIN_ROLES };
