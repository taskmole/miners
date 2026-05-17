"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

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
  const { token, userId } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const headers = useMemo(() => {
    if (!token) return null;
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, [token]);

  const fetchTeams = useCallback(async () => {
    if (!headers) return;

    try {
      const res = await fetch("/api/db/teams", { headers });
      if (!res.ok) return;
      const data = await res.json();
      setTeams(data);
    } catch (err) {
      console.error("[useTeams] fetch error:", err);
    } finally {
      setIsLoaded(true);
    }
  }, [headers]);

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
      if (!headers) return null;

      try {
        const res = await fetch("/api/db/teams", {
          method: "POST",
          headers,
          body: JSON.stringify({ name, memberIds }),
        });

        if (!res.ok) return null;
        const team = await res.json();
        await fetchTeams();
        return team;
      } catch (err) {
        console.error("[useTeams] create error:", err);
        return null;
      }
    },
    [headers, fetchTeams]
  );

  const updateTeam = useCallback(
    async (id: string, updates: { name?: string; is_active?: boolean }) => {
      if (!headers) return;

      try {
        await fetch("/api/db/teams", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ id, ...updates }),
        });
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] update error:", err);
      }
    },
    [headers, fetchTeams]
  );

  const deleteTeam = useCallback(
    async (id: string) => {
      if (!headers) return;

      try {
        await fetch(`/api/db/teams?id=${id}`, {
          method: "DELETE",
          headers,
        });
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] delete error:", err);
      }
    },
    [headers, fetchTeams]
  );

  const fetchMembers = useCallback(
    async (teamId: string): Promise<TeamMember[]> => {
      if (!headers) return [];

      try {
        const res = await fetch(`/api/db/team-members?team_id=${teamId}`, { headers });
        if (!res.ok) return [];
        return await res.json();
      } catch (err) {
        console.error("[useTeams] fetchMembers error:", err);
        return [];
      }
    },
    [headers]
  );

  const addMember = useCallback(
    async (teamId: string, memberId: string, role?: "owner" | "member") => {
      if (!headers) return;

      try {
        const res = await fetch("/api/db/team-members", {
          method: "POST",
          headers,
          body: JSON.stringify({ team_id: teamId, user_id: memberId, role }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] addMember error:", err);
        throw err;
      }
    },
    [headers, fetchTeams]
  );

  const removeMember = useCallback(
    async (teamId: string, memberId: string) => {
      if (!headers) return;

      try {
        const res = await fetch(
          `/api/db/team-members?team_id=${teamId}&user_id=${memberId}`,
          { method: "DELETE", headers }
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error);
        }
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] removeMember error:", err);
        throw err;
      }
    },
    [headers, fetchTeams]
  );

  const changeMemberRole = useCallback(
    async (teamId: string, memberId: string, role: "owner" | "member") => {
      if (!headers) return;

      try {
        await fetch("/api/db/team-members", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ team_id: teamId, user_id: memberId, role }),
        });
        await fetchTeams();
      } catch (err) {
        console.error("[useTeams] changeMemberRole error:", err);
      }
    },
    [headers, fetchTeams]
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
