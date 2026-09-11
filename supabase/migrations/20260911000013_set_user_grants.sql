-- One atomic grants write.
--
-- Two defects, one cause. PUT /api/db/user-grants deleted the dropped cities
-- first and upserted the new ones second, with no transaction:
--
--   1. It reported success when RLS had refused. A DELETE that matches zero
--      rows under RLS is not an error, so a non-super-admin sending
--      grants: [] got back 200 [] and nothing changed. Silent refusal is the
--      worst possible answer: the screen says saved, the database says no.
--   2. It could leave somebody with no cities at all. Move a person from
--      Madrid+Prague to a city that does not exist and the delete lands, the
--      insert 500s, and they end up with nothing.
--
-- One function fixes both. It re-checks is_super_admin() INSIDE, because
-- SECURITY DEFINER means RLS is no longer doing that job; it validates every
-- city against the cities table, so an unknown city raises cleanly instead of
-- a foreign-key 500; and the delete and the insert share one function body, so
-- the write is all-or-nothing.
--
-- Same shape and the same REVOKE/GRANT footer as invite_contributor() in
-- 20260911000007. The footer is the step that got missed once already today.
--
-- Nothing calls it yet. The route switches to it in the code deploy.
--
-- Undo:
--   DROP FUNCTION public.set_user_grants(uuid, jsonb);

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
  -- being read as "off". The screen stopped sending the per-city financials
  -- tick when the switch moved onto the person, and without this the first
  -- save after that would quietly clear the old column on every city, on a
  -- table the finance helper is still reading.
  WITH incoming AS (
    SELECT g->>'city_id'                        AS city_id,
           g->>'level'                          AS level,
           (g->>'can_see_financials')::boolean  AS fin,
           (g->>'receives_alerts')::boolean     AS alerts
    FROM jsonb_array_elements(p_grants) g
  )
  INSERT INTO public.user_city_grants (user_id, city_id, level, can_see_financials, receives_alerts)
  SELECT p_user_id,
         i.city_id,
         i.level,
         coalesce(i.fin,    cur.can_see_financials, false),
         coalesce(i.alerts, cur.receives_alerts,    false)
  FROM incoming i
  LEFT JOIN public.user_city_grants cur
    ON cur.user_id = p_user_id AND cur.city_id = i.city_id
  ON CONFLICT (user_id, city_id) DO UPDATE
    SET level              = excluded.level,
        can_see_financials = excluded.can_see_financials,
        receives_alerts    = excluded.receives_alerts;

  -- The same shape the route used to return, so the browser sees no change.
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT user_id, city_id, level, can_see_financials, receives_alerts
    FROM public.user_city_grants
    WHERE user_id = p_user_id
    ORDER BY city_id
  ) x;

  RETURN v_result;
END;
$function$;

-- Callable by signed-in users; the function decides whether they may. anon has
-- no business here at all, and the first line would reject it anyway.
REVOKE EXECUTE ON FUNCTION public.set_user_grants(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_grants(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.set_user_grants(uuid, jsonb) IS
  'Replaces one person''s city grants in a single all-or-nothing write. '
  'Super admin only, re-checked inside because SECURITY DEFINER bypasses RLS.';
