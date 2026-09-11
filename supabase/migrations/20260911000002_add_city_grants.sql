-- Step 1 of the per-city permissions migration: add the storage, change
-- nothing.
--
-- After this migration every helper function still reads `user_profiles.role`
-- and every policy still behaves exactly as it did. The new table is written
-- but not yet read. Step 2 teaches the helpers to read it.
--
-- What a person is, in the new model:
--
--   is_super_admin   one on/off switch. Everything, everywhere.
--   a grant per city a level (view / contribute / approve) and an independent
--                    "can see financials" tick. No row means no access, which
--                    is why the screens render "No access" as a visible choice
--                    rather than an empty state.
--
-- Levels are cumulative on the map-access ladder only:
--   view       see the city on the map
--   contribute + submit pitches, request properties, comment, draw, save lists
--   approve    + the admin dashboard, approve and reject, the decision emails
--
-- Contribute is NOT a weaker Approve. It is a different thing that happens to
-- sit between the two. Step 2 depends on that distinction.
--
-- Undo, in this order:
--   DROP TRIGGER sync_legacy_role_from_flag ON public.user_profiles;
--   DROP TRIGGER sync_legacy_role_from_grants ON public.user_city_grants;
--   DROP FUNCTION public.sync_legacy_role_for_user(uuid);
--   DROP FUNCTION public.legacy_role_for_user(uuid);
--   DROP TABLE public.user_city_grants;
--   ALTER TABLE public.user_profiles DROP COLUMN is_super_admin;
--   and restore handle_new_user() from 20260907000001_repair_handle_new_user.sql


-- ---------------------------------------------------------------------------
-- 1. The Super Admin switch
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_super_admin IS
  'Everything everywhere, plus users, settings, scoring rules and cities. '
  'Replaces the super_admin role. Only a super admin may set it.';

-- Copy today's truth across. The role column stays authoritative until step 3;
-- this is the flag catching up with it, not replacing it yet.
UPDATE public.user_profiles
SET is_super_admin = true
WHERE role = 'super_admin' AND is_super_admin IS DISTINCT FROM true;


-- ---------------------------------------------------------------------------
-- 2. Pin the new flag against self-promotion, NOW, not at step 3
-- ---------------------------------------------------------------------------
--
-- The plan rewrites enforce_profile_field_locks() at step 3. That is one step
-- too late. Step 2 redefines is_super_admin() to read this column, so from
-- step 2 onward an unpinned column is a one-line self-promotion:
--
--   UPDATE user_profiles SET is_super_admin = true WHERE id = auth.uid();
--
-- straight through the public API, which is the exact hole closed on
-- 2026-09-10 for the role column. Pinning a column nobody writes yet costs
-- nothing, so it goes in here where the column is born.
--
-- Everything else about the guard is unchanged; step 3 rewrites the body
-- properly once the role column stops being the source of truth.

CREATE OR REPLACE FUNCTION public.enforce_profile_field_locks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
       AND (OLD.role = 'super_admin' OR NEW.role = 'super_admin'
         OR OLD.is_super_admin OR NEW.is_super_admin)
       AND (NEW.role              IS DISTINCT FROM OLD.role
         OR NEW.is_super_admin    IS DISTINCT FROM OLD.is_super_admin
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
     OR NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
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
$function$;


-- ---------------------------------------------------------------------------
-- 3. The grants table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_city_grants (
  user_id            uuid    NOT NULL,
  city_id            text    NOT NULL,
  level              text    NOT NULL,
  can_see_financials boolean NOT NULL DEFAULT false,
  receives_alerts    boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (user_id, city_id),

  CONSTRAINT user_city_grants_level_check
    CHECK (level IN ('view', 'contribute', 'approve')),

  -- ON UPDATE CASCADE is not decoration here, it is the difference between a
  -- working invite and a silent lockout.
  --
  -- When an invited person first signs in, handle_new_user() runs
  --   UPDATE user_profiles SET id = NEW.id WHERE id = <the placeholder id>
  -- rewriting the primary key. All seven pre-existing foreign keys to
  -- user_profiles already cascade on update, which is why invites work today.
  -- Grants are the first thing that exists BEFORE first login, so without the
  -- cascade that UPDATE throws a foreign key violation - and handle_new_user()
  -- ends with EXCEPTION WHEN OTHERS ... RAISE WARNING, which swallows it. The
  -- person then signs in with no profile matching their auth id and sits on
  -- "Account Pending" forever, with nothing anyone would think to look at.
  CONSTRAINT user_city_grants_user_fk
    FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
    ON UPDATE CASCADE ON DELETE CASCADE,

  CONSTRAINT user_city_grants_city_fk
    FOREIGN KEY (city_id) REFERENCES public.cities(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
);

COMMENT ON TABLE public.user_city_grants IS
  'What one person may do in one city. No row means no access to that city.';
COMMENT ON COLUMN public.user_city_grants.receives_alerts IS
  'Property alert emails for this city. Replaces the single global '
  'user_profiles.receives_scraper_emails switch: the consent now sits next to '
  'the scope instead of two screens away.';

CREATE INDEX IF NOT EXISTS user_city_grants_city_idx
  ON public.user_city_grants (city_id);

-- Keep updated_at honest without a bespoke trigger per column.
CREATE OR REPLACE FUNCTION public.touch_user_city_grants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS touch_user_city_grants ON public.user_city_grants;
CREATE TRIGGER touch_user_city_grants
  BEFORE UPDATE ON public.user_city_grants
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_city_grants();


-- ---------------------------------------------------------------------------
-- 4. Lock it down in the same migration that creates it
-- ---------------------------------------------------------------------------
--
-- This is not a follow-up. The moment step 2's helpers read this table, a
-- writable grants table is the self-promotion hole of 2026-09-10 reopened
-- under a new name: insert yourself an 'approve' row and you have the admin
-- dashboard.
--
-- On recursion: is_admin() and is_super_admin() are SECURITY DEFINER and owned
-- by postgres, which also owns this table, and the table does not FORCE row
-- security. A definer function therefore reads user_city_grants with RLS
-- bypassed, so calling is_admin() from this table's own policy terminates
-- rather than recursing. This is the same shape as user_profiles' existing
-- policies, which call is_admin() while is_admin() reads user_profiles.

ALTER TABLE public.user_city_grants ENABLE ROW LEVEL SECURITY;

-- Signed-out visitors have no business here at all.
REVOKE ALL ON public.user_city_grants FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_city_grants TO authenticated;
GRANT ALL ON public.user_city_grants TO service_role;

-- Read: your own access, plus whoever runs the user screen. An Approver has to
-- see other people's grants to render the user list at all.
DROP POLICY IF EXISTS "Own grants or admins see all" ON public.user_city_grants;
CREATE POLICY "Own grants or admins see all"
  ON public.user_city_grants FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Write: super admins only, full stop. An Approver inviting somebody into
-- their own city goes through the SECURITY DEFINER invite_contributor()
-- function added in step 6, never through a loosened policy here. Writing a
-- policy that has to express "insert only Contribute, only in my cities, only
-- for a brand new person" is exactly where self-promotion holes get born.
DROP POLICY IF EXISTS "Only super admins can insert grants" ON public.user_city_grants;
CREATE POLICY "Only super admins can insert grants"
  ON public.user_city_grants FOR INSERT
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Only super admins can update grants" ON public.user_city_grants;
CREATE POLICY "Only super admins can update grants"
  ON public.user_city_grants FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Only super admins can delete grants" ON public.user_city_grants;
CREATE POLICY "Only super admins can delete grants"
  ON public.user_city_grants FOR DELETE
  USING (public.is_super_admin());


-- ---------------------------------------------------------------------------
-- 5. Self-signups get nothing
-- ---------------------------------------------------------------------------
--
-- handle_new_user() is where the default for a self-signup actually lives, and
-- it currently hands out every enabled city:
--   city_ids = (SELECT id FROM cities WHERE enabled = true)
-- Under the new model no grants means no access, so a self-signup gets no
-- grants and no cities, and stays inactive until somebody lets them in.
--
-- Note the catch-all exception handler at the bottom: anything wrong in here
-- fails quietly with a warning, so this function is never the place to learn
-- that something is broken. It is unchanged, because a failed sign-up locks a
-- person out entirely while a missing profile can be fixed by hand.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_existing_id uuid;
BEGIN
  v_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');

  -- Did an admin pre-configure a profile for this email?
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.user_profiles
    WHERE LOWER(email) = LOWER(v_email)
      AND id != NEW.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Claim it: point the invited profile at the real auth user, keeping
      -- the role, cities, grants and team the admin already set. The grants
      -- follow the id rewrite because user_city_grants cascades on update.
      UPDATE public.user_profiles
      SET id = NEW.id,
          display_name = COALESCE(display_name,
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name'),
          email = v_email,
          updated_at = now()
      WHERE id = v_existing_id;

      RETURN NEW;
    END IF;
  END IF;

  -- Nobody invited them: create the profile with no access to anything and
  -- inactive until an admin lets them in. No grant rows are created here on
  -- purpose - "no row" is how the new model spells "no access".
  INSERT INTO public.user_profiles (
    id,
    role,
    display_name,
    email,
    city_ids,
    is_active,
    is_super_admin
  ) VALUES (
    NEW.id,
    'franchisee',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    v_email,
    ARRAY[]::text[],
    false,
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block sign-up because profile creation failed. An admin can always
  -- fix the profile afterwards; a failed signup locks the person out entirely.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 6. Backfill: copy TODAY, not the destination
-- ---------------------------------------------------------------------------
--
--   role today        backfilled as
--   ----------------  --------------------------------------------------
--   super_admin       flag on, Approve + financials everywhere
--   head_office_exec  Approve + financials everywhere
--   finance_reviewer  View + financials everywhere (nobody holds this role)
--   area_coordinator  View, no financials
--   franchisee        Contribute, no financials
--
-- Every city, not the person's assigned city_ids, because today a role is
-- global: a franchisee assigned only Prague can still act on a Madrid property.
-- Copying city_ids here would be step 4 arriving early, disguised as a
-- migration, and then a migration bug and an intended restriction look alike.
--
-- area_coordinator is backfilled as View even though the destination table in
-- the plan says Approve. Same reason: backfill preserves today, step 4 moves
-- people.
--
-- The financials ticks matter. Without them super admins and head office
-- silently lose revenue access the moment step 3 flips is_finance_plus().
--
-- Cities: madrid, barcelona and prague. NOT seville, which was added to the
-- cities table in the previous migration and has never existed anywhere a role
-- could apply to. Granting everyone a city that has no data, no pipeline entry
-- and no users would be inventing access, not preserving it. Seville gets
-- granted deliberately, by hand, when it is real.

INSERT INTO public.user_city_grants (user_id, city_id, level, can_see_financials, receives_alerts)
SELECT
  up.id,
  c.id,
  CASE up.role
    WHEN 'super_admin'      THEN 'approve'
    WHEN 'head_office_exec' THEN 'approve'
    WHEN 'finance_reviewer' THEN 'view'
    WHEN 'area_coordinator' THEN 'view'
    ELSE                         'contribute'
  END,
  up.role IN ('super_admin', 'head_office_exec', 'finance_reviewer'),
  -- receives_alerts is the one field backfilled from city_ids rather than from
  -- the role, because the digest is the only thing city_ids genuinely drives
  -- today. Copy it faithfully: subscribed AND this city is one of theirs.
  up.receives_scraper_emails AND c.id = ANY(COALESCE(up.city_ids, ARRAY[]::text[]))
FROM public.user_profiles up
CROSS JOIN (VALUES ('madrid'), ('barcelona'), ('prague')) AS c(id)
ON CONFLICT (user_id, city_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 7. The dual-write trigger, created AFTER the backfill
-- ---------------------------------------------------------------------------
--
-- Steps 1 to 3 roll back cleanly by reverting one deploy, but only while the
-- old role column stays truthful. So the grants keep it in sync.
--
-- This lives in a trigger rather than in the admin screen because a
-- screen-level version drifts the moment a second write path exists, and step
-- 6 adds exactly that with the Approver invite form. A trigger is the same few
-- lines and cannot be bypassed.
--
-- It is created here, after the bulk insert above, and not one line earlier.
-- The derived mapping is lossy - the area_coordinator is backfilled as View,
-- which derives 'franchisee' - so a trigger present during the backfill would
-- overwrite their real role on the spot. That corrupts the old-role half of
-- step 2's "old OR new", which is the entire rollback mechanism, before it is
-- ever needed.

CREATE OR REPLACE FUNCTION public.legacy_role_for_user(p_user uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT is_super_admin FROM public.user_profiles WHERE id = p_user)
      THEN 'super_admin'
    WHEN EXISTS (
      SELECT 1 FROM public.user_city_grants
      WHERE user_id = p_user AND level = 'approve'
    ) THEN 'head_office_exec'
    ELSE 'franchisee'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_legacy_role_for_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_derived text;
BEGIN
  v_derived := public.legacy_role_for_user(p_user);

  -- A no-op when it already agrees. Without this every grant edit writes a
  -- row on user_profiles, which fires enforce_profile_field_locks() for no
  -- reason and bumps updated_at on a profile nobody touched.
  UPDATE public.user_profiles
  SET role = v_derived, updated_at = now()
  WHERE id = p_user
    AND role IS DISTINCT FROM v_derived;
END;
$function$;

-- SECURITY DEFINER on the two functions above is load bearing, not habit. The
-- UPDATE they run fires enforce_profile_field_locks() on user_profiles, and
-- that guard's first line is "IF current_user <> 'authenticated' THEN RETURN".
-- Running as the owner makes current_user 'postgres', so the guard steps aside
-- instead of two triggers arguing across two tables at 9pm.
--
-- Which is exactly why they must not be callable from outside.
--
-- Postgres grants EXECUTE to PUBLIC on a new function by default, and this
-- database has no blanket revoke (every existing SECURITY DEFINER function
-- here carries `=X/postgres`). Both functions return a non-trigger type and
-- live in `public`, so PostgREST would publish them at /rest/v1/rpc/... to
-- anon and authenticated alike. That hands a signed-out visitor two things:
--
--   legacy_role_for_user      probe whether any uuid is super admin
--   sync_legacy_role_for_user rewrite anybody's role, running as postgres,
--                             straight past enforce_profile_field_locks
--
-- The second is the worse one. It would let anyone revert the inactive
-- area_coordinator to 'franchisee' and undo any hand-made role edit that
-- disagrees with the grants.
--
-- The trigger functions below need no revoke: PostgREST does not expose a
-- function returning `trigger`. The signatures here are spelled out in full
-- on purpose, because a revoke that misses the signature leaves the hole open
-- while looking closed.
REVOKE EXECUTE ON FUNCTION public.legacy_role_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_legacy_role_for_user(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_legacy_role_from_grants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_legacy_role_for_user(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS sync_legacy_role_from_grants ON public.user_city_grants;
CREATE TRIGGER sync_legacy_role_from_grants
  AFTER INSERT OR UPDATE OR DELETE ON public.user_city_grants
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_role_from_grants();

-- The Super Admin switch is the other half of the derivation and it lives on
-- user_profiles, so flipping it has to move the legacy role too. Done inline
-- on NEW rather than with a second UPDATE, so there is no recursion to guard
-- against. The trigger name sorts after 'enforce_profile_field_locks', and
-- Postgres fires same-timing triggers in name order, so the guard has already
-- had its say by the time this runs.
CREATE OR REPLACE FUNCTION public.sync_legacy_role_from_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_super_admin THEN
    NEW.role := 'super_admin';
  ELSIF OLD.is_super_admin AND NOT NEW.is_super_admin THEN
    -- Switched off: fall back to what their grants say they are.
    NEW.role := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.user_city_grants
        WHERE user_id = NEW.id AND level = 'approve'
      ) THEN 'head_office_exec'
      ELSE 'franchisee'
    END;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_legacy_role_from_flag ON public.user_profiles;
CREATE TRIGGER sync_legacy_role_from_flag
  BEFORE UPDATE OF is_super_admin ON public.user_profiles
  FOR EACH ROW
  WHEN (NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin)
  EXECUTE FUNCTION public.sync_legacy_role_from_flag();
