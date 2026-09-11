-- Step 0B of the per-city permissions migration: make the city list agree
-- with itself.
--
-- Three sources disagreed, in different directions:
--
--   source                          madrid  barcelona  prague  seville
--   cities.enabled                  on      ON         OFF     missing
--   src/components/CitySelector     on      off        on      off
--   CITY_OPTIONS on the user screen on      MISSING    on      missing
--
-- The database believed Barcelona was live and Prague was not. The app
-- believed the opposite, and the app is right: Barcelona goes live after this
-- work, Prague is already running.
--
-- This was doing real damage, not just sitting there:
--
--   1. handle_new_user() gives a self-signup
--      city_ids = (SELECT id FROM cities WHERE enabled = true), which meant
--      Madrid and Barcelona and never Prague.
--   2. The user edit screen's CITY_OPTIONS array had no Barcelona in it at
--      all, so saving anybody's profile silently stripped Barcelona from them.
--
-- The code half of this fix is src/lib/cities.ts, which is now the single list
-- the map picker, the admin screens and the server routes all read.
--
-- `enabled` means "selectable on the map". It does not mean "nobody may be
-- assigned here": an inactive city is one nobody can open, not one nobody may
-- be permissioned for. Getting those two backwards is what hid Barcelona.
--
-- Undo:
--   UPDATE public.cities SET enabled = true  WHERE id = 'barcelona';
--   UPDATE public.cities SET enabled = false WHERE id = 'prague';
--   DELETE FROM public.cities WHERE id = 'seville';

-- Prague is live. Barcelona is not, yet.
UPDATE public.cities SET enabled = true  WHERE id IN ('madrid', 'prague');
UPDATE public.cities SET enabled = false WHERE id = 'barcelona';

-- Seville was in the city picker as "coming soon" but had no row here at all.
-- Once access is granted per city, a grant points at a city row by foreign
-- key, so a city the app offers and the database has never heard of becomes a
-- constraint violation rather than a cosmetic mismatch.
INSERT INTO public.cities (id, name, country, center, enabled)
VALUES (
  'seville',
  'Seville',
  'ES',
  ST_SetSRID(ST_MakePoint(-5.9845, 37.3891), 4326),
  false
)
ON CONFLICT (id) DO NOTHING;
