-- ===========================================
-- MIGRATION: Auto-create user profile on signup
-- ===========================================
-- When someone signs in with Google for the first time,
-- automatically create a user_profiles row with:
--   role: franchisee (lowest permission)
--   display_name: from Google account
--   email: from Google account
--   city_ids: all enabled cities
--   is_active: true
--
-- Super admins can then promote them via the app or dashboard.
-- ===========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
    ARRAY(SELECT id FROM public.cities WHERE enabled = true),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger fires after a new user is created in auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
