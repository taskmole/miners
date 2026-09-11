-- Account off means off.
--
-- Until now `is_active` was enforced nowhere in the database. Switching an
-- account off hid the app in the browser but left every policy open: an
-- inactive person could still read places, café records and the Madrid CSV
-- straight from PostgREST. The only check lived in src/app/page.tsx and it
-- failed OPEN in its catch block.
--
-- Each of the four helpers below now answers false for an inactive person on
-- the GRANT-DERIVED branch only. The super-admin branch is deliberately left
-- untouched: `is_admin()` guards the user_profiles UPDATE policy and
-- `enforce_profile_field_locks()` stops a non-admin changing `is_active` even
-- on their own row, so gating the whole function would let an inactive super
-- admin lock every super admin out permanently, recoverable only from the
-- Supabase dashboard. Documented consequence: an inactive super admin still
-- reads everything. Both current super admins are active.
--
-- `is_active IS DISTINCT FROM false`, never a bare `AND p.is_active`: the
-- column is nullable (default true, 0 NULLs today) and `AND NULL` would
-- silently cut a future NULL row. This is the form 20260911000008 uses.
--
-- The check folds into the existing user_profiles EXISTS rather than adding a
-- third subquery. has_city_level() sits on 8 SELECT policies including the
-- 3936-row places query, so a separate lookup would cost 50% more per call.
-- Reading the profile row also costs nothing extra in correctness terms: every
-- user_city_grants row has a FK to user_profiles, so a grant implies a profile.
--
-- Rollback: re-run 20260911000004_helpers_read_grants_only.sql, which holds the
-- pre-change bodies of all four functions.

CREATE OR REPLACE FUNCTION public.has_city_level(p_city_id text, p_min_level text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND (
        -- The switch means everything everywhere, including cities that do not
        -- exist yet, so it is answered before the grants are read at all.
        p.is_super_admin
        OR (
          p.is_active IS DISTINCT FROM false
          AND EXISTS (
            SELECT 1 FROM public.user_city_grants g
            WHERE g.user_id = p.id
              AND g.city_id = p_city_id
              -- The ladder is cumulative: approve implies contribute implies
              -- view. Spelled out as an array position rather than an enum so
              -- that adding a level later does not need a type migration.
              AND array_position(ARRAY['view','contribute','approve'], g.level)
                  >= array_position(ARRAY['view','contribute','approve'], p_min_level)
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.is_active IS DISTINCT FROM false
          AND EXISTS (
            SELECT 1 FROM public.user_city_grants g
            WHERE g.user_id = p.id AND g.level = 'approve'
          )
        )
      )
  );
$function$;

-- is_dashboard_role() is a byte-identical twin of is_admin() today. Edited the
-- same way rather than aliased to it, so that the two can diverge later without
-- a surprise.
CREATE OR REPLACE FUNCTION public.is_dashboard_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.is_active IS DISTINCT FROM false
          AND EXISTS (
            SELECT 1 FROM public.user_city_grants g
            WHERE g.user_id = p.id AND g.level = 'approve'
          )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_finance_plus()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles p
    WHERE p.id = auth.uid()
      AND (
        p.is_super_admin
        OR (
          p.is_active IS DISTINCT FROM false
          AND EXISTS (
            SELECT 1 FROM public.user_city_grants g
            WHERE g.user_id = p.id AND g.can_see_financials
          )
        )
      )
  );
$function$;
