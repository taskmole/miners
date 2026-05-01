-- Migration: Formalize drawn_features table, add RLS, and create missing RPC functions
-- Context: drawn_features was created manually and has no tracked definition, no RLS,
-- and two RPC functions the app calls (migrate_anonymous_user, update_drawn_feature_metadata)
-- were never created, causing silent failures.

-- 1. Formalize drawn_features table (safe to run against existing table)
CREATE TABLE IF NOT EXISTS public.drawn_features (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  city_id text,
  geojson jsonb,
  name text,
  color text,
  tags text[],
  link text,
  category_id text,
  address text,
  address_coords jsonb,
  created_by text,
  attachments jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add any missing columns (safe if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drawn_features' AND column_name = 'city_id') THEN
    ALTER TABLE public.drawn_features ADD COLUMN city_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drawn_features' AND column_name = 'attachments') THEN
    ALTER TABLE public.drawn_features ADD COLUMN attachments jsonb;
  END IF;
END $$;

-- 2. Enable RLS on drawn_features
ALTER TABLE public.drawn_features ENABLE ROW LEVEL SECURITY;

-- RLS policies: owner can do everything, admins can see all
CREATE POLICY "Users can view own drawn features"
  ON public.drawn_features FOR SELECT
  USING (
    user_id = auth.uid()::text
    OR public.is_admin()
  );

CREATE POLICY "Users can insert own drawn features"
  ON public.drawn_features FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update own drawn features"
  ON public.drawn_features FOR UPDATE
  USING (
    user_id = auth.uid()::text
    OR public.is_admin()
  );

CREATE POLICY "Users can delete own drawn features"
  ON public.drawn_features FOR DELETE
  USING (
    user_id = auth.uid()::text
    OR public.is_admin()
  );

-- 3. Create migrate_anonymous_user RPC
-- Re-tags all data from one or more anonymous IDs to the authenticated user ID.
-- Called on every login to ensure cross-device data consistency.
CREATE OR REPLACE FUNCTION public.migrate_anonymous_user(
  anon_id text,
  auth_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- drawn_features
  UPDATE public.drawn_features
    SET user_id = auth_id, created_by = auth_id
    WHERE user_id = anon_id;

  -- pitches (scouting trips)
  UPDATE public.pitches
    SET created_by = auth_id
    WHERE created_by = anon_id;

  -- lists
  UPDATE public.lists
    SET created_by = auth_id
    WHERE created_by = anon_id;

  -- list_items
  UPDATE public.list_items
    SET created_by = auth_id
    WHERE created_by = anon_id;

  -- hidden_pois
  UPDATE public.hidden_pois
    SET user_id = auth_id
    WHERE user_id = anon_id;

  -- comments
  UPDATE public.comments
    SET created_by = auth_id
    WHERE created_by = anon_id;

  -- point_categories
  UPDATE public.point_categories
    SET created_by = auth_id
    WHERE created_by = anon_id;

  -- activity_log
  UPDATE public.activity_log
    SET user_id = auth_id
    WHERE user_id = anon_id;
END;
$$;

-- 4. Create update_drawn_feature_metadata RPC
-- Called from ShapeComments.tsx to persist shape metadata (name, color, tags, etc.)
CREATE OR REPLACE FUNCTION public.update_drawn_feature_metadata(
  feature_id text,
  feature_name text DEFAULT NULL,
  feature_color text DEFAULT NULL,
  feature_tags text[] DEFAULT NULL,
  feature_link text DEFAULT NULL,
  feature_category_id text DEFAULT NULL,
  feature_address text DEFAULT NULL,
  feature_address_coords jsonb DEFAULT NULL,
  feature_created_by text DEFAULT NULL,
  feature_attachments jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.drawn_features
    SET
      name = COALESCE(feature_name, name),
      color = COALESCE(feature_color, color),
      tags = COALESCE(feature_tags, tags),
      link = COALESCE(feature_link, link),
      category_id = COALESCE(feature_category_id, category_id),
      address = COALESCE(feature_address, address),
      address_coords = COALESCE(feature_address_coords, address_coords),
      created_by = COALESCE(feature_created_by, created_by),
      attachments = COALESCE(feature_attachments, attachments),
      updated_at = now()
    WHERE id = feature_id;
END;
$$;
