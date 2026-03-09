# Migration Plan

**Date:** 2026-03-09
**Status:** EXECUTED SUCCESSFULLY

---

## Overview

5 phased migrations to bring the Supabase database from "tables only" to fully secured with RLS, indexes, and seed data.

---

## Phase 1: Helper Functions (Migration 000001)

**File:** `20260309000001_create_helper_functions.sql`
**Risk:** None — additive, uses CREATE OR REPLACE
**Status:** APPLIED

Creates 3 helper functions required by RLS policies:
- `is_admin()` — checks super_admin or head_office_exec role
- `is_finance_plus()` — checks finance_reviewer + admin roles
- `is_authenticated()` — checks auth.uid() is not null

**Rollback:** `DROP FUNCTION IF EXISTS public.is_admin, public.is_finance_plus, public.is_authenticated;`

---

## Phase 2: activity_log_reads Table (Migration 000002)

**File:** `20260309000002_create_activity_log_reads.sql`
**Risk:** None — new table, IF NOT EXISTS
**Status:** APPLIED

Creates junction table for per-user read/unread tracking of activity log entries. Includes:
- Table with PK, FK to activity_log (CASCADE), unique constraint
- RLS enabled with 3 policies (select/insert/delete own only)

**Rollback:** `DROP TABLE IF EXISTS public.activity_log_reads;`

---

## Phase 3: RLS Policies (Migration 000003)

**File:** `20260309000003_enable_rls_and_policies.sql`
**Risk:** Low — enables RLS on existing tables. Could block anon queries if policies are wrong.
**Status:** APPLIED

Enables RLS on all 32 tables and creates ~120 policies:
- Public read tables (cities, places, etc.): `USING (true)` for SELECT
- Authenticated-only tables: `USING (is_authenticated())`
- Finance-restricted tables: `USING (is_finance_plus())`
- Owner-based tables: `USING (created_by = auth.uid())`
- Admin write tables: `WITH CHECK (is_admin())`

**Rollback:** Would need to DROP each policy and ALTER TABLE DISABLE RLS for each table.

---

## Phase 4: Indexes (Migration 000004)

**File:** `20260309000004_create_indexes.sql`
**Risk:** None — IF NOT EXISTS, purely additive
**Status:** APPLIED (all 20 pre-existing indexes confirmed, 2 new for activity_log_reads)

22 indexes covering:
- Spatial (GIST) indexes for geography columns
- B-tree indexes for common query patterns
- Partial index for unread mentions

---

## Phase 5: Seed Data (Migration 000005)

**File:** `20260309000005_seed_app_settings.sql`
**Risk:** None — ON CONFLICT DO NOTHING
**Status:** APPLIED (4 rows inserted)

Seeds app_settings with defaults for gravity model, city, feature flags, and AI query API key placeholder.

---

## Data Preservation

The following existing data was NOT touched:
- cities: 3 rows with PostGIS centers (unchanged)
- categories: 11 business-specific categories (unchanged)
- scoring_params: 6 normalized weights (unchanged)
