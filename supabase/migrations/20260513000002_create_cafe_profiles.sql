-- Enrichment table for Miners cafe operational profiles.
-- Links to places via FK. Only stores data not already in the places table.

CREATE TABLE IF NOT EXISTS cafe_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL UNIQUE REFERENCES places(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('to_go_mini', 'core', 'flagship')),
  interior_seats integer DEFAULT 0,
  exterior_seats integer DEFAULT 0,
  area_sqm numeric,
  monthly_revenue numeric,
  has_kitchen boolean DEFAULT false,
  notes text,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cafe_profiles_place_id ON cafe_profiles(place_id);

-- RLS
ALTER TABLE cafe_profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (revenue filtered server-side in API route)
CREATE POLICY "cafe_profiles_select" ON cafe_profiles
  FOR SELECT USING (is_authenticated());

-- Only admins can insert
CREATE POLICY "cafe_profiles_insert" ON cafe_profiles
  FOR INSERT WITH CHECK (is_admin());

-- Only admins can update
CREATE POLICY "cafe_profiles_update" ON cafe_profiles
  FOR UPDATE USING (is_admin());

-- Only admins can delete
CREATE POLICY "cafe_profiles_delete" ON cafe_profiles
  FOR DELETE USING (is_admin());

-- Helper function for auto-updating updated_at (safe to re-create)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at on changes
CREATE OR REPLACE TRIGGER cafe_profiles_updated_at
  BEFORE UPDATE ON cafe_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
