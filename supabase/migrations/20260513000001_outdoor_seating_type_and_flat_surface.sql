-- Convert outdoor_seating from boolean to text (outdoor seating type)
-- and add flat_surface boolean column to pitches table.

ALTER TABLE public.pitches
  ALTER COLUMN outdoor_seating TYPE text
  USING CASE
    WHEN outdoor_seating = true THEN 'street'
    ELSE NULL
  END;

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS flat_surface boolean;
