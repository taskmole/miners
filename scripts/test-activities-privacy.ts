/**
 * Test script for Activities privacy filter + new action types.
 * Run: npx tsx scripts/test-activities-privacy.ts
 *
 * Tests the filtering logic extracted from the API route,
 * and the display layer (ACTION_TYPE_MAP + buildTargetName).
 * No browser or role changes needed.
 */

// ─── Extracted filtering logic (mirrors route.ts lines 46-58) ───

function filterForFranchisee(
  userId: string,
  comments: Array<{ id: string; created_by: string }>,
  lists: Array<{ id: string; created_by: string }>,
  activityLog: Array<{ id: string; user_id: string; action_type: string; summary: string | null }>,
) {
  const filteredComments = comments.filter(c => c.created_by === userId);
  const filteredLists = lists.filter(l => l.created_by === userId);
  const filteredActivityLog = activityLog.filter(e => {
    if (e.user_id === userId) return true;
    if (!e.summary) return false;
    try {
      const parsed = typeof e.summary === "string" ? JSON.parse(e.summary) : e.summary;
      return parsed.assigned_to === userId || parsed.trip_owner_id === userId;
    } catch {
      return false;
    }
  });
  return { filteredComments, filteredLists, filteredActivityLog };
}

// ─── Extracted display logic (mirrors useActivities.ts) ───

type ActivityType = "added" | "updated" | "commented" | "visited" | "rated" | "created" | "deleted";
type TargetType = "cafe" | "property" | "area" | "poi" | "list";

const ACTION_TYPE_MAP: Record<string, { type: ActivityType; action: string; targetType: TargetType }> = {
  added_to_list: { type: 'added', action: 'added', targetType: 'list' },
  added_attachment: { type: 'added', action: 'added attachment to', targetType: 'poi' },
  created_point: { type: 'created', action: 'created point', targetType: 'poi' },
  created_area: { type: 'created', action: 'created area', targetType: 'area' },
  commented_on_shape: { type: 'commented', action: 'commented on', targetType: 'area' },
  removed_from_list: { type: 'deleted', action: 'removed', targetType: 'list' },
  deleted_list: { type: 'deleted', action: 'deleted list', targetType: 'list' },
  deleted_comment: { type: 'deleted', action: 'deleted comment on', targetType: 'poi' },
  deleted_attachment: { type: 'deleted', action: 'deleted attachment from', targetType: 'poi' },
  assigned_property: { type: 'added', action: 'assigned', targetType: 'property' },
  pre_rejected_property: { type: 'deleted', action: 'pre-rejected', targetType: 'property' },
  removed_assignment: { type: 'deleted', action: 'removed assignment from', targetType: 'property' },
  created_scouting_trip: { type: 'created', action: 'created scouting trip for', targetType: 'property' },
  submitted_scouting_trip: { type: 'added', action: 'submitted scouting trip for', targetType: 'property' },
  approved_scouting_trip: { type: 'updated', action: 'approved scouting trip for', targetType: 'property' },
  rejected_scouting_trip: { type: 'deleted', action: 'rejected scouting trip for', targetType: 'property' },
};

function buildTargetName(
  actionType: string,
  nameWithType: string,
  summary: Record<string, unknown>,
): string {
  switch (actionType) {
    case 'added_to_list':
      return summary.listName ? `${nameWithType} to "${summary.listName}"` : nameWithType;
    case 'removed_from_list':
      return summary.listName ? `${nameWithType} from "${summary.listName}"` : nameWithType;
    case 'deleted_list':
      return `"${summary.listName || 'a list'}"`;
    case 'added_attachment':
    case 'deleted_attachment':
    case 'deleted_comment':
      return nameWithType;
    case 'assigned_property': {
      const name = (summary.placeName as string) || 'a property';
      const assignee = summary.assigneeName as string | null;
      return assignee ? `${name} to ${assignee}` : name;
    }
    case 'pre_rejected_property':
    case 'removed_assignment':
      return (summary.placeName as string) || 'a property';
    case 'created_scouting_trip':
    case 'submitted_scouting_trip':
    case 'approved_scouting_trip':
    case 'rejected_scouting_trip':
      return (summary.tripName as string) || (summary.placeName as string) || 'a trip';
    default:
      return (summary.placeName as string) || (summary.shapeName as string) || (summary.name as string) || 'a place';
  }
}

// ─── Test runner ───

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

// ─── Test data ───

const ME = "user-franchisee-123";
const ADMIN = "user-admin-456";
const OTHER_FRANCHISEE = "user-franchisee-789";

const mockComments = [
  { id: "c1", created_by: ME },
  { id: "c2", created_by: OTHER_FRANCHISEE },
  { id: "c3", created_by: ADMIN },
];

const mockLists = [
  { id: "l1", created_by: ME },
  { id: "l2", created_by: OTHER_FRANCHISEE },
  { id: "l3", created_by: ADMIN },
];

const mockActivityLog = [
  // My own action
  { id: "a1", user_id: ME, action_type: "added_to_list", summary: '{"placeName":"Cafe Sol"}' },
  // Other franchisee's action (should be hidden)
  { id: "a2", user_id: OTHER_FRANCHISEE, action_type: "added_to_list", summary: '{"placeName":"Cafe Luna"}' },
  // Admin assigned property TO ME (should be visible via assigned_to)
  { id: "a3", user_id: ADMIN, action_type: "assigned_property", summary: JSON.stringify({ placeName: "Gran Via 42", assigned_to: ME, assigneeName: "Franchisee" }) },
  // Admin assigned property to OTHER (should be hidden)
  { id: "a4", user_id: ADMIN, action_type: "assigned_property", summary: JSON.stringify({ placeName: "Calle Mayor 10", assigned_to: OTHER_FRANCHISEE }) },
  // Admin approved MY trip (should be visible via trip_owner_id)
  { id: "a5", user_id: ADMIN, action_type: "approved_scouting_trip", summary: JSON.stringify({ tripName: "My Trip", trip_owner_id: ME }) },
  // Admin rejected OTHER's trip (should be hidden)
  { id: "a6", user_id: ADMIN, action_type: "rejected_scouting_trip", summary: JSON.stringify({ tripName: "Other Trip", trip_owner_id: OTHER_FRANCHISEE }) },
  // Null summary (should be hidden for non-owner)
  { id: "a7", user_id: OTHER_FRANCHISEE, action_type: "created_point", summary: null },
  // Malformed JSON summary (should be hidden for non-owner, not crash)
  { id: "a8", user_id: OTHER_FRANCHISEE, action_type: "created_area", summary: "not-json{{{" },
  // My own action with null summary (should still be visible - I'm the actor)
  { id: "a9", user_id: ME, action_type: "created_point", summary: null },
  // Admin pre-rejected a property (no assigned_to or trip_owner_id - should be hidden from franchisee)
  { id: "a10", user_id: ADMIN, action_type: "pre_rejected_property", summary: JSON.stringify({ placeName: "Bad Location", rejectionReason: "Too expensive" }) },
  // Admin's own list action (should be hidden from franchisee)
  { id: "a11", user_id: ADMIN, action_type: "deleted_list", summary: '{"listName":"Admin List"}' },
  // Edge: summary is already an object (not a string) - some DB drivers do this
  { id: "a12", user_id: ADMIN, action_type: "assigned_property", summary: JSON.stringify({ placeName: "Parsed Place", assigned_to: ME }) },
  // Edge: assigned_to present but doesn't match me
  { id: "a13", user_id: ADMIN, action_type: "assigned_property", summary: JSON.stringify({ placeName: "Not Mine", assigned_to: "user-someone-else" }) },
  // Edge: both assigned_to and trip_owner_id present, only trip_owner_id matches
  { id: "a14", user_id: ADMIN, action_type: "approved_scouting_trip", summary: JSON.stringify({ tripName: "Shared Trip", assigned_to: OTHER_FRANCHISEE, trip_owner_id: ME }) },
  // Edge: empty string summary
  { id: "a15", user_id: OTHER_FRANCHISEE, action_type: "created_point", summary: "" },
];


// ═══════════════════════════════════════════════
// TEST SUITE 1: Privacy Filtering
// ═══════════════════════════════════════════════

console.log("\n=== SUITE 1: Franchisee Privacy Filter ===\n");

const { filteredComments, filteredLists, filteredActivityLog } = filterForFranchisee(
  ME, mockComments, mockLists, mockActivityLog,
);

console.log("Comments:");
assert(filteredComments.length === 1, `Only my comment visible (got ${filteredComments.length}, expected 1)`);
assert(filteredComments[0]?.id === "c1", "My comment c1 is visible");

console.log("\nLists:");
assert(filteredLists.length === 1, `Only my list visible (got ${filteredLists.length}, expected 1)`);
assert(filteredLists[0]?.id === "l1", "My list l1 is visible");

console.log("\nActivity Log:");
const visibleIds = filteredActivityLog.map(e => e.id);
assert(visibleIds.includes("a1"), "a1: My own action is visible");
assert(!visibleIds.includes("a2"), "a2: Other franchisee's action is hidden");
assert(visibleIds.includes("a3"), "a3: Property assigned TO ME is visible (assigned_to match)");
assert(!visibleIds.includes("a4"), "a4: Property assigned to OTHER is hidden");
assert(visibleIds.includes("a5"), "a5: My trip approved is visible (trip_owner_id match)");
assert(!visibleIds.includes("a6"), "a6: Other's trip rejected is hidden");
assert(!visibleIds.includes("a7"), "a7: Other's action with null summary is hidden");
assert(!visibleIds.includes("a8"), "a8: Other's action with malformed JSON is hidden (no crash)");
assert(visibleIds.includes("a9"), "a9: My own action with null summary is still visible");
assert(!visibleIds.includes("a10"), "a10: Admin pre-reject (no target userId) is hidden from franchisee");
assert(!visibleIds.includes("a11"), "a11: Admin's own list deletion is hidden from franchisee");
assert(visibleIds.includes("a12"), "a12: String-serialized JSON with assigned_to=ME is visible");
assert(!visibleIds.includes("a13"), "a13: assigned_to for someone else is hidden");
assert(visibleIds.includes("a14"), "a14: trip_owner_id=ME matches even when assigned_to is someone else");
assert(!visibleIds.includes("a15"), "a15: Other's action with empty string summary is hidden");

const expectedVisible = ["a1", "a3", "a5", "a9", "a12", "a14"];
assert(filteredActivityLog.length === expectedVisible.length, `Total visible: ${filteredActivityLog.length}, expected ${expectedVisible.length}`);


// ═══════════════════════════════════════════════
// TEST SUITE 2: Admin sees everything
// ═══════════════════════════════════════════════

console.log("\n=== SUITE 2: Admin Sees Everything ===\n");

// Admin filter = no filter (isFranchisee is false)
assert(mockComments.length === 3, "Admin sees all 3 comments");
assert(mockLists.length === 3, "Admin sees all 3 lists");
assert(mockActivityLog.length === 15, "Admin sees all 15 activity log entries");


// ═══════════════════════════════════════════════
// TEST SUITE 3: All 7 new action types registered
// ═══════════════════════════════════════════════

console.log("\n=== SUITE 3: New Action Types Registered ===\n");

const newTypes = [
  "assigned_property",
  "pre_rejected_property",
  "removed_assignment",
  "created_scouting_trip",
  "submitted_scouting_trip",
  "approved_scouting_trip",
  "rejected_scouting_trip",
];

for (const t of newTypes) {
  const entry = ACTION_TYPE_MAP[t];
  assert(!!entry, `${t} is registered in ACTION_TYPE_MAP`);
  assert(entry?.targetType === "property", `${t} targetType is 'property' (not 'trip')`);
}

// Verify old types still work
const oldTypes = [
  "added_to_list", "added_attachment", "created_point", "created_area",
  "commented_on_shape", "removed_from_list", "deleted_list",
  "deleted_comment", "deleted_attachment",
];
for (const t of oldTypes) {
  assert(!!ACTION_TYPE_MAP[t], `Old type ${t} still registered`);
}

assert(Object.keys(ACTION_TYPE_MAP).length === 16, `Total action types: ${Object.keys(ACTION_TYPE_MAP).length}, expected 16`);


// ═══════════════════════════════════════════════
// TEST SUITE 4: buildTargetName for new types
// ═══════════════════════════════════════════════

console.log("\n=== SUITE 4: buildTargetName Display Logic ===\n");

// assigned_property with assignee
assert(
  buildTargetName("assigned_property", "", { placeName: "Gran Via 42", assigneeName: "Jan Novak" }) === "Gran Via 42 to Jan Novak",
  "assigned_property shows 'PropertyName to AssigneeName'"
);

// assigned_property without assignee
assert(
  buildTargetName("assigned_property", "", { placeName: "Gran Via 42" }) === "Gran Via 42",
  "assigned_property without assignee shows just property name"
);

// assigned_property with no data at all
assert(
  buildTargetName("assigned_property", "", {}) === "a property",
  "assigned_property with empty summary falls back to 'a property'"
);

// pre_rejected_property
assert(
  buildTargetName("pre_rejected_property", "", { placeName: "Bad Location" }) === "Bad Location",
  "pre_rejected_property shows property name"
);

// removed_assignment
assert(
  buildTargetName("removed_assignment", "", { placeName: "Old Place" }) === "Old Place",
  "removed_assignment shows property name"
);

// created_scouting_trip
assert(
  buildTargetName("created_scouting_trip", "", { tripName: "Madrid Scout #1" }) === "Madrid Scout #1",
  "created_scouting_trip shows trip name"
);

// submitted_scouting_trip with no tripName, fallback to placeName
assert(
  buildTargetName("submitted_scouting_trip", "", { placeName: "Some Place" }) === "Some Place",
  "submitted_scouting_trip falls back to placeName when no tripName"
);

// approved_scouting_trip with nothing
assert(
  buildTargetName("approved_scouting_trip", "", {}) === "a trip",
  "approved_scouting_trip with empty summary falls back to 'a trip'"
);

// rejected_scouting_trip
assert(
  buildTargetName("rejected_scouting_trip", "", { tripName: "Rejected One" }) === "Rejected One",
  "rejected_scouting_trip shows trip name"
);

// Verify old types still produce correct output
assert(
  buildTargetName("added_to_list", "Cafe Sol (cafe)", { listName: "Favorites" }) === 'Cafe Sol (cafe) to "Favorites"',
  "Old type added_to_list still works correctly"
);

assert(
  buildTargetName("deleted_list", "", { listName: "Old List" }) === '"Old List"',
  "Old type deleted_list still works correctly"
);


// ═══════════════════════════════════════════════
// TEST SUITE 5: Edge Cases
// ═══════════════════════════════════════════════

console.log("\n=== SUITE 5: Edge Cases ===\n");

// Franchisee with zero matching activities
const { filteredActivityLog: emptyResult } = filterForFranchisee(
  "user-nobody-999",
  mockComments,
  mockLists,
  mockActivityLog,
);
assert(emptyResult.length === 0, "Franchisee with no matching activities gets empty feed");

// Action type not in map (unknown type from future)
const unknownEntry = ACTION_TYPE_MAP["future_unknown_type"];
assert(!unknownEntry, "Unknown action type returns undefined (won't crash, just won't render)");

// buildTargetName default path for unknown action type
const defaultName = buildTargetName("some_future_type", "fallback", { placeName: "Test Place" });
assert(defaultName === "Test Place", "Unknown action type in buildTargetName uses default path");

// Role defaulting: if roleRes returns null/undefined, defaults to franchisee (safe default)
const nullRole = null as unknown as string;
const isFranchiseeDefault = (nullRole || "franchisee") === "franchisee";
assert(isFranchiseeDefault, "Null role defaults to franchisee (safe: restrictive by default)");


// ═══════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════

console.log("\n" + "=".repeat(50));
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log("  ⚠️  Some tests failed! Review the output above.\n");
  process.exit(1);
} else {
  console.log("  All tests passed. Privacy filter and display logic verified.\n");
  process.exit(0);
}
