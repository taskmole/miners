-- Fix migrate_anonymous_user: cast types correctly + close auth bypass.
--
-- Three bugs in the prior version:
--   1. Function declared text params but most target tables use uuid columns.
--      Postgres aborted with 42883 "operator does not exist: uuid = text".
--      Anonymous data never re-tagged on login.
--   2. Function accepted auth_id as a parameter and trusted it. With
--      SECURITY DEFINER the caller could pass any auth UUID and absorb
--      another user's anonymous data into their own account.
--   3. Listed tables that did not match live schema: list_items has no
--      created_by (ownership flows via list_id -> lists.created_by) and
--      point_categories does not exist.
--
-- New shape: single-argument function. Caller identity comes from
-- auth.uid() which is the only trusted source.

DROP FUNCTION IF EXISTS public.migrate_anonymous_user(text, text);
DROP FUNCTION IF EXISTS public.migrate_anonymous_user(text);

CREATE OR REPLACE FUNCTION public.migrate_anonymous_user(anon_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_uuid uuid := auth.uid();
  anon_uuid   uuid := anon_id::uuid;
  caller_text text;
BEGIN
  IF caller_uuid IS NULL THEN
    RAISE EXCEPTION 'migrate_anonymous_user requires an authenticated caller';
  END IF;
  caller_text := caller_uuid::text;

  -- text columns
  UPDATE public.drawn_features
    SET user_id = caller_text, created_by = caller_text
    WHERE user_id = anon_id;

  -- uuid columns
  UPDATE public.pitches      SET created_by = caller_uuid WHERE created_by = anon_uuid;
  UPDATE public.lists        SET created_by = caller_uuid WHERE created_by = anon_uuid;
  UPDATE public.hidden_pois  SET user_id    = caller_uuid WHERE user_id    = anon_uuid;
  UPDATE public.comments     SET created_by = caller_uuid WHERE created_by = anon_uuid;
  UPDATE public.activity_log SET user_id    = caller_uuid WHERE user_id    = anon_uuid;
END;
$$;
