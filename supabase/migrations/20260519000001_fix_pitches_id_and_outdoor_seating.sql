-- Fix pitches.id column type from uuid to text.
-- The app generates string IDs like "trip_1716123456789_abc123def" which are not valid UUIDs.
-- This caused every upsert to silently fail with "invalid input syntax for type uuid".
-- Same class of bug as 20260515000001_fix_list_items_place_id.sql.

-- Step 1: Drop FK from pitch_approvals that references pitches.id
ALTER TABLE public.pitch_approvals DROP CONSTRAINT IF EXISTS pitch_approvals_pitch_id_fkey;

-- Step 2: Change pitch_approvals.pitch_id from uuid to text
ALTER TABLE public.pitch_approvals ALTER COLUMN pitch_id TYPE text USING pitch_id::text;

-- Step 3: Change pitches.id from uuid to text
ALTER TABLE public.pitches ALTER COLUMN id TYPE text USING id::text;

-- Step 4: Remove the uuid default (gen_random_uuid() returns uuid, not text)
ALTER TABLE public.pitches ALTER COLUMN id DROP DEFAULT;

-- Step 5: Re-add FK with cascade delete
ALTER TABLE public.pitch_approvals
  ADD CONSTRAINT pitch_approvals_pitch_id_fkey
  FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;

-- Step 6: Fix outdoor_seating from boolean to text (migration 20260513000001 was never applied)
ALTER TABLE public.pitches
  ALTER COLUMN outdoor_seating TYPE text
  USING CASE WHEN outdoor_seating = true THEN 'street' ELSE NULL END;

-- Step 7: Add flat_surface column (also from unapplied migration 20260513000001)
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS flat_surface boolean;
