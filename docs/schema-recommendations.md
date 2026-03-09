# Schema Recommendations: Franchise Operations Platform

> These recommendations go beyond the current PRD. They describe schema additions that would support the long-term evolution of Miners Location Scout into a full franchise operations platform.

**Current state:** 33 tables in Supabase covering location scouting, user management, approvals, performance tracking, competitor intelligence, profitability prediction, and collaboration across 3 cities (Madrid, Barcelona, Prague).

---

## 1. Multi-Brand Support

If The Miners ever operates more than one brand (e.g. a premium line, a grab-and-go concept, a co-brand partnership), the schema needs a way to separate brand-level configuration from location-level data.

### Recommendations

**brands table**
- Stores each brand identity: name, logo URL, default color palette, description, status (active/inactive).
- Every location, performance record, and approval workflow would reference a brand ID.
- Why it matters: Without this, adding a second brand means duplicating tables or adding messy "brand" columns everywhere after the fact. Adding it early is cheap; retrofitting is expensive.
- Priority: **nice-to-have** (only matters if multi-brand becomes real)
- Dependencies: None. Can be added independently and backfilled with a single "The Miners" record.

**brand_settings table**
- Key-value or structured settings per brand: default gravity score weights, target revenue thresholds, approval chain configuration, styling preferences.
- Why it matters: Different brands might have different KPIs, different approval flows, or different location criteria. This keeps brand-specific logic out of application code.
- Priority: **nice-to-have**
- Dependencies: brands table.

**Add brand_id column to existing tables**
- Tables affected: places, pitches, cafe_performance, revenue_data, prospective_locations, competitor_metrics.
- Why it matters: This is the join key that lets every query filter by brand. Without it, multi-brand queries require guesswork.
- Priority: **future** (only when a second brand is confirmed)
- Dependencies: brands table.

---

## 2. Time-Series Performance

The current performance tables store snapshots, but franchise dashboards need trends: week-over-week, month-over-month, year-over-year comparisons.

### Recommendations

**performance_daily_summary table**
- One row per location per day. Columns: location ID, date, revenue, transaction count, average ticket, labor hours, labor cost, waste amount, customer count.
- Aggregated from raw performance_data and revenue_data, either by a nightly cron job or a Supabase database function.
- Why it matters: Querying raw transaction-level data for trend charts is slow. A daily summary table makes dashboards snappy and keeps the AI query feature from scanning millions of rows.
- Priority: **should-have**
- Dependencies: Existing performance_data and revenue_data tables.

**performance_monthly_rollup table**
- One row per location per month. Same metrics as daily but pre-aggregated to monthly totals and averages. Includes month-over-month change percentages.
- Why it matters: Executive dashboards and franchise comparison views need monthly data instantly, not computed on the fly.
- Priority: **should-have**
- Dependencies: performance_daily_summary.

**city_benchmarks table**
- One row per city per month. Stores median and percentile values (25th, 50th, 75th, 90th) for key metrics across all locations in that city.
- Why it matters: Lets any location instantly see how it compares to its city average. Critical for the AI query feature ("How does our Madrid store compare to the city average?").
- Priority: **should-have**
- Dependencies: performance_monthly_rollup.

**Materialized view: location_performance_current**
- A materialized view that always holds the latest 30-day rolling metrics for each location. Refreshed daily.
- Why it matters: The most common dashboard query is "how is this location doing right now?" This eliminates the need to compute trailing averages on every page load.
- Priority: **should-have**
- Dependencies: performance_daily_summary.

---

## 3. AI Query Optimization

The AI query feature (from ai-query-feature.md) will translate natural language into database queries. The schema should make this easier and trackable.

### Recommendations

**table_descriptions table**
- One row per table. Columns: table name, plain-English description of what it stores, list of key columns with descriptions, example questions this table can answer, relationships to other tables.
- Why it matters: The AI needs context to write correct queries. Storing table descriptions in the database (rather than hard-coded in application code) means they stay in sync as the schema evolves. Any developer who adds a table also adds its description.
- Priority: **should-have**
- Dependencies: None.

**column_descriptions table**
- One row per column per table. Columns: table name, column name, data type, plain-English description, example values, whether it's a foreign key and what it references.
- Why it matters: More granular than table descriptions. Helps the AI distinguish between similarly-named columns across tables (e.g., "score" in gravity_scores vs. "score" in benchmarks).
- Priority: **should-have**
- Dependencies: table_descriptions.

**ai_query_log table**
- One row per AI query. Columns: user ID, timestamp, natural language question, generated SQL or API call, result row count, execution time in milliseconds, token count (input + output), model used, whether the user marked the result as helpful, error message if failed.
- Why it matters: Tracks usage patterns, identifies expensive queries, measures AI accuracy over time, and provides data for billing or rate-limiting. Also a goldmine for improving the AI — failed queries show where the schema descriptions are unclear.
- Priority: **should-have**
- Dependencies: AI query feature being implemented.

**ai_token_budget table**
- One row per user or per organization per month. Columns: user/org ID, month, token limit, tokens used, query count, last reset date.
- Why it matters: AI queries cost money. Without budget tracking, a single power user could run up a large bill. This enables usage caps and cost visibility.
- Priority: **nice-to-have**
- Dependencies: ai_query_log.

**saved_queries table**
- One row per saved query. Columns: user ID, name, natural language question, generated query, pinned (boolean), created date, last run date, share scope (private / team / public).
- Why it matters: Users will ask the same questions repeatedly ("Which Madrid location had the highest revenue last month?"). Saved queries avoid re-generating the same AI output and give users a personal dashboard of bookmarked insights.
- Priority: **nice-to-have**
- Dependencies: AI query feature.

---

## 4. Location Lifecycle

A location moves through defined stages: prospect, pitched, approved, under-construction, open, operating, underperforming, closed. The current schema captures some of this through pitches and approvals but has no unified lifecycle view.

### Recommendations

**location_lifecycle table**
- One row per lifecycle event. Columns: location ID, previous status, new status, changed by (user ID), changed at (timestamp), reason/notes, supporting document URLs.
- Why it matters: Creates a complete history of every location's journey. Enables queries like "How long does it take from pitch to opening in Barcelona?" or "Which locations were approved but never opened?"
- Priority: **should-have**
- Dependencies: A standardized set of lifecycle statuses (see location_statuses below).

**location_statuses enum or reference table**
- Defines the allowed statuses: prospect, pitched, under-review, approved, rejected, lease-signed, under-construction, open, operating, underperforming, temporarily-closed, permanently-closed.
- Why it matters: Without a controlled list, statuses drift ("open" vs "Open" vs "operating" vs "active"). An enum or reference table enforces consistency, which is critical for the AI query feature.
- Priority: **should-have**
- Dependencies: None.

**location_milestones table**
- One row per milestone per location. Columns: location ID, milestone type (lease signed, permits obtained, construction started, soft open, grand open, first profitable month), target date, actual date, responsible user, notes.
- Why it matters: Tracks whether locations are on schedule. Enables alerts like "This location was supposed to open 3 weeks ago." Essential for franchise operations managers overseeing multiple cities.
- Priority: **nice-to-have**
- Dependencies: location_lifecycle.

---

## 5. Franchise Agreement Tracking

Every franchise location has legal and financial obligations: lease terms, franchise agreements, renewal dates, rent escalations. None of this is currently in the schema.

### Recommendations

**lease_agreements table**
- One row per lease. Columns: location ID, landlord name, landlord contact, lease start date, lease end date, renewal option (yes/no), renewal deadline, monthly rent, rent escalation percentage, rent escalation frequency, security deposit, square meters, special terms (text), document URL, status (active / expired / terminated).
- Why it matters: Missed renewal deadlines can mean losing a location. Rent escalations affect profitability forecasts. This is table-stakes data for franchise operations.
- Priority: **should-have**
- Dependencies: None.

**franchise_agreements table**
- One row per franchise agreement per location. Columns: location ID, agreement type (franchise / sub-franchise / company-owned), start date, end date, renewal terms, royalty percentage, marketing fund percentage, minimum performance requirements, termination conditions, document URL, status.
- Why it matters: If The Miners ever franchises locations (rather than company-operating all of them), this tracks the legal relationship. Even for company-owned locations, it can track internal agreements between HQ and city operations teams.
- Priority: **nice-to-have**
- Dependencies: None.

**contract_reminders table**
- One row per reminder. Columns: related table (lease or franchise agreement), related record ID, reminder type (renewal deadline, rent review, insurance renewal, license renewal), reminder date, advance notice days, assigned to (user ID), status (pending / sent / acknowledged / actioned), notes.
- Why it matters: Automates the "don't forget" problem. Connects to the notification system (section 6) to alert the right person at the right time.
- Priority: **nice-to-have**
- Dependencies: lease_agreements or franchise_agreements, notification system.

---

## 6. Notification System

The current schema has mentions and an activity log, but no structured notification system that can handle approval updates, performance alerts, deadline reminders, and user preferences.

### Recommendations

**notifications table**
- One row per notification. Columns: recipient user ID, notification type (approval-update, performance-alert, deadline-reminder, mention, system-announcement), title, body, related entity type (location, pitch, lease, etc.), related entity ID, link URL, created at, read at (null if unread), dismissed at.
- Why it matters: A single unified table for all notifications means the frontend only needs one query to populate the notification bell. The AI query feature can also answer "What notifications did I miss this week?"
- Priority: **should-have**
- Dependencies: None.

**notification_preferences table**
- One row per user per notification type. Columns: user ID, notification type, in-app enabled (boolean), email enabled (boolean), email digest frequency (instant / daily / weekly / off), push enabled (boolean if mobile is ever added).
- Why it matters: Users get overwhelmed by notifications. Letting them control what they receive and how they receive it is essential for adoption.
- Priority: **should-have**
- Dependencies: notifications table.

**performance_alert_rules table**
- One row per alert rule. Columns: rule name, metric (revenue, transactions, average ticket, etc.), condition (below threshold, above threshold, week-over-week decline exceeds percentage), threshold value, applies to (specific location, city, or all), notify role or specific user, enabled (boolean), cooldown period (don't re-alert for X days).
- Why it matters: Turns the performance data from passive dashboards into active monitoring. "Alert me if any Prague location's weekly revenue drops more than 15%" is the kind of rule that prevents small problems from becoming big ones.
- Priority: **nice-to-have**
- Dependencies: notifications table, performance_daily_summary.

---

## 7. Audit Trail

The current activity_log captures user actions, but a proper audit trail needs to capture the actual data that changed (before and after values) for compliance and debugging.

### Recommendations

**audit_log table**
- One row per change. Columns: table name, record ID, action (insert / update / delete), changed by (user ID), changed at (timestamp), old values (JSON), new values (JSON), IP address, session ID.
- This should be populated automatically by Supabase database triggers, not by application code (application code can be bypassed or forgotten).
- Why it matters: When a gravity score changes, or a performance number is edited, or an approval status flips, you need to know who did it, when, and what the previous value was. This is non-negotiable for franchise operations where financial data is involved.
- Priority: **should-have**
- Dependencies: None (can be implemented purely at the database level with triggers).

**data_change_requests table**
- One row per change request. Columns: requester user ID, table name, record ID, proposed changes (JSON), reason, status (pending / approved / rejected / applied), reviewer user ID, reviewed at, applied at.
- Why it matters: For sensitive data (performance numbers, financial metrics), you may want a "request to change" workflow rather than direct edits. This is especially important if franchise operators can submit their own numbers.
- Priority: **future**
- Dependencies: audit_log, approval workflow.

---

## 8. Data Quality

Schema-level constraints prevent bad data from entering the system. These are cheaper to implement than application-level validation and can't be bypassed.

### Recommendations

**Add CHECK constraints to existing tables**
- revenue_data: revenue must be >= 0, transaction count must be >= 0.
- cafe_performance: rating must be between 0 and 5, review count must be >= 0.
- gravity_scores: score values should have a defined valid range.
- lease_agreements: end date must be after start date, rent must be > 0.
- Why it matters: Without CHECK constraints, a bug in the frontend or API can write negative revenue or a lease that ends before it starts. The database should be the last line of defense.
- Priority: **should-have**
- Dependencies: None.

**Convert text columns to enum types where appropriate**
- Approval statuses, location lifecycle statuses, notification types, pitch statuses, user roles — anywhere a column currently stores free-text but only a handful of values are valid.
- Why it matters: Enums prevent typos and inconsistencies ("approved" vs "Approved" vs "aproved"). They also make the AI query feature more reliable because the AI can list the valid values for any enum column.
- Priority: **should-have**
- Dependencies: Audit existing columns to identify candidates.

**Add NOT NULL constraints to critical columns**
- Any foreign key column that should always reference a parent record.
- Timestamps like created_at and updated_at on every table.
- User ID on any row that represents a user action.
- Why it matters: NULL values in required fields cause silent failures. A performance record with no location ID is useless. A pitch with no creator is untraceable.
- Priority: **should-have**
- Dependencies: Backfill any existing NULL values before adding constraints.

**Add unique constraints and indexes**
- Unique constraint on location + date in performance_daily_summary (prevent duplicate daily records).
- Unique constraint on user + notification type in notification_preferences.
- Composite indexes on frequently queried combinations: (city + status), (location_id + date range), (user_id + created_at).
- Why it matters: Unique constraints prevent duplicate data. Indexes keep queries fast as data grows. Both are especially important for the AI query feature, which will run ad-hoc queries that haven't been manually optimized.
- Priority: **should-have**
- Dependencies: Tables they reference must exist.

---

## Implementation Order

Based on dependencies and impact, here is a suggested rollout sequence:

| Phase | Additions | Rationale |
|-------|-----------|-----------|
| **Phase 1** | Data quality constraints, audit_log, table_descriptions, column_descriptions | Foundation. Makes existing data reliable and prepares for AI queries. No new features needed. |
| **Phase 2** | location_lifecycle, location_statuses, notifications, notification_preferences | Core franchise operations. Gives every location a trackable status and every user a notification inbox. |
| **Phase 3** | performance_daily_summary, performance_monthly_rollup, city_benchmarks, ai_query_log | Enables time-series dashboards and AI query feature. Requires Phase 1 for data quality. |
| **Phase 4** | lease_agreements, contract_reminders, performance_alert_rules, saved_queries | Operational depth. Requires Phase 2 (notifications) and Phase 3 (performance summaries). |
| **Phase 5** | brands, brand_settings, franchise_agreements, data_change_requests, ai_token_budget | Future expansion. Only when multi-brand or franchising becomes a real business need. |

---

## Key Principles

1. **Add structure early, data later.** Creating a table with the right columns costs nothing. Retrofitting structure onto messy data is painful.
2. **Enforce at the database level.** Application-level validation is important but insufficient. The database should reject bad data even if the app has a bug.
3. **Design for the AI.** Every table and column should have a plain-English description stored in the database. If a human can't describe what a column contains, the AI certainly can't query it correctly.
4. **Track time, not just state.** Don't just store "this location is open." Store "this location moved from approved to open on March 3, 2026, by user X." History is what turns a database into an operations platform.
5. **Notifications are infrastructure.** Every new feature (performance alerts, lease reminders, approval updates) will eventually need to notify someone. Build the notification system once and let everything plug into it.
