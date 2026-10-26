-- ===========================================
-- MIGRATION: Changing a pitch needs Contribute in its city
-- ===========================================
-- Verified against production on 2026-10-26 before this was written. The
-- function below is the live pg_get_functiondef of
-- public.enforce_pitch_review_fields() (from 20261026000002) with one block
-- added, not a retyped copy.
--
-- THE GAP. The pitches UPDATE policy lets the owner or a teammate edit a
-- draft or returned pitch. It never asks about city access. So somebody whose
-- access in a city dropped to View could still edit and resubmit their own
-- returned pitch there, and so could a teammate with only View.
--
-- THE FIX (owner's decision, 2026-10-26: view-only means hands off). For a
-- non-reviewer UPDATE, the trigger now also needs
-- has_city_level(<city>, 'contribute') for both the old and the new city_id,
-- or it raises 42501, which the app answers with a 403. Reviewers
-- (public.is_admin()) are not affected, the same as for every other rule in
-- this trigger. INSERT needs nothing new: the INSERT policy already requires
-- Contribute. Deleting your own draft stays allowed by the DELETE policy;
-- that is cleanup, not a change to the pitch.
--
-- WHY HERE AND NOT IN THE POLICY. This trigger already holds every other
-- rule about who may change a pitch, so the new one sits with them. It also
-- covers any upsert that reaches an existing row, because the conflict path
-- fires BEFORE UPDATE against the real OLD row.
--
-- Undo (paste as one block): re-run the CREATE OR REPLACE FUNCTION from
-- 20261026000002_guard_pitch_review_fields.sql, then the REVOKE below.
-- ===========================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_pitch_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  reviewer boolean;
  old_paths text[] := '{}';
  p text;
BEGIN
  -- The service role, migrations and admin scripts are not the threat model.
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- See THE UPSERT TRAP above: an existing id means this is the conflict path
  -- of an upsert, and the BEFORE UPDATE firing that follows checks it.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.pitches WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  reviewer := public.is_admin();

  IF NOT reviewer THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'draft' AND NEW.status IS DISTINCT FROM 'submitted' THEN
        RAISE EXCEPTION 'A new pitch can only be a draft or submitted.'
          USING ERRCODE = '42501';
      END IF;
      IF NEW.final_reviewed_at IS NOT NULL
         OR NEW.final_reviewed_by IS NOT NULL
         OR NEW.reviewed_by IS NOT NULL
         OR NEW.rejection_notes IS NOT NULL
         OR NEW.return_notes IS NOT NULL THEN
        RAISE EXCEPTION 'Only a reviewer can fill in the review of a pitch.'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status
         AND NOT (NEW.status = 'submitted' AND OLD.status IN ('draft', 'returned')) THEN
        RAISE EXCEPTION 'Only a reviewer can change a pitch from % to %.', OLD.status, NEW.status
          USING ERRCODE = '42501';
      END IF;
      -- IS DISTINCT FROM, never <>: these are NULL on most rows, and
      -- NULL <> 'x' is NULL, which would wave the change through.
      IF NEW.final_reviewed_at IS DISTINCT FROM OLD.final_reviewed_at
         OR NEW.final_reviewed_by IS DISTINCT FROM OLD.final_reviewed_by
         OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
         OR NEW.rejection_notes IS DISTINCT FROM OLD.rejection_notes
         OR NEW.return_notes IS DISTINCT FROM OLD.return_notes THEN
        RAISE EXCEPTION 'Only a reviewer can change the review of a pitch.'
          USING ERRCODE = '42501';
      END IF;
      -- The UPDATE policy lets a teammate edit, and its WITH CHECK accepts a
      -- row they would own, so without this they could take the pitch over.
      IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'The owner of a pitch cannot be changed.'
          USING ERRCODE = '42501';
      END IF;
      -- View-only means hands off (owner's decision, 2026-10-26): changing a
      -- pitch needs Contribute in its city, before and after, for owners and
      -- teammates alike. Without this an owner kept editing and resubmitting
      -- after their city access dropped to View.
      IF NOT public.has_city_level(OLD.city_id, 'contribute')
         OR NOT public.has_city_level(NEW.city_id, 'contribute') THEN
        RAISE EXCEPTION 'Changing a pitch needs Contribute access in its city.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Every new file reference must be the caller's own. "New" is tested with
  -- NOT (p = ANY(...)), never p <> ALL(...): with a NULL in the array the
  -- latter is NULL and the check would silently pass.
  IF TG_OP = 'UPDATE' THEN
    old_paths := COALESCE(OLD.attachment_paths, '{}');
  END IF;

  FOREACH p IN ARRAY COALESCE(NEW.attachment_paths, '{}') LOOP
    CONTINUE WHEN p IS NULL OR p = ANY (old_paths);
    IF NOT (
      p LIKE auth.uid()::text || '/%'
      OR EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'attachments'
          AND o.name = p
          AND o.owner_id = auth.uid()::text
      )
    ) THEN
      RAISE EXCEPTION 'A pitch can only add files you uploaded.'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_pitch_review_fields()
  FROM PUBLIC, anon, authenticated;

-- Prove it, or roll everything back.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'pitches_guard_review_fields'
      AND tgrelid = 'public.pitches'::regclass
  ) THEN
    RAISE EXCEPTION 'pitch trigger missing';
  END IF;

  IF position('has_city_level(OLD.city_id' in
       pg_get_functiondef('public.enforce_pitch_review_fields()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'the contribute check did not land';
  END IF;

  IF has_function_privilege('authenticated', 'public.enforce_pitch_review_fields()', 'execute')
     OR has_function_privilege('anon', 'public.enforce_pitch_review_fields()', 'execute') THEN
    RAISE EXCEPTION 'trigger function is still executable over the API';
  END IF;
END
$check$;

COMMIT;
