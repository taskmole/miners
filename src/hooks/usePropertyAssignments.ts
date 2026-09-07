"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

export interface PropertyAssignment {
  id: string;
  property_place_id: string;
  assigned_to: string | null;
  assigned_to_team: string | null;
  assigned_by: string;
  status: "assigned" | "pre_rejected";
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignableUser {
  id: string;
  display_name: string | null;
  email: string | null;
  role: string;
}

async function fetchAssignments(): Promise<PropertyAssignment[]> {
  try {
    const data = await apiFetch<PropertyAssignment[]>('/api/db/property-assignments');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchUsers(): Promise<AssignableUser[]> {
  try {
    const data = await apiFetch<AssignableUser[]>('/api/db/user-profiles?mode=all');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function usePropertyAssignments(userTeamIds: string[] = []) {
  const { userId } = useAuth();
  const [assignments, setAssignments] = useState<PropertyAssignment[]>([]);
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    async function load() {
      const [assignmentData, userData] = await Promise.all([
        fetchAssignments(),
        fetchUsers(),
      ]);
      setAssignments(assignmentData);
      setUsers(userData);
      setIsLoaded(true);
    }

    load();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const interval = setInterval(async () => {
      const data = await fetchAssignments();
      setAssignments(data);
    }, 60_000);
    return () => clearInterval(interval);
  }, [isLoaded]);

  // Also refresh whenever the tab regains focus. A franchisee whose request
  // has just been approved switches back to this tab and expects to be able to
  // scout the property; waiting up to a minute for the poll reads as the
  // approval not having worked.
  useEffect(() => {
    if (!isLoaded) return;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      setAssignments(await fetchAssignments());
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isLoaded]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, PropertyAssignment>();
    for (const a of assignments) {
      map.set(a.property_place_id, a);
    }
    return map;
  }, [assignments]);

  const getAssignment = useCallback((placeId: string): PropertyAssignment | null => {
    return assignmentMap.get(placeId) ?? null;
  }, [assignmentMap]);

  const isAssignedToMe = useCallback((placeId: string): boolean => {
    if (!userId) return false;
    const a = assignmentMap.get(placeId);
    if (!a || a.status !== "assigned") return false;
    if (a.assigned_to === userId) return true;
    if (a.assigned_to_team && userTeamIds.includes(a.assigned_to_team)) return true;
    return false;
  }, [assignmentMap, userId, userTeamIds]);

  const canPitch = useCallback((placeId: string): { allowed: boolean; reason: string | null } => {
    const a = assignmentMap.get(placeId);
    if (!a) return { allowed: true, reason: null };
    if (a.status === "pre_rejected") {
      return { allowed: false, reason: a.rejection_reason || "Pre-rejected" };
    }
    // Check team assignment
    if (a.assigned_to_team) {
      if (userTeamIds.includes(a.assigned_to_team)) {
        return { allowed: true, reason: null };
      }
      return { allowed: false, reason: "Assigned to a team" };
    }
    if (a.assigned_to && a.assigned_to !== userId) {
      const assignee = users.find(u => u.id === a.assigned_to);
      const name = assignee?.display_name || assignee?.email || "someone else";
      return { allowed: false, reason: `Assigned to ${name}` };
    }
    return { allowed: true, reason: null };
  }, [assignmentMap, userId, users, userTeamIds]);

  const assignProperty = useCallback(async (
    placeId: string,
    assignedTo: string | null,
    options?: { teamId?: string; notes?: string }
  ) => {
    const result = await apiFetch<PropertyAssignment>('/api/db/property-assignments', {
      method: 'POST',
      body: JSON.stringify({
        property_place_id: placeId,
        assigned_to: options?.teamId ? null : assignedTo,
        assigned_to_team: options?.teamId ?? null,
        status: 'assigned',
        notes: options?.notes ?? null,
      }),
    });
    setAssignments(prev => {
      const filtered = prev.filter(a => a.property_place_id !== placeId);
      return [result, ...filtered];
    });
    return result;
  }, []);

  const preRejectProperty = useCallback(async (
    placeId: string,
    reason: string,
    notes?: string
  ) => {
    const result = await apiFetch<PropertyAssignment>('/api/db/property-assignments', {
      method: 'POST',
      body: JSON.stringify({
        property_place_id: placeId,
        status: 'pre_rejected',
        rejection_reason: reason,
        notes: notes ?? null,
      }),
    });
    setAssignments(prev => {
      const filtered = prev.filter(a => a.property_place_id !== placeId);
      return [result, ...filtered];
    });
    return result;
  }, []);

  const removeAssignment = useCallback(async (placeId: string) => {
    await apiFetch('/api/db/property-assignments?property_place_id=' + encodeURIComponent(placeId), {
      method: 'DELETE',
    });
    setAssignments(prev => prev.filter(a => a.property_place_id !== placeId));
  }, []);

  const refreshAssignments = useCallback(async () => {
    const data = await fetchAssignments();
    setAssignments(data);
  }, []);

  return {
    isLoaded,
    assignments,
    users,
    getAssignment,
    isAssignedToMe,
    canPitch,
    assignProperty,
    preRejectProperty,
    removeAssignment,
    refreshAssignments,
  };
}
