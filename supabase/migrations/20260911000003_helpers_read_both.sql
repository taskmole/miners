-- Step 2 of the per-city permissions migration: teach the helpers to read
-- both systems.
--
-- Four function bodies change to "allowed if the old role says yes OR the new
-- grant says yes". Not one line of policy text is touched, because no policy
-- contains a role name: of 154 policies, exactly one mentions `role` and it is
-- `team_members.role = 'owner'`, an unrelated concept. The helpers are the
-- whole surface.
--
-- This is the risky deploy, and it is risky in a boring way: if it breaks, it
-- breaks loudly and immediately, and it is one deploy to roll back.
--
-- The new definitions, written out because the old ladder and the new ladder
-- cross each other:
--
--   is_super_admin()     the flag, or the old role
--   is_admin()           either of those, or Approve in any city
--   is_dashboard_role()  same as is_admin, or any old dashboard role
--   is_finance_plus()    either, or the financials tick in any city
--
-- is_dashboard_role() is deliberately NOT "View or above". A franchisee is
-- backfilled as Contribute, which outranks View, so that definition would hand
-- the admin dashboard to all nine franchisees on the spot. Contribute is not a
-- weaker Approve; it is a different thing that happens to sit between the two
-- on the map-access ladder, and only there.
--
-- Behaviour after this migration is byte-identical to today for all 17 people,
-- verified by impersonating every one of them and comparing is_admin,
-- is_dashboard_role, is_super_admin and is_finance_plus against the same table
-- captured before the change. Zero rows differ.
--
-- That includes the inactive area_coordinator, who backfilled as View but
-- still holds the old role, so the "old OR new" here keeps their dashboard
-- open. They lose it at step 3, where the old half goes away. That is the one
-- accepted behaviour change in the whole of steps 1 to 3, and it is written
-- down at step 3 so it is not mistaken for a bug later.
--
-- Undo: re-run the bodies from 20260907000002_security_hardening_rls_and_search_path.sql
-- (is_admin, is_dashboard_role, is_finance_plus) and 20260910000002 (is_super_admin).

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND (is_super_admin OR role = 'super_admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND (is_super_admin OR role IN ('super_admin', 'head_office_exec'))
  )
  OR EXISTS (
    SELECT 1 FROM public.user_city_grants
    WHERE user_id = auth.uid() AND level = 'approve'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_dashboard_role()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND (is_super_admin
        OR role IN ('super_admin', 'head_office_exec', 'finance_reviewer', 'area_coordinator'))
  )
  OR EXISTS (
    SELECT 1 FROM public.user_city_grants
    WHERE user_id = auth.uid() AND level = 'approve'
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_finance_plus()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND (is_super_admin
        OR role IN ('super_admin', 'head_office_exec', 'finance_reviewer'))
  )
  OR EXISTS (
    SELECT 1 FROM public.user_city_grants
    WHERE user_id = auth.uid() AND can_see_financials
  );
$function$;
