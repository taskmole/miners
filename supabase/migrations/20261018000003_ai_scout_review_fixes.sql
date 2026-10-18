-- AI scout, review fixes.
--
-- 1. The instructions are the customer's location strategy, so only people
--    who train the AI may read them. Everyone else who sees a card gets the
--    labels and weights through ai_profile_labels(), without the guide text,
--    the business description or the learned rules.
-- 2. decide_ai_suggestion() refuses to apply a suggestion tested against an
--    older version (it goes back to testing), and validates a new point's id
--    and label before it can become part of the active instructions.

BEGIN;

DROP POLICY IF EXISTS ai_profiles_read ON public.ai_profiles;
CREATE POLICY ai_profiles_read ON public.ai_profiles
  FOR SELECT TO authenticated USING (public.trains_ai_anywhere());

CREATE OR REPLACE FUNCTION public.ai_profile_labels(p_ids uuid[])
RETURNS TABLE (id uuid, points jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id,
         jsonb_agg(
           jsonb_build_object(
             'id', x->>'id',
             'label', x->>'label',
             'kind', x->>'kind',
             'weight', (x->>'weight')::int)
           ORDER BY t.ord)
  FROM public.ai_profiles p
  CROSS JOIN LATERAL jsonb_array_elements(p.points) WITH ORDINALITY AS t(x, ord)
  WHERE p.id = ANY(p_ids) AND auth.uid() IS NOT NULL
  GROUP BY p.id;
$function$;
REVOKE ALL ON FUNCTION public.ai_profile_labels(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_profile_labels(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decide_ai_suggestion(p_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s       public.ai_suggestions%ROWTYPE;
  cur     public.ai_profiles%ROWTYPE;
  v_rules text[];
  v_pts   jsonb;
  v_new   uuid;
  v_from  text;
  v_to    text;
  v_amt   int;
BEGIN
  IF NOT public.trains_ai_anywhere() THEN
    RAISE EXCEPTION 'You cannot train the AI.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO s FROM public.ai_suggestions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such suggestion.' USING ERRCODE = 'P0002';
  END IF;
  IF s.status NOT IN ('ready', 'held', 'testing') THEN
    RAISE EXCEPTION 'This suggestion was already decided.' USING ERRCODE = '22023';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.ai_suggestions
       SET status = 'skipped', decided_by = auth.uid(), decided_at = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('status', 'skipped');
  END IF;

  IF s.status <> 'ready' THEN
    RAISE EXCEPTION 'Only a tested suggestion that helped can be accepted.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO cur FROM public.ai_profiles
   WHERE customer_id = s.customer_id AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There are no active instructions.' USING ERRCODE = 'P0002';
  END IF;

  -- Scores were measured against one version. If the instructions moved on
  -- since (another accept, a rollback), the numbers no longer hold: send it
  -- back for testing instead of applying it on top. Returned, not raised, so
  -- the reset survives.
  IF s.base_profile_id IS DISTINCT FROM cur.id THEN
    UPDATE public.ai_suggestions
       SET status = 'testing', score_before = NULL, score_after = NULL, sample = NULL
     WHERE id = p_id;
    RETURN jsonb_build_object('status', 'retesting');
  END IF;

  v_rules := cur.rules;
  v_pts   := cur.points;

  IF s.kind = 'rule' THEN
    IF coalesce(s.change->>'add_rule', '') = '' THEN
      RAISE EXCEPTION 'The rule is empty.' USING ERRCODE = '22023';
    END IF;
    v_rules := array_append(v_rules, s.change->>'add_rule');

  ELSIF s.kind = 'point' THEN
    -- A new point takes its weight proportionally from the others, so the
    -- weights still add up to 100.
    v_amt := coalesce((s.change->'add_point'->>'weight')::int, 5);
    IF v_amt < 1 OR v_amt > 30 THEN
      RAISE EXCEPTION 'A new point must weigh between 1 and 30.' USING ERRCODE = '22023';
    END IF;
    -- The id ends up in ai_feedback.point_id (CHECKed against this pattern)
    -- and drives the scorer's output schema, so a bad one would quietly stop
    -- every scoring run.
    IF coalesce(s.change->'add_point'->>'id', '') !~ '^[a-z_]{1,40}$'
       OR coalesce(btrim(s.change->'add_point'->>'label'), '') = ''
       OR char_length(s.change->'add_point'->>'label') > 60 THEN
      RAISE EXCEPTION 'The new rating point needs a short label and a lowercase id.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_pts) x
               WHERE x->>'id' = s.change->'add_point'->>'id') THEN
      RAISE EXCEPTION 'That rating point already exists.' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_agg(jsonb_set(x, '{weight}',
             to_jsonb(round((x->>'weight')::numeric * (100 - v_amt) / 100)::int)))
      INTO v_pts FROM jsonb_array_elements(v_pts) x;
    v_pts := v_pts || jsonb_build_array(
      jsonb_build_object(
        'id', s.change->'add_point'->>'id',
        'label', s.change->'add_point'->>'label',
        'kind', 'ai',
        'weight', v_amt,
        'guide', coalesce(s.change->'add_point'->>'guide', '')));
    -- Rounding can leave the total a point or two off 100; the heaviest point
    -- absorbs the difference.
    SELECT jsonb_agg(CASE WHEN x->>'id' = heavy.id
             THEN jsonb_set(x, '{weight}', to_jsonb((x->>'weight')::int + 100 - tot.total))
             ELSE x END)
      INTO v_pts
      FROM jsonb_array_elements(v_pts) x,
           (SELECT sum((y->>'weight')::int) AS total FROM jsonb_array_elements(v_pts) y) tot,
           (SELECT y->>'id' AS id FROM jsonb_array_elements(v_pts) y
             ORDER BY (y->>'weight')::int DESC LIMIT 1) heavy;

  ELSIF s.kind = 'weight' THEN
    v_from := s.change->'move_weight'->>'from';
    v_to   := s.change->'move_weight'->>'to';
    v_amt  := (s.change->'move_weight'->>'amount')::int;
    IF v_amt IS NULL OR v_amt < 1 OR v_amt > 10 THEN
      RAISE EXCEPTION 'Weights move by 1 to 10 points at a time.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pts) x
                   WHERE x->>'id' = v_from AND (x->>'weight')::int >= v_amt)
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_pts) x WHERE x->>'id' = v_to) THEN
      RAISE EXCEPTION 'Those rating points cannot trade that much weight.' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_agg(CASE
             WHEN x->>'id' = v_from THEN jsonb_set(x, '{weight}', to_jsonb((x->>'weight')::int - v_amt))
             WHEN x->>'id' = v_to   THEN jsonb_set(x, '{weight}', to_jsonb((x->>'weight')::int + v_amt))
             ELSE x END)
      INTO v_pts FROM jsonb_array_elements(v_pts) x;
  END IF;

  UPDATE public.ai_profiles SET is_active = false WHERE id = cur.id;
  INSERT INTO public.ai_profiles
    (customer_id, version, is_active, model, business, rules, points,
     match_weights, ideal_size, note, created_by)
  VALUES
    (cur.customer_id,
     (SELECT max(version) + 1 FROM public.ai_profiles WHERE customer_id = cur.customer_id),
     true, cur.model, cur.business, v_rules, v_pts,
     cur.match_weights, cur.ideal_size,
     'Accepted: ' || s.title, auth.uid())
  RETURNING id INTO v_new;

  UPDATE public.ai_suggestions
     SET status = 'accepted', decided_by = auth.uid(), decided_at = now(),
         result_profile_id = v_new
   WHERE id = p_id;

  RETURN jsonb_build_object('status', 'accepted', 'profile_id', v_new);
END;
$function$;
REVOKE ALL ON FUNCTION public.decide_ai_suggestion(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_ai_suggestion(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_ai_suggestion(uuid, boolean) TO authenticated, service_role;

COMMIT;
