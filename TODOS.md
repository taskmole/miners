# TODOs

## Completed

### ✓ Supabase Admin Dashboard Error (Fixed)
Removed the join query that was causing the foreign key error. Now fetches pitches directly without joining to user_profiles.

---

## Future Improvements

### useLists localStorage cleanup (blocked on DB migration)
**What:** Remove localStorage dual-write from `src/hooks/useLists.ts`.
**Why:** The `drawnAreas` field (drawn shapes linked to a list) only exists in localStorage. If we remove localStorage from this file, that data is permanently lost. Cross-device sync won't work for list-attached shapes until this is fixed.
**Blocked by:** Supabase migration to add a `list_drawn_areas` table (or a `drawn_areas` JSONB column on `lists`). The `list_items` table also needs `place_name`, `place_type`, `place_address`, `lat`, `lon` columns.
**Context:** All other localStorage dual-writes were removed in April 2026. This is the last one.

### Add unit tests for useMapData hook
**What:** Set up Vitest and write unit tests for `src/hooks/useMapData.ts`.
**Why:** The data loading hook had a production bug (infinite spinner) with zero test coverage. Tests should cover: fetch timeout behavior, supabase null handling, retry mechanism, and the two-phase loading flow.
**Context:** The hook was restructured in May 2026 to split loading into Phase 1 (cafes, blocks spinner) and Phase 2 (properties/POIs, background). Playwright exists for E2E but no unit test framework is set up.

### Create migrate_anonymous_user Supabase function
**What:** Deploy the `migrate_anonymous_user` RPC function to Supabase.
**Why:** The cross-device sync feature (commit f2fcb71) calls `supabase.rpc('migrate_anonymous_user')` but the function returns 404 because it was never created in the database.
**Context:** The function should reassign rows in drawn_features, lists, list_items, activity_log from the anonymous user ID to the authenticated user ID.
