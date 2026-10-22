import { describe, it, expect } from "vitest";
import {
  evaluatePropertyActions,
  pendingPropertyActions,
  type PropertyActionInput,
} from "@/lib/property-actions";

const base: PropertyActionInput = {
  isAdmin: false,
  isPreRejected: false,
  rejectionReason: null,
  hasAssignment: false,
  isAssignedToMe: false,
  assigneeLabel: null,
  pitchStatus: null,
  hasPendingRequest: false,
  wasRejectedForMe: false,
};

const run = (over: Partial<PropertyActionInput>) => evaluatePropertyActions({ ...base, ...over });

describe("evaluatePropertyActions", () => {
  it("shows nothing while the role is unknown", () => {
    const r = pendingPropertyActions();
    expect(r.stage).toBe("loading");
    expect(r.showRequest || r.showAssign || r.showCreateTrip).toBe(false);
  });

  it("pre-reject beats a pitch and an assignment", () => {
    const r = run({ isAdmin: true, isPreRejected: true, rejectionReason: "too small", hasAssignment: true, pitchStatus: "approved" });
    expect(r.stage).toBe("preRejected");
    expect(r.showUndoPreReject).toBe(true);
    expect(r.caption).toBe("Pre-rejected: too small");
  });

  it("only admins can undo a pre-reject", () => {
    expect(run({ isPreRejected: true }).showUndoPreReject).toBe(false);
  });

  it("a pitch beats an assignment and blocks new trips", () => {
    const r = run({ isAdmin: true, hasAssignment: true, isAssignedToMe: true, pitchStatus: "submitted" });
    expect(r.stage).toBe("pitch");
    expect(r.showCreateTrip).toBe(false);
    expect(r.showRemoveAssignment).toBe(true);
    expect(r.showPreReject).toBe(false);
  });

  it("admins may pre-reject only once the pitch was rejected", () => {
    expect(run({ isAdmin: true, pitchStatus: "rejected" }).showPreReject).toBe(true);
  });

  it("the assignee can plan a trip, admins can remove", () => {
    const mine = run({ hasAssignment: true, isAssignedToMe: true });
    expect(mine.stage).toBe("assigned");
    expect(mine.showCreateTrip).toBe(true);
    expect(mine.showRemoveAssignment).toBe(false);

    const admin = run({ isAdmin: true, hasAssignment: true, assigneeLabel: "Ana" });
    expect(admin.showCreateTrip).toBe(false);
    expect(admin.showRemoveAssignment).toBe(true);
    expect(admin.caption).toBe("Assigned to Ana");
  });

  it("free for an admin: trip, assign, pre-reject", () => {
    const r = run({ isAdmin: true });
    expect(r.stage).toBe("free");
    expect(r.showCreateTrip && r.showAssign && r.showPreReject).toBe(true);
    expect(r.showRequest).toBe(false);
  });

  it("free for a franchisee: request, then requested, or declined", () => {
    expect(run({}).stage).toBe("free");
    expect(run({}).showRequest).toBe(true);

    const pending = run({ hasPendingRequest: true });
    expect(pending.stage).toBe("requested");
    expect(pending.showRequest).toBe(true);

    const declined = run({ wasRejectedForMe: true });
    expect(declined.stage).toBe("declined");
    expect(declined.showRequest).toBe(false);
  });
});
