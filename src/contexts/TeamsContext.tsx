"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTeams, type Team, type TeamMember } from "@/hooks/useTeams";

interface TeamsContextValue {
  teams: Team[];
  isLoaded: boolean;
  userTeamIds: string[];
  getTeam: (teamId: string) => Team | null;
  isInTeam: (teamId: string) => boolean;
  createTeam: (name: string, memberIds?: string[]) => Promise<Team | null>;
  updateTeam: (id: string, updates: { name?: string; is_active?: boolean }) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
  fetchMembers: (teamId: string) => Promise<TeamMember[]>;
  addMember: (teamId: string, memberId: string, role?: "owner" | "member") => Promise<void>;
  removeMember: (teamId: string, memberId: string) => Promise<void>;
  changeMemberRole: (teamId: string, memberId: string, role: "owner" | "member") => Promise<void>;
  refreshTeams: () => Promise<void>;
}

const TeamsContext = createContext<TeamsContextValue | null>(null);

export function TeamsProvider({ children }: { children: ReactNode }) {
  const hook = useTeams();

  return (
    <TeamsContext.Provider value={hook}>
      {children}
    </TeamsContext.Provider>
  );
}

export function useTeamsContext(): TeamsContextValue {
  const context = useContext(TeamsContext);
  if (!context) {
    throw new Error("useTeamsContext must be used within a TeamsProvider");
  }
  return context;
}
