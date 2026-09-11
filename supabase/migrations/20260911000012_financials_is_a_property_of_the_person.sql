-- Financials becomes a property of the person, not of the city.
--
-- The admin screen showed a Financials tick per city, but is_finance_plus()
-- returns true if ANY grant carries the tick, and not one of the six finance
-- tables has a city_id. So the control was global all along and the screen
-- implied a per-city choice it never had. Rather than leave a lie on screen,
-- the flag moves onto the person.
--
-- The new function reads BOTH sources on purpose. There is then no window in
-- which the old screen writes to a dead field or the new screen reads an empty
-- one. 20260911000014 (deploy 3) drops the grant column and simplifies this.
--
-- Authored from the live pg_get_functiondef output taken AFTER
-- 20260911000010, not from the migration files. CREATE OR REPLACE replaces the
-- whole body, so writing this from the pre-M1 source would have silently undone
-- the is_active gate for financials. Same trap, worse, for
-- enforce_profile_field_locks(): its body carries the
-- `OLD.role = 'super_admin' OR NEW.role = 'super_admin'` disjunct that closed a
-- real escalation hole earlier today, so it is reproduced here verbatim with
-- only the new column added.
--
-- The trigger extension is not optional. user_profiles UPDATE is
-- `(id = auth.uid()) OR is_admin()`, so without it any Approver could tick
-- their own financials.
--
-- Rollback (only safe BEFORE deploy 2 ships; after that the screen writes this
-- column and dropping it loses real edits):
--   ALTER TABLE public.user_profiles DROP COLUMN can_see_financials;
--   then re-run this file's previous is_finance_plus body from 20260911000010
--   and the enforce_profile_field_locks body from 20260910000002.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS can_see_financials boolean NOT NULL DEFAULT false;

-- Backfill from the grant ticks so nobody loses the access they have today.
UPDATE public.user_profiles p
SET can_see_financials = true
WHERE NOT p.can_see_financials
  AND EXISTS (
    SELECT 1 FROM public.user_city_grants g
    WHERE g.user_id = p.id AND g.can_see_financials
  );

CREATE OR REPLACE FUNCTION public.is_finance_plus()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.is_active IS DISTINCT FROM false
          AND (
            -- The new home of the flag.
            p.can_see_financials
            -- The old home. Read until deploy 3 drops the column, so that a
            -- half-deployed state cannot take anyone's access away.
            OR EXISTS (
              SELECT 1 FROM public.user_city_grants g
              WHERE g.user_id = p.id AND g.can_see_financials
            )
          )
        )
      )
  );
$function$;

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

    -- Money is a super admin's call, on anyone's row including the editor's
    -- own. Without this line an Approver could tick their own financials,
    -- because the UPDATE policy on user_profiles lets anyone edit their own
    -- row and lets any admin edit anyone's.
    IF NOT public.is_super_admin()
       AND NEW.can_see_financials IS DISTINCT FROM OLD.can_see_financials THEN
      RAISE EXCEPTION 'Only a super admin can change who sees financials.'
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
     OR NEW.can_see_financials IS DISTINCT FROM OLD.can_see_financials
     OR NEW.id             IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only an admin can change a profile''s access, cities or email.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
