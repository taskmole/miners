-- Add score column for property ranking (0-100 numeric)
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS score numeric;

-- Add image_analysis column for vision AI analysis results (JSONB)
ALTER TABLE public.places ADD COLUMN IF NOT EXISTS image_analysis jsonb;

-- Index on score for fast ORDER BY score DESC queries
CREATE INDEX IF NOT EXISTS places_score_idx
  ON public.places(score)
  WHERE score IS NOT NULL;

-- Migrate legacy Idealista data: source='property' -> source='idealista'
-- The old populate-places-table.ts wrote Idealista listings with source='property'.
-- The new scraper uses source='idealista'. This aligns them so upsert works correctly.
UPDATE public.places SET source = 'idealista' WHERE source = 'property';
