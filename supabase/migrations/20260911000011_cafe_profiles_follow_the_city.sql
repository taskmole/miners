-- Café records follow the city.
--
-- cafe_profiles was readable by anyone signed in: its SELECT policy was a bare
-- is_authenticated(). A brand-new, inactive, zero-grant account read
-- monthly_revenue straight from PostgREST. It was also not city-scoped, so a
-- Madrid-only person could read every Prague café.
--
-- All four policies are scoped through the parent place, not just SELECT.
-- Scoping SELECT alone would break the edit screen: the write policies are a
-- global is_admin(), so a Prague-only Approver could UPDATE a Madrid café and
-- then fail to read it back. /api/db/cafe-profiles does
-- .update(...).select().single(), which returns no row and throws, surfacing as
-- a 500 that reads like a crash.
--
-- `view` for reading, `approve` for writing, alongside the existing is_admin().
-- is_admin() is now itself gated on is_active by 20260911000010, so an inactive
-- Approver fails both halves.
--
-- Safe against the code that is live right now: /api/db/cafe-profiles already
-- lists places first (RLS filtered) and then fetches profiles for those ids, so
-- the visible set is unchanged for everyone active and in-city. 23 rows, so no
-- performance concern.
--
-- Rollback:
--   DROP POLICY cafe_profiles_select ON public.cafe_profiles;
--   CREATE POLICY cafe_profiles_select ON public.cafe_profiles FOR SELECT USING (is_authenticated());
--   DROP POLICY cafe_profiles_insert ON public.cafe_profiles;
--   CREATE POLICY cafe_profiles_insert ON public.cafe_profiles FOR INSERT WITH CHECK (is_admin());
--   DROP POLICY cafe_profiles_update ON public.cafe_profiles;
--   CREATE POLICY cafe_profiles_update ON public.cafe_profiles FOR UPDATE USING (is_admin());
--   DROP POLICY cafe_profiles_delete ON public.cafe_profiles;
--   CREATE POLICY cafe_profiles_delete ON public.cafe_profiles FOR DELETE USING (is_admin());

DROP POLICY IF EXISTS cafe_profiles_select ON public.cafe_profiles;
CREATE POLICY cafe_profiles_select ON public.cafe_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_profiles.place_id
        AND public.has_city_level(p.city_id, 'view')
    )
  );

DROP POLICY IF EXISTS cafe_profiles_insert ON public.cafe_profiles;
CREATE POLICY cafe_profiles_insert ON public.cafe_profiles
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_profiles.place_id
        AND public.has_city_level(p.city_id, 'approve')
    )
  );

-- No WITH CHECK spelled out: Postgres defaults an UPDATE policy's WITH CHECK to
-- its USING expression, so the row cannot be moved to a place outside the
-- writer's cities either.
DROP POLICY IF EXISTS cafe_profiles_update ON public.cafe_profiles;
CREATE POLICY cafe_profiles_update ON public.cafe_profiles
  FOR UPDATE
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_profiles.place_id
        AND public.has_city_level(p.city_id, 'approve')
    )
  );

DROP POLICY IF EXISTS cafe_profiles_delete ON public.cafe_profiles;
CREATE POLICY cafe_profiles_delete ON public.cafe_profiles
  FOR DELETE
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_profiles.place_id
        AND public.has_city_level(p.city_id, 'approve')
    )
  );
