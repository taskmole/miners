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
