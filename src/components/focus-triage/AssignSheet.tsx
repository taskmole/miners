"use client";

import React from "react";
import { Users, UserPlus } from "lucide-react";
import { useTeamsContext } from "@/contexts/TeamsContext";
import { usePropertyAssignmentContext } from "@/contexts/PropertyAssignmentContext";

interface AssignSheetProps {
  onAssign: (targetId: string, targetName: string, type: "team" | "user") => void;
  onClose: () => void;
}

export function AssignSheet({ onAssign, onClose }: AssignSheetProps) {
  const { teams } = useTeamsContext();
  const { users: assignableUsers } = usePropertyAssignmentContext();
  const franchisees = assignableUsers.filter((u) => u.role === "franchisee");

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50"
        style={{ animation: "triage-sheet-up 250ms ease-out" }}
      >
        {/* Pill handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-zinc-300" />
        </div>

        <div className="px-6 pt-2 pb-6">
          <h3 className="text-base font-semibold text-zinc-900 mb-4">
            Assign to
          </h3>

          {/* Teams */}
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
                    className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
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

          {/* People */}
          {franchisees.length > 0 && (
            <>
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
                People
              </p>
              <div className="space-y-0.5">
                {franchisees.map((person) => (
                  <button
                    key={person.id}
                    onClick={() =>
                      onAssign(
                        person.id,
                        person.display_name || person.email || person.id.slice(0, 8),
                        "user",
                      )
                    }
                    className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                      <UserPlus className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-sm text-zinc-700 flex-1 text-left">
                      {person.display_name || person.email || person.id.slice(0, 8)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {teams.length === 0 && franchisees.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-4">
              No teams or franchisees found
            </p>
          )}
        </div>
      </div>
    </>
  );
}
