# Franchise Operations Readiness Assessment

**Date:** 2026-03-09
**Context:** The app is evolving from location scouting → franchise operations platform

---

## 1. Multi-Tenant / Multi-Brand Support

**Current State: PARTIALLY READY**

What exists:
- `cities` table with `enabled` flag — supports multi-city operations
- `user_profiles.city_ids` (text array) — can restrict users to specific cities
- `user_profiles.region_id` — supports regional grouping
- `regions` table — allows sub-city organization

What's missing:
- **No `brand_id` or `franchise_brand` table** — if the company operates multiple brands (not just The Miners), there's no way to partition data by brand
- **No tenant isolation** — all data is in the same namespace; a franchisee of Brand A can see Brand B's data
- Places, pitches, performance data have no brand/tenant column

**Recommendation:** If multi-brand is a future need, add a `brands` table and `brand_id` foreign key to `places`, `pitches`, `cafe_performance`, `revenue_data`. If it's single-brand for the foreseeable future, the current schema works fine.

---

## 2. Per-Location Performance Tracking

**Current State: READY**

The schema has strong performance tracking:
- `cafe_performance` — monthly P&L per location
- `revenue_data` — daily revenue/costs breakdown with 12+ financial columns
- `performance_data` — traffic/conversion/spend metrics
- `performance_targets` — alert thresholds per location
- `competitor_metrics` — competitor intelligence per place

What's missing:
- **No historical snapshots** — if scoring_params change, old gravity_scores don't record which weights they used (though `params_version` helps)
- **No aggregation views** — no materialized views for monthly/quarterly rollups
- **No benchmarking across locations** — `profitability_benchmarks` is city-level, not location-level comparison

**Recommendation:** Add materialized views for common queries (monthly revenue by city, top performers, etc.) once data starts flowing. Consider a `location_comparisons` view.

---

## 3. AI Query Feature Support

**Current State: READY (with app_settings seed)**

What the AI query feature needs (from ai-query-feature.md):
- `app_settings` table with `openai_api_key` row — EXISTS but EMPTY (needs seed)
- Queryable tables with clear schemas — ALL EXIST
- User roles for API key management — schema ready (super_admin, head_office_exec)
- `activity_log` for query logging — EXISTS

What's missing:
- **app_settings is empty** — the `openai_api_key` setting needs to be seeded
- **No query_log table** — the PRD mentions logging queries to `activity_log`, which works, but a dedicated `ai_queries` table would be cleaner for cost tracking

**Recommendation:** Seed `app_settings`. Consider adding an `ai_queries` table in a future migration for dedicated query analytics (tokens used, cost, response time).

---

## 4. Approval Workflow

**Current State: READY**

- `approval_workflows` — configurable multi-level approvals per city
- `pitches` — comprehensive scouting submissions with 25+ fields
- `pitch_approvals` — per-level approval decisions
- User roles map to approval levels (area_coordinator → L1, finance_reviewer → L2, head_office_exec → L3)

No gaps identified for current needs.

---

## 5. Collaboration Features

**Current State: READY**

- `comments` — entity-based comments (polymorphic via entity_type/entity_id)
- `mentions` — @mentions with read/unread tracking
- `activity_log` — shared activity feed with per-user read tracking (activity_log_reads)
- `tags` — entity tagging system
- `scouting_reports` — field notes with photos

No gaps identified for current needs.

---

## 6. Role-Based Access Control

**Current State: SCHEMA READY, NOT ENFORCED**

The schema defines 5 roles: super_admin, head_office_exec, finance_reviewer, area_coordinator, franchisee.

**Critical Gap:** RLS policies and helper functions are NOT applied. Until they are, there is NO access control — anyone with the anon key can read/write everything.

---

## 7. Spatial Intelligence

**Current State: READY**

- PostGIS extension enabled
- geography(POINT) and geography(POLYGON) types throughout
- `gravity_scores` for pre-calculated location attractiveness
- `gravity_batches` for calculation metadata
- Spatial indexes defined (GIST)
- `profitability_benchmarks` with location bonuses (transit, university, office)
- `prospective_locations` for user-saved potential sites

No gaps identified for current needs.

---

## 8. Data Pipeline Integration

**Current State: READY**

- `places.source` and `places.source_id` with unique constraint — supports deduplication
- `places.last_seen_at` — supports staleness detection
- `places.is_new` — supports new POI alerts
- Service role key (bypasses RLS) ready for pipeline scripts

No gaps identified for current needs.

---

## Summary: Franchise Ops Readiness Score

| Capability | Score | Notes |
|-----------|-------|-------|
| Multi-city operations | 9/10 | Strong support |
| Multi-brand/tenant | 4/10 | Not supported yet |
| Performance tracking | 8/10 | Comprehensive, needs aggregation views |
| AI query support | 7/10 | Schema ready, needs seed data |
| Approval workflows | 9/10 | Fully modeled |
| Collaboration | 9/10 | Comments, mentions, activity feed |
| Access control | 2/10 | Schema defined, NOT enforced (critical) |
| Spatial intelligence | 9/10 | PostGIS, gravity model, profitability |
| Data pipeline | 9/10 | Dedup, staleness, service role |

**Overall: 7/10 — Schema is solid, but RLS enforcement is the critical blocker.**

---

## Recommended Future Additions

See `/docs/schema-recommendations.md` for detailed proposals.
