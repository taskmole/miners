-- ===========================================
-- MIGRATION: Create all indexes (IF NOT EXISTS)
-- ===========================================
-- These indexes may already exist if create-tables.sql was run as a whole.
-- Using IF NOT EXISTS makes this safe to re-run.
-- ===========================================

-- Places indexes
CREATE INDEX IF NOT EXISTS places_location_idx ON public.places USING GIST(location);
CREATE INDEX IF NOT EXISTS places_source_idx ON public.places(source, source_id);
CREATE INDEX IF NOT EXISTS places_city_category_idx ON public.places(city_id, category_id);
CREATE INDEX IF NOT EXISTS places_status_idx ON public.places(status);

-- Spatial indexes
CREATE INDEX IF NOT EXISTS areas_geometry_idx ON public.areas USING GIST(geometry);
CREATE INDEX IF NOT EXISTS polygon_layers_geometry_idx ON public.polygon_layers USING GIST(geometry);
CREATE INDEX IF NOT EXISTS polygon_layers_type_idx ON public.polygon_layers(city_id, layer_type);

-- Traffic indexes
CREATE INDEX IF NOT EXISTS traffic_data_location_idx ON public.traffic_data USING GIST(location);
CREATE INDEX IF NOT EXISTS traffic_data_hour_idx ON public.traffic_data(city_id, hora);
CREATE INDEX IF NOT EXISTS footfall_data_geo_idx ON public.footfall_data USING GIST(location);

-- Prospective locations
CREATE INDEX IF NOT EXISTS prospective_locations_geo_idx ON public.prospective_locations USING GIST(location);

-- Gravity model indexes
CREATE INDEX IF NOT EXISTS gravity_scores_geo_idx ON public.gravity_scores USING GIST(location);
CREATE INDEX IF NOT EXISTS gravity_scores_city_idx ON public.gravity_scores(city_id, params_version);

-- Comments & mentions indexes
CREATE INDEX IF NOT EXISTS comments_entity_idx ON public.comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS mentions_user_unread_idx ON public.mentions(mentioned_user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS mentions_comment_idx ON public.mentions(comment_id);

-- Hidden POIs
CREATE INDEX IF NOT EXISTS hidden_pois_user_idx ON public.hidden_pois(user_id);

-- Approval workflow indexes
CREATE INDEX IF NOT EXISTS pitch_approvals_pitch_idx ON public.pitch_approvals(pitch_id);

-- Revenue & performance indexes
CREATE INDEX IF NOT EXISTS revenue_data_place_date_idx ON public.revenue_data(place_id, date);
CREATE INDEX IF NOT EXISTS cafe_performance_place_idx ON public.cafe_performance(place_id);

-- Activity log reads indexes (from migration 001)
CREATE INDEX IF NOT EXISTS activity_log_reads_user_idx ON public.activity_log_reads(user_id);
CREATE INDEX IF NOT EXISTS activity_log_reads_activity_idx ON public.activity_log_reads(activity_log_id);
