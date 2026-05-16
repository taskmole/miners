-- Fix list_items.place_id column type from uuid to text.
-- The app generates string placeIds like "cafe-50.07553-14.41893" which are not valid UUIDs.
-- This caused every item insert to silently fail with "invalid input syntax for type uuid".

-- Step 1: Drop the FK constraint that references places(id) - it may or may not exist in live DB
ALTER TABLE public.list_items DROP CONSTRAINT IF EXISTS list_items_place_id_fkey;

-- Step 2: Change column type from uuid to text
ALTER TABLE public.list_items ALTER COLUMN place_id TYPE text USING place_id::text;
