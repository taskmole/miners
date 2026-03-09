# Migration Gap Analysis

**Date:** 2026-03-09
**Compared:** Live Supabase DB vs PRD Requirements

---

## Summary

| Category | Total Required | Exists | Missing | Different |
|----------|---------------|--------|---------|-----------|
| Tables | 33 | 32 | 1 | 0 |
| Helper Functions | 3 | 0 | 3 | — |
| RLS Enabled | 33 tables | 0 | 33 | — |
| RLS Policies | ~120 | 0 | ~120 | — |
| Indexes | 22 | Unknown* | Unknown* | — |
| Seed Data | 4 tables | 3 partial | 1 (app_settings) | 2 (categories, scoring_params) |

*Cannot verify indexes from anon key. If create-tables.sql was run as a single script, all 15 original indexes should exist. The 2 migration 001 indexes are definitely missing.

---

## Detailed Gap Analysis

### Tables

| Table | PRD Requires | Current State | Status | Action Needed |
|-------|-------------|---------------|--------|---------------|
| cities | yes | exists, 3 rows | OK | none |
| app_settings | yes | exists, 0 rows | GAP | seed data |
| categories | yes | exists, 11 rows | OK | none (different from seed but valid) |
| scoring_params | yes | exists, 6 rows | OK | none (different from seed but valid) |
| regions | yes | exists, 0 rows | OK | none |
| comments | yes | exists, 0 rows | OK | none |
| tags | yes | exists, 0 rows | OK | none |
| user_profiles | yes | exists, 0 rows | OK | none |
| user_activity_state | yes | exists, 0 rows | OK | none |
| hidden_pois | yes | exists, 0 rows | OK | none |
| mentions | yes | exists, 0 rows | OK | none |
| places | yes | exists, 0 rows | OK | none |
| areas | yes | exists, 0 rows | OK | none |
| polygon_layers | yes | exists, 0 rows | OK | none |
| traffic_data | yes | exists, 0 rows | OK | none |
| footfall_data | yes | exists, 0 rows | OK | none |
| lists | yes | exists, 0 rows | OK | none |
| list_items | yes | exists, 0 rows | OK | none |
| scouting_reports | yes | exists, 0 rows | OK | none |
| activity_log | yes | exists, 0 rows | OK | none |
| approval_workflows | yes | exists, 0 rows | OK | none |
| pitches | yes | exists, 0 rows | OK | none |
| pitch_approvals | yes | exists, 0 rows | OK | none |
| cafe_performance | yes | exists, 0 rows | OK | none |
| revenue_data | yes | exists, 0 rows | OK | none |
| performance_data | yes | exists, 0 rows | OK | none |
| performance_targets | yes | exists, 0 rows | OK | none |
| competitor_metrics | yes | exists, 0 rows | OK | none |
| gravity_scores | yes | exists, 0 rows | OK | none |
| gravity_batches | yes | exists, 0 rows | OK | none |
| profitability_benchmarks | yes | exists, 0 rows | OK | none |
| prospective_locations | yes | exists, 0 rows | OK | none |
| activity_log_reads | yes (migration 001) | DOES NOT EXIST | **GAP** | create table + indexes + RLS |

### Helper Functions

| Function | PRD Requires | Current State | Status | Action Needed |
|----------|-------------|---------------|--------|---------------|
| is_admin() | yes | does not exist | **GAP** | create function |
| is_finance_plus() | yes | does not exist | **GAP** | create function |
| is_authenticated() | yes | does not exist | **GAP** | create function |

### RLS (Row Level Security)

| Table | PRD Requires | RLS Enabled | Policies Exist | Status | Action Needed |
|-------|-------------|-------------|----------------|--------|---------------|
| cities | yes | no | no | **GAP** | enable RLS + create 4 policies |
| app_settings | yes | no | no | **GAP** | enable RLS + create 4 policies |
| categories | yes | no | no | **GAP** | enable RLS + create 4 policies |
| scoring_params | yes | no | no | **GAP** | enable RLS + create 4 policies |
| regions | yes | no | no | **GAP** | enable RLS + create 4 policies |
| comments | yes | no | no | **GAP** | enable RLS + create 4 policies |
| tags | yes | no | no | **GAP** | enable RLS + create 4 policies |
| user_profiles | yes | no | no | **GAP** | enable RLS + create 4 policies |
| user_activity_state | yes | no | no | **GAP** | enable RLS + create 4 policies |
| hidden_pois | yes | no | no | **GAP** | enable RLS + create 4 policies |
| mentions | yes | no | no | **GAP** | enable RLS + create 4 policies |
| places | yes | no | no | **GAP** | enable RLS + create 4 policies |
| areas | yes | no | no | **GAP** | enable RLS + create 4 policies |
| polygon_layers | yes | no | no | **GAP** | enable RLS + create 4 policies |
| traffic_data | yes | no | no | **GAP** | enable RLS + create 4 policies |
| footfall_data | yes | no | no | **GAP** | enable RLS + create 4 policies |
| lists | yes | no | no | **GAP** | enable RLS + create 4 policies |
| list_items | yes | no | no | **GAP** | enable RLS + create 4 policies |
| scouting_reports | yes | no | no | **GAP** | enable RLS + create 4 policies |
| activity_log | yes | no | no | **GAP** | enable RLS + create 2 policies |
| approval_workflows | yes | no | no | **GAP** | enable RLS + create 4 policies |
| pitches | yes | no | no | **GAP** | enable RLS + create 4 policies |
| pitch_approvals | yes | no | no | **GAP** | enable RLS + create 3 policies |
| cafe_performance | yes | no | no | **GAP** | enable RLS + create 4 policies |
| revenue_data | yes | no | no | **GAP** | enable RLS + create 4 policies |
| performance_data | yes | no | no | **GAP** | enable RLS + create 4 policies |
| performance_targets | yes | no | no | **GAP** | enable RLS + create 4 policies |
| competitor_metrics | yes | no | no | **GAP** | enable RLS + create 4 policies |
| profitability_benchmarks | yes | no | no | **GAP** | enable RLS + create 4 policies |
| prospective_locations | yes | no | no | **GAP** | enable RLS + create 4 policies |
| gravity_scores | yes | no | no | **GAP** | enable RLS + create 4 policies |
| gravity_batches | yes | no | no | **GAP** | enable RLS + create 4 policies |
| activity_log_reads | yes | N/A (table missing) | N/A | **GAP** | create with table |

### Indexes

| Index | PRD Requires | Current State | Status | Action Needed |
|-------|-------------|---------------|--------|---------------|
| places_location_idx | yes | likely exists* | VERIFY | verify or create |
| places_source_idx | yes | likely exists* | VERIFY | verify or create |
| places_city_category_idx | yes | likely exists* | VERIFY | verify or create |
| places_status_idx | yes | likely exists* | VERIFY | verify or create |
| areas_geometry_idx | yes | likely exists* | VERIFY | verify or create |
| polygon_layers_geometry_idx | yes | likely exists* | VERIFY | verify or create |
| polygon_layers_type_idx | yes | likely exists* | VERIFY | verify or create |
| traffic_data_location_idx | yes | likely exists* | VERIFY | verify or create |
| traffic_data_hour_idx | yes | likely exists* | VERIFY | verify or create |
| footfall_data_geo_idx | yes | likely exists* | VERIFY | verify or create |
| prospective_locations_geo_idx | yes | likely exists* | VERIFY | verify or create |
| gravity_scores_geo_idx | yes | likely exists* | VERIFY | verify or create |
| gravity_scores_city_idx | yes | likely exists* | VERIFY | verify or create |
| comments_entity_idx | yes | likely exists* | VERIFY | verify or create |
| mentions_user_unread_idx | yes | likely exists* | VERIFY | verify or create |
| mentions_comment_idx | yes | likely exists* | VERIFY | verify or create |
| hidden_pois_user_idx | yes | likely exists* | VERIFY | verify or create |
| pitch_approvals_pitch_idx | yes | likely exists* | VERIFY | verify or create |
| revenue_data_place_date_idx | yes | likely exists* | VERIFY | verify or create |
| cafe_performance_place_idx | yes | likely exists* | VERIFY | verify or create |
| activity_log_reads_user_idx | yes | does not exist | **GAP** | create with table |
| activity_log_reads_activity_idx | yes | does not exist | **GAP** | create with table |

*If create-tables.sql was run as a single script, these indexes were created at the bottom of that script.

### Seed Data

| Table | PRD Seed | Current Data | Status | Action Needed |
|-------|----------|-------------|--------|---------------|
| cities | 3 rows (name/country/enabled) | 3 rows (with PostGIS centers, country codes) | DIFFERENT but OK | DO NOT overwrite |
| categories | 7 generic categories | 11 business-specific categories | DIFFERENT but OK | DO NOT overwrite |
| scoring_params | 16 gravity params | 6 normalized params | DIFFERENT but OK | DO NOT overwrite |
| app_settings | 4 settings | 0 rows | **GAP** | Insert seed data |

---

## Items in DB but NOT in PRD

| Item | Type | Notes |
|------|------|-------|
| Extra categories (11 vs 7) | data | Business-specific categories like "EU Coffee Trip", "The Miners" — keep |
| Different scoring_params structure | data | Normalized weights vs raw weights — different approach, keep |
| PostGIS center points on cities | data | Better than PRD seed — keep |
| Prague disabled | config | Intentional business decision — keep |

---

## Priority Actions

1. **CRITICAL**: Create helper functions (prerequisite for RLS)
2. **CRITICAL**: Enable RLS on all 32 existing tables
3. **CRITICAL**: Create all RLS policies
4. **HIGH**: Create activity_log_reads table + indexes + RLS
5. **MEDIUM**: Seed app_settings with defaults
6. **LOW**: Verify indexes exist (use IF NOT EXISTS to be safe)
