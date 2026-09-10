-- ===========================================
-- MIGRATION: Nobody promotes themselves
-- ===========================================
-- The hole this closes, verified against production before writing it:
--
--   The UPDATE policy on user_profiles is
--     USING ((id = auth.uid()) OR is_admin())
--   with no WITH CHECK, so the USING expression doubles as the check and a
--   franchisee updating their own row satisfies it both before and after the
--   change. Nothing said the role column had to stay put, and `authenticated`
--   holds an UPDATE grant on every column, so:
--
--     UPDATE user_profiles SET role = 'super_admin' WHERE id = <self>
--
--   succeeded when run as a franchisee. That is one call away from the browser:
--   the app's own PATCH /api/db/user-profiles forwards `role` untouched and
--   leaves the decision to RLS. Any of the eight franchisee accounts could have
--   granted itself every permission in the product.
--
-- Why a trigger and not a better policy: RLS WITH CHECK cannot see the row as
-- it was, so "this column must not change" is simply not expressible there. A
-- BEFORE UPDATE trigger is the only primitive that can compare old with new,
-- and it applies to every route in - the app, the API, a direct call with the
-- public key - because the database is the one gate nobody can go around.
--
-- Who is policed: only callers arriving as the `authenticated` role, which is
-- how PostgREST runs a logged-in user's request. Deliberately NOT keyed off
-- auth.uid() alone. handle_new_user() claims an invited profile by rewriting
-- its primary key during sign-up, and it runs as its own owner; policing by
-- role rather than by "is somebody logged in" keeps that path, the service
-- role, and one-off migrations working no matter what the JWT looks like.
-- ===========================================

CREATE OR REPLACE FUNCTION public.enforce_profile_field_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Sign-up, the service role and migrations are not the threat model.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    -- Admins run the user screen, so they may change roles, access and cities.
    -- What they may not do is reach a super admin. Two ways that matters, and
    -- both are closed here rather than only the obvious one:
    --
    --   1. Minting their own kind. Without this, head office (which passes
    --      is_admin()) could promote anyone, themselves included, and the
    --      difference between the two levels would be cosmetic.
    --   2. Switching a super admin off. is_active = false puts an account
    --      behind the "account pending" screen, so head office could lock the
    --      founders out of their own product without touching a single role.
    --
    -- Anything that is not permission-shaped - a display name, a team, email
    -- preferences - stays editable, on a super admin's row as much as anyone's.
    IF NOT public.is_super_admin()
       AND (OLD.role = 'super_admin' OR NEW.role = 'super_admin')
       AND (NEW.role              IS DISTINCT FROM OLD.role
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
  -- IS DISTINCT FROM, never <>: can_approve_level is NULL for every user
  -- today, and NULL <> NULL is NULL, which would wave the change straight
  -- through.
  --
  -- email and id are locked alongside the obvious three. Sign-up matches an
  -- invited profile by email address, so an editable email lets someone point
  -- their row at a colleague's invitation; id is the row's identity and only
  -- the claim path has any business changing it.
  IF NEW.role              IS DISTINCT FROM OLD.role
     OR NEW.is_active      IS DISTINCT FROM OLD.is_active
     OR NEW.city_ids       IS DISTINCT FROM OLD.city_ids
     OR NEW.can_approve_level IS DISTINCT FROM OLD.can_approve_level
     OR NEW.email          IS DISTINCT FROM OLD.email
     OR NEW.id             IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only an admin can change a profile''s role, access, cities or email.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- 20260317000001 wrote a narrower guard for the same hole (role changes only,
-- and it let head office grant super_admin). It never reached production - the
-- table carried no triggers at all when this one was written - so it is
-- removed rather than left to fire alongside and confuse the next reader.
DROP TRIGGER IF EXISTS check_role_escalation ON public.user_profiles;
DROP FUNCTION IF EXISTS public.prevent_role_escalation();

DROP TRIGGER IF EXISTS enforce_profile_field_locks ON public.user_profiles;

CREATE TRIGGER enforce_profile_field_locks
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_field_locks();

-- Logged-out visitors have no business writing profiles at all. The RLS
-- policies already stop them (every one needs auth.uid()), so this takes away
-- a grant nothing uses: one less thing standing on RLS alone.
REVOKE UPDATE ON public.user_profiles FROM anon;

-- Undo, should it ever be needed:
--   DROP TRIGGER enforce_profile_field_locks ON public.user_profiles;
--   DROP FUNCTION public.enforce_profile_field_locks();
--   GRANT UPDATE ON public.user_profiles TO anon;
