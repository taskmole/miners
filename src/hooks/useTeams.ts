"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api-client";
import { logActivity } from "@/lib/supabaseHelpers";

export interface Team {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  team_members: TeamMemberSummary[];
}

export interface TeamMemberSummary {
  id: string;
  user_id: string;
  role: "owner" | "member";
  added_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: "owner" | "member";
  added_by: string;
  added_at: string;
}

export function useTeams() {
  const { isReady } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchTeams = useCallback(async () => {
    if (!isReady) return;

    try {
      const data = await apiFetch<Team[]>("/api/db/teams");
      setTeams(data);
    } catch (err) {
      console.error("[useTeams] fetch error:", err);
    } finally {
      setIsLoaded(true);
    }
  }, [isReady]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const userTeamIds = useMemo(
    () => teams.map((t) => t.id),
    [teams]
  );

  const getTeam = useCallback(
    (teamId: string) => teams.find((t) => t.id === teamId) || null,
    [teams]
  );

  const isInTeam = useCallback(
    (teamId: string) => userTeamIds.includes(teamId),
    [userTeamIds]
  );

  const createTeam = useCallback(
    async (name: string, memberIds?: string[]): Promise<Team | null> => {
      if (!isReady) return null;

      try {
        const team = await apiFetch<Team>("/api/db/teams", {
          method: "POST",
          body: JSON.stringify({ name, memberIds }),
        });
        await fetchTeams();
        return team;
      } catch (err) {
        console.error("[useTeams] create error:", err);
        return null;
      }
    },
    [isReady, fetchTeams]
  );

  const updateTeam = useCallback(
    async (id: string, updates: { name?: string; is_active?: boolean }) => {
      if (!isReady) return;

      try {
        await apiFetch("/api/db/teams", {
          method: "PATCH",
          body: JSON.stringify({ id, ...updates }),
        });
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] update error:", err);
      }
    },
    [isReady, fetchTeams]
  );

  const deleteTeam = useCallback(
    async (id: string) => {
      if (!isReady) return;

      try {
        await apiFetch(`/api/db/teams?id=${id}`, { method: "DELETE" });
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] delete error:", err);
      }
    },
    [isReady, fetchTeams]
  );

  const fetchMembers = useCallback(
    async (teamId: string): Promise<TeamMember[]> => {
      if (!isReady) return [];

      try {
        return await apiFetch<TeamMember[]>(`/api/db/team-members?team_id=${teamId}`);
      } catch (err) {
        console.error("[useTeams] fetchMembers error:", err);
        return [];
      }
    },
    [isReady]
  );

  const addMember = useCallback(
    async (teamId: string, memberId: string, role?: "owner" | "member") => {
      if (!isReady) return;

      try {
        await apiFetch("/api/db/team-members", {
          method: "POST",
          body: JSON.stringify({ team_id: teamId, user_id: memberId, role }),
        });
        await fetchTeams();
        // In-app notice for the added member (they match on target_user_id).
        logActivity("added_to_team", {
          teamName: getTeam(teamId)?.name ?? null,
          target_user_id: memberId,
        });
      } catch (err) {
        console.error("[useTeams] addMember error:", err);
        throw err;
      }
    },
    [isReady, fetchTeams, getTeam]
  );

  const removeMember = useCallback(
    async (teamId: string, memberId: string) => {
      if (!isReady) return;

      try {
        await apiFetch(
          `/api/db/team-members?team_id=${teamId}&user_id=${memberId}`,
          { method: "DELETE" }
        );
        await fetchTeams();
        // In-app notice for the removed member (they match on target_user_id).
        logActivity("removed_from_team", {
          teamName: getTeam(teamId)?.name ?? null,
          target_user_id: memberId,
        });
      } catch (err) {
        console.error("[useTeams] removeMember error:", err);
        throw err;
      }
    },
    [isReady, fetchTeams, getTeam]
  );

  const changeMemberRole = useCallback(
    async (teamId: string, memberId: string, role: "owner" | "member") => {
      if (!isReady) return;

      try {
        await apiFetch("/api/db/team-members", {
          method: "PATCH",
          body: JSON.stringify({ team_id: teamId, user_id: memberId, role }),
        });
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] changeMemberRole error:", err);
      }
    },
    [isReady, fetchTeams]
  );

  return {
    teams,
    isLoaded,
    userTeamIds,
    getTeam,
    isInTeam,
    createTeam,
    updateTeam,
    deleteTeam,
    fetchMembers,
    addMember,
    removeMember,
    changeMemberRole,
    refreshTeams: fetchTeams,
  };
}
