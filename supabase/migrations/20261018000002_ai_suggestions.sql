-- AI scout, part two: the weekly suggestions head office accepts or skips.
--
-- A suggestion is a small, exact change to the active instructions (add a
-- rule line, add a rating point, move weight between points), stored with the
-- scoreboard numbers from testing it against everything head office has
-- rated. Accepting one applies it by code, with no AI call, by writing a new
-- version of the customer's instructions and switching to it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      text NOT NULL DEFAULT 'miners' REFERENCES public.customers(id),
  source           text NOT NULL DEFAULT 'weekly' CHECK (source IN ('weekly', 'user')),
  kind             text NOT NULL CHECK (kind IN ('rule', 'point', 'weight')),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  evidence         text CHECK (char_length(evidence) <= 1000),
  change           jsonb NOT NULL,
  -- testing: waiting for the scoreboard. ready: tested and better or equal.
  -- held: tested and worse, shown greyed with the reason.
  status           text NOT NULL DEFAULT 'testing'
                   CHECK (status IN ('testing', 'ready', 'held', 'accepted', 'skipped', 'rolled_back')),
  base_profile_id  uuid REFERENCES public.ai_profiles(id) ON DELETE SET NULL,
  score_before     numeric,
  score_after      numeric,
  sample           int,
  held_reason      text,
  result_profile_id uuid REFERENCES public.ai_profiles(id) ON DELETE SET NULL,
  requested_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  decided_by       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_suggestions_status_idx
  ON public.ai_suggestions (customer_id, status, created_at DESC);

-- Anyone who may train the AI in at least one city. Mirrors trainsAiAnywhere()
-- in src/lib/permissions.ts. The instructions are per customer, not per city,
-- so this is the right door for reading and deciding suggestions.
CREATE OR REPLACE FUNCTION public.trains_ai_anywhere()
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
            WHERE g.user_id = p.id AND g.level = 'approve' AND g.can_train_ai
          )
        )
      )
  );
$function$;
REVOKE ALL ON FUNCTION public.trains_ai_anywhere() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trains_ai_anywhere() TO authenticated, service_role;

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_suggestions_read ON public.ai_suggestions;
CREATE POLICY ai_suggestions_read ON public.ai_suggestions
  FOR SELECT TO authenticated USING (public.trains_ai_anywhere());
-- Head office may propose their own rule; it waits for the scoreboard.
DROP POLICY IF EXISTS ai_suggestions_propose ON public.ai_suggestions;
CREATE POLICY ai_suggestions_propose ON public.ai_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.trains_ai_anywhere()
    AND source = 'user' AND kind = 'rule' AND status = 'testing'
    AND requested_by = auth.uid()
    AND decided_by IS NULL AND score_before IS NULL AND score_after IS NULL
  );
-- No UPDATE or DELETE policy: decisions go through decide_ai_suggestion().
GRANT SELECT, INSERT ON public.ai_suggestions TO authenticated;
REVOKE ALL ON public.ai_suggestions FROM anon;

-- Accept or skip, atomically. Accept copies the active instructions, applies
-- the exact change, saves it as the next version and switches to it. Only a
-- 'ready' suggestion can be accepted: one the scoreboard held back cannot be
-- forced through from the screen.
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
        'guide', s.change->'add_point'->>'guide'));
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
GRANT EXECUTE ON FUNCTION public.decide_ai_suggestion(uuid, boolean) TO authenticated, service_role;

-- One-click rollback to any earlier version, for the same people.
CREATE OR REPLACE FUNCTION public.activate_ai_profile(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_customer text;
BEGIN
  IF NOT public.trains_ai_anywhere() THEN
    RAISE EXCEPTION 'You cannot train the AI.' USING ERRCODE = '42501';
  END IF;
  SELECT customer_id INTO v_customer FROM public.ai_profiles WHERE id = p_profile_id;
  IF v_customer IS NULL THEN
    RAISE EXCEPTION 'No such version.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.ai_profiles SET is_active = false WHERE customer_id = v_customer AND is_active;
  UPDATE public.ai_profiles SET is_active = true WHERE id = p_profile_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.activate_ai_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_ai_profile(uuid) TO authenticated, service_role;

COMMIT;
