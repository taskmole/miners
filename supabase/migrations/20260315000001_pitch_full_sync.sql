-- ===========================================
-- MIGRATION: Add missing columns for full pitch sync
-- ===========================================
-- Enables syncing ALL form fields from client to Supabase
-- so admins can see full submission details from any device
-- ===========================================

-- Checklist data (array of questions/answers)
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS checklist JSONB;

-- Author info (for display in admin)
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS author_name TEXT;

-- Trip/pitch name
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS trip_name TEXT;

-- Transfer fee (traspaso) - missing from original schema
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS transfer_fee NUMERIC;

-- Rejection feedback
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS rejection_notes TEXT;

-- Who reviewed (display name)
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Storage paths for attachments (files uploaded to Supabase Storage)
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS attachment_paths TEXT[];
