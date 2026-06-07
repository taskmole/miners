-- ===========================================
-- MIGRATION: user_profiles.team_id column (deprecated)
-- ===========================================
-- SUPERSEDED by 20260517000001_create_teams.sql, which is the authoritative
-- teams schema (teams + team_members tables, helper functions, and RLS).
--
-- This file originally also created a minimal `teams` table, which collided
-- with the `CREATE TABLE public.teams` in 20260517000001 and broke a fresh
-- database setup. Teams creation now lives solely in 20260517000001.
--
-- We keep only the (now deprecated) user_profiles.team_id column here, as a
-- plain uuid with no foreign key, since `teams` is created in the later
-- migration. The column is no longer the source of truth for membership: the
-- app reads team membership from the team_members table. It remains only as a
-- convenience backing value for the single-team selector in the admin UI.
--
-- All statements are guarded so this migration is safe to run in any order and
-- more than once.
-- ===========================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS team_id uuid;

CREATE INDEX IF NOT EXISTS idx_user_profiles_team_id ON public.user_profiles(team_id);
