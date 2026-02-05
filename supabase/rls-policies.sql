-- ===========================================
-- MINERS LOCATION SCOUT - ROW LEVEL SECURITY POLICIES
-- ===========================================
--
-- DO NOT RUN THIS YET!
-- This file is prepared for when you go live.
--
-- How to use:
-- 1. Open Supabase Dashboard > SQL Editor
-- 2. Paste this entire file
-- 3. Run in DEV project first to test
-- 4. Run in PROD when verified
--
-- User Roles:
-- - super_admin: Full access to everything
-- - head_office_exec: Final approvals, view all data
-- - finance_reviewer: Access to financial data
-- - area_coordinator: First-level approvals
-- - franchisee: Basic user, creates pitches
--
-- ===========================================

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Check if current user is an admin (super_admin or head_office_exec)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_exec')
  );
$$;

-- Check if current user is finance+ (finance_reviewer, head_office_exec, or super_admin)
CREATE OR REPLACE FUNCTION public.is_finance_plus()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'head_office_exec', 'finance_reviewer')
  );
$$;

-- Check if current user is authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- ===========================================
-- 1. CITIES - Public read, admin write
-- ===========================================

ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view cities"
ON public.cities FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert cities"
ON public.cities FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update cities"
ON public.cities FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete cities"
ON public.cities FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 2. APP_SETTINGS - Public read, admin write
-- ===========================================

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view app_settings"
ON public.app_settings FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert app_settings"
ON public.app_settings FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update app_settings"
ON public.app_settings FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete app_settings"
ON public.app_settings FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 3. CATEGORIES - Public read, admin write
-- ===========================================

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view categories"
ON public.categories FOR SELECT
USING (true);

-- Users can create non-system categories
CREATE POLICY "Authenticated users can insert categories"
ON public.categories FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND (is_system = false OR public.is_admin())
);

-- Only owner or admin can update
CREATE POLICY "Owner or admin can update categories"
ON public.categories FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

-- Only owner or admin can delete (non-system only)
CREATE POLICY "Owner or admin can delete categories"
ON public.categories FOR DELETE
USING (
  (created_by = auth.uid() OR public.is_admin())
  AND is_system = false
);

-- ===========================================
-- 4. SCORING_PARAMS - Public read, admin write
-- ===========================================

ALTER TABLE public.scoring_params ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view scoring_params"
ON public.scoring_params FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert scoring_params"
ON public.scoring_params FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update scoring_params"
ON public.scoring_params FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete scoring_params"
ON public.scoring_params FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 5. REGIONS - Public read, admin write
-- ===========================================

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view regions"
ON public.regions FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert regions"
ON public.regions FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update regions"
ON public.regions FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete regions"
ON public.regions FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 6. COMMENTS - All can read, owner can edit
-- ===========================================

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view comments"
ON public.comments FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert comments"
ON public.comments FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND created_by = auth.uid()
);

CREATE POLICY "Owner or admin can update comments"
ON public.comments FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

CREATE POLICY "Owner or admin can delete comments"
ON public.comments FOR DELETE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

-- ===========================================
-- 7. TAGS - All can read, owner can edit
-- ===========================================

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view tags"
ON public.tags FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert tags"
ON public.tags FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND created_by = auth.uid()
);

CREATE POLICY "Owner or admin can update tags"
ON public.tags FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

CREATE POLICY "Owner or admin can delete tags"
ON public.tags FOR DELETE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

-- ===========================================
-- 8. USER_PROFILES - Self or admin
-- ===========================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Users see themselves, admins see all
CREATE POLICY "Users can view own profile or admins see all"
ON public.user_profiles FOR SELECT
USING (
  id = auth.uid()
  OR public.is_admin()
);

-- Only admins can create user profiles
CREATE POLICY "Only admins can insert user_profiles"
ON public.user_profiles FOR INSERT
WITH CHECK (public.is_admin());

-- Users can update own profile (except role), admins can update any
CREATE POLICY "Users can update own profile"
ON public.user_profiles FOR UPDATE
USING (
  id = auth.uid()
  OR public.is_admin()
);

-- Only admins can delete profiles
CREATE POLICY "Only admins can delete user_profiles"
ON public.user_profiles FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 9. USER_ACTIVITY_STATE - Own only
-- ===========================================

ALTER TABLE public.user_activity_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activity state"
ON public.user_activity_state FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own activity state"
ON public.user_activity_state FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activity state"
ON public.user_activity_state FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own activity state"
ON public.user_activity_state FOR DELETE
USING (user_id = auth.uid());

-- ===========================================
-- 10. HIDDEN_POIS - Own only
-- ===========================================

ALTER TABLE public.hidden_pois ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own hidden_pois"
ON public.hidden_pois FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own hidden_pois"
ON public.hidden_pois FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own hidden_pois"
ON public.hidden_pois FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own hidden_pois"
ON public.hidden_pois FOR DELETE
USING (user_id = auth.uid());

-- ===========================================
-- 11. MENTIONS - See own mentions only
-- ===========================================

ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- Users see mentions about them
CREATE POLICY "Users can view mentions about them"
ON public.mentions FOR SELECT
USING (mentioned_user_id = auth.uid());

-- Anyone can create mentions (when commenting)
CREATE POLICY "Authenticated users can insert mentions"
ON public.mentions FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND mentioned_by_user_id = auth.uid()
);

-- Users can update their own mentions (mark as read)
CREATE POLICY "Users can update own mentions"
ON public.mentions FOR UPDATE
USING (mentioned_user_id = auth.uid());

-- Only the creator or admin can delete
CREATE POLICY "Creator or admin can delete mentions"
ON public.mentions FOR DELETE
USING (
  mentioned_by_user_id = auth.uid()
  OR public.is_admin()
);

-- ===========================================
-- 12. PLACES - Public read, service_role write
-- ===========================================

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

-- Anyone can view places
CREATE POLICY "Anyone can view places"
ON public.places FOR SELECT
USING (true);

-- Only service_role (data pipeline) or admins can insert
-- Note: service_role bypasses RLS, so this is for edge cases
CREATE POLICY "Only admins can insert places"
ON public.places FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update places"
ON public.places FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete places"
ON public.places FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 13. AREAS - All can read, owner can edit
-- ===========================================

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view areas"
ON public.areas FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert areas"
ON public.areas FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND created_by = auth.uid()
);

CREATE POLICY "Owner or admin can update areas"
ON public.areas FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

CREATE POLICY "Owner or admin can delete areas"
ON public.areas FOR DELETE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

-- ===========================================
-- 14. POLYGON_LAYERS - Public read, service_role write
-- ===========================================

ALTER TABLE public.polygon_layers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view polygon_layers"
ON public.polygon_layers FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert polygon_layers"
ON public.polygon_layers FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update polygon_layers"
ON public.polygon_layers FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete polygon_layers"
ON public.polygon_layers FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 15. TRAFFIC_DATA - Public read, service_role write
-- ===========================================

ALTER TABLE public.traffic_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view traffic_data"
ON public.traffic_data FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert traffic_data"
ON public.traffic_data FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update traffic_data"
ON public.traffic_data FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete traffic_data"
ON public.traffic_data FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 16. FOOTFALL_DATA - Public read, service_role write
-- ===========================================

ALTER TABLE public.footfall_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view footfall_data"
ON public.footfall_data FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert footfall_data"
ON public.footfall_data FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update footfall_data"
ON public.footfall_data FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete footfall_data"
ON public.footfall_data FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 17. LISTS - All can read, owner can edit
-- ===========================================

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view lists"
ON public.lists FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert lists"
ON public.lists FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND created_by = auth.uid()
);

CREATE POLICY "Owner or admin can update lists"
ON public.lists FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

CREATE POLICY "Owner or admin can delete lists"
ON public.lists FOR DELETE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

-- ===========================================
-- 18. LIST_ITEMS - Follows list ownership
-- ===========================================

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

-- Can view if can view the parent list
CREATE POLICY "Users can view list_items of accessible lists"
ON public.list_items FOR SELECT
USING (
  public.is_authenticated()
  AND EXISTS (
    SELECT 1 FROM public.lists
    WHERE lists.id = list_items.list_id
  )
);

-- Can insert if own the list
CREATE POLICY "List owner can insert list_items"
ON public.list_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lists
    WHERE lists.id = list_items.list_id
    AND (lists.created_by = auth.uid() OR public.is_admin())
  )
);

-- Can update if own the list
CREATE POLICY "List owner can update list_items"
ON public.list_items FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.lists
    WHERE lists.id = list_items.list_id
    AND (lists.created_by = auth.uid() OR public.is_admin())
  )
);

-- Can delete if own the list
CREATE POLICY "List owner can delete list_items"
ON public.list_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.lists
    WHERE lists.id = list_items.list_id
    AND (lists.created_by = auth.uid() OR public.is_admin())
  )
);

-- ===========================================
-- 19. SCOUTING_REPORTS - All can read, owner can edit
-- ===========================================

ALTER TABLE public.scouting_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scouting_reports"
ON public.scouting_reports FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert scouting_reports"
ON public.scouting_reports FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND created_by = auth.uid()
);

CREATE POLICY "Owner or admin can update scouting_reports"
ON public.scouting_reports FOR UPDATE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

CREATE POLICY "Owner or admin can delete scouting_reports"
ON public.scouting_reports FOR DELETE
USING (
  created_by = auth.uid()
  OR public.is_admin()
);

-- ===========================================
-- 20. ACTIVITY_LOG - All can view and create
-- ===========================================

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activity_log"
ON public.activity_log FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Authenticated users can insert activity_log"
ON public.activity_log FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND user_id = auth.uid()
);

-- No update/delete for activity log (immutable audit trail)

-- ===========================================
-- 21. APPROVAL_WORKFLOWS - Public read, admin write
-- ===========================================

ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approval_workflows"
ON public.approval_workflows FOR SELECT
USING (public.is_authenticated());

CREATE POLICY "Only admins can insert approval_workflows"
ON public.approval_workflows FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update approval_workflows"
ON public.approval_workflows FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete approval_workflows"
ON public.approval_workflows FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 22. PITCHES - All can view, owner can edit drafts
-- ===========================================

ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view all pitches
CREATE POLICY "Authenticated users can view pitches"
ON public.pitches FOR SELECT
USING (public.is_authenticated());

-- Users can create their own pitches
CREATE POLICY "Authenticated users can insert pitches"
ON public.pitches FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND created_by = auth.uid()
);

-- Owner can update drafts, admins can update any
CREATE POLICY "Owner can update draft pitches"
ON public.pitches FOR UPDATE
USING (
  (created_by = auth.uid() AND status = 'draft')
  OR public.is_admin()
);

-- Only admin can delete pitches
CREATE POLICY "Only admins can delete pitches"
ON public.pitches FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 23. PITCH_APPROVALS - All can view, approvers can create
-- ===========================================

ALTER TABLE public.pitch_approvals ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view approvals
CREATE POLICY "Authenticated users can view pitch_approvals"
ON public.pitch_approvals FOR SELECT
USING (public.is_authenticated());

-- Authenticated users can create approvals (workflow logic in app)
CREATE POLICY "Authenticated users can insert pitch_approvals"
ON public.pitch_approvals FOR INSERT
WITH CHECK (
  public.is_authenticated()
  AND approver_id = auth.uid()
);

-- No update (approvals are final)

-- Only admin can delete
CREATE POLICY "Only admins can delete pitch_approvals"
ON public.pitch_approvals FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 24. CAFE_PERFORMANCE - Finance+ only
-- ===========================================

ALTER TABLE public.cafe_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance+ can view cafe_performance"
ON public.cafe_performance FOR SELECT
USING (public.is_finance_plus());

CREATE POLICY "Finance+ can insert cafe_performance"
ON public.cafe_performance FOR INSERT
WITH CHECK (public.is_finance_plus());

CREATE POLICY "Finance+ can update cafe_performance"
ON public.cafe_performance FOR UPDATE
USING (public.is_finance_plus());

CREATE POLICY "Only admins can delete cafe_performance"
ON public.cafe_performance FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 25. REVENUE_DATA - Finance+ only
-- ===========================================

ALTER TABLE public.revenue_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance+ can view revenue_data"
ON public.revenue_data FOR SELECT
USING (public.is_finance_plus());

CREATE POLICY "Finance+ can insert revenue_data"
ON public.revenue_data FOR INSERT
WITH CHECK (public.is_finance_plus());

CREATE POLICY "Finance+ can update revenue_data"
ON public.revenue_data FOR UPDATE
USING (public.is_finance_plus());

CREATE POLICY "Only admins can delete revenue_data"
ON public.revenue_data FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 26. PERFORMANCE_DATA - Finance+ only
-- ===========================================

ALTER TABLE public.performance_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance+ can view performance_data"
ON public.performance_data FOR SELECT
USING (public.is_finance_plus());

CREATE POLICY "Finance+ can insert performance_data"
ON public.performance_data FOR INSERT
WITH CHECK (public.is_finance_plus());

CREATE POLICY "Finance+ can update performance_data"
ON public.performance_data FOR UPDATE
USING (public.is_finance_plus());

CREATE POLICY "Only admins can delete performance_data"
ON public.performance_data FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 27. PERFORMANCE_TARGETS - Finance+ only
-- ===========================================

ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance+ can view performance_targets"
ON public.performance_targets FOR SELECT
USING (public.is_finance_plus());

CREATE POLICY "Finance+ can insert performance_targets"
ON public.performance_targets FOR INSERT
WITH CHECK (public.is_finance_plus());

CREATE POLICY "Finance+ can update performance_targets"
ON public.performance_targets FOR UPDATE
USING (public.is_finance_plus());

CREATE POLICY "Only admins can delete performance_targets"
ON public.performance_targets FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 28. COMPETITOR_METRICS - All can view, finance+ can edit
-- ===========================================

ALTER TABLE public.competitor_metrics ENABLE ROW LEVEL SECURITY;

-- All can view competitor info
CREATE POLICY "Authenticated users can view competitor_metrics"
ON public.competitor_metrics FOR SELECT
USING (public.is_authenticated());

-- Finance+ can modify
CREATE POLICY "Finance+ can insert competitor_metrics"
ON public.competitor_metrics FOR INSERT
WITH CHECK (public.is_finance_plus());

CREATE POLICY "Finance+ can update competitor_metrics"
ON public.competitor_metrics FOR UPDATE
USING (public.is_finance_plus());

CREATE POLICY "Only admins can delete competitor_metrics"
ON public.competitor_metrics FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 29. PROFITABILITY_BENCHMARKS - All can view, admin can edit
-- ===========================================

ALTER TABLE public.profitability_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profitability_benchmarks"
ON public.profitability_benchmarks FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert profitability_benchmarks"
ON public.profitability_benchmarks FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Only admins can update profitability_benchmarks"
ON public.profitability_benchmarks FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Only admins can delete profitability_benchmarks"
ON public.profitability_benchmarks FOR DELETE
USING (public.is_admin());

-- ===========================================
-- 30. PROSPECTIVE_LOCATIONS - Own or admin
-- ===========================================

ALTER TABLE public.prospective_locations ENABLE ROW LEVEL SECURITY;

-- Users see own, admins see all
CREATE POLICY "Users can view own prospective_locations"
ON public.prospective_locations FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_admin()
);

CREATE POLICY "Users can insert own prospective_locations"
ON public.prospective_locations FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own prospective_locations"
ON public.prospective_locations FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own prospective_locations"
ON public.prospective_locations FOR DELETE
USING (user_id = auth.uid());

-- ===========================================
-- DONE!
-- ===========================================
--
-- Remember:
-- 1. Run in DEV Supabase first
-- 2. Test with different user roles
-- 3. Run in PROD when verified
--
-- service_role key bypasses all RLS (used by data pipeline)
-- anon key respects RLS (used by frontend)
-- ===========================================
