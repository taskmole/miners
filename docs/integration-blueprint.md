# Supabase Integration Blueprint

**Date:** 2026-03-08
**Status:** Planning complete, ready for implementation

---

## Migration Order

| Phase | Hook | Supabase Table(s) | Complexity | Blockers |
|-------|------|-------------------|------------|----------|
| 1 | useHiddenPois | hidden_pois | Low | None |
| 2 | usePointCategories | categories | Low | None |
| 3 | useLists | lists + list_items | Medium | Schema ALTER needed |
| 4 | useScoutingTrips | pitches | High | Schema ALTER needed |
| 5 | usePoiComments | comments | Medium | Needs places table populated |
| 6 | useAttachments | Supabase Storage + new table | High | Needs places table + Storage bucket |
| 7 | useMapData | places | Medium | Separate track (CSV → DB) |

---

## Pre-Migration Setup

Create shared utility file: `src/lib/supabaseHelpers.ts`
- `getAnonymousUserId()` — stable device ID until auth is ready
- `withSupabase<T>(fn, fallback)` — try Supabase, fall back gracefully
- `handleSupabaseError(error, context)` — standardized error logging

---

## Key Decisions

1. **No new dependencies** — @supabase/supabase-js already installed, no TanStack Query needed
2. **Dual-write transition** — localStorage first (sync), then Supabase (async). On load, Supabase wins.
3. **Same hook API surface** — components don't change
4. **Anonymous user ID** — stored in localStorage until auth is ready
5. **Lazy loading for comments** — load per-POI, not all at once

---

## SQL Changes Required Before Each Phase

### Phase 3 (Lists)
```sql
ALTER TABLE public.lists ADD COLUMN metadata jsonb;
ALTER TABLE public.list_items ADD COLUMN metadata jsonb;
ALTER TABLE public.list_items ADD COLUMN sort_order integer DEFAULT 0;
```

### Phase 4 (Scouting Trips)
```sql
ALTER TABLE public.pitches ADD COLUMN name text;
ALTER TABLE public.pitches ADD COLUMN related_places jsonb;
ALTER TABLE public.pitches ADD COLUMN checklist jsonb;
ALTER TABLE public.pitches ADD COLUMN attachments jsonb;
ALTER TABLE public.pitches ADD COLUMN uploaded_document jsonb;
ALTER TABLE public.pitches ADD COLUMN trip_type text DEFAULT 'form';
ALTER TABLE public.pitches ADD COLUMN author_name text;
```

### Phase 6 (Attachments)
```sql
CREATE TABLE public.place_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL,
  thumbnail_path text,
  uploaded_by text,
  uploaded_by_name text,
  added_at timestamp with time zone DEFAULT now()
);
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| RLS blocks anon key | High | Add permissive anon policies during dev |
| entity_id UUID mismatch | High | Don't migrate comments until places table has UUIDs |
| Data loss during dual-write | Medium | localStorage first, Supabase async |
| Storage signed URLs expire | Low | Generate URLs in component on mount |
| pitches property field is object, not ID | Medium | Store full object in related_places jsonb |

---

## Files Changed Per Phase

| Phase | Files Modified | Files Created |
|-------|---------------|---------------|
| Setup | — | src/lib/supabaseHelpers.ts |
| 1 | src/hooks/useHiddenPois.ts | — |
| 2 | src/hooks/usePointCategories.ts | — |
| 3 | src/hooks/useLists.ts | supabase/migrations/002-lists-metadata.sql |
| 4 | src/contexts/ScoutingTripsContext.tsx | supabase/migrations/003-pitches-extra-columns.sql |
| 5 | src/hooks/usePoiComments.ts | — |
| 6 | src/hooks/useAttachments.ts, src/types/attachments.ts | supabase/migrations/004-place-attachments.sql |
| 7 | src/hooks/useMapData.ts | — |

Total: 9 files modified, 4 files created. No component changes until Phase 6.
