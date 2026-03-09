-- ===========================================
-- MIGRATION: Create first super_admin user profile
-- ===========================================
-- Matus H. — first authenticated user
-- Without this, RLS blocks all admin write operations
-- ===========================================

INSERT INTO public.user_profiles (id, role, display_name, is_active)
VALUES (
  '701d1698-32a2-457f-871a-9d5e220d279e',
  'super_admin',
  'Matus',
  true
)
ON CONFLICT (id) DO NOTHING;
