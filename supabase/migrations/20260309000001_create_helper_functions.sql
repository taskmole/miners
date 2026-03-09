-- ===========================================
-- MIGRATION: Create helper functions for RLS policies
-- ===========================================
-- These functions are used by RLS policies across all tables.
-- Must run BEFORE enabling RLS or creating policies.
-- ===========================================

-- Check if current user is an admin (super_admin or head_office_exec)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_exec')
  );
$$;

-- Check if current user is finance+ (finance_reviewer, head_office_exec, or super_admin)
CREATE OR REPLACE FUNCTION public.is_finance_plus()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_exec', 'finance_reviewer')
  );
$$;

-- Check if current user is authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;
