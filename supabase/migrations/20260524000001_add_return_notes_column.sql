-- Add return_notes column for "returned" trip status
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS return_notes TEXT;

-- Update RLS policy to allow owners to edit returned trips (not just draft)
DROP POLICY IF EXISTS "Owner or team member can update draft pitches" ON public.pitches;

CREATE POLICY "Owner or team member can update draft or returned pitches"
  ON public.pitches FOR UPDATE
  USING (
    (created_by = auth.uid() AND status IN ('draft', 'returned'))
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.user_team_ids()) AND status IN ('draft', 'returned'))
    OR public.is_admin()
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (team_id IS NOT NULL AND team_id IN (SELECT public.user_team_ids()))
    OR public.is_admin()
  );
