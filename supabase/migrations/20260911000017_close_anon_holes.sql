-- ===========================================
-- MIGRATION: Nothing is open to the public, and nobody inherits a colleague
-- ===========================================
-- Two holes, both verified against production before this was written.
--
-- HOLE 1: poi_attachments is open to everyone, logged out included.
--
--   The table carries one policy, "Allow all operations on poi_attachments",
--   ALL / public / USING true / WITH CHECK true, and it is the ONLY policy on
--   the table. anon also holds every grant on it. So a request carrying the
--   publishable key that ships in every page, with no session at all, can read
--   every attachment and delete every attachment. Tested, not inferred.
--
--   drawn_features is in the same state: the same open policy sits alongside
--   four correct owner-or-admin policies, and policies are OR'd, so the open
--   one wins and the good ones never apply. Its anon grants are revoked here
--   too. The open policy itself is NOT dropped in this migration: the
--   drawn-features route still takes user_id from the query string, so the
--   owner policies would start refusing saves the moment the browser's local
--   id is stale. That is a route change, and it ships separately.
--
-- HOLE 2: migrate_anonymous_user hands you a colleague's work.
--
--   It re-tags an anonymous browser session's rows to the signed-in caller.
--   The destination is already forced to auth.uid(), so nobody can push work
--   onto somebody else. What is missing is the other half: it never checks
--   that the id being migrated FROM is actually an anonymous one. Pass a
--   colleague's uuid and their drawings, pitches, lists, hidden places,
--   comments and activity become yours, and theirs are gone. SECURITY DEFINER,
--   so row security does not stop it, and it returns void, so it is silent.
--
--   The fix is one existence check. An anonymous id is a value from
--   crypto.randomUUID() in the browser and never appears in user_profiles, so
--   "is this id a real person" is exactly the right question, and the only
--   caller (migrateAnonymousData in src/lib/supabaseHelpers.ts) passes local
--   storage ids that can never match a profile.
--
-- ORDER OF DEPLOYMENT MATTERS. The new INSERT policy on poi_attachments
-- requires uploaded_by to be the signed-in user. The browser used to choose
-- that value, and getCurrentUserId() falls back to a random local id, so this
-- migration must not reach production before the route change that stamps
-- uploaded_by server-side. Code first, then this.
-- ===========================================

-- -------------------------------------------------------------------------
-- 1. poi_attachments: replace the open policy with four real ones
-- -------------------------------------------------------------------------
--
-- The access rule, confirmed with Jaro: any signed-in Miners person can see
-- attachments on any property, because that is how teams work today. Only the
-- person who uploaded a file, or an admin, may change or remove it.
--
-- Note uploaded_by is a uuid, so it compares to auth.uid() directly. The
-- drawn_features policies cast with auth.uid()::text because user_id there is
-- text. Copying that cast to this table is a type error, not a style choice.

DROP POLICY IF EXISTS "Allow all operations on poi_attachments" ON public.poi_attachments;

CREATE POLICY "Signed-in users can view attachments"
  ON public.poi_attachments FOR SELECT
  USING (public.is_authenticated());

CREATE POLICY "Users can add their own attachments"
  ON public.poi_attachments FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

CREATE POLICY "Uploader or admin can update attachments"
  ON public.poi_attachments FOR UPDATE
  USING (uploaded_by = auth.uid() OR public.is_admin());

CREATE POLICY "Uploader or admin can delete attachments"
  ON public.poi_attachments FOR DELETE
  USING (uploaded_by = auth.uid() OR public.is_admin());

-- -------------------------------------------------------------------------
-- 2. Take the logged-out role off both tables entirely
-- -------------------------------------------------------------------------
--
-- There is no logged-out mode in this product. The landing page covers the
-- whole screen until sign-in and every /api/db/* route rejects a request with
-- no token, so nothing uses these grants. Revoking them means the tables stop
-- depending on row security alone to keep strangers out.
--
-- ALL rather than the four verbs: anon also held TRUNCATE on both, which would
-- have emptied either table in one statement.

REVOKE ALL ON public.poi_attachments FROM anon;
REVOKE ALL ON public.drawn_features  FROM anon;

-- -------------------------------------------------------------------------
-- 3. migrate_anonymous_user: refuse to migrate a real person
-- -------------------------------------------------------------------------
--
-- Replaced against the signature that is actually in production, which takes
-- one argument. The repo's 20260501000001 declares a two-argument version that
-- does not exist there; writing this against the file would have created a
-- second function and left the live one untouched.
--
-- Everything below the new check is unchanged from production.

CREATE OR REPLACE FUNCTION public.migrate_anonymous_user(anon_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_uuid uuid := auth.uid();
  anon_uuid   uuid := anon_id::uuid;
  caller_text text;
BEGIN
  IF caller_uuid IS NULL THEN
    RAISE EXCEPTION 'migrate_anonymous_user requires an authenticated caller';
  END IF;
  caller_text := caller_uuid::text;

  -- The whole point of this change. An anonymous id is a browser value that
  -- was never anybody's account, so it cannot be in user_profiles. An id that
  -- IS in there belongs to a colleague, and claiming it would move their work
  -- to the caller and leave them with nothing.
  --
  -- Checked before any UPDATE runs, so a refused call changes nothing at all
  -- rather than stopping halfway through six tables.
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = anon_uuid) THEN
    RAISE EXCEPTION 'That id belongs to a person, not an anonymous session.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.drawn_features
    SET user_id = caller_text, created_by = caller_text
    WHERE user_id = anon_id;

  UPDATE public.pitches      SET created_by = caller_uuid WHERE created_by = anon_uuid;
  UPDATE public.lists        SET created_by = caller_uuid WHERE created_by = anon_uuid;
  UPDATE public.hidden_pois  SET user_id    = caller_uuid WHERE user_id    = anon_uuid;
  UPDATE public.comments     SET created_by = caller_uuid WHERE created_by = anon_uuid;
  UPDATE public.activity_log SET user_id    = caller_uuid WHERE user_id    = anon_uuid;
END;
$function$;

-- Same footer as invite_contributor() in 20260911000007, and it is the step
-- that keeps getting missed. migrate_anonymous_user was left on the default
-- EXECUTE grant, which is PUBLIC, plus an explicit grant to anon on top. Its
-- first line rejects a caller with no auth.uid(), so this takes nothing away
-- that worked; it means a logged-out caller is turned back at the door rather
-- than one line inside the function.
REVOKE EXECUTE ON FUNCTION public.migrate_anonymous_user(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.migrate_anonymous_user(text) TO authenticated;

COMMENT ON FUNCTION public.migrate_anonymous_user(text) IS
  'Re-tags one anonymous browser session''s rows to the signed-in caller. '
  'Refuses an id that belongs to a real profile, which would otherwise move a '
  'colleague''s work to the caller and leave them with nothing.';

-- -------------------------------------------------------------------------
-- 4. The shape-details function is executable by strangers
-- -------------------------------------------------------------------------
--
-- update_drawn_feature_metadata is SECURITY DEFINER, so it ignores row
-- security, and it holds the same default PUBLIC grant plus an explicit anon
-- grant. Unlike migrate_anonymous_user it has no auth check inside it at all,
-- so today a request with no session can rewrite any shape's name, colour,
-- tags, link or attachments. Taking the grant away closes that from outside.
--
-- The other half of this hole, that any SIGNED-IN person can rewrite anyone
-- else's shape, needs an ownership check inside the function, and that has to
-- ship alongside the drawn-features route change or saving breaks. It is not
-- in this migration. Only the stranger is locked out here.
--
-- Written against the signature that is really in production, whose
-- address-coords argument is double precision[]. The repo's 20260501000001
-- declares jsonb there; naming that signature would revoke a grant on a
-- function that does not exist and leave the live one untouched.
REVOKE EXECUTE ON FUNCTION public.update_drawn_feature_metadata(
  text, text, text, text[], text, text, text, double precision[], text, jsonb
) FROM PUBLIC, anon;

-- -------------------------------------------------------------------------
-- 5. insert_miners_place lets a stranger inject fake properties
-- -------------------------------------------------------------------------
--
-- Same shape as the two functions above: SECURITY DEFINER, so it ignores row
-- security, and it holds the default PUBLIC grant plus an explicit anon grant
-- on top. It writes a new row into the properties table, so today a request
-- with no session at all can add made-up places alongside the 3,983 real ones.
--
-- Confirmed against production: the function is owned by postgres, so this
-- revoke really takes (unlike one aimed at a supabase_admin-owned object,
-- which succeeds silently and changes nothing), and it already carries a
-- separate explicit grant to authenticated, so signed-in people are unaffected.
-- Its only caller is a server route that already runs signed in.

REVOKE EXECUTE ON FUNCTION public.insert_miners_place(
  text, text, text, double precision, double precision
) FROM PUBLIC, anon;

-- -------------------------------------------------------------------------
-- 6. Cosmetic: the two existing attachments still say "Guest"
-- -------------------------------------------------------------------------
--
-- The route fix stamps the real display name from the verified session, but
-- only on files uploaded from now on. Both rows already in the table were
-- uploaded by a real person whose profile says "Jaro Zapletal", so correct
-- them here rather than leaving two files permanently credited to nobody.
-- Matched by uploaded_by against user_profiles so no name is hardcoded.

UPDATE public.poi_attachments a
   SET uploaded_by_name = u.display_name
  FROM public.user_profiles u
 WHERE u.id = a.uploaded_by
   AND a.uploaded_by_name = 'Guest'
   AND u.display_name IS NOT NULL;

-- Undo, should it ever be needed:
--   CREATE POLICY "Allow all operations on poi_attachments"
--     ON public.poi_attachments FOR ALL USING (true) WITH CHECK (true);
--   DROP POLICY "Signed-in users can view attachments" ON public.poi_attachments;
--   DROP POLICY "Users can add their own attachments" ON public.poi_attachments;
--   DROP POLICY "Uploader or admin can update attachments" ON public.poi_attachments;
--   DROP POLICY "Uploader or admin can delete attachments" ON public.poi_attachments;
--   GRANT INSERT, SELECT, UPDATE, DELETE ON public.poi_attachments TO anon;
--   GRANT INSERT, SELECT, UPDATE, DELETE ON public.drawn_features  TO anon;
--   GRANT EXECUTE ON FUNCTION public.migrate_anonymous_user(text) TO PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.update_drawn_feature_metadata(
--     text, text, text, text[], text, text, text, double precision[], text, jsonb
--   ) TO PUBLIC, anon;
--   Then re-create migrate_anonymous_user without the user_profiles check.
--   GRANT EXECUTE ON FUNCTION public.insert_miners_place(
--     text, text, text, double precision, double precision
--   ) TO PUBLIC, anon;
