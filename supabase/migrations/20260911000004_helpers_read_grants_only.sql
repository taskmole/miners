-- Step 3 of the per-city permissions migration: flip to the new system.
--
-- The same four helpers stop reading `user_profiles.role` entirely. Verified
-- by impersonating all 17 people and diffing is_admin, is_dashboard_role,
-- is_super_admin and is_finance_plus against the table captured before step 2.
-- Exactly one row differs, and it is the one accepted change in the whole of
-- steps 1 to 3:
--
--   Maksim Petrov, the single area_coordinator, loses is_dashboard_role.
--
-- They backfilled as View, and View does not open the dashboard. They have
-- been deactivated for some time and cannot sign in at all, so the live impact
-- is zero. Written down here so that when somebody finds it in six months it
-- reads as a decision rather than a bug.
--
-- Nobody else moves.
--
--   is_super_admin()     the flag
--   is_admin()           the flag, or Approve in any city
--   is_dashboard_role()  identical to is_admin() from here on
--   is_finance_plus()    the flag, or the financials tick in any city
--
-- enforce_profile_field_locks() is rewritten in THE SAME TRANSACTION, not
-- afterwards. It calls is_admin() and reads OLD.role, so flipping the helpers
-- silently changes what it means, and it is the only thing standing between a
-- franchisee and promoting themselves. The two have to move together or there
-- is a window where the guard is reasoning about a column that no longer
-- decides anything.
--
-- The `role` column stays, still written by the dual-write trigger from step
-- 1, because it is the rollback mechanism: reverting steps 2 and 3 restores
-- helpers that read it, and they need it to be truthful. Step 7 drops it.
--
-- Undo: re-apply 20260911000003_helpers_read_both.sql, which is the "old OR
-- new" version and is correct whichever way the data has moved since.

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_super_admin
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
    WHERE id = auth.uid() AND is_super_admin
  )
  OR EXISTS (
    SELECT 1 FROM public.user_city_grants
    WHERE user_id = auth.uid() AND level = 'approve'
  );
$function$;

-- Now genuinely identical to is_admin(). Kept as its own function rather than
-- aliased because 11 policies call it by name, and renaming those is churn
-- with no payoff. Approve is what opens the dashboard; Contribute never does.
CREATE OR REPLACE FUNCTION public.is_dashboard_role()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_super_admin
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
    WHERE id = auth.uid() AND is_super_admin
  )
  OR EXISTS (
    SELECT 1 FROM public.user_city_grants
    WHERE user_id = auth.uid() AND can_see_financials
  );
$function$;


-- ---------------------------------------------------------------------------
-- The profile guard, rewritten around the new fields
-- ---------------------------------------------------------------------------
--
-- What changed: the super-admin test is now the `is_super_admin` column, not
-- the role string. `role` is still pinned for non-admins, because the
-- dual-write trigger owns that column now and nobody else has any business
-- writing it.
--
-- What deliberately did NOT change: the guard says nothing about the grants
-- table. Grants are a separate table with its own RLS - writes are super admin
-- only, or the SECURITY DEFINER invite_contributor() added in step 6. A row
-- trigger on user_profiles cannot see a write to another table anyway, and
-- pretending otherwise would be a guard that looks like protection and is not.

CREATE OR REPLACE FUNCTION public.enforce_profile_field_locks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sign-up, the service role and migrations are not the threat model. This
  -- also lets the step 1 dual-write trigger through, since it runs SECURITY
  -- DEFINER as postgres.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    -- Anyone who approves somewhere may run the user screen. What they may not
    -- do is reach a super admin. Two ways that matters, both closed here:
    --
    --   1. Minting their own kind. Without this, an Approver could switch the
    --      Super Admin flag on for anyone, themselves included, and the
    --      difference between the two would be cosmetic.
    --   2. Switching a super admin off. is_active = false puts an account
    --      behind the "account pending" screen, so an Approver could lock the
    --      founders out of their own product without granting anything.
    --
    -- Anything not permission-shaped - a display name, a team, a preference -
    -- stays editable, on a super admin's row as much as anyone's.
    -- Both spellings of "super admin" are in the reach condition, and the
    -- role string stays there until step 7 drops the column. Testing only the
    -- flag looks equivalent and is not: an Approver whose row has the flag
    -- false on both sides satisfies neither disjunct, so
    --
    --   UPDATE user_profiles SET role = 'super_admin' WHERE id = auth.uid()
    --
    -- sails straight through. The dual-write trigger does not catch it either,
    -- because it is BEFORE UPDATE OF is_super_admin and a role-only update
    -- never fires it, so the planted string sticks. Two things then break:
    -- rolling step 3 back restores helpers that read `role`, handing the
    -- attacker a real super admin; and the user-profiles API route still keys
    -- its own checks on the role string today. Verified by reproducing it
    -- against prod in a rolled-back transaction before putting this line back.
    IF NOT public.is_super_admin()
       AND (OLD.is_super_admin OR NEW.is_super_admin
         OR OLD.role = 'super_admin' OR NEW.role = 'super_admin')
       AND (NEW.is_super_admin    IS DISTINCT FROM OLD.is_super_admin
         OR NEW.role              IS DISTINCT FROM OLD.role
         OR NEW.is_active         IS DISTINCT FROM OLD.is_active
         OR NEW.city_ids          IS DISTINCT FROM OLD.city_ids
         OR NEW.can_approve_level IS DISTINCT FROM OLD.can_approve_level
         OR NEW.email             IS DISTINCT FROM OLD.email) THEN
      RAISE EXCEPTION 'Only a super admin can grant, remove or suspend the super admin role.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- Everyone else may edit their own profile, but not the parts of it that
  -- decide what they are allowed to do.
  --
  -- IS DISTINCT FROM, never <>: can_approve_level is NULL for every user, and
  -- NULL <> NULL is NULL, which would wave the change straight through.
  --
  -- email and id are locked alongside the rest. Sign-up matches an invited
  -- profile by email address, so an editable email lets someone point their
  -- row at a colleague's invitation; id is the row's identity and only the
  -- claim path has any business changing it.
  IF NEW.is_super_admin    IS DISTINCT FROM OLD.is_super_admin
     OR NEW.role           IS DISTINCT FROM OLD.role
     OR NEW.is_active      IS DISTINCT FROM OLD.is_active
     OR NEW.city_ids       IS DISTINCT FROM OLD.city_ids
     OR NEW.can_approve_level IS DISTINCT FROM OLD.can_approve_level
     OR NEW.email          IS DISTINCT FROM OLD.email
     OR NEW.id             IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only an admin can change a profile''s access, cities or email.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
