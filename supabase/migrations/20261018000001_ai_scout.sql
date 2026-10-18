-- AI scout: per-attribute ratings that head office can correct, so the AI
-- learns each customer's taste.
--
-- Schema only. The customer's instructions (business description, rating
-- points, learned rules) are inserted straight into the database, never into
-- this file: the repository is public and those instructions are the
-- customer's location strategy.
--
-- Every new table carries customer_id. Today there is one customer, so the
-- column is a label rather than a wall; the policies below scope by city, the
-- way the rest of the app does. Making customer_id a real boundary is the job
-- for when a second customer signs.

BEGIN;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.customers (id, name) VALUES ('miners', 'The Miners')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Who may train the AI: a per-person, per-city switch next to alerts.
-- Only meaningful with approve, and the CHECK makes that impossible to get
-- wrong rather than merely unlikely.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_city_grants
  ADD COLUMN IF NOT EXISTS can_train_ai boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_city_grants
  DROP CONSTRAINT IF EXISTS can_train_ai_needs_approve;
ALTER TABLE public.user_city_grants
  ADD CONSTRAINT can_train_ai_needs_approve
  CHECK (NOT can_train_ai OR level = 'approve');

-- Mirrors canTrainAiIn() in src/lib/permissions.ts. Super admins always can;
-- anyone else needs an active account, approve in the city, and the switch.
-- Never written in terms of is_admin(), which ignores the city.
CREATE OR REPLACE FUNCTION public.can_train_ai(p_city_id text)
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
            WHERE g.user_id = p.id
              AND g.city_id = p_city_id
              AND g.level = 'approve'
              AND g.can_train_ai
          )
        )
      )
  );
$function$;
-- Policies call it as the signed-in user, so authenticated must keep EXECUTE.
REVOKE ALL ON FUNCTION public.can_train_ai(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_train_ai(text) TO authenticated, service_role;

-- set_user_grants learns the new key. Rebuilt from the live definition
-- (pg_get_functiondef, 2026-10-18); only the incoming CTE, the insert and the
-- result changed. An omitted key keeps the stored value, and the switch is
-- forced off for any level below approve so a demotion clears it.
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
           (g->>'receives_alerts')::boolean AS alerts,
           (g->>'can_train_ai')::boolean    AS train
    FROM jsonb_array_elements(p_grants) g
  )
  INSERT INTO public.user_city_grants (user_id, city_id, level, receives_alerts, can_train_ai)
  SELECT p_user_id,
         i.city_id,
         i.level,
         coalesce(i.alerts, cur.receives_alerts, false),
         i.level = 'approve' AND coalesce(i.train, cur.can_train_ai, false)
  FROM incoming i
  LEFT JOIN public.user_city_grants cur
    ON cur.user_id = p_user_id AND cur.city_id = i.city_id
  ON CONFLICT (user_id, city_id) DO UPDATE
    SET level           = excluded.level,
        receives_alerts = excluded.receives_alerts,
        can_train_ai    = excluded.can_train_ai;

  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT user_id, city_id, level, receives_alerts, can_train_ai
    FROM public.user_city_grants
    WHERE user_id = p_user_id
    ORDER BY city_id
  ) x;

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Instructions, versioned. One active version per customer. The scorer and
-- the weekly learner use the service role; signed-in people only read.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   text NOT NULL DEFAULT 'miners' REFERENCES public.customers(id),
  version       int  NOT NULL,
  is_active     boolean NOT NULL DEFAULT false,
  model         text NOT NULL DEFAULT 'claude-sonnet-5-5',
  business      text NOT NULL,
  rules         text[] NOT NULL DEFAULT '{}',
  points        jsonb NOT NULL,
  match_weights jsonb NOT NULL DEFAULT '{"size":35,"rent":30,"distance":20,"deal":15}',
  ideal_size    jsonb NOT NULL DEFAULT '{"min":50,"max":150}',
  scoreboard    jsonb,
  note          text,
  created_by    uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_profiles_one_active
  ON public.ai_profiles (customer_id) WHERE is_active;

ALTER TABLE public.ai_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_profiles_read ON public.ai_profiles;
-- Labels and weights are needed to draw the breakdown on every card.
CREATE POLICY ai_profiles_read ON public.ai_profiles
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- One rating per listing per instructions version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_ratings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    text NOT NULL DEFAULT 'miners' REFERENCES public.customers(id),
  place_id       uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  city_id        text NOT NULL,
  profile_id     uuid NOT NULL REFERENCES public.ai_profiles(id) ON DELETE CASCADE,
  points         jsonb NOT NULL,
  blend          int  NOT NULL CHECK (blend BETWEEN 0 AND 100),
  gut            int  CHECK (gut BETWEEN 0 AND 100),
  second_look    text,
  summary        text,
  photos_checked int  NOT NULL DEFAULT 0,
  model          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, profile_id)
);
CREATE INDEX IF NOT EXISTS ai_ratings_profile_idx ON public.ai_ratings (profile_id);

ALTER TABLE public.ai_ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_ratings_read ON public.ai_ratings;
CREATE POLICY ai_ratings_read ON public.ai_ratings
  FOR SELECT TO authenticated USING (public.has_city_level(city_id, 'view'));

-- ---------------------------------------------------------------------------
-- What head office told us: point fixes, the overall verdict, and the
-- assign / reject / request decisions captured at the moment they happen
-- (property_assignments keeps one row per listing and overwrites it).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id text NOT NULL DEFAULT 'miners' REFERENCES public.customers(id),
  place_id    uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  city_id     text,
  rating_id   uuid REFERENCES public.ai_ratings(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('point', 'overall', 'assign', 'reject', 'request')),
  point_id    text CHECK (point_id ~ '^[a-z_]{1,40}$'),
  ai_value    int  CHECK (ai_value BETWEEN 1 AND 5),
  human_value int  CHECK (human_value BETWEEN 1 AND 5),
  verdict     text CHECK (verdict IN ('too_low', 'right', 'too_high')),
  note        text CHECK (char_length(note) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- One live answer per person per listing per point (and one overall verdict),
-- so changing your mind updates rather than piling up.
CREATE UNIQUE INDEX IF NOT EXISTS ai_feedback_one_answer
  ON public.ai_feedback (user_id, place_id, kind, coalesce(point_id, ''))
  WHERE kind IN ('point', 'overall');
CREATE INDEX IF NOT EXISTS ai_feedback_city_idx ON public.ai_feedback (customer_id, city_id, created_at DESC);

-- The city always comes from the listing, never from the caller, so nobody
-- can file feedback under a city they train in for a listing elsewhere.
CREATE OR REPLACE FUNCTION public.ai_feedback_set_city()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT p.city_id INTO NEW.city_id FROM public.places p WHERE p.id = NEW.place_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_feedback_set_city() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ai_feedback_set_city ON public.ai_feedback;
CREATE TRIGGER ai_feedback_set_city
  BEFORE INSERT OR UPDATE ON public.ai_feedback
  FOR EACH ROW EXECUTE FUNCTION public.ai_feedback_set_city();

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_feedback_read ON public.ai_feedback;
CREATE POLICY ai_feedback_read ON public.ai_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_train_ai(city_id));
DROP POLICY IF EXISTS ai_feedback_insert ON public.ai_feedback;
CREATE POLICY ai_feedback_insert ON public.ai_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_train_ai(city_id));
DROP POLICY IF EXISTS ai_feedback_update ON public.ai_feedback;
CREATE POLICY ai_feedback_update ON public.ai_feedback
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.can_train_ai(city_id))
  WITH CHECK (user_id = auth.uid() AND public.can_train_ai(city_id));

GRANT SELECT ON public.customers, public.ai_profiles, public.ai_ratings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_feedback TO authenticated;
REVOKE ALL ON public.customers, public.ai_profiles, public.ai_ratings, public.ai_feedback FROM anon;

COMMIT;
