-- Helper function: is_dashboard_role()
-- Returns true for super_admin, head_office_exec, finance_reviewer, area_coordinator
CREATE OR REPLACE FUNCTION public.is_dashboard_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_exec', 'finance_reviewer', 'area_coordinator')
  );
$$;

-- Property assignments table
CREATE TABLE public.property_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_place_id text NOT NULL UNIQUE,
  assigned_to uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  assigned_by uuid NOT NULL REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'pre_rejected')),
  rejection_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_property_assignments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER property_assignments_updated_at
  BEFORE UPDATE ON public.property_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_property_assignments_updated_at();

-- RLS
ALTER TABLE public.property_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all assignments"
  ON public.property_assignments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Dashboard roles can insert assignments"
  ON public.property_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_dashboard_role());

CREATE POLICY "Dashboard roles can update assignments"
  ON public.property_assignments
  FOR UPDATE
  TO authenticated
  USING (public.is_dashboard_role())
  WITH CHECK (public.is_dashboard_role());

CREATE POLICY "Dashboard roles can delete assignments"
  ON public.property_assignments
  FOR DELETE
  TO authenticated
  USING (public.is_dashboard_role());

-- Index for quick lookups by assigned user
CREATE INDEX idx_property_assignments_assigned_to ON public.property_assignments(assigned_to);
