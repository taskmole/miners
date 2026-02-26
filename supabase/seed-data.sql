-- ===========================================
-- MINERS LOCATION SCOUT - SEED DATA
-- Run this AFTER create-tables.sql
-- ===========================================

-- ===========================================
-- CITIES
-- ===========================================

INSERT INTO public.cities (id, name, country, enabled) VALUES
  ('madrid', 'Madrid', 'Spain', true),
  ('barcelona', 'Barcelona', 'Spain', true),
  ('prague', 'Prague', 'Czech Republic', true)
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- SCORING PARAMS (Gravity Model Weights)
-- ===========================================
-- These are the configurable weights used by the gravity model.
-- Admins can adjust these via UI to tune location scoring.

INSERT INTO public.scoring_params (name, weight) VALUES
  -- Core gravity model weights
  ('gravity_population', 4),    -- Weight for population density
  ('gravity_income', 3),        -- Weight for income/wealth level
  ('gravity_metro', 6),         -- Weight for metro/transit proximity
  ('gravity_traffic', 8),       -- Weight for pedestrian footfall
  ('gravity_poi', 5),           -- Weight for nearby POI density

  -- Distance decay and resolution
  ('gravity_beta', 1.5),        -- Distance decay exponent (higher = more local)
  ('gravity_resolution', 100),  -- Grid resolution in meters

  -- Influence radius in meters
  ('influence_population', 1500),
  ('influence_income', 1500),
  ('influence_metro', 800),
  ('influence_traffic', 500),
  ('influence_poi', 400),

  -- POI type weights (used within poi score calculation)
  ('poi_weight_cafe', 0.3),
  ('poi_weight_metro', 0.4),
  ('poi_weight_gym', 0.2),
  ('poi_weight_other', 0.1)
ON CONFLICT DO NOTHING;

-- ===========================================
-- SYSTEM CATEGORIES
-- ===========================================
-- Default point categories that cannot be deleted by users.

INSERT INTO public.categories (name, icon, color, is_system) VALUES
  ('Cafe', 'coffee', 'amber', true),
  ('Places for Rent', 'home', 'blue', true),
  ('Business Area', 'briefcase', 'slate', true),
  ('Shopping Area', 'shopping-bag', 'pink', true),
  ('High Street', 'map-pin', 'purple', true),
  ('Student Dormitory', 'building', 'green', true),
  ('University', 'graduation-cap', 'indigo', true)
ON CONFLICT DO NOTHING;

-- ===========================================
-- APP SETTINGS
-- ===========================================
-- Global application settings

INSERT INTO public.app_settings (key, value) VALUES
  ('gravity_model_version', '"v1.0"'),
  ('default_city', '"madrid"'),
  ('feature_flags', '{"gravity_heatmap": true, "profitability_predictions": false}')
ON CONFLICT (key) DO NOTHING;

-- ===========================================
-- DONE!
-- ===========================================
