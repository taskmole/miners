-- ===========================================================================
-- Assigning and requesting a property have been failing since 20260911000006.
-- ===========================================================================
--
-- That migration added `city_for_place_id(text)` as SECURITY DEFINER and, quite
-- correctly, revoked EXECUTE from anon and authenticated: it runs as postgres
-- and reads `places`, so leaving it callable over PostgREST would hand every
-- signed-in person a way around the per-city policy on that table.
--
-- What it missed is the caller. `set_city_from_place_id()` is the BEFORE INSERT
-- trigger that fills `city_id` on property_assignments and property_requests,
-- and it was created WITHOUT `SECURITY DEFINER`, so it runs as whoever did the
-- insert. A signed-in user therefore hits:
--
--   42501: permission denied for function city_for_place_id
--
-- and the whole insert is rolled back. Neither route sends `city_id` itself
-- (both rely on this trigger by design), so in practice:
--
--   * "Assign to..." always returns "Failed to assign".
--   * A franchisee can never request a property.
--
-- Both tables have zero rows created after 2026-09-11, which is the outage.
--
-- THE FIX, AND WHY IT IS THIS ONE.
-- Marking the trigger function SECURITY DEFINER lets it reach the helper while
-- leaving the REVOKE fully intact: `city_for_place_id` stays uncallable from
-- the API. The alternative, granting authenticated EXECUTE on the helper, would
-- undo the exact hole 20260911000006 set out to close.
--
-- Running this function as postgres is safe to a degree the helper is not. It
-- has no dynamic SQL, takes nothing from the caller but the NEW row, assigns a
-- single column, and its search_path is pinned. Its EXECUTE grant is dropped
-- too: a trigger fires regardless of grants, and nobody should be calling it
-- directly.
--
-- Rehearsed against production inside BEGIN/ROLLBACK before applying. Assign
-- (Madrid) landed city_id='madrid', request (Prague) landed 'prague', and a
-- direct call to city_for_place_id as `authenticated` still raised 42501.
--
-- Undo:
--   CREATE OR REPLACE FUNCTION public.set_city_from_place_id() ... (without
--   SECURITY DEFINER), which restores the outage. There is no reason to.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.set_city_from_place_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.city_id IS NULL THEN
    NEW.city_id := public.city_for_place_id(NEW.property_place_id);
  END IF;
  RETURN NEW;
END;
$function$;

-- A trigger fires whatever the grants say, so nothing needs to call this
-- directly. Now that it runs as postgres, that matters more than it did.
REVOKE EXECUTE ON FUNCTION public.set_city_from_place_id() FROM PUBLIC, anon, authenticated;

-- The triggers themselves are unchanged; recreated only so a fresh database
-- built from these migrations in any order still ends up with both of them.
DROP TRIGGER IF EXISTS set_city_from_place_id ON public.property_requests;
CREATE TRIGGER set_city_from_place_id
  BEFORE INSERT OR UPDATE OF property_place_id ON public.property_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_city_from_place_id();

DROP TRIGGER IF EXISTS set_city_from_place_id ON public.property_assignments;
CREATE TRIGGER set_city_from_place_id
  BEFORE INSERT OR UPDATE OF property_place_id ON public.property_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_city_from_place_id();

-- Refuse to finish quietly if the grant did not actually come off. A silent
-- no-op REVOKE is the normal failure mode on this project.
DO $check$
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname = 'set_city_from_place_id') THEN
    RAISE EXCEPTION 'set_city_from_place_id is still SECURITY INVOKER; the outage is not fixed.';
  END IF;

  IF has_function_privilege('authenticated', 'public.city_for_place_id(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'city_for_place_id became callable by authenticated; that is the hole 20260911000006 closed.';
  END IF;
END
$check$;
