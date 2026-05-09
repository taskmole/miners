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

### Audit SECURITY DEFINER functions for trust-the-caller bugs
**What:** Review every `CREATE FUNCTION ... SECURITY DEFINER` in `supabase/migrations/` and confirm each derives caller identity from `auth.uid()` rather than accepting it as a parameter.
**Why:** The `migrate_anonymous_user` fix on 2026-05-04 found that the function trusted a caller-supplied `auth_id`, letting any signed-in user re-tag anonymous data into someone else's account. The same pattern likely exists in other RPCs (e.g. `update_drawn_feature_metadata`).
**Pros:** Closes a class of auth-bypass bugs in one sweep.
**Cons:** Requires reading every CREATE FUNCTION block. Some functions may legitimately need to accept user IDs (admin tools), so each needs judgment.
**Where to start:** `grep -n 'SECURITY DEFINER' supabase/migrations/*.sql`. For each hit, check whether the function takes a user/auth ID parameter; if so, replace with `auth.uid()` or add a guard.

### Drop the legacy `miners-anonymous-user-id` localStorage key
**What:** Remove the `ANON_USER_KEY` constant and its read at `src/lib/supabaseHelpers.ts:11-12, 103-104`. Simplify `idsToMigrate` to just the browser session ID.
**Why:** This key is read but never written by current code. It's a leftover from an earlier auth model. After 2-3 months of the new migration shipping, every active user has logged in at least once and their legacy data is migrated.
**Pros:** Removes ~10 lines and one loop iteration per login. Simpler mental model.
**Cons:** Tiny window where a long-dormant user returns and never gets their old anonymous data migrated. Acceptable risk.
**Don't ship before:** ~2026-08-01.

### ✓ Create migrate_anonymous_user Supabase function (Resolved 2026-05-04)
The function did exist (migration `20260501000001_create_drawn_features_and_rpcs.sql`) but had a uuid/text type mismatch that returned 42883 wrapped as 404. Fixed in migration `20260504000001_fix_migrate_anonymous_user.sql`, which also closed an auth-bypass bug.

### Improve service worker caching strategy
**What:** Add cache size limits and expiration to `public/sw.js`.
**Why:** The current implementation caches every GET request indefinitely with no size cap. For a map app loading tile images and CSV data, the cache can grow very large on mobile devices with limited storage.
**Pros:** Prevents unbounded cache growth on phones. Ensures users get fresh data after updates.
**Cons:** Requires choosing sensible limits (max entries, max age) and possibly different strategies per resource type (tiles vs. API data vs. static assets).
**Where to start:** `public/sw.js`. Consider using a network-first strategy for API/data routes, cache-first for static assets, and adding a max-entries limit.
