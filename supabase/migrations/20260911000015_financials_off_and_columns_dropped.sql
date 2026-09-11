-- Financials off for everyone, and the dead columns go.
--
-- Three things finish here.
--
-- 1. THE SWITCH GOES OFF. Six people carried the financials flag: two super
--    admins, who see revenue through the Super Admin switch regardless, and
--    four others. The user screen now shows Financials as coming soon and off
--    for everybody, and a greyed-out Off that four people can see straight
--    through would be exactly the lying screen this whole change set out to
--    remove. Egor, Max Vankevich and Razmik lose the one revenue figure.
--    Katerina is switched off anyway.
--
--    Undo, if the feature ships tomorrow:
--      UPDATE public.user_profiles SET can_see_financials = true
--      WHERE email IN ('egor.kolpakov@theminers.eu', 'max.vankevich@theminers.eu',
--                      'razmik.yedgaryan@theminers.eu');
--
-- 2. REVENUE'S OLD HOME GOES. cafe_profiles.monthly_revenue was readable by
--    anyone signed in until this morning. 20260911000014 gave the number its
--    own table with its own policy, the code has been reading and writing
--    there since the last deploy, and the old column is now a second copy that
--    only new bugs could ever read.
--
-- 3. THE PER-CITY TICK GOES. user_city_grants.can_see_financials, along with
--    the three places that still touch it: is_finance_plus(), which no longer
--    needs the OR; set_user_grants(), which stopped being sent the key when
--    the screen dropped the control; and invite_contributor(), which would
--    break on its INSERT the moment the column vanished.
--
-- Safe against the code that is live right now: the deploy before this one
-- removed every SELECT of both columns. Verified against the running site
-- before applying.
--
-- Rollback: re-add either column (nullable, default false), re-run the
-- 20260911000012 body of is_finance_plus, and put can_see_financials back into
-- the two function bodies below. The revenue figure itself lives in
-- cafe_financials and is not touched here.

-- 1 ----------------------------------------------------------------------
-- Anything still only in the old table comes across first, so the drop below
-- cannot lose a figure saved through the old path. ON CONFLICT DO NOTHING and
-- not a blanket copy: cafe_financials is authoritative now, and re-copying
-- would clobber anything saved through the new one.
INSERT INTO public.cafe_financials (place_id, monthly_revenue)
SELECT c.place_id, c.monthly_revenue
FROM public.cafe_profiles c
WHERE c.monthly_revenue IS NOT NULL
ON CONFLICT (place_id) DO NOTHING;

UPDATE public.user_profiles SET can_see_financials = false WHERE can_see_financials;

-- 2 ----------------------------------------------------------------------
ALTER TABLE public.cafe_profiles DROP COLUMN IF EXISTS monthly_revenue;

-- 3 ----------------------------------------------------------------------
-- One source of truth. The is_active gate from 20260911000010 is carried
-- through unchanged; this body was written from the live pg_get_functiondef
-- output, not from the migration files, because CREATE OR REPLACE replaces
-- everything and writing it from memory is how that gate would quietly vanish.
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
        OR (p.is_active IS DISTINCT FROM false AND p.can_see_financials)
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_user_grants(p_user_id uuid, p_grants jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bad    text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;

  -- The whole point of the function. RLS protected the table; it does not
  -- protect a SECURITY DEFINER body, so the check is written out here.
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin can change who has access to a city.'
      USING ERRCODE = '42501';
  END IF;

  IF p_grants IS NULL OR jsonb_typeof(p_grants) <> 'array' THEN
    RAISE EXCEPTION 'The city list must be an array.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'There is no such person.' USING ERRCODE = '23503';
  END IF;

  SELECT string_agg(DISTINCT coalesce(g->>'level', '(none)'), ', ')
  INTO v_bad
  FROM jsonb_array_elements(p_grants) g
  WHERE coalesce(g->>'level', '') NOT IN ('view', 'contribute', 'approve');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown access level: %.', v_bad USING ERRCODE = '22023';
  END IF;

  -- Checked against cities before anything is written, so an unknown city
  -- leaves the person exactly as they were rather than half-cleared.
  SELECT string_agg(DISTINCT coalesce(g->>'city_id', '(none)'), ', ')
  INTO v_bad
  FROM jsonb_array_elements(p_grants) g
  WHERE NOT EXISTS (SELECT 1 FROM public.cities c WHERE c.id = g->>'city_id');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'There is no city called %.', v_bad USING ERRCODE = '23503';
  END IF;

  -- ON CONFLICT cannot touch the same row twice in one statement, so a list
  -- with a city repeated would raise a cardinality_violation the caller could
  -- not read. Caught here with words instead.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_grants) g
    GROUP BY g->>'city_id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'The same city is listed twice.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.user_city_grants d
  WHERE d.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_grants) g
      WHERE g->>'city_id' = d.city_id
    );

  -- A key the caller left out keeps whatever the row already had, rather than
  -- being read as "off".
  WITH incoming AS (
    SELECT g->>'city_id'                    AS city_id,
           g->>'level'                      AS level,
           (g->>'receives_alerts')::boolean AS alerts
    FROM jsonb_array_elements(p_grants) g
  )
  INSERT INTO public.user_city_grants (user_id, city_id, level, receives_alerts)
  SELECT p_user_id,
         i.city_id,
         i.level,
         coalesce(i.alerts, cur.receives_alerts, false)
  FROM incoming i
  LEFT JOIN public.user_city_grants cur
    ON cur.user_id = p_user_id AND cur.city_id = i.city_id
  ON CONFLICT (user_id, city_id) DO UPDATE
    SET level           = excluded.level,
        receives_alerts = excluded.receives_alerts;

  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT user_id, city_id, level, receives_alerts
    FROM public.user_city_grants
    WHERE user_id = p_user_id
    ORDER BY city_id
  ) x;

  RETURN v_result;
END;
$function$;

-- invite_contributor still wrote the column on every INSERT and would have
-- broken the moment it went. Body reproduced from the live definition with
-- that one field removed.
CREATE OR REPLACE FUNCTION public.invite_contributor(
  p_email        text,
  p_city_id      text,
  p_display_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email  text := lower(trim(p_email));
  v_id     uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'An email address is required.' USING ERRCODE = '22023';
  END IF;

  -- The caller must approve in the city they are inviting into. A super
  -- admin passes this too, via has_city_level().
  IF NOT public.has_city_level(p_city_id, 'approve') THEN
    RAISE EXCEPTION 'You can only invite people into cities you approve in.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cities WHERE id = p_city_id) THEN
    RAISE EXCEPTION 'There is no city called %.', p_city_id USING ERRCODE = '23503';
  END IF;

  -- Brand new people only. Without this, "invite" becomes a way to hand
  -- yourself a grant in somebody else's city by inviting an address that
  -- already has a profile, and the existing profile's access would be
  -- quietly widened.
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Somebody with that email already exists. Ask a super admin to change their access.'
      USING ERRCODE = '23505';
  END IF;

  v_id := gen_random_uuid();

  -- Active immediately: an Approver inviting a franchisee into their own city
  -- is the whole point, and making them chase a super admin to switch the
  -- account on would defeat it. A SUPER ADMIN creating somebody from the
  -- users screen gets the opposite default, no cities and inactive, because
  -- that path is for people whose access is not decided yet.
  INSERT INTO public.user_profiles (id, role, display_name, email, is_active, is_super_admin, city_ids)
  VALUES (v_id, 'franchisee', nullif(trim(coalesce(p_display_name, '')), ''), v_email, true, false, ARRAY[p_city_id]);

  INSERT INTO public.user_city_grants (user_id, city_id, level, receives_alerts)
  VALUES (v_id, p_city_id, 'contribute', false);

  RETURN v_id;
END;
$function$;

ALTER TABLE public.user_city_grants DROP COLUMN IF EXISTS can_see_financials;
