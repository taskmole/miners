-- ===========================================
-- MINERS LOCATION SCOUT - DATABASE SCHEMA
-- Run this in Supabase SQL Editor (dev first, then prod)
-- ===========================================

-- Enable PostGIS extension (for geography types)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ===========================================
-- FOUNDATION TABLES (no dependencies)
-- ===========================================

CREATE TABLE public.cities (
  id text NOT NULL,
  name text NOT NULL,
  country text,
  center geography(POINT),
  bounds geography(POLYGON),
  config jsonb,
  enabled boolean DEFAULT true,
  CONSTRAINT cities_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_settings (
  key text NOT NULL,
  value jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (key)
);

CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon text,
  color text,
  is_system boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.scoring_params (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  weight numeric DEFAULT 0,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT scoring_params_pkey PRIMARY KEY (id)
);

CREATE TABLE public.regions (
  id text NOT NULL,
  name text NOT NULL,
  city_id text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT regions_pkey PRIMARY KEY (id),
  CONSTRAINT regions_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_by uuid,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT comments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  tag text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tags_pkey PRIMARY KEY (id)
);

-- ===========================================
-- USER MANAGEMENT
-- ===========================================

CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  role text DEFAULT 'franchisee',
  display_name text,
  email text,
  region_id text,
  city_ids text[],
  can_approve_level integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_activity_state (
  user_id uuid NOT NULL,
  last_viewed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_activity_state_pkey PRIMARY KEY (user_id)
);

CREATE TABLE public.hidden_pois (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  place_id text NOT NULL,
  hidden_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hidden_pois_pkey PRIMARY KEY (id),
  CONSTRAINT hidden_pois_user_place_unique UNIQUE (user_id, place_id)
);

CREATE TABLE public.mentions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  mentioned_user_id uuid NOT NULL,
  mentioned_by_user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  is_read boolean DEFAULT false,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mentions_pkey PRIMARY KEY (id),
  CONSTRAINT mentions_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE,
  CONSTRAINT mentions_comment_user_unique UNIQUE (comment_id, mentioned_user_id)
);

-- ===========================================
-- MAIN DATA TABLES
-- ===========================================

CREATE TABLE public.places (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city_id text,
  category_id uuid,
  source text NOT NULL,
  source_id text,
  name text NOT NULL,
  address text,
  location geography(POINT) NOT NULL,
  metadata jsonb,
  photos text[],
  is_new boolean DEFAULT false,
  status text DEFAULT 'active',
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone DEFAULT now(),
  CONSTRAINT places_pkey PRIMARY KEY (id),
  CONSTRAINT places_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id),
  CONSTRAINT places_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT places_source_unique UNIQUE (source, source_id)
);

CREATE TABLE public.areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city_id text,
  name text NOT NULL,
  link text,
  geometry geography(POLYGON) NOT NULL,
  tags text[],
  color text,
  comments text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT areas_pkey PRIMARY KEY (id),
  CONSTRAINT areas_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.polygon_layers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city_id text,
  layer_type text NOT NULL,
  name text NOT NULL,
  geometry geography(POLYGON) NOT NULL,
  metadata jsonb,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT polygon_layers_pkey PRIMARY KEY (id),
  CONSTRAINT polygon_layers_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.traffic_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city_id text,
  location geography(POINT),
  distrito text,
  direccion text,
  hora integer,
  avg_count numeric,
  source text,
  period date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT traffic_data_pkey PRIMARY KEY (id),
  CONSTRAINT traffic_data_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.footfall_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city_id text NOT NULL,
  district text,
  address text,
  location geography(POINT) NOT NULL,
  hour_0 numeric,
  hour_1 numeric,
  hour_2 numeric,
  hour_3 numeric,
  hour_4 numeric,
  hour_5 numeric,
  hour_6 numeric,
  hour_7 numeric,
  hour_8 numeric,
  hour_9 numeric,
  hour_10 numeric,
  hour_11 numeric,
  hour_12 numeric,
  hour_13 numeric,
  hour_14 numeric,
  hour_15 numeric,
  hour_16 numeric,
  hour_17 numeric,
  hour_18 numeric,
  hour_19 numeric,
  hour_20 numeric,
  hour_21 numeric,
  hour_22 numeric,
  hour_23 numeric,
  data_collection_date date,
  data_source text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT footfall_data_pkey PRIMARY KEY (id),
  CONSTRAINT footfall_data_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

-- ===========================================
-- USER CONTENT TABLES
-- ===========================================

CREATE TABLE public.lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.list_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  list_id uuid,
  place_id uuid,
  visit_date date,
  visit_time time without time zone,
  weather text,
  traffic_observation text,
  comments text,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT list_items_pkey PRIMARY KEY (id),
  CONSTRAINT list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES public.lists(id) ON DELETE CASCADE,
  CONSTRAINT list_items_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE
);

CREATE TABLE public.scouting_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid,
  created_by uuid,
  notes text,
  photos text[],
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT scouting_reports_pkey PRIMARY KEY (id),
  CONSTRAINT scouting_reports_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id)
);

CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  city_id text,
  action_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  summary text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_log_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

-- ===========================================
-- APPROVAL WORKFLOW TABLES
-- ===========================================

CREATE TABLE public.approval_workflows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city_id text,
  num_levels integer NOT NULL DEFAULT 3,
  level_1_role text DEFAULT 'area_coordinator',
  level_2_role text DEFAULT 'finance_reviewer',
  level_3_role text DEFAULT 'head_office_exec',
  level_4_role text,
  is_default boolean DEFAULT false,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT approval_workflows_pkey PRIMARY KEY (id),
  CONSTRAINT approval_workflows_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id)
);

CREATE TABLE public.pitches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city_id text,
  place_id uuid,
  created_by uuid,
  workflow_id uuid,
  status text DEFAULT 'draft',
  current_level integer DEFAULT 0,
  condition_notes text,
  rejection_level integer,
  revision_count integer DEFAULT 0,
  address text,
  area_sqm numeric,
  storage_sqm numeric,
  property_type text,
  footfall_estimate integer,
  neighbourhood_profile text,
  nearby_competitors text,
  monthly_rent numeric,
  service_fees numeric,
  deposit numeric,
  fitout_cost numeric,
  opening_investment numeric,
  expected_daily_revenue numeric,
  monthly_revenue_range text,
  payback_months integer,
  ventilation text,
  water_waste text,
  power_capacity text,
  visibility text,
  delivery_access text,
  seating_capacity integer,
  outdoor_seating boolean,
  risks text[],
  photos text[],
  submitted_at timestamp with time zone,
  final_reviewed_at timestamp with time zone,
  final_reviewed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pitches_pkey PRIMARY KEY (id),
  CONSTRAINT pitches_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id),
  CONSTRAINT pitches_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id),
  CONSTRAINT pitches_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.approval_workflows(id)
);

CREATE TABLE public.pitch_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pitch_id uuid,
  level_number integer NOT NULL,
  approver_id uuid,
  decision text NOT NULL,
  comments text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pitch_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT pitch_approvals_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE
);

-- ===========================================
-- PERFORMANCE & REVENUE TABLES
-- ===========================================

CREATE TABLE public.cafe_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL,
  month date NOT NULL,
  monthly_revenue numeric,
  monthly_costs numeric,
  monthly_profit numeric,
  avg_daily_customers integer,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cafe_performance_pkey PRIMARY KEY (id),
  CONSTRAINT cafe_performance_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id),
  CONSTRAINT cafe_performance_place_month_unique UNIQUE (place_id, month)
);

CREATE TABLE public.revenue_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid,
  date date NOT NULL,
  source text DEFAULT 'manual',
  daily_revenue numeric,
  transaction_count integer,
  avg_ticket_size numeric,
  rent_cost numeric,
  labor_cost numeric,
  supplies_cost numeric,
  other_costs numeric,
  total_costs numeric,
  gross_profit numeric,
  net_profit numeric,
  margin_percent numeric,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT revenue_data_pkey PRIMARY KEY (id),
  CONSTRAINT revenue_data_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id),
  CONSTRAINT revenue_data_place_date_unique UNIQUE (place_id, date)
);

CREATE TABLE public.performance_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid,
  date date,
  traffic_per_hour numeric,
  conversion_rate numeric,
  avg_spend numeric,
  revenue numeric,
  custom_metrics jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT performance_data_pkey PRIMARY KEY (id),
  CONSTRAINT performance_data_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id)
);

CREATE TABLE public.performance_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid,
  target_type text NOT NULL,
  target_value numeric NOT NULL,
  alert_threshold_percent numeric DEFAULT 20,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT performance_targets_pkey PRIMARY KEY (id),
  CONSTRAINT performance_targets_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id)
);

CREATE TABLE public.competitor_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  place_id uuid,
  estimated_daily_revenue numeric,
  estimated_monthly_revenue numeric,
  revenue_confidence text,
  price_level text,
  market_share_percent numeric,
  specialties text[],
  chain_affiliation text,
  is_specialty_coffee boolean DEFAULT false,
  seating_capacity_estimate integer,
  has_outdoor_seating boolean,
  opened_date date,
  closed_date date,
  last_rating numeric,
  last_review_count integer,
  rating_trend text,
  notes text,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT competitor_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT competitor_metrics_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE
);

-- ===========================================
-- PROFITABILITY PREDICTION TABLES
-- ===========================================

CREATE TABLE public.profitability_benchmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  city text NOT NULL UNIQUE,
  avg_ticket_price numeric NOT NULL,
  conversion_rate numeric NOT NULL,
  operating_hours_per_day integer NOT NULL,
  fixed_monthly_costs numeric NOT NULL,
  variable_cost_per_customer numeric NOT NULL,
  typical_setup_cost numeric NOT NULL,
  near_transit_bonus numeric DEFAULT 1.15,
  near_university_bonus numeric DEFAULT 1.10,
  near_office_bonus numeric DEFAULT 1.05,
  high_competition_penalty numeric DEFAULT 0.85,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT profitability_benchmarks_pkey PRIMARY KEY (id)
);

CREATE TABLE public.prospective_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  city_id text NOT NULL,
  name text NOT NULL,
  location geography(POINT) NOT NULL,
  address text,
  monthly_rent numeric,
  size_sqm numeric,
  transfer_fee numeric,
  linked_idealista_id uuid,
  prediction_json jsonb,
  prediction_calculated_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prospective_locations_pkey PRIMARY KEY (id),
  CONSTRAINT prospective_locations_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id),
  CONSTRAINT prospective_locations_linked_idealista_id_fkey FOREIGN KEY (linked_idealista_id) REFERENCES public.places(id)
);

-- ===========================================
-- INDEXES FOR PERFORMANCE
-- ===========================================

CREATE INDEX places_location_idx ON public.places USING GIST(location);
CREATE INDEX places_source_idx ON public.places(source, source_id);
CREATE INDEX places_city_category_idx ON public.places(city_id, category_id);
CREATE INDEX places_status_idx ON public.places(status);

CREATE INDEX areas_geometry_idx ON public.areas USING GIST(geometry);
CREATE INDEX polygon_layers_geometry_idx ON public.polygon_layers USING GIST(geometry);
CREATE INDEX polygon_layers_type_idx ON public.polygon_layers(city_id, layer_type);

CREATE INDEX traffic_data_location_idx ON public.traffic_data USING GIST(location);
CREATE INDEX traffic_data_hour_idx ON public.traffic_data(city_id, hora);

CREATE INDEX footfall_data_geo_idx ON public.footfall_data USING GIST(location);

CREATE INDEX prospective_locations_geo_idx ON public.prospective_locations USING GIST(location);

CREATE INDEX comments_entity_idx ON public.comments(entity_type, entity_id);
CREATE INDEX mentions_user_unread_idx ON public.mentions(mentioned_user_id, is_read) WHERE is_read = false;
CREATE INDEX mentions_comment_idx ON public.mentions(comment_id);

CREATE INDEX hidden_pois_user_idx ON public.hidden_pois(user_id);

CREATE INDEX pitch_approvals_pitch_idx ON public.pitch_approvals(pitch_id);
CREATE INDEX revenue_data_place_date_idx ON public.revenue_data(place_id, date);
CREATE INDEX cafe_performance_place_idx ON public.cafe_performance(place_id);

-- ===========================================
-- DONE!
-- ===========================================
