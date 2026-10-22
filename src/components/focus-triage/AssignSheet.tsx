"use client";

import React from "react";
import { AssignList } from "@/components/AssignList";
import { DETAILS_SHEET } from "./layout";

interface AssignSheetProps {
  onAssign: (targetId: string, targetName: string, type: "team" | "user") => void;
  onClose: () => void;
}

export function AssignSheet({ onAssign, onClose }: AssignSheetProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Sheet. On wide screens it rises over the details column only. */}
      <div
        className={`absolute bottom-0 left-0 right-0 ${DETAILS_SHEET} max-h-full bg-white rounded-t-2xl z-50 flex flex-col`}
        style={{ animation: "triage-sheet-up 250ms ease-out" }}
      >
        {/* Pill handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-zinc-300" />
        </div>

        <h3 className="text-base font-semibold text-zinc-900 px-6 pt-2 pb-4 shrink-0">
          Assign to
        </h3>

        {/* Options scroll on their own so Cancel below always stays reachable,
            even with three teams and a long list of franchisees on a phone. */}
        <div className="px-6 flex-1 min-h-0 max-h-[60vh] overflow-y-auto">
          <AssignList onAssign={onAssign} />
        </div>

        {/* Cancel sits outside the scroll area, so backing out never means
            hunting for the dark margin that closes the whole modal. */}
        <div
          className="px-6 pt-3 shrink-0"
          style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-full bg-zinc-100 text-sm font-medium text-zinc-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
