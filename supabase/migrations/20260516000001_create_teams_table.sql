-- ===========================================
-- MIGRATION: Create teams table + team_id on user_profiles
-- ===========================================

CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_name_unique UNIQUE (name)
);

ALTER TABLE public.user_profiles
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

CREATE INDEX idx_user_profiles_team_id ON public.user_profiles(team_id);

-- RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view teams"
ON public.teams FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Only admins can insert teams"
ON public.teams FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update teams"
ON public.teams FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete teams"
ON public.teams FOR DELETE
USING (public.is_admin());
