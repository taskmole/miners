-- ===========================================
-- MIGRATION: Head office decides property requests
-- ===========================================
-- Deciding a property request was super_admin only, which left the two
-- founders as the only people who could clear the queue. Head office already
-- reviews scouting trips and already passes is_admin() everywhere else in the
-- schema, so this brings requests in line with the rest of the model rather
-- than granting anything genuinely new.
--
-- is_admin() = super_admin + head_office_exec.
--
-- Everything else about the policy is unchanged and deliberately so:
--   - USING (status = 'pending') is what stops a decided request being
--     flipped back or decided twice.
--   - WITH CHECK pins decided_by to the person making the call, so the
--     decision log cannot be written in someone else's name.
-- ===========================================

DROP POLICY IF EXISTS "Super admins decide pending requests" ON public.property_requests;

CREATE POLICY "Admins decide pending requests"
  ON public.property_requests
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    AND status = 'pending'
  )
  WITH CHECK (
    public.is_admin()
    AND status IN ('approved', 'rejected')
    AND decided_by = auth.uid()
  );

-- is_super_admin() is left in place. Nothing else uses it today, but it is the
-- gate to reach for the next time something must stay founders-only.
