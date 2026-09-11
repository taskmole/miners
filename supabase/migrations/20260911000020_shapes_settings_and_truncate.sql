-- ===========================================
-- MIGRATION: Map shapes get real owners, the settings table stops being public
-- ===========================================
-- Stage 5, the last of the set. Ships with the code deploy that takes the
-- owner's id from the verified session in all three drawn-features methods and
-- that sends a signed-in request for the scouting defaults.
--
-- Nobody uses the drawing tool and drawn_features holds zero rows, which is
-- the reason to do this properly now rather than a reason to put it off:
-- nothing can be orphaned by any of it.
-- ===========================================

-- -------------------------------------------------------------------------
-- 1. Drop the open policy on drawn_features
-- -------------------------------------------------------------------------
--
-- "Allow all operations on drawn_features" is ALL / USING (true) /
-- WITH CHECK (true). It sits alongside four correct owner-or-admin policies,
-- and policies are OR'd together, so the open one wins and the good four have
-- never once applied. They start working the moment it goes.
--
-- It was deliberately left in place by 20260911000017, because the route still
-- took user_id from the query string and the browser's copy of that id can be
-- a stale local value, so the owner policies would have started refusing
-- saves. That route change is in the deploy this migration ships with.

DROP POLICY IF EXISTS "Allow all operations on drawn_features" ON public.drawn_features;

-- -------------------------------------------------------------------------
-- 2. update_drawn_feature_metadata: check who is asking
-- -------------------------------------------------------------------------
--
-- SECURITY DEFINER, so it ignores row security, and today it checks nothing at
-- all: any signed-in person can rewrite any shape's name, colour, tags, link
-- and attachments by naming its id. 20260911000017 took the grant off the
-- logged-out role; this closes the other half.
--
-- Three specifics, because the live function is not what the repo file says it
-- is and each one is easy to get wrong:
--
--   a. The check is keyed on user_id, not created_by. They are two different
--      columns and only user_id decides who owns a shape. created_by is an
--      author stamp.
--
--   b. The function currently overwrites created_by on every single save with
--      whatever the browser sent. It is now set once, when it is empty, and
--      left alone afterwards.
--
--   c. It REFUSES rather than quietly updating nothing. Once the open policy
--      above is gone this function is the only gate there is, and a silent
--      no-op would show "saved" on a shape that was not saved. The route turns
--      42501 into a plain "You can only change your own shapes."
--
-- Written against the signature that is really in production, whose
-- address-coords argument is double precision[]. The repo's 20260501000001
-- declares jsonb there; replacing that signature would create a second
-- function and leave the live one untouched.

CREATE OR REPLACE FUNCTION public.update_drawn_feature_metadata(
  feature_id text,
  feature_name text DEFAULT NULL::text,
  feature_color text DEFAULT NULL::text,
  feature_tags text[] DEFAULT NULL::text[],
  feature_link text DEFAULT NULL::text,
  feature_category_id text DEFAULT NULL::text,
  feature_address text DEFAULT NULL::text,
  feature_address_coords double precision[] DEFAULT NULL::double precision[],
  feature_created_by text DEFAULT NULL::text,
  feature_attachments jsonb DEFAULT NULL::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  owner_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_drawn_feature_metadata requires an authenticated caller'
      USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO owner_id FROM public.drawn_features WHERE id = feature_id;

  -- Told apart on purpose. A shape that is not there is not the same answer as
  -- a shape somebody else owns, and the route says different things about them.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such shape.' USING ERRCODE = 'P0002';
  END IF;

  IF owner_id IS DISTINCT FROM auth.uid()::text AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'That shape belongs to somebody else.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.drawn_features SET
    name = feature_name,
    color = feature_color,
    tags = feature_tags,
    link = feature_link,
    category_id = feature_category_id,
    address = feature_address,
    address_coords = feature_address_coords,
    -- Set once, then left alone. Overwriting it on every save meant an admin
    -- editing somebody else's shape silently became its author.
    created_by = COALESCE(NULLIF(created_by, ''), feature_created_by),
    attachments = feature_attachments,
    updated_at = now()
  WHERE id = feature_id;
END;
$function$;

COMMENT ON FUNCTION public.update_drawn_feature_metadata(
  text, text, text, text[], text, text, text, double precision[], text, jsonb
) IS
  'Updates one map shape''s details. Refuses a shape the caller does not own '
  'unless they are an admin, and records the author only on the first save.';

-- -------------------------------------------------------------------------
-- 3. app_settings stops being readable without a login
-- -------------------------------------------------------------------------
--
-- "Anyone can view app_settings" is USING (true) granted to PUBLIC, and the
-- settings endpoint asked for no sign-in either, so it was the one endpoint in
-- the whole app that answered a request from a stranger. Writing was already
-- admin-only; only the read changes.

DROP POLICY IF EXISTS "Anyone can view app_settings" ON public.app_settings;

CREATE POLICY "Signed-in users can view app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

-- -------------------------------------------------------------------------
-- 4. The OpenAI key slot leaves the database
-- -------------------------------------------------------------------------
--
-- A login gate is not enough on its own for a secret: it stops strangers, but
-- all 15 colleagues could still read the key through the same endpoint. The
-- row holds an empty key today and NOTHING in the codebase reads or writes it,
-- so the honest fix is to delete it and keep that key where the rest of the
-- secrets live, in the hosting environment. The endpoint also now serves only
-- a named list of settings, so a future slot is not readable by accident.
--
-- Undo, should the row ever be wanted back:
--   INSERT INTO public.app_settings (key, value) VALUES
--     ('openai_api_key',
--      '{"key": "", "model": "gpt-4o-mini", "enabled": false, "zdr_enabled": true}'::jsonb);

DELETE FROM public.app_settings WHERE key = 'openai_api_key';

-- -------------------------------------------------------------------------
-- 5. The logged-out role loses the permission to empty tables
-- -------------------------------------------------------------------------
--
-- anon holds TRUNCATE on 41 of the 44 tables. TRUNCATE ignores every access
-- rule, so one statement would empty a table whatever its policies say. There
-- is no way to reach that command today: the data API does not offer it, the
-- publishable key is not a database password, and no reachable function
-- exposes one. It is removed because nothing legitimate uses it, not because
-- anything can call it.
--
-- TRUNCATE AND NOTHING ELSE. This is the one step in the whole plan where a
-- slip of the hand does visible damage: a broader revoke would cut the
-- logged-out role off from the reference data (cities, categories, scoring
-- weights) and from the activity feed, which the browser subscribes to
-- directly. Rehearsed: anon's 41 SELECT grants are all still there afterwards.
--
-- IT REACHES 38 OF THE 41, AND THE THREE IT MISSES ARE THE SAME THREE AS EVER.
-- spatial_ref_sys, geography_columns and geometry_columns belong to
-- supabase_admin, and migrations run as postgres, which is not the grantor. A
-- revoke on those succeeds with no error and changes nothing, which is the
-- default failure mode here and the reason the count is checked rather than
-- assumed. They are PostGIS reference objects and are covered by the Supabase
-- support request that stage 0 is about.

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;

-- Undo:
--   CREATE POLICY "Allow all operations on drawn_features"
--     ON public.drawn_features FOR ALL USING (true) WITH CHECK (true);
--   DROP POLICY "Signed-in users can view app_settings" ON public.app_settings;
--   CREATE POLICY "Anyone can view app_settings"
--     ON public.app_settings FOR SELECT USING (true);
--   GRANT TRUNCATE ON ALL TABLES IN SCHEMA public TO anon;
--   Then re-create update_drawn_feature_metadata without the ownership check.
