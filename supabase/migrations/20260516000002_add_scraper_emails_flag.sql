-- ===========================================
-- MIGRATION: Add receives_scraper_emails flag to user_profiles
-- ===========================================

ALTER TABLE public.user_profiles
  ADD COLUMN receives_scraper_emails boolean NOT NULL DEFAULT false;
