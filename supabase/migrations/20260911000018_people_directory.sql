-- ===========================================
-- MIGRATION: A directory of names, with no email addresses in it
-- ===========================================
-- Step 1 of three. This one only ADDS a function. Nothing is taken away here,
-- so it is safe to apply on its own, ahead of the code that uses it.
--
-- THE PROBLEM IT LEADS TO SOLVING. user_profiles carries a policy,
-- "Authenticated users can view user profiles", that lets any signed-in person
-- read every column of every row. The /api/db/user-profiles?mode=all handler
-- then hands that straight to every browser on every page load, so all 15
-- colleagues can read all 17 people's email addresses, roles and city lists.
--
-- WHY A FUNCTION RATHER THAN COLUMN PERMISSIONS. Taking SELECT off the email
-- column would also break the admin screens, which legitimately need it, and
-- the Users search box searches by email. A function that returns everything
-- except the address leaves admins untouched.
--
-- IT RETURNS EVERYONE, ACTIVE OR NOT, AND THAT IS NOT AN OVERSIGHT.
-- The activity feed throws away any comment whose author it cannot name
-- (src/hooks/useActivities.ts). Return only active people, and on the day
-- somebody is switched off every comment they ever wrote vanishes from
-- everyone's feed. Two people are switched off today and neither has
-- commented, so this costs nothing now and prevents a confusing bug later.
-- is_active comes back as a column so screens can still grey people out; it
-- just must not decide whether the row exists at all.
--
-- Same pattern as request_reviewer_emails and team_member_emails, which this
-- codebase already uses twice for exactly this purpose: SECURITY DEFINER, a
-- pinned search path, and an explicit grant to signed-in people only.
-- ===========================================

CREATE OR REPLACE FUNCTION public.people_directory()
RETURNS TABLE(
  id uuid,
  display_name text,
  role text,
  team_id uuid,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT up.id, up.display_name, up.role, up.team_id, up.is_active
  FROM public.user_profiles up
  -- Signed-in callers only. Written out rather than calling
  -- public.is_authenticated(), which does not pin its own search_path. Same
  -- reasoning, and the same line, as request_reviewer_emails.
  WHERE auth.uid() IS NOT NULL;
$function$;

-- Default EXECUTE is PUBLIC, which would hand the staff list to strangers.
REVOKE EXECUTE ON FUNCTION public.people_directory() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.people_directory() TO authenticated;

COMMENT ON FUNCTION public.people_directory() IS
  'Every person''s id, display name, role, team and active flag, and nothing '
  'else. No email address. Returns inactive people too, because the activity '
  'feed drops any comment whose author it cannot name.';

-- Without this the data API keeps serving from a stale schema cache and the
-- app gets "function not found" until something else happens to reload it.
NOTIFY pgrst, 'reload schema';

-- Undo:
--   DROP FUNCTION public.people_directory();
