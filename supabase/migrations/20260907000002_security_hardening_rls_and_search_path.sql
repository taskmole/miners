-- ===========================================
-- MIGRATION: Security hardening
-- ===========================================
-- 1. Re-enables RLS on team_members (was manually disabled in prod).
--    The original policies queried team_members from inside their own
--    policy definitions, which Postgres rejects with "infinite recursion".
--    The policies below use SECURITY DEFINER helper functions instead,
--    which bypass RLS and break the loop.
-- 2. Pins search_path on all functions flagged by the Supabase
--    security advisor (function_search_path_mutable).
--
-- Rollback (returns to pre-migration state):
--   ALTER TABLE public.team_members DISABLE ROW LEVEL SECURITY;
-- ===========================================

-- ===========================================
-- 1. OWNER-CHECK HELPER
-- ===========================================
-- Mirrors user_team_ids() / is_team_member(): SECURITY DEFINER so it can
-- read team_members without triggering that table's own RLS policies.

CREATE OR REPLACE FUNCTION public.is_team_owner(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = team_uuid
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- ===========================================
-- 2. NON-RECURSIVE TEAM_MEMBERS POLICIES
-- ===========================================
-- Team creation stays covered: the teams INSERT policy is dashboard-only,
-- so the creator's bootstrap owner row passes via is_dashboard_role().

DROP POLICY IF EXISTS "Members can view teammates" ON public.team_members;
DROP POLICY IF EXISTS "Team owners and admins can add members" ON public.team_members;
DROP POLICY IF EXISTS "Team owners and admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Self or team owners or admins can remove members" ON public.team_members;

CREATE POLICY "Members can view teammates"
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (public.is_team_member(team_id) OR public.is_dashboard_role());

CREATE POLICY "Team owners and admins can add members"
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_owner(team_id) OR public.is_dashboard_role());

CREATE POLICY "Team owners and admins can update members"
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (public.is_team_owner(team_id) OR public.is_dashboard_role());

CREATE POLICY "Self or team owners or admins can remove members"
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_team_owner(team_id)
    OR public.is_dashboard_role()
  );

-- ===========================================
-- 3. RE-ENABLE RLS
-- ===========================================

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- 4. PIN search_path ON FLAGGED FUNCTIONS
-- ===========================================
-- Prevents search_path hijacking; no behavior change since all of these
-- already reference objects in public/auth explicitly or via triggers.

ALTER FUNCTION public.check_email_domain() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.is_finance_plus() SET search_path = public;
ALTER FUNCTION public.is_authenticated() SET search_path = public;
ALTER FUNCTION public.is_dashboard_role() SET search_path = public;
ALTER FUNCTION public.is_team_member(uuid) SET search_path = public;
ALTER FUNCTION public.user_team_ids() SET search_path = public;
ALTER FUNCTION public.migrate_anonymous_user(text) SET search_path = public;
ALTER FUNCTION public.insert_miners_place(text, text, text, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.update_drawn_feature_metadata(text, text, text, text[], text, text, text, double precision[], text, jsonb) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.update_teams_updated_at() SET search_path = public;
ALTER FUNCTION public.update_property_assignments_updated_at() SET search_path = public;
ALTER FUNCTION public.update_property_requests_updated_at() SET search_path = public;
