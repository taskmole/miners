-- ===========================================
-- MIGRATION: Files belong to the person who uploaded them
-- ===========================================
-- Verified against production on 2026-10-26 before this was written.
--
-- THE HOLE. storage.objects carries one policy for this bucket,
-- "Signed-in users manage attachments", FOR ALL, TO authenticated, with
-- nothing but bucket_id = 'attachments' in it. So any signed-in person could
-- list, read, overwrite or delete every file in the bucket. On top of that,
-- the read-link check in src/app/api/db/attachments/route.ts (mayReadPath)
-- lets anyone open a file whose path is recorded on an attachment row or a
-- pitch, and nothing stopped someone writing a colleague's path into their
-- own row. That turned "recorded somewhere" into "readable by anyone who
-- types the path in".
--
-- THE FIX, in two halves.
--
--   1. Four policies instead of one. "Mine" means the file sits in my folder
--      (the first path segment is my user id) or I am its storage owner. The
--      second test is for the four older files whose folder is a random
--      browser id from before sign-in existed: their owner_id is still the
--      real uploader.
--        INSERT  own folder only.
--        UPDATE  mine, and it must stay in my folder.
--        DELETE  mine, or an admin.
--        SELECT  mine, or an admin, or the path is recorded on an attachment
--                row, or on a pitch I can see. This is mayReadPath moved into
--                the database. The pitch test is a subquery, so the caller's
--                own pitch rules ("mine, or in a city I may view") apply.
--
--   2. A trigger on poi_attachments so the "recorded on an attachment row"
--      way in cannot be forged: a new or changed storage_path must be empty,
--      in the caller's own folder, or a file the caller owns. Pitches get the
--      same check in 20261026000002.
--
-- HOW THE STORAGE SERVICE USES THESE (all as the caller, via the anon key plus
-- their JWT, from the server routes):
--   createSignedUploadUrl  checks INSERT. The upload itself then writes with
--                          owner_id set to whoever signed the link.
--   createSignedUrl        checks SELECT.
--   remove                 checks DELETE, and SELECT for its RETURNING.
-- The uploader and any admin pass all three. The attachments route deletes
-- the row first and the file second, so the file delete leans on "mine or
-- admin", which is exactly who may delete the row.
--
-- WHY objects.name IS WRITTEN OUT IN FULL. Inside the subqueries, a bare
-- "name" could bind to a column of poi_attachments or pitches instead of the
-- file. Spelling it objects.name rules that out.
--
-- PRE-FLIGHT (2026-10-26). 12 files in the bucket. Every path recorded on
-- poi_attachments (1) and on pitches.attachment_paths (5 across 3 pitches)
-- sits in the folder of the row's own uploader or owner, so nobody had used
-- the hole, and no existing row is affected by the trigger (unchanged paths
-- always pass).
--
-- Undo (paste as one block):
--   DROP TRIGGER IF EXISTS poi_attachments_path_must_be_mine ON public.poi_attachments;
--   DROP FUNCTION IF EXISTS public.enforce_attachment_path_ownership();
--   DROP POLICY IF EXISTS "Attachments: upload into own folder" ON storage.objects;
--   DROP POLICY IF EXISTS "Attachments: owner updates" ON storage.objects;
--   DROP POLICY IF EXISTS "Attachments: owner or admin deletes" ON storage.objects;
--   DROP POLICY IF EXISTS "Attachments: read own, shared or as admin" ON storage.objects;
--   CREATE POLICY "Signed-in users manage attachments" ON storage.objects FOR ALL
--     TO authenticated
--     USING (bucket_id = 'attachments') WITH CHECK (bucket_id = 'attachments');
-- ===========================================

BEGIN;

DROP POLICY IF EXISTS "Signed-in users manage attachments" ON storage.objects;

CREATE POLICY "Attachments: upload into own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Attachments: owner updates"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR owner_id = auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Attachments: owner or admin deletes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND ((storage.foldername(name))[1] = auth.uid()::text
         OR owner_id = auth.uid()::text
         OR public.is_admin())
  );

CREATE POLICY "Attachments: read own, shared or as admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR owner_id = auth.uid()::text
      OR public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.poi_attachments a
        WHERE a.storage_path = objects.name
      )
      OR EXISTS (
        SELECT 1 FROM public.pitches p
        WHERE objects.name = ANY (p.attachment_paths)
      )
    )
  );

-- A new or changed storage_path must point at something the caller owns.
-- Same shape as enforce_profile_field_locks(): SECURITY INVOKER, so the
-- storage.objects lookup below runs under the caller's own read rule above,
-- which always lets them see their own files.
CREATE OR REPLACE FUNCTION public.enforce_attachment_path_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- The service role, migrations and admin scripts are not the threat model.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Untouched paths always pass, so older rows stay editable.
  IF TG_OP = 'UPDATE' AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path THEN
    RETURN NEW;
  END IF;

  IF NEW.storage_path IS NULL
     OR NEW.storage_path LIKE auth.uid()::text || '/%'
     OR EXISTS (
       SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = 'attachments'
         AND o.name = NEW.storage_path
         AND o.owner_id = auth.uid()::text
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'An attachment can only point at a file you uploaded.'
    USING ERRCODE = '42501';
END;
$function$;

-- Firing a trigger does not check EXECUTE, so nobody needs it. Off the public
-- API, same as 20261021000001.
REVOKE EXECUTE ON FUNCTION public.enforce_attachment_path_ownership()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS poi_attachments_path_must_be_mine ON public.poi_attachments;
CREATE TRIGGER poi_attachments_path_must_be_mine
  BEFORE INSERT OR UPDATE OF storage_path ON public.poi_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attachment_path_ownership();

-- Prove it, or roll everything back.
DO $check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Signed-in users manage attachments'
  ) THEN
    RAISE EXCEPTION 'the bucket-wide policy is still there';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname LIKE 'Attachments: %') <> 4 THEN
    RAISE EXCEPTION 'expected 4 attachment policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'poi_attachments_path_must_be_mine'
      AND tgrelid = 'public.poi_attachments'::regclass
  ) THEN
    RAISE EXCEPTION 'path trigger missing';
  END IF;

  IF has_function_privilege('authenticated', 'public.enforce_attachment_path_ownership()', 'execute')
     OR has_function_privilege('anon', 'public.enforce_attachment_path_ownership()', 'execute') THEN
    RAISE EXCEPTION 'trigger function is still executable over the API';
  END IF;
END
$check$;

COMMIT;
