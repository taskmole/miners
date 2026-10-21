-- Take the three trigger functions off the public API.
--
-- WHY
--   Supabase's security advisor flags check_email_domain(), handle_new_user()
--   and sync_legacy_role_from_grants() as SECURITY DEFINER functions that anon
--   and authenticated can execute over /rest/v1/rpc. They are trigger
--   functions, so a direct call is already refused by Postgres, but the grant
--   is still there (PUBLIC gets EXECUTE on every new function) and it is six of
--   the advisor's warnings.
--
-- WHY IT IS SAFE
--   Postgres checks EXECUTE on a trigger function only when the trigger is
--   created, never when it fires. Rehearsed on production inside
--   BEGIN/ROLLBACK: with EXECUTE revoked from PUBLIC, anon and authenticated, a
--   super admin's insert, update and delete on user_city_grants (as
--   `authenticated`) still fired sync_legacy_role_from_grants, an allowed
--   sign-up still got its profile, and a blocked one was still refused.
--
--   The two auth.users triggers fire as supabase_auth_admin (sign-up), a role
--   the rehearsal could not switch to. It keeps EXECUTE explicitly, so sign-up
--   does not depend on the rule above.
--
--   Nothing in the app calls these functions directly.
--
-- Undo: GRANT EXECUTE ON FUNCTION ... TO PUBLIC;

BEGIN;

REVOKE EXECUTE ON FUNCTION
  public.check_email_domain(),
  public.handle_new_user(),
  public.sync_legacy_role_from_grants()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.check_email_domain(),
  public.handle_new_user()
TO supabase_auth_admin;

-- Prove it, or roll everything back. A REVOKE that "succeeds" without taking
-- effect is the usual failure mode on Supabase.
DO $check$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.check_email_domain()',
    'public.handle_new_user()',
    'public.sync_legacy_role_from_grants()'
  ] LOOP
    IF has_function_privilege('anon', fn, 'execute')
       OR has_function_privilege('authenticated', fn, 'execute') THEN
      RAISE EXCEPTION '% is still executable by anon or authenticated', fn;
    END IF;
  END LOOP;

  IF NOT has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'execute')
     OR NOT has_function_privilege('supabase_auth_admin', 'public.check_email_domain()', 'execute') THEN
    RAISE EXCEPTION 'supabase_auth_admin lost EXECUTE on a sign-up trigger';
  END IF;
END
$check$;

COMMIT;
