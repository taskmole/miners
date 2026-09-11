-- Step 5 of the per-city permissions migration: city restriction.
--
-- This is the one step that is a new feature rather than a change of
-- plumbing. Steps 1 to 4 moved where permissions are stored and narrowed who
-- holds what; nothing until now actually stopped a person opening a city.
--
-- It is a separate step because `is_admin()` takes no arguments and can never
-- know which city a row belongs to. The new helper takes one. Merging this
-- with the storage swap would have made a migration bug and an intended
-- restriction indistinguishable.
--
-- WHAT IS NOT RESTRICTED HERE, and why:
--
--   activity_log   every one of its 232 rows has city_id NULL. Restricting it
--                  would blank the activity feed for everybody including
--                  super admins. It needs its city_id populated first, which
--                  is a separate piece of work.
--   lists          a saved list is not city-scoped; it has no city column and
--                  can hold properties from anywhere.
--   cities, teams, user_profiles  not city-scoped in any useful sense.
--
-- MUST SHIP WITH THE APP CHANGES IN THE SAME DEPLOY. `places` SELECT stops
-- being `USING true`, and `/api/db/places` currently reads it with the
-- anonymous key and no user token at all, so that route returns an empty map
-- until it is changed to pass the caller's session. `/api/data`, which serves
-- 15 CSV files of cafe, gym and POI data straight off disk with no auth
-- whatsoever, needs route-level auth for the same reason: it has no row
-- concept, and it is the bulk of the map data, so without it this whole
-- restriction is cosmetic.
--
-- Undo: restore the policy bodies listed against each block below, and
--   DROP FUNCTION public.has_city_level(text, text);

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The helper that takes a city
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_city_level(p_city_id text, p_min_level text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- The switch means everything everywhere, including cities that do not
    -- exist yet, so it is answered before the grants are read at all.
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_super_admin
    )
    OR EXISTS (
      SELECT 1 FROM public.user_city_grants g
      WHERE g.user_id = auth.uid()
        AND g.city_id = p_city_id
        -- The ladder is cumulative: approve implies contribute implies view.
        -- Spelled out as an array position rather than an enum so that adding
        -- a level later does not need a type migration.
        AND array_position(ARRAY['view','contribute','approve'], g.level)
            >= array_position(ARRAY['view','contribute','approve'], p_min_level)
    );
$function$;

COMMENT ON FUNCTION public.has_city_level(text, text) IS
  'Does the caller hold at least p_min_level in p_city_id? Super admins always do.';

-- A row whose city is NULL belongs to no city, so nobody can claim a level in
-- it. Returning false there is the safe direction, and it is what the SQL
-- above does naturally (no grant matches NULL), but it is worth stating: any
-- table restricted below must have city_id populated or it goes dark.


-- ---------------------------------------------------------------------------
-- 2. Give property requests and assignments a city
-- ---------------------------------------------------------------------------
--
-- Neither table has ever had one. They reference a property by a synthetic
-- place id of the form `property-<lat>-<lon>-<hash>`, which is NOT a
-- `places.id` uuid, so the city cannot be reached by joining. It has to come
-- out of the coordinates baked into the id, the same way notification routing
-- already works.
--
-- 21 rows in total, all of them Prague.

CREATE OR REPLACE FUNCTION public.city_for_place_id(p_place_id text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m text[];
  v_lat double precision;
  v_lon double precision;
  v_city text;
BEGIN
  IF p_place_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- A real places uuid, if anyone ever stores one here.
  IF p_place_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT city_id INTO v_city FROM public.places WHERE id = p_place_id::uuid;
    RETURN v_city;
  END IF;

  -- `property-50.06362-14.40902-4274e50b`, and the awkward Spanish case
  -- `property-40.41680--3.70380-4274e50b`, where a negative longitude puts a
  -- double minus in the middle. Requiring a decimal point in both numbers is
  -- what keeps the two apart.
  m := regexp_match(p_place_id, '^[a-z_]+-(-?[0-9]+\.[0-9]+)-(-?[0-9]+\.[0-9]+)(?:-[0-9a-f]+)?$');
  IF m IS NULL THEN
    RETURN NULL;
  END IF;

  v_lat := m[1]::double precision;
  v_lon := m[2]::double precision;

  -- Nearest city centre, and only if it is close enough to be that city.
  -- 150 km is wide enough for any commuter belt and tight enough that a point
  -- in another country (Berlin is ~280 km from Prague) comes back NULL rather
  -- than being guessed at.
  SELECT c.id INTO v_city
  FROM public.cities c
  WHERE c.center IS NOT NULL
    AND ST_DWithin(
          c.center::geography,
          ST_SetSRID(ST_MakePoint(v_lon, v_lat), 4326)::geography,
          150000)
  ORDER BY c.center::geography <-> ST_SetSRID(ST_MakePoint(v_lon, v_lat), 4326)::geography
  LIMIT 1;

  RETURN v_city;
END;
$function$;

-- Runs as postgres and reads places, so it must not be callable from outside.
REVOKE EXECUTE ON FUNCTION public.city_for_place_id(text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.property_requests    ADD COLUMN IF NOT EXISTS city_id text;
ALTER TABLE public.property_assignments ADD COLUMN IF NOT EXISTS city_id text;

UPDATE public.property_requests
SET city_id = public.city_for_place_id(property_place_id)
WHERE city_id IS NULL;

UPDATE public.property_assignments
SET city_id = public.city_for_place_id(property_place_id)
WHERE city_id IS NULL;

-- Keep it filled from here on, rather than relying on every insert path in
-- the app to remember. There are several, and a row that arrives with a NULL
-- city becomes invisible to the policies below, which is a silent failure.
CREATE OR REPLACE FUNCTION public.set_city_from_place_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.city_id IS NULL THEN
    NEW.city_id := public.city_for_place_id(NEW.property_place_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_city_from_place_id ON public.property_requests;
CREATE TRIGGER set_city_from_place_id
  BEFORE INSERT OR UPDATE OF property_place_id ON public.property_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_city_from_place_id();

DROP TRIGGER IF EXISTS set_city_from_place_id ON public.property_assignments;
CREATE TRIGGER set_city_from_place_id
  BEFORE INSERT OR UPDATE OF property_place_id ON public.property_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_city_from_place_id();

CREATE INDEX IF NOT EXISTS property_requests_city_idx    ON public.property_requests (city_id);
CREATE INDEX IF NOT EXISTS property_assignments_city_idx ON public.property_assignments (city_id);


-- ---------------------------------------------------------------------------
-- 3. places: the one that matters
-- ---------------------------------------------------------------------------
-- Was: USING true. Literally anyone, signed in or not.

DROP POLICY IF EXISTS "Anyone can view places" ON public.places;
CREATE POLICY "View places in your cities" ON public.places
  FOR SELECT USING (public.has_city_level(city_id, 'view'));


-- ---------------------------------------------------------------------------
-- 4. Map overlay data, all city-scoped, all currently open to the world
-- ---------------------------------------------------------------------------
-- Every one of these tables is empty today, so this costs nothing now and
-- means nobody has to remember when they start filling up.
-- Was, on each: USING true.

DROP POLICY IF EXISTS "Anyone can view gravity_scores" ON public.gravity_scores;
CREATE POLICY "View gravity_scores in your cities" ON public.gravity_scores
  FOR SELECT USING (public.has_city_level(city_id, 'view'));

DROP POLICY IF EXISTS "Anyone can view traffic_data" ON public.traffic_data;
CREATE POLICY "View traffic_data in your cities" ON public.traffic_data
  FOR SELECT USING (public.has_city_level(city_id, 'view'));

DROP POLICY IF EXISTS "Anyone can view footfall_data" ON public.footfall_data;
CREATE POLICY "View footfall_data in your cities" ON public.footfall_data
  FOR SELECT USING (public.has_city_level(city_id, 'view'));

DROP POLICY IF EXISTS "Anyone can view polygon_layers" ON public.polygon_layers;
CREATE POLICY "View polygon_layers in your cities" ON public.polygon_layers
  FOR SELECT USING (public.has_city_level(city_id, 'view'));


-- ---------------------------------------------------------------------------
-- 5. pitches
-- ---------------------------------------------------------------------------
-- Was SELECT: is_authenticated(), i.e. every signed-in person saw every pitch.
--
-- `created_by = auth.uid()` stays as a disjunct deliberately. Somebody
-- narrowed out of a city must not lose sight of work they did there; they
-- stop being able to act on it, which is the point, but their own history
-- does not evaporate.

DROP POLICY IF EXISTS "Authenticated users can view pitches" ON public.pitches;
CREATE POLICY "View pitches in your cities or your own" ON public.pitches
  FOR SELECT USING (
    created_by = auth.uid()
    OR public.has_city_level(city_id, 'view')
  );

-- Was CHECK: is_authenticated() AND created_by = auth.uid().
-- Submitting a pitch is an act, so it needs Contribute, not View. This is
-- what stops Kirill filing a pitch in Prague.
DROP POLICY IF EXISTS "Authenticated users can insert pitches" ON public.pitches;
CREATE POLICY "Contributors can insert pitches" ON public.pitches
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND public.has_city_level(city_id, 'contribute')
  );


-- ---------------------------------------------------------------------------
-- 6. property_requests
-- ---------------------------------------------------------------------------
-- Was SELECT: (requested_by = auth.uid()) OR is_dashboard_role()
--     a reviewer in Madrid could read every Prague request.
-- Was UPDATE USING: is_admin() AND status = 'pending'
--     and CHECK: is_admin() AND status IN (approved, rejected) AND decided_by = auth.uid()

DROP POLICY IF EXISTS "Own requests or dashboard roles see all" ON public.property_requests;
CREATE POLICY "Own requests or approvers in that city" ON public.property_requests
  FOR SELECT USING (
    requested_by = auth.uid()
    OR public.has_city_level(city_id, 'approve')
  );

-- Was CHECK: requested_by = auth.uid() AND status = 'pending' AND decided_by IS NULL AND decided_at IS NULL
DROP POLICY IF EXISTS "Create own pending requests" ON public.property_requests;
CREATE POLICY "Contributors create own pending requests" ON public.property_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND public.has_city_level(city_id, 'contribute')
  );

DROP POLICY IF EXISTS "Admins decide pending requests" ON public.property_requests;
CREATE POLICY "Approvers decide requests in their cities" ON public.property_requests
  FOR UPDATE
  USING (public.has_city_level(city_id, 'approve') AND status = 'pending')
  WITH CHECK (
    public.has_city_level(city_id, 'approve')
    AND status = ANY (ARRAY['approved', 'rejected'])
    AND decided_by = auth.uid()
  );


-- ---------------------------------------------------------------------------
-- 7. property_assignments
-- ---------------------------------------------------------------------------
-- Was SELECT: true. Was INSERT/UPDATE/DELETE: is_dashboard_role().
--
-- `assigned_to = auth.uid()` stays visible regardless of city, for the same
-- reason as a pitch author: being told to go and look at something, then not
-- being able to see the instruction, is worse than either outcome on its own.

DROP POLICY IF EXISTS "Authenticated users can view all assignments" ON public.property_assignments;
CREATE POLICY "View assignments in your cities or your own" ON public.property_assignments
  FOR SELECT USING (
    assigned_to = auth.uid()
    OR (assigned_to_team IS NOT NULL AND assigned_to_team IN (SELECT public.user_team_ids()))
    OR public.has_city_level(city_id, 'view')
  );

DROP POLICY IF EXISTS "Dashboard roles can insert assignments" ON public.property_assignments;
CREATE POLICY "Approvers assign in their cities" ON public.property_assignments
  FOR INSERT WITH CHECK (public.has_city_level(city_id, 'approve'));

DROP POLICY IF EXISTS "Dashboard roles can update assignments" ON public.property_assignments;
CREATE POLICY "Approvers update assignments in their cities" ON public.property_assignments
  FOR UPDATE
  USING (public.has_city_level(city_id, 'approve'))
  WITH CHECK (public.has_city_level(city_id, 'approve'));

DROP POLICY IF EXISTS "Dashboard roles can delete assignments" ON public.property_assignments;
CREATE POLICY "Approvers delete assignments in their cities" ON public.property_assignments
  FOR DELETE USING (public.has_city_level(city_id, 'approve'));


-- ---------------------------------------------------------------------------
-- 8. Who gets told about a property request
-- ---------------------------------------------------------------------------
--
-- This is what the whole migration unblocks. The function used to return
-- super admins and nobody else, and a hardcoded rule in
-- src/lib/notify-routing.ts bolted Kirill onto anything in Spain, because
-- there was no way to say "the person who approves Madrid".
--
-- Now there is. Everyone who approves in the request's city, plus super
-- admins, and the Spain special case is deleted along with it.
--
-- Takes the city as an argument rather than reading it from a request row, so
-- the caller does not need read access to the request to find out who to mail.

DROP FUNCTION IF EXISTS public.request_reviewer_emails();

CREATE OR REPLACE FUNCTION public.request_reviewer_emails(p_city_id text DEFAULT NULL)
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT up.id, up.email, up.display_name
  FROM public.user_profiles up
  WHERE up.is_active
    AND up.email IS NOT NULL
    AND (
      up.is_super_admin
      OR (
        p_city_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.user_city_grants g
          WHERE g.user_id = up.id
            AND g.city_id = p_city_id
            AND g.level = 'approve'
        )
      )
    )
    -- Signed-in callers only. Written out rather than calling
    -- public.is_authenticated(), which does not pin its own search_path.
    AND auth.uid() IS NOT NULL;
$function$;

COMMIT;
