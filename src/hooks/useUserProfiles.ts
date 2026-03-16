"use client";

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { Database } from '@/lib/supabase';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type UserRole = 'super_admin' | 'head_office_exec' | 'finance_reviewer' | 'area_coordinator' | 'franchisee';

const ADMIN_ROLES: UserRole[] = ['super_admin'];

export function useUserProfiles() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all users
  const fetchUsers = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setUsers(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch current user's role
  const fetchCurrentUserRole = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('Error fetching current user role:', fetchError);
        return;
      }

      setCurrentUserRole(data?.role as UserRole || 'franchisee');
    } catch (err) {
      console.error('Error fetching current user role:', err);
    }
  }, []);

  // Update user role
  const updateRole = useCallback(async (userId: string, newRole: UserRole): Promise<boolean> => {
    if (!isSupabaseConfigured() || !supabase) return false;

    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ));
      return true;
    } catch (err) {
      console.error('Error updating role:', err);
      return false;
    }
  }, []);

  // Toggle user active status
  const toggleActive = useCallback(async (userId: string, isActive: boolean): Promise<boolean> => {
    if (!isSupabaseConfigured() || !supabase) return false;

    try {
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_active: isActive } : u
      ));
      return true;
    } catch (err) {
      console.error('Error toggling active status:', err);
      return false;
    }
  }, []);

  // Check if current user is admin
  const isAdmin = currentUserRole ? ADMIN_ROLES.includes(currentUserRole) : false;

  // Initial fetch
  useEffect(() => {
    fetchCurrentUserRole();
    fetchUsers();
  }, [fetchCurrentUserRole, fetchUsers]);

  return {
    users,
    currentUserRole,
    isAdmin,
    loading,
    error,
    updateRole,
    toggleActive,
    refetch: fetchUsers,
  };
}

export type { UserProfile, UserRole };
export { ADMIN_ROLES };
