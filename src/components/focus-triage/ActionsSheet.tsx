"use client";

import React, { useState } from "react";
import { Route, ListPlus, UserPlus, Ban } from "lucide-react";

interface ActionsSheetProps {
  showAssign: boolean;
  showPreReject: boolean;
  onAssign: () => void;
  onCreateTrip: () => void;
  onAddToList: () => void;
  onPreReject: (reason: string) => void;
  onClose: () => void;
}

export function ActionsSheet({
  showAssign,
  showPreReject,
  onAssign,
  onCreateTrip,
  onAddToList,
  onPreReject,
  onClose,
}: ActionsSheetProps) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

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
          <h3 className="text-base font-semibold text-zinc-900 mb-3">
            Actions
          </h3>

          <div className="space-y-0.5">
            {showAssign && (
              <button
                onClick={onAssign}
                className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <UserPlus className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-700">Assign to...</span>
              </button>
            )}

            <button
              onClick={() => { onCreateTrip(); onClose(); }}
              className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <Route className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-700">Create trip</span>
            </button>

            <button
              onClick={() => { onAddToList(); onClose(); }}
              className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <ListPlus className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-700">Add to list</span>
            </button>

            {showPreReject && (
              <>
                <div className="border-t border-zinc-100 my-1" />
                {!showRejectInput ? (
                  <button
                    onClick={() => setShowRejectInput(true)}
                    className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Ban className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-red-600">Pre-reject</span>
                  </button>
                ) : (
                  <div className="py-2">
                    <input
                      type="text"
                      placeholder="Reason for rejection"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && rejectReason.trim()) {
                          onPreReject(rejectReason.trim());
                        }
                      }}
                      className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2.5 bg-transparent mb-2"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (rejectReason.trim()) onPreReject(rejectReason.trim());
                      }}
                      disabled={!rejectReason.trim()}
                      className="w-full py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
