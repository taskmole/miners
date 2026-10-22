"use client";

import React from "react";
import { Users, UserPlus } from "lucide-react";
import { useTeamsContext } from "@/contexts/TeamsContext";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";

interface AssignListProps {
  onAssign: (targetId: string, targetName: string, type: "team" | "user") => void;
  /** Blocks taps while an assignment is already being saved. */
  disabled?: boolean;
}

/**
 * Who a property can be assigned to: teams first, then franchisees.
 * Shared by the New listings triage sheet and the map card's Assign step,
 * so both offer the same people in the same order.
 */
const ROW = "w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50";

export function AssignList({ onAssign, disabled }: AssignListProps) {
  const { teams } = useTeamsContext();
  const { users: assignableUsers } = usePropertyAssignmentContext();
  const franchisees = assignableUsers.filter((u) => u.role === "franchisee");

  return (
    <>
      {teams.length > 0 && (
        <>
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
            Teams
          </p>
          <div className="space-y-0.5 mb-4">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => onAssign(team.id, team.name, "team")}
                disabled={disabled}
                className={ROW}
              >
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="w-3 h-3 text-blue-600" />
                </div>
                <span className="text-sm text-zinc-700 flex-1 text-left">
                  {team.name}
                </span>
                <span className="text-xs text-zinc-400">
                  {team.team_members.length} members
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {franchisees.length > 0 && (
        <>
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
            People
          </p>
          <div className="space-y-0.5">
            {franchisees.map((person) => {
              const name = person.display_name || person.email || person.id.slice(0, 8);
              return (
                <button key={person.id} onClick={() => onAssign(person.id, name, "user")} disabled={disabled} className={ROW}>
                  <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                    <UserPlus className="w-3 h-3 text-emerald-600" />
                  </div>
                  <span className="text-sm text-zinc-700 flex-1 text-left">{name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {teams.length === 0 && franchisees.length === 0 && (
        <p className="text-sm text-zinc-400 text-center py-4">
          No teams or franchisees found
        </p>
      )}
    </>
  );
}
