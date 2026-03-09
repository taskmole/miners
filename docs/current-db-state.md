# Current Database State

**Captured:** 2026-03-09
**Project:** sybuvcpmybdsuduthvom (Supabase)
**Region:** eu-north-1

---

## Tables (33 total)

All 32 tables from `create-tables.sql` exist. Migration 001 (`activity_log_reads`) has NOT been applied.

### Tables with Data

| Table | Row Count | Notes |
|-------|-----------|-------|
| cities | 3 | Madrid (ES, enabled), Barcelona (ES, enabled), Prague (CZ, disabled). All have PostGIS center points. |
| categories | 11 | Business-specific categories (EU Coffee Trip, Regular Cafe, The Miners, Property, Transit Station, Office Center, Shopping Center, High Street, University, Student Dorm, New Development). All system=true. |
| scoring_params | 6 | foot_traffic (0.25), population_density (0.15), competitor_saturation (0.20), transit_proximity (0.15), university_proximity (0.10), rent_affordability (0.15). Normalized weights summing to 1.0. |

### Empty Tables (29)

| Table | Status |
|-------|--------|
| app_settings | 0 rows — seed data NOT applied |
| regions | 0 rows |
| comments | 0 rows |
| tags | 0 rows |
| user_profiles | 0 rows |
| user_activity_state | 0 rows |
| hidden_pois | 0 rows |
| mentions | 0 rows |
| places | 0 rows |
| areas | 0 rows |
| polygon_layers | 0 rows |
| traffic_data | 0 rows |
| footfall_data | 0 rows |
| lists | 0 rows |
| list_items | 0 rows |
| scouting_reports | 0 rows |
| activity_log | 0 rows |
| approval_workflows | 0 rows |
| pitches | 0 rows |
| pitch_approvals | 0 rows |
| cafe_performance | 0 rows |
| revenue_data | 0 rows |
| performance_data | 0 rows |
| performance_targets | 0 rows |
| competitor_metrics | 0 rows |
| gravity_scores | 0 rows |
| gravity_batches | 0 rows |
| profitability_benchmarks | 0 rows |
| prospective_locations | 0 rows |

### Missing Tables

| Table | Source | Status |
|-------|--------|--------|
| activity_log_reads | migration 001 | NOT CREATED — migration file has wrong naming pattern |

---

## Helper Functions

| Function | Status |
|----------|--------|
| is_admin() | DOES NOT EXIST |
| is_finance_plus() | DOES NOT EXIST |
| is_authenticated() | DOES NOT EXIST |

---

## RLS (Row Level Security)

**Status: NOT ENABLED**

Evidence: Anon key can freely query `revenue_data`, `cafe_performance`, and other tables that should be restricted to finance+ roles. Helper functions that policies depend on don't exist.

---

## Indexes

**Status: UNKNOWN — cannot confirm from anon key**

The `create-tables.sql` file includes 15 index creation statements at the bottom. If the entire file was executed as one script, they should exist. Cannot verify without service role access.

---

## Extensions

| Extension | Status |
|-----------|--------|
| PostGIS | Likely enabled (geography columns work, cities have PostGIS point data) |

---

## Auth

- Google OAuth callback route exists at `/src/app/auth/callback/route.ts`
- Supabase client configured with PKCE flow
- Domain restriction appears active (theminers.eu)
- No user profiles exist yet (0 rows in user_profiles)

---

## Data Differences from Seed File

The live database has DIFFERENT data than `seed-data.sql`:

### Categories
- **Seed file**: 7 generic categories (Cafe, Places for Rent, Business Area, etc.)
- **Live DB**: 11 business-specific categories (EU Coffee Trip, Regular Cafe, The Miners, etc.)
- **Action**: DO NOT overwrite — live data is intentional business configuration

### Scoring Params
- **Seed file**: 16 params with raw gravity model weights (4, 3, 6, 8, 5) plus influence radii
- **Live DB**: 6 params with normalized weights (0.25, 0.20, etc.) summing to 1.0
- **Action**: DO NOT overwrite — live data represents a different (possibly newer) approach

### Cities
- **Seed file**: 3 cities with just name/country/enabled
- **Live DB**: 3 cities with PostGIS center points, country codes (ES/CZ instead of full names), Prague disabled
- **Action**: DO NOT overwrite — live data has more information

### App Settings
- **Seed file**: 4 settings (gravity_model_version, default_city, feature_flags, openai_api_key)
- **Live DB**: 0 rows
- **Action**: SHOULD seed — but carefully, as this is the only table where seed data is truly missing
