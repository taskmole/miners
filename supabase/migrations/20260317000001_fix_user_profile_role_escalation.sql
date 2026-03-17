-- Migration: Prevent privilege escalation on user_profiles
--
-- Problem: The RLS update policy on user_profiles allows users to update
-- their own row, but doesn't prevent them from changing their own role
-- (e.g. from 'franchisee' to 'super_admin').
--
-- Fix: A database trigger that rejects role changes unless the caller
-- is a super_admin or head_office_exec. This works regardless of whether
-- the update comes from the app, the Supabase dashboard, or raw SQL.
--
-- IMPORTANT: Run this BEFORE enabling RLS on user_profiles.

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If role is not being changed, allow the update
  IF NEW.role = OLD.role OR NEW.role IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only super_admin and head_office_exec can change roles
  IF EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_exec')
  ) THEN
    RETURN NEW;
  END IF;

  -- Block the role change
  RAISE EXCEPTION 'Only admins can change user roles';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach the trigger to user_profiles
DROP TRIGGER IF EXISTS check_role_escalation ON public.user_profiles;
CREATE TRIGGER check_role_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();
