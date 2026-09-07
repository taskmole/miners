-- ===========================================
-- REPAIR: handle_new_user() on production
-- ===========================================
-- Production is running the ORIGINAL version of this function, from
-- 20260309000007, not the invite-aware version from 20260516000003. The
-- case-insensitive unique index on email did get applied, so the two are out
-- of step and every invited user is locked out:
--
--   1. An admin adds someone in Admin > Users. That writes a user_profiles row
--      with their email and a placeholder id.
--   2. That person signs in with Google for the first time. Supabase creates
--      an auth.users row with a brand new id.
--   3. The old trigger tries to INSERT a second profile with the new id and
--      the same email. It only handles ON CONFLICT (id), so the email index
--      raises, the signup transaction rolls back, and the person sees
--      "Database error saving new user". They can never log in.
--
-- Reproduced against production on 2026-09-07 with a throwaway account.
--
-- This re-applies the invite-aware version verbatim, so an existing profile is
-- claimed by the new auth user instead of duplicated, keeping the role and
-- cities the admin chose. CREATE OR REPLACE, so it is safe to run more than
-- once and safe to run even where 20260516000003 did apply correctly.
-- ===========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_existing_id uuid;
BEGIN
  v_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');

  -- Did an admin pre-configure a profile for this email?
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.user_profiles
    WHERE LOWER(email) = LOWER(v_email)
      AND id != NEW.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Claim it: point the invited profile at the real auth user, keeping
      -- the role, cities and team the admin already set.
      UPDATE public.user_profiles
      SET id = NEW.id,
          display_name = COALESCE(display_name,
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name'),
          email = v_email,
          updated_at = now()
      WHERE id = v_existing_id;

      RETURN NEW;
    END IF;
  END IF;

  -- Nobody invited them: create the profile inactive until an admin approves.
  INSERT INTO public.user_profiles (
    id,
    role,
    display_name,
    email,
    city_ids,
    is_active
  ) VALUES (
    NEW.id,
    'franchisee',
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'),
    v_email,
    ARRAY(SELECT id FROM public.cities WHERE enabled = true),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Never block sign-up because profile creation failed. An admin can always
  -- fix the profile afterwards; a failed signup locks the person out entirely.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
