-- ===========================================
-- MIGRATION: A record of "new trip submitted" emails, for a per-person limit
-- ===========================================
-- The pitch save route (POST /api/db/pitches) emails the two reviewers each
-- time a pitch becomes submitted. A scout with Contribute could otherwise
-- flood them by creating pitch after pitch. The route now writes one row here
-- per send and skips the email once a person has 10 in the last hour (owner's
-- decision, 2026-10-26). The save itself always goes through.
--
-- Server only: written and read with the service role. No policies, so with
-- RLS on, signed-in users and visitors get nothing even if a grant slipped in.
--
-- Undo (paste as one block):
--   DROP TABLE IF EXISTS public.submission_email_log;
-- ===========================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.submission_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pitch_id text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- The limit asks "how many by this person since an hour ago".
CREATE INDEX IF NOT EXISTS submission_email_log_user_sent
  ON public.submission_email_log (user_id, sent_at DESC);

ALTER TABLE public.submission_email_log ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.submission_email_log TO service_role;
REVOKE ALL ON public.submission_email_log FROM anon, authenticated;

-- Prove it, or roll everything back.
DO $check$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.submission_email_log', 'insert')
     OR NOT has_table_privilege('service_role', 'public.submission_email_log', 'select') THEN
    RAISE EXCEPTION 'service_role cannot use submission_email_log';
  END IF;
  IF has_table_privilege('anon', 'public.submission_email_log', 'select')
     OR has_table_privilege('authenticated', 'public.submission_email_log', 'select')
     OR has_table_privilege('authenticated', 'public.submission_email_log', 'insert') THEN
    RAISE EXCEPTION 'submission_email_log is reachable over the API';
  END IF;
END
$check$;

COMMIT;
