-- ===========================================
-- MIGRATION: Only reviewers can decide a pitch
-- ===========================================
-- Verified against production on 2026-10-26 before this was written.
--
-- THE HOLE. The pitches UPDATE policy lets the owner (or a teammate) edit a
-- draft or returned pitch, and its WITH CHECK only asks who owns the row. It
-- says nothing about status. So an owner could send
--   PATCH /api/db/pitches { id, status: 'approved' }
-- and approve their own draft (proven on prod in a rolled-back transaction).
-- The INSERT path had the same hole: upsert a brand-new row as 'approved'.
-- Separately, attachment_paths could name anyone's file, and a path recorded
-- on a pitch is readable by everyone who can see that pitch (see
-- 20261026000001), so that was a way to get a read link to a colleague's
-- private file.
--
-- THE FIX. A BEFORE INSERT OR UPDATE trigger. For anyone who is not a
-- reviewer (public.is_admin(), the same check the dashboard and
-- send-trip-status use today):
--   INSERT  status must be draft or submitted, and the five review fields
--           (final_reviewed_at, final_reviewed_by, reviewed_by,
--           rejection_notes, return_notes) must be empty.
--   UPDATE  status may stay the same, or go draft -> submitted or
--           returned -> submitted. The five review fields and created_by must
--           not change. The app's own save re-sends them unchanged, so it
--           still passes.
-- For everyone signed in, reviewers included: every NEW entry in
-- attachment_paths must be in the caller's own folder or a file they own.
-- Entries already on the row always pass, so a teammate saving a pitch that
-- holds the owner's files is fine. The own-folder test also covers a pitch
-- saved before its upload has finished, which happens because the sync queue
-- and the uploader run separately.
--
-- THE UPSERT TRAP. The app saves pitches with an upsert
-- (INSERT ... ON CONFLICT (id) DO UPDATE). Postgres runs BEFORE INSERT
-- triggers on the proposed row even when the row already exists, and only
-- then takes the DO UPDATE path (which fires BEFORE UPDATE against the real
-- OLD row). Checking the INSERT rules there would refuse an owner re-saving
-- a returned pitch, because return_notes is set. So the INSERT branch steps
-- aside when the id already exists and lets the UPDATE firing judge it. That
-- lookup runs under the caller's own read rule, which is enough: the upsert's
-- update path refuses anyone who cannot see the existing row anyway, and a
-- plain INSERT with an existing id fails on the primary key. For the same
-- reason none of this lives in the INSERT policy.
--
-- pitch_approvals (unused, 0 rows) let anyone insert themselves as an
-- approver. Its INSERT check now also requires is_admin().
--
-- The app maps 42501 to a 403, which the trip sync queue treats as permanent
-- instead of retrying forever.
--
-- Undo (paste as one block):
--   DROP TRIGGER IF EXISTS pitches_guard_review_fields ON public.pitches;
--   DROP FUNCTION IF EXISTS public.enforce_pitch_review_fields();
--   DROP POLICY IF EXISTS "Reviewers can insert their own pitch_approvals" ON public.pitch_approvals;
--   CREATE POLICY "Authenticated users can insert pitch_approvals" ON public.pitch_approvals
--     FOR INSERT WITH CHECK (is_authenticated() AND approver_id = auth.uid());
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

DROP TRIGGER IF EXISTS pitches_guard_review_fields ON public.pitches;
CREATE TRIGGER pitches_guard_review_fields
  BEFORE INSERT OR UPDATE ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pitch_review_fields();

DROP POLICY IF EXISTS "Authenticated users can insert pitch_approvals" ON public.pitch_approvals;
CREATE POLICY "Reviewers can insert their own pitch_approvals"
  ON public.pitch_approvals FOR INSERT
  WITH CHECK (public.is_admin() AND approver_id = auth.uid());

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

  IF has_function_privilege('authenticated', 'public.enforce_pitch_review_fields()', 'execute')
     OR has_function_privilege('anon', 'public.enforce_pitch_review_fields()', 'execute') THEN
    RAISE EXCEPTION 'trigger function is still executable over the API';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pitch_approvals'
      AND policyname = 'Authenticated users can insert pitch_approvals'
  ) THEN
    RAISE EXCEPTION 'the open pitch_approvals insert policy is still there';
  END IF;
END
$check$;

COMMIT;
