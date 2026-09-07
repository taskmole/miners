-- ===========================================
-- FIX: sign-in allowlist drift between the database and the app
-- ===========================================
-- Symptom: "Database error saving new user" on Google sign-in, for two months.
--
-- Cause: there are two allowlists and they disagreed.
--
--   1. public.check_email_domain(), run by the `enforce_email_domain` trigger
--      BEFORE INSERT ON auth.users. Added by hand in the Supabase dashboard
--      and never captured in a migration, so it was invisible in this repo.
--      Because it is a BEFORE trigger it fires before handle_new_user(), and
--      its RAISE aborts the whole GoTrue signup transaction. GoTrue reports
--      that as a generic "Database error saving new user" with no detail,
--      which is why this took so long to find.
--
--   2. src/lib/auth-config.ts, checked in the OAuth callback route.
--
-- List 2 allows two extra addresses that list 1 does not. List 1 runs first
-- and wins, so those two exceptions could never work. jzapletal1@gmail.com
-- (the franchisee-role test account) was locked out from the day it was added.
--
-- Verbatim previous definition, for rollback:
--
--   CREATE OR REPLACE FUNCTION public.check_email_domain()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   BEGIN
--     IF NEW.email NOT LIKE '%@theminers.eu'
--        AND NEW.email NOT LIKE '%@partner.theminers.eu'
--        AND NEW.email != 'founders@taskmole.co' THEN
--       RAISE EXCEPTION 'Only authorized email domains allowed';
--     END IF;
--     RETURN NEW;
--   END;
--   $function$
--
-- The trigger keeps pointing at the same function, so CREATE OR REPLACE is
-- all that is needed; the trigger itself is left untouched.
--
-- Deliberately NOT changed here:
--   * NULL email still passes, exactly as before. The old NOT LIKE chain
--     evaluated to NULL for a NULL email, which is not TRUE, so no exception
--     was raised. Prod has no phone-only or anonymous users today (checked:
--     0 of 12), but preserving this keeps the behaviour delta to one thing.
--   * The gate stays in the database. The app-side check in
--     src/app/auth/callback/route.ts runs only AFTER the session has been
--     issued and merely calls signOut(), which does not invalidate the access
--     token already handed out. This trigger is the only real gate.
-- ===========================================

CREATE OR REPLACE FUNCTION public.check_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- KEEP IN SYNC with ALLOWED_DOMAINS in src/lib/auth-config.ts.
  -- Whole domain only. A subdomain such as sub.theminers.eu is not covered.
  allowed_domains CONSTANT text[] := ARRAY[
    'theminers.eu',
    'partner.theminers.eu'
  ];

  -- KEEP IN SYNC with ALLOWED_EMAILS in src/lib/auth-config.ts.
  -- Individual exceptions, matched in full.
  allowed_emails CONSTANT text[] := ARRAY[
    'founders@taskmole.co',
    'jzapletal1@gmail.com'
  ];

  v_email  text;
  v_domain text;
BEGIN
  -- Phone-only and anonymous sign-ups carry no email; leave them alone.
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- GoTrue lowercases emails before insert, so this is belt and braces.
  v_email := lower(btrim(NEW.email));

  IF v_email = ANY (allowed_emails) THEN
    RETURN NEW;
  END IF;

  -- Everything after the last "@". Anchoring on the last one avoids being
  -- fooled by a quoted local part that itself contains an "@".
  v_domain := substring(v_email from '@([^@]+)$');

  IF v_domain = ANY (allowed_domains) THEN
    RETURN NEW;
  END IF;

  -- Names the address and the lists. GoTrue still shows the caller a generic
  -- "Database error saving new user", but this line lands in the Postgres log
  -- so the next person does not have to reverse-engineer the rules.
  RAISE EXCEPTION
    'signup blocked: % is not on the sign-in allowlist (domains: %; addresses: %)',
    v_email,
    array_to_string(allowed_domains, ', '),
    array_to_string(allowed_emails, ', ')
    USING
      ERRCODE = 'check_violation',
      HINT = 'Update check_email_domain() and src/lib/auth-config.ts together.';
END;
$$;
