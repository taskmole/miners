-- The per-point breakdown is shown only to people who train the AI (today:
-- super admins), so the rows behind it are readable only by them as well.
-- Everyone else still sees the overall score and summary, which live on
-- places.image_analysis as before.

BEGIN;

DROP POLICY IF EXISTS ai_ratings_read ON public.ai_ratings;
CREATE POLICY ai_ratings_read ON public.ai_ratings
  FOR SELECT TO authenticated USING (public.can_train_ai(city_id));

COMMIT;
