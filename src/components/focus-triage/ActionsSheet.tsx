"use client";

import React, { useState } from "react";
import { Route, ListPlus, UserPlus, UserMinus, Ban, Hand, Check, Undo2 } from "lucide-react";
import type { PropertyActionState } from "@/lib/property-actions";

interface ActionsSheetProps {
  /**
   * Which entries to show. Built by evaluatePropertyActions so this sheet and
   * the map popup can never disagree about who is allowed to do what. This
   * sheet used to hardcode "Create trip" as always visible, which let a
   * franchisee start a trip on a property that was not theirs.
   */
  actions: PropertyActionState;
  /** True once this person has a request waiting on this property. */
  hasRequested: boolean;
  onAssign: () => void;
  onRequest: () => void;
  onCreateTrip: () => void;
  onAddToList: () => void;
  onPreReject: (reason: string) => void;
  onUndoPreReject: () => void;
  onRemoveAssignment: () => void;
  onClose: () => void;
}

export function ActionsSheet({
  actions,
  hasRequested,
  onAssign,
  onRequest,
  onCreateTrip,
  onAddToList,
  onPreReject,
  onUndoPreReject,
  onRemoveAssignment,
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

          {/* Hidden entries lose their explanation, so the caption carries it. */}
          {actions.caption && (
            <p className="text-xs text-zinc-500 mb-2">{actions.caption}</p>
          )}

          <div className="space-y-0.5">
            {actions.showAssign && (
              <button
                onClick={onAssign}
                className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <UserPlus className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-700">Assign to...</span>
              </button>
            )}

            {actions.showRequest && (
              hasRequested ? (
                <div className="w-full flex items-center gap-3 py-3">
                  <Check className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm text-zinc-400">Already requested</span>
                </div>
              ) : (
                <button
                  onClick={() => { onRequest(); onClose(); }}
                  className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <Hand className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm text-zinc-700">Request this property</span>
                </button>
              )
            )}

            {actions.showCreateTrip && (
              <button
                onClick={() => { onCreateTrip(); onClose(); }}
                className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                <Route className="w-4 h-4 text-zinc-400" />
                <span className="text-sm text-zinc-700">Create trip</span>
              </button>
            )}

            {/* Bookmarking is private and has no side effects, so it stays
                available in every state. See property-actions.ts. */}
            <button
              onClick={() => { onAddToList(); onClose(); }}
              className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <ListPlus className="w-4 h-4 text-zinc-400" />
              <span className="text-sm text-zinc-700">Add to list</span>
            </button>

            {actions.showRemoveAssignment && (
              <>
                <div className="border-t border-zinc-100 my-1" />
                <button
                  onClick={() => { onRemoveAssignment(); onClose(); }}
                  className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <UserMinus className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">Remove assignment</span>
                </button>
              </>
            )}

            {actions.showUndoPreReject && (
              <>
                <div className="border-t border-zinc-100 my-1" />
                <button
                  onClick={() => { onUndoPreReject(); onClose(); }}
                  className="w-full flex items-center gap-3 py-3 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <Undo2 className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm text-zinc-700">Undo pre-reject</span>
                </button>
              </>
            )}

            {actions.showPreReject && (
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
