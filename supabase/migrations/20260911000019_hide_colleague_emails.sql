-- ===========================================
-- MIGRATION: Colleagues' email addresses stop being readable by colleagues
-- ===========================================
-- Step 3 of three, and the order is not optional.
--
--   1. 20260911000018 added people_directory().          (applied)
--   2. The code deploy switched the two readers to it.   (must be live)
--   3. This drops the loose policy.                      (here)
--
-- Dropping the policy first would blank out colleagues' names on every comment
-- in the activity feed for every non-admin, because the feed throws away any
-- entry whose author it cannot name.
--
-- WHAT GOES. "Authenticated users can view user profiles", a SELECT policy
-- with USING (is_authenticated()). It lets any of the 15 signed-in people read
-- all 17 people's email addresses, roles and city lists. It only ever existed
-- in production; the checked-in schema never had it, so this also brings the
-- live database back in line with the repo.
--
-- WHAT SURVIVES, AND WHY BOTH HALVES MATTER. "Users can view own profile or
-- admins see all", USING (id = auth.uid() OR is_admin()). Lose the first half
-- and every own-row lookup dies; lose the second and admins lose the Users
-- screen. Asserted at the bottom rather than assumed.
--
-- THREE THINGS CHECKED SO THIS CANNOT DOWNGRADE ANYONE:
--   - Each person can still read their own row, through the surviving policy.
--   - What a person is allowed to do comes from the grants endpoint
--     (/api/db/user-grants?mode=current), not from this list, so nobody's own
--     permissions come from the part being restricted.
--   - user_city_grants is already locked to "mine, or admin", so there is no
--     second copy of the same leak sitting next to it.
--
-- THE SECOND DOOR, WHICH HAS TO CLOSE IN THE SAME STEP.
-- request_reviewer_emails() hands back the addresses of every active super
-- admin, and of every approver in a named city. It refuses strangers, but it
-- was deliberately open to every signed-in person so a contributor raising a
-- property request could have the reviewers notified. Hide emails from the
-- directory and leave this open, and any of the 15 can still ask it directly
-- for the 2 super admins and the 8 approvers. Its one caller
-- (src/lib/property-request-emails.ts) now calls it with the service role, so
-- the signed-in grant can go.
-- ===========================================

DROP POLICY IF EXISTS "Authenticated users can view user profiles" ON public.user_profiles;

REVOKE EXECUTE ON FUNCTION public.request_reviewer_emails(text) FROM PUBLIC, anon, authenticated;

-- The policy that has to survive. A DO block rather than a comment, because
-- "confirm it is still there afterwards" is the kind of check that gets
-- skipped, and getting it wrong locks every person out of their own profile.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.user_profiles'::regclass
      AND polname = 'Users can view own profile or admins see all'
  ) THEN
    RAISE EXCEPTION
      'Refusing to continue: the own-row-or-admin read policy on user_profiles is missing.';
  END IF;
END
$check$;

-- Undo:
--   CREATE POLICY "Authenticated users can view user profiles"
--     ON public.user_profiles FOR SELECT USING (public.is_authenticated());
--   GRANT EXECUTE ON FUNCTION public.request_reviewer_emails(text) TO authenticated;
