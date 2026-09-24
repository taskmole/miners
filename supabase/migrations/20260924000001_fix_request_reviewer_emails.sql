-- Reviewers have not been told about a single new property request since
-- 2026-09-11.
--
-- The app looks reviewers up with the service role (see
-- notifyReviewersOfRequest in src/lib/property-request-emails.ts), because
-- 20260911000019 took EXECUTE away from signed-in users. But the function
-- still ended in "AND auth.uid() IS NOT NULL", and the service role has no
-- user id, so the lookup returned nobody and every "New property request"
-- email was skipped as "no-reviewers". Rehearsed on prod: 0 rows as the
-- service role, 3 for Prague with a user id.
--
-- The guard now accepts the service role OR a signed-in user. It is kept
-- rather than dropped as a second line of defence: should EXECUTE ever be
-- granted back by accident, anonymous callers still get nothing.
--
-- CREATE OR REPLACE, never DROP + CREATE: a recreated function starts with
-- EXECUTE granted to PUBLIC.

CREATE OR REPLACE FUNCTION public.request_reviewer_emails(p_city_id text DEFAULT NULL::text)
 RETURNS TABLE(user_id uuid, email text, display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT up.id, up.email, up.display_name
  FROM public.user_profiles up
  WHERE up.is_active
    AND up.email IS NOT NULL
    AND (
      up.is_super_admin
      OR (
        p_city_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_city_grants g
          WHERE g.user_id = up.id
            AND g.city_id = p_city_id
            AND g.level = 'approve'
        )
      )
    )
    -- The server (service role), or a signed-in person.
    AND (
      auth.jwt() ->> 'role' = 'service_role'
      OR auth.uid() IS NOT NULL
    );
$function$;

-- Re-assert the lock, then prove it took. A REVOKE can silently do nothing
-- when postgres is not the grantor.
REVOKE EXECUTE ON FUNCTION public.request_reviewer_emails(text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.request_reviewer_emails(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.request_reviewer_emails(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'request_reviewer_emails is still callable by anon or authenticated';
  END IF;
END $$;
