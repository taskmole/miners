-- Step 4 of the per-city permissions migration: change who can actually do
-- what.
--
-- NUMBERED 000008 THOUGH IT IS STEP 4, ON PURPOSE. It must run AFTER the city
-- restriction (000006) and the invite function (000007), so that the
-- restriction goes live while everybody still holds all three cities and is
-- therefore harmless, and the actual narrowing is the last thing to happen
-- and is reversible per person from the admin screen in seconds. A migration
-- runner replays lexicographically, so the file name has to carry that order
-- rather than the step number.
--
-- Steps 1 to 3 were invisible on purpose. This one is not. It is the first
-- migration that takes access away from real people, and every line of it is
-- reversible from the admin screen in about ten seconds.
--
-- Until now everybody holds all three cities, because a role was global: a
-- franchisee assigned only Prague could still act on a Madrid property. Here
-- each person is narrowed to the cities they were actually assigned, which is
-- what `user_profiles.city_ids` has been recording all along without enforcing
-- anything.
--
--   Jaro, Matus          Super Admin switch, already on. Untouched.
--   Kirill               Madrid Approve, Prague View. The case this whole
--                        migration exists for: he decides Spain and only
--                        watches Prague, which no single role could express.
--   Egor, Max, Razmik    Approve, their own cities only.
--   Katerina             Approve, her own cities. Stays inactive.
--   Maksim               Approve, his own cities. Stays inactive. Note this
--                        RAISES him from the View he backfilled as; the old
--                        area_coordinator role was the same power as head
--                        office under a second name.
--   9 franchisees        Contribute, their own cities only.
--
-- Financials and Alerts are carried across unchanged on every city a person
-- keeps. Only the cities they lose take their ticks with them. Checked before
-- writing this: not one of the eight people receiving property alerts today
-- loses a city they were subscribed to, so the digest recipient list comes out
-- of this identical. That is the one failure nobody can see from the outside -
-- no error, no broken page, just the wrong people quietly getting or missing
-- their daily properties - so it is verified rather than assumed.
--
-- Undo, wholesale: re-run the step 1 backfill, which gives everybody all three
-- cities again at the level their old role implies. Per person, the admin
-- screen is faster.
--
-- Accept that this makes the legacy role mapping lossy. Rolling step 3 back
-- after this restores pre-step-4 breadth, so Kirill would regain Prague
-- approval. That fails WIDE, not shut, among 17 colleagues who all work here.
-- Acceptable, but know it.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Drop the cities nobody was actually assigned
-- ---------------------------------------------------------------------------
--
-- Super admins are exempt: the switch means everything everywhere, and their
-- grants are belt and braces. Everyone else keeps only what city_ids says.
--
-- A person with an empty or null city_ids would be stripped to nothing by
-- this. There is nobody in that state today, and the guard below makes the
-- migration refuse rather than silently locking somebody out if that changes
-- between writing this and running it.

DO $$
DECLARE
  v_cityless int;
BEGIN
  SELECT count(*) INTO v_cityless
  FROM public.user_profiles
  WHERE NOT is_super_admin
    AND coalesce(array_length(city_ids, 1), 0) = 0;

  IF v_cityless > 0 THEN
    RAISE EXCEPTION
      '% non-super-admin profiles have no city_ids. Narrowing them would strip '
      'their access to nothing. Set their cities first, or exclude them here.',
      v_cityless;
  END IF;
END $$;

DELETE FROM public.user_city_grants g
USING public.user_profiles up
WHERE up.id = g.user_id
  AND NOT up.is_super_admin
  AND NOT (g.city_id = ANY(coalesce(up.city_ids, ARRAY[]::text[])));


-- ---------------------------------------------------------------------------
-- 2. Kirill: Madrid Approve, Prague View
-- ---------------------------------------------------------------------------
--
-- His city_ids say Madrid only, so step 1 above has just removed Barcelona and
-- Prague from him. Prague goes back as View, which is the whole point: he can
-- see Prague on the map and cannot touch a thing there.
--
-- Matched on email rather than on a uuid pasted into a migration, so that
-- reading this file tells you who it is about.

INSERT INTO public.user_city_grants (user_id, city_id, level, can_see_financials, receives_alerts)
SELECT id, 'prague', 'view', false, false
FROM public.user_profiles
WHERE lower(email) = 'kirill.odintsov@theminers.eu'
ON CONFLICT (user_id, city_id) DO UPDATE SET level = 'view';


-- ---------------------------------------------------------------------------
-- 3. Maksim, the former area_coordinator, rises from View to Approve
-- ---------------------------------------------------------------------------
--
-- Backfill preserved today, and today he is View. The destination is Approve:
-- head office and coordinator were the same power under two names, which is
-- why the coordinator role is being deleted rather than kept. He has been
-- deactivated for some time, so this changes nothing live; it means his
-- account is in the right shape if he ever comes back.
--
-- Matched on email, not on role = 'area_coordinator', and that is not a style
-- choice. The DELETE in section 1 fires the step 1 dual-write trigger, which
-- re-derives his legacy role from his remaining grants: View plus no flag
-- derives 'franchisee', so by the time this statement runs the role string it
-- would have matched on is already gone. Caught by rehearsing against prod -
-- it left him silently on View, which is the exact "migration bug that looks
-- like an intended restriction" this plan keeps warning about.

UPDATE public.user_city_grants g
SET level = 'approve'
FROM public.user_profiles up
WHERE up.id = g.user_id
  AND lower(up.email) = 'maksim.petrov@theminers.eu'
  AND g.level = 'view';


-- ---------------------------------------------------------------------------
-- 4. Prove it before committing
-- ---------------------------------------------------------------------------
--
-- Two things must hold, and both fail silently if they do not.

DO $$
DECLARE
  v_nobody int;
  v_lost_alerts int;
BEGIN
  -- Nobody may come out of this with no access at all.
  SELECT count(*) INTO v_nobody
  FROM public.user_profiles up
  WHERE NOT up.is_super_admin
    AND NOT EXISTS (SELECT 1 FROM public.user_city_grants g WHERE g.user_id = up.id);

  IF v_nobody > 0 THEN
    RAISE EXCEPTION '% people would be left with no cities at all.', v_nobody;
  END IF;

  -- Every alert subscription that existed must still exist. The digest is the
  -- one thing here that breaks without making a sound.
  SELECT count(*) INTO v_lost_alerts
  FROM public.user_profiles up
  WHERE up.receives_scraper_emails
    AND up.is_active IS DISTINCT FROM false
    AND EXISTS (
      SELECT 1 FROM unnest(coalesce(up.city_ids, ARRAY[]::text[])) AS c(id)
      WHERE c.id IN ('madrid', 'barcelona', 'prague')
        AND NOT EXISTS (
          SELECT 1 FROM public.user_city_grants g
          WHERE g.user_id = up.id AND g.city_id = c.id AND g.receives_alerts
        )
    );

  IF v_lost_alerts > 0 THEN
    RAISE EXCEPTION '% people would silently stop receiving alerts they have today.', v_lost_alerts;
  END IF;
END $$;

COMMIT;
