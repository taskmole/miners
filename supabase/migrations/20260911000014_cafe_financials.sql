-- Money gets its own table.
--
-- monthly_revenue lived on cafe_profiles, whose SELECT policy was a bare
-- is_authenticated(). Anyone signed in could read the revenue figure straight
-- from PostgREST. 20260911000011 scoped that table to the city, which closes
-- the hole for people outside the city, but it still leaves the figure in the
-- same row as the notes and the opening hours: everyone who may read a café
-- record reads the money with it.
--
-- Splitting the number into its own table lets the money carry its own rule:
-- is_finance_plus() AND the city, rather than just the city.
--
-- cafe_profiles.monthly_revenue is deliberately left in place. Nothing reads
-- this new table until the code deploy, and the old column has to keep working
-- until then. 20260911000015 (deploy 3) tops this table up and drops the
-- column.
--
-- Undo:
--   DROP TABLE public.cafe_financials;

CREATE TABLE IF NOT EXISTS public.cafe_financials (
  -- One row per place, not per café profile: the profile can be deleted and
  -- re-created, and the money should not silently follow it back.
  place_id       uuid PRIMARY KEY REFERENCES public.places(id) ON DELETE CASCADE,
  monthly_revenue numeric,
  updated_by     uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- The one figure that exists today.
INSERT INTO public.cafe_financials (place_id, monthly_revenue)
SELECT c.place_id, c.monthly_revenue
FROM public.cafe_profiles c
WHERE c.monthly_revenue IS NOT NULL
ON CONFLICT (place_id) DO NOTHING;

ALTER TABLE public.cafe_financials ENABLE ROW LEVEL SECURITY;

-- Reading money needs both: the financials switch AND the city. Either alone
-- is not enough, which is the whole reason the table exists.
DROP POLICY IF EXISTS cafe_financials_select ON public.cafe_financials;
CREATE POLICY cafe_financials_select ON public.cafe_financials
  FOR SELECT
  USING (
    public.is_finance_plus()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_financials.place_id
        AND public.has_city_level(p.city_id, 'view')
    )
  );

DROP POLICY IF EXISTS cafe_financials_insert ON public.cafe_financials;
CREATE POLICY cafe_financials_insert ON public.cafe_financials
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_financials.place_id
        AND public.has_city_level(p.city_id, 'approve')
    )
  );

DROP POLICY IF EXISTS cafe_financials_update ON public.cafe_financials;
CREATE POLICY cafe_financials_update ON public.cafe_financials
  FOR UPDATE
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_financials.place_id
        AND public.has_city_level(p.city_id, 'approve')
    )
  );

DROP POLICY IF EXISTS cafe_financials_delete ON public.cafe_financials;
CREATE POLICY cafe_financials_delete ON public.cafe_financials
  FOR DELETE
  USING (
    public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = cafe_financials.place_id
        AND public.has_city_level(p.city_id, 'approve')
    )
  );

-- PostgREST needs the table-level grant as well as the policies; the policies
-- then decide the rows. anon is left out entirely.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_financials TO authenticated;
-- Supabase's default privileges hand anon a seat at every new table. Money is
-- the one place that is clearly wrong, so it is taken back explicitly rather
-- than left to RLS alone.
REVOKE ALL ON public.cafe_financials FROM anon;

COMMENT ON TABLE public.cafe_financials IS
  'Revenue, split out of cafe_profiles so it can carry the financials switch '
  'as well as the city rule.';
