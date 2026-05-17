"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import type { Database } from '@/lib/supabase';

export type Team = Database['public']['Tables']['teams']['Row'];

export function useTeams(autoFetch = true) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Team[]>('/api/db/teams');
      setTeams(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching teams:', err);
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, []);

  const createTeam = useCallback(async (name: string): Promise<Team | null> => {
    try {
      const data = await apiFetch<Team>('/api/db/teams', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (data) {
        setTeams(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      return data;
    } catch (err) {
      console.error('Error creating team:', err);
      throw err;
    }
  }, []);

  const renameTeam = useCallback(async (id: string, name: string): Promise<boolean> => {
    try {
      const data = await apiFetch<Team>('/api/db/teams', {
        method: 'PATCH',
        body: JSON.stringify({ id, name }),
      });
      if (data) {
        setTeams(prev => prev.map(t => t.id === id ? data : t).sort((a, b) => a.name.localeCompare(b.name)));
      }
      return true;
    } catch (err) {
      console.error('Error renaming team:', err);
      return false;
    }
  }, []);

  const deleteTeam = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/db/teams?id=${id}`, { method: 'DELETE' });
      setTeams(prev => prev.filter(t => t.id !== id));
      return true;
    } catch (err) {
      console.error('Error deleting team:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    if (autoFetch) fetchTeams();
  }, [autoFetch, fetchTeams]);

  return {
    teams,
    loading,
    error,
    refetch: fetchTeams,
    createTeam,
    renameTeam,
    deleteTeam,
  };
}
