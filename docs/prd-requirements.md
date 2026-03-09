# PRD Requirements — Complete Extraction

Extracted from `/docs/database-migration-prd.md` line by line.

---

## Extensions Required

| Extension | Purpose |
|-----------|---------|
| PostGIS | Geography types for spatial queries |

---

## Helper Functions Required

| Function | Purpose | Used By |
|----------|---------|---------|
| is_admin() | Check if user is super_admin or head_office_exec | RLS policies |
| is_finance_plus() | Check if user is finance_reviewer, head_office_exec, or super_admin | RLS policies |
| is_authenticated() | Check if auth.uid() is not null | RLS policies |

---

## Tables Required (33 total)

### Foundation Tables (7 including tags)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 1 | cities | id(text), name(text), country(text), center(geography POINT), bounds(geography POLYGON), config(jsonb), enabled(boolean) | id | none |
| 2 | app_settings | key(text), value(jsonb), updated_at(timestamptz) | key | none |
| 3 | categories | id(uuid), name(text), icon(text), color(text), is_system(boolean), created_by(uuid), created_at(timestamptz) | id | none |
| 4 | scoring_params | id(uuid), name(text), weight(numeric), updated_by(uuid), updated_at(timestamptz) | id | none |
| 5 | regions | id(text), name(text), city_id(text), description(text), created_at(timestamptz) | id | city_id → cities |
| 6 | comments | id(uuid), entity_type(text), entity_id(uuid), created_by(uuid), content(text), created_at(timestamptz) | id | none |
| 7 | tags | id(uuid), entity_type(text), entity_id(uuid), tag(text), created_by(uuid), created_at(timestamptz) | id | none |

### User Management (4)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 8 | user_profiles | id(uuid), role(text), display_name(text), email(text), region_id(text), city_ids(text[]), can_approve_level(integer), is_active(boolean), created_at(timestamptz), updated_at(timestamptz) | id | none |
| 9 | user_activity_state | user_id(uuid), last_viewed_at(timestamptz) | user_id | none |
| 10 | hidden_pois | id(uuid), user_id(uuid), place_id(text), hidden_at(timestamptz) | id | unique(user_id, place_id) |
| 11 | mentions | id(uuid), comment_id(uuid), mentioned_user_id(uuid), mentioned_by_user_id(uuid), entity_type(text), entity_id(uuid), is_read(boolean), read_at(timestamptz), created_at(timestamptz) | id | comment_id → comments(CASCADE), unique(comment_id, mentioned_user_id) |

### Main Data Tables (6)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 12 | places | id(uuid), city_id(text), category_id(uuid), source(text), source_id(text), name(text), address(text), location(geography POINT), metadata(jsonb), photos(text[]), is_new(boolean), status(text), created_by(uuid), created_at(timestamptz), updated_at(timestamptz), last_seen_at(timestamptz) | id | city_id → cities, category_id → categories, unique(source, source_id) |
| 13 | areas | id(uuid), city_id(text), name(text), link(text), geometry(geography POLYGON), tags(text[]), color(text), comments(text), created_by(uuid), created_at(timestamptz), updated_at(timestamptz) | id | city_id → cities |
| 14 | polygon_layers | id(uuid), city_id(text), layer_type(text), name(text), geometry(geography POLYGON), metadata(jsonb), created_by(uuid), created_at(timestamptz) | id | city_id → cities |
| 15 | traffic_data | id(uuid), city_id(text), location(geography POINT), distrito(text), direccion(text), hora(integer), avg_count(numeric), source(text), period(date), created_at(timestamptz) | id | city_id → cities |
| 16 | footfall_data | id(uuid), city_id(text), district(text), address(text), location(geography POINT), hour_0..hour_23(numeric), data_collection_date(date), data_source(text), created_at(timestamptz) | id | city_id → cities |

### User Content Tables (4)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 17 | lists | id(uuid), name(text), created_by(uuid), created_at(timestamptz) | id | none |
| 18 | list_items | id(uuid), list_id(uuid), place_id(uuid), visit_date(date), visit_time(time), weather(text), traffic_observation(text), comments(text), added_at(timestamptz) | id | list_id → lists(CASCADE), place_id → places(CASCADE) |
| 19 | scouting_reports | id(uuid), place_id(uuid), created_by(uuid), notes(text), photos(text[]), created_at(timestamptz) | id | place_id → places |
| 20 | activity_log | id(uuid), user_id(uuid), city_id(text), action_type(text), entity_type(text), entity_id(uuid), summary(text), created_at(timestamptz) | id | city_id → cities |

### Approval Workflow (3)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 21 | approval_workflows | id(uuid), name(text), city_id(text), num_levels(integer), level_1_role(text), level_2_role(text), level_3_role(text), level_4_role(text), is_default(boolean), created_by(uuid), created_at(timestamptz), updated_at(timestamptz) | id | city_id → cities |
| 22 | pitches | id(uuid), city_id(text), place_id(uuid), created_by(uuid), workflow_id(uuid), status(text), current_level(integer), + 20 more columns | id | city_id → cities, place_id → places, workflow_id → approval_workflows |
| 23 | pitch_approvals | id(uuid), pitch_id(uuid), level_number(integer), approver_id(uuid), decision(text), comments(text), created_at(timestamptz) | id | pitch_id → pitches(CASCADE) |

### Performance & Revenue (5)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 24 | cafe_performance | id(uuid), place_id(uuid), month(date), monthly_revenue(numeric), monthly_costs(numeric), monthly_profit(numeric), avg_daily_customers(integer), notes(text), recorded_by(uuid), created_at(timestamptz) | id | place_id → places, unique(place_id, month) |
| 25 | revenue_data | id(uuid), place_id(uuid), date(date), source(text), daily_revenue(numeric), + 10 cost/profit columns, notes(text), created_by(uuid), timestamps | id | place_id → places, unique(place_id, date) |
| 26 | performance_data | id(uuid), place_id(uuid), date(date), traffic_per_hour(numeric), conversion_rate(numeric), avg_spend(numeric), revenue(numeric), custom_metrics(jsonb), created_at(timestamptz) | id | place_id → places |
| 27 | performance_targets | id(uuid), place_id(uuid), target_type(text), target_value(numeric), alert_threshold_percent(numeric), created_by(uuid), created_at(timestamptz) | id | place_id → places |
| 28 | competitor_metrics | id(uuid), place_id(uuid), + 15 metric columns, updated_by(uuid), updated_at(timestamptz) | id | place_id → places(CASCADE) |

### Gravity Model (2)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 29 | gravity_scores | id(uuid), city_id(text), location(geography POINT), score(numeric), normalized_score(numeric), resolution_meters(integer), params_version(text), calculated_at(timestamptz) | id | city_id → cities |
| 30 | gravity_batches | id(uuid), city_id(text), params_version(text), weights(jsonb), beta(numeric), resolution_meters(integer), point_count(integer), min_score(numeric), max_score(numeric), calculated_by(uuid), calculated_at(timestamptz) | id | city_id → cities |

### Profitability (2)

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 31 | profitability_benchmarks | id(uuid), city(text UNIQUE), avg_ticket_price(numeric), + 8 columns, created_by(uuid), timestamps | id | none |
| 32 | prospective_locations | id(uuid), user_id(uuid), city_id(text), name(text), location(geography POINT), + 7 columns, timestamps | id | city_id → cities, linked_idealista_id → places |

### Migration 001

| # | Table | Columns | Primary Key | Foreign Keys |
|---|-------|---------|-------------|--------------|
| 33 | activity_log_reads | id(uuid), user_id(uuid), activity_log_id(uuid), read_at(timestamptz) | id | activity_log_id → activity_log(CASCADE), unique(user_id, activity_log_id) |

---

## Indexes Required (17)

| Index | Table | Type | Columns |
|-------|-------|------|---------|
| places_location_idx | places | GIST | location |
| places_source_idx | places | btree | source, source_id |
| places_city_category_idx | places | btree | city_id, category_id |
| places_status_idx | places | btree | status |
| areas_geometry_idx | areas | GIST | geometry |
| polygon_layers_geometry_idx | polygon_layers | GIST | geometry |
| polygon_layers_type_idx | polygon_layers | btree | city_id, layer_type |
| traffic_data_location_idx | traffic_data | GIST | location |
| traffic_data_hour_idx | traffic_data | btree | city_id, hora |
| footfall_data_geo_idx | footfall_data | GIST | location |
| prospective_locations_geo_idx | prospective_locations | GIST | location |
| gravity_scores_geo_idx | gravity_scores | GIST | location |
| gravity_scores_city_idx | gravity_scores | btree | city_id, params_version |
| comments_entity_idx | comments | btree | entity_type, entity_id |
| mentions_user_unread_idx | mentions | btree (partial) | mentioned_user_id, is_read WHERE is_read = false |
| mentions_comment_idx | mentions | btree | comment_id |
| hidden_pois_user_idx | hidden_pois | btree | user_id |
| pitch_approvals_pitch_idx | pitch_approvals | btree | pitch_id |
| revenue_data_place_date_idx | revenue_data | btree | place_id, date |
| cafe_performance_place_idx | cafe_performance | btree | place_id |
| activity_log_reads_user_idx | activity_log_reads | btree | user_id |
| activity_log_reads_activity_idx | activity_log_reads | btree | activity_log_id |

---

## RLS Policies Required (32 tables)

Every table must have RLS enabled. See `/supabase/rls-policies.sql` for complete policy definitions.

Policy patterns:
- **Public read, admin write**: cities, app_settings, scoring_params, regions, polygon_layers, traffic_data, footfall_data, profitability_benchmarks, gravity_scores, gravity_batches
- **Authenticated read, owner edit**: comments, tags, areas, lists, scouting_reports
- **Owner-only**: user_activity_state, hidden_pois, prospective_locations, activity_log_reads
- **Self or admin**: user_profiles, mentions
- **Authenticated read/create, immutable**: activity_log (no update/delete)
- **Finance+ restricted**: cafe_performance, revenue_data, performance_data, performance_targets
- **Authenticated view, finance+ edit**: competitor_metrics
- **Role-based**: pitches (owner can update drafts), pitch_approvals (approver can create)
- **Parent-based**: list_items (follows list ownership)

---

## Seed Data Required

| Table | Items | Notes |
|-------|-------|-------|
| cities | 3 | Madrid, Barcelona, Prague |
| scoring_params | 16 | Gravity model weights + influence radii + POI weights |
| categories | 7 | Generic system categories |
| app_settings | 4 | gravity_model_version, default_city, feature_flags, openai_api_key |

---

## User Roles

| Role | Level |
|------|-------|
| super_admin | Full access |
| head_office_exec | Final approval, all cities |
| finance_reviewer | Level 2 approval, financial data |
| area_coordinator | Level 1 approval, manage region |
| franchisee | Basic user, submit pitches |
