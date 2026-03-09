-- ===========================================
-- MIGRATION: Seed app_settings with defaults
-- ===========================================
-- ONLY inserts app_settings rows.
-- Does NOT touch cities, categories, or scoring_params
-- (those already have business-specific data in the live DB).
-- Uses ON CONFLICT DO NOTHING to be safe for re-runs.
-- ===========================================

INSERT INTO public.app_settings (key, value) VALUES
  ('gravity_model_version', '"v1.0"'),
  ('default_city', '"madrid"'),
  ('feature_flags', '{"gravity_heatmap": true, "profitability_predictions": false}'),
  ('openai_api_key', '{"key": "", "model": "gpt-4o-mini", "zdr_enabled": true, "enabled": false}')
ON CONFLICT (key) DO NOTHING;
