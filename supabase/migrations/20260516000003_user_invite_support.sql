-- ===========================================
-- MIGRATION: Support admin-created (invited) user profiles
-- ===========================================
-- When an admin pre-configures a profile with an email,
-- and that person later signs in via Google, the trigger
-- links the existing profile to the new auth user.
-- ===========================================

-- Case-insensitive unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_lower
  ON public.user_profiles (LOWER(email))
  WHERE email IS NOT NULL;

-- Replace the auto-create trigger to handle pre-configured profiles
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

  -- Check if admin pre-configured a profile with this email
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.user_profiles
    WHERE LOWER(email) = LOWER(v_email)
      AND id != NEW.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Link the pre-configured profile to the real auth user
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

  -- No pre-configured profile: create inactive until admin approves
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
  -- Never block sign-up due to profile creation errors
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
