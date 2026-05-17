-- ===========================================
-- MIGRATION: Teams feature
-- ===========================================
-- Creates teams and team_members tables, adds team columns to
-- property_assignments, lists, and pitches tables.
-- Updates RLS policies to allow team-based access.
-- ===========================================

-- ===========================================
-- 1. HELPER FUNCTIONS
-- ===========================================

-- Returns all team IDs the current user belongs to
CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = auth.uid();
$$;

-- Checks if current user is a member of a specific team
CREATE OR REPLACE FUNCTION public.is_team_member(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = team_uuid
    AND user_id = auth.uid()
  );
$$;

-- ===========================================
-- 2. TEAMS TABLE
-- ===========================================

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION public.update_teams_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_teams_updated_at();

CREATE INDEX idx_teams_created_by ON public.teams(created_by);

-- ===========================================
-- 3. TEAM_MEMBERS TABLE
-- ===========================================

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  added_by uuid NOT NULL REFERENCES public.user_profiles(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);
CREATE INDEX idx_team_members_team_id ON public.team_members(team_id);

-- ===========================================
-- 4. ADD TEAM COLUMNS TO EXISTING TABLES
-- ===========================================

-- Property assignments: assigned_to_team (mutually exclusive with assigned_to)
ALTER TABLE public.property_assignments
  ADD COLUMN assigned_to_team uuid REFERENCES public.teams(id) ON DELETE SET NULL;

ALTER TABLE public.property_assignments
  ADD CONSTRAINT chk_assignment_exclusivity
  CHECK (NOT (assigned_to IS NOT NULL AND assigned_to_team IS NOT NULL));

CREATE INDEX idx_property_assignments_team ON public.property_assignments(assigned_to_team);

-- Lists: team_id for shared lists
ALTER TABLE public.lists
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX idx_lists_team_id ON public.lists(team_id);

-- Pitches: team_id for shared trips
ALTER TABLE public.pitches
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX idx_pitches_team_id ON public.pitches(team_id);

-- ===========================================
-- 5. RLS FOR TEAMS TABLE
-- ===========================================

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members and admins can view teams"
  ON public.teams
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
    )
    OR public.is_dashboard_role()
  );

CREATE POLICY "Dashboard roles can create teams"
  ON public.teams
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_dashboard_role()
    AND created_by = auth.uid()
  );

CREATE POLICY "Team owners and admins can update teams"
  ON public.teams
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = teams.id
      AND team_members.user_id = auth.uid()
      AND team_members.role = 'owner'
    )
    OR public.is_dashboard_role()
  );

CREATE POLICY "Only admins can delete teams"
  ON public.teams
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ===========================================
-- 6. RLS FOR TEAM_MEMBERS TABLE
-- ===========================================

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view teammates"
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
    )
    OR public.is_dashboard_role()
  );

CREATE POLICY "Team owners and admins can add members"
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
    )
    OR public.is_dashboard_role()
  );

CREATE POLICY "Team owners and admins can update members"
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
    )
    OR public.is_dashboard_role()
  );

CREATE POLICY "Self or team owners or admins can remove members"
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    team_members.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
      AND tm.user_id = auth.uid()
      AND tm.role = 'owner'
    )
    OR public.is_dashboard_role()
  );

-- ===========================================
-- 7. UPDATE LISTS RLS - Allow team member access
-- ===========================================

-- Drop and recreate the UPDATE policy to include team members
DROP POLICY IF EXISTS "Owner or admin can update lists" ON public.lists;

CREATE POLICY "Owner or team member or admin can update lists"
  ON public.lists
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.user_team_ids()))
    OR public.is_admin()
  );

-- ===========================================
-- 8. UPDATE LIST_ITEMS RLS - Allow team member access
-- ===========================================

-- Drop and recreate INSERT/UPDATE/DELETE to include team members
DROP POLICY IF EXISTS "List owner can insert list_items" ON public.list_items;
DROP POLICY IF EXISTS "List owner can update list_items" ON public.list_items;
DROP POLICY IF EXISTS "List owner can delete list_items" ON public.list_items;

CREATE POLICY "List owner or team member can insert list_items"
  ON public.list_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lists
      WHERE lists.id = list_items.list_id
      AND (
        lists.created_by = auth.uid()
        OR (lists.team_id IS NOT NULL AND lists.team_id IN (SELECT public.user_team_ids()))
        OR public.is_admin()
      )
    )
  );

CREATE POLICY "List owner or team member can update list_items"
  ON public.list_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.lists
      WHERE lists.id = list_items.list_id
      AND (
        lists.created_by = auth.uid()
        OR (lists.team_id IS NOT NULL AND lists.team_id IN (SELECT public.user_team_ids()))
        OR public.is_admin()
      )
    )
  );

CREATE POLICY "List owner or team member can delete list_items"
  ON public.list_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.lists
      WHERE lists.id = list_items.list_id
      AND (
        lists.created_by = auth.uid()
        OR (lists.team_id IS NOT NULL AND lists.team_id IN (SELECT public.user_team_ids()))
        OR public.is_admin()
      )
    )
  );

-- ===========================================
-- 9. UPDATE PITCHES RLS - Allow team members to update draft pitches
-- ===========================================

DROP POLICY IF EXISTS "Owner can update draft pitches" ON public.pitches;

CREATE POLICY "Owner or team member can update draft pitches"
  ON public.pitches
  FOR UPDATE
  USING (
    (created_by = auth.uid() AND status = 'draft')
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.user_team_ids()) AND status = 'draft')
    OR public.is_admin()
  );

-- ===========================================
-- DONE
-- ===========================================
