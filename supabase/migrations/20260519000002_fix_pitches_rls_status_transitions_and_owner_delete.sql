-- Fix 1: UPDATE policy blocks status transitions.
-- The USING clause checks status='draft' against BOTH old and new rows (WITH CHECK defaults to USING).
-- When submitTrip changes status from 'draft' to 'submitted', the new row fails the check.
-- Fix: add explicit WITH CHECK that allows the owner to write any status.

DROP POLICY IF EXISTS "Owner or team member can update draft pitches" ON public.pitches;

CREATE POLICY "Owner or team member can update draft pitches"
  ON public.pitches FOR UPDATE
  USING (
    (created_by = auth.uid() AND status = 'draft')
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.user_team_ids()) AND status = 'draft')
    OR public.is_admin()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.user_team_ids()))
    OR public.is_admin()
  );

-- Fix 2: DELETE policy only allows admins. Regular users should be able to delete their own drafts.

DROP POLICY IF EXISTS "Only admins can delete pitches" ON public.pitches;

CREATE POLICY "Owner can delete draft pitches or admin can delete any"
  ON public.pitches FOR DELETE
  USING (
    (created_by = auth.uid() AND status = 'draft')
    OR public.is_admin()
  );
