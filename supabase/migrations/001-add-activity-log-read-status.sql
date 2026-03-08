-- ===========================================
-- MIGRATION 001: Add read/unread tracking for activity_log
-- ===========================================
--
-- The activity_log is a shared feed — all authenticated users see all entries.
-- Read/unread status must be tracked PER USER, not on the activity_log row itself.
--
-- Solution: A junction table that records which user has read which activity entry.
-- If a row exists in activity_log_reads for (user_id, activity_log_id), it's read.
-- If no row exists, it's unread for that user.
--
-- To query unread items for a user:
--   SELECT al.*
--   FROM activity_log al
--   LEFT JOIN activity_log_reads alr
--     ON alr.activity_log_id = al.id AND alr.user_id = auth.uid()
--   WHERE alr.id IS NULL
--   ORDER BY al.created_at DESC;
--
-- To mark an item as read:
--   INSERT INTO activity_log_reads (user_id, activity_log_id) VALUES (auth.uid(), '<id>')
--   ON CONFLICT DO NOTHING;
--
-- To mark ALL items as read (bulk):
--   INSERT INTO activity_log_reads (user_id, activity_log_id)
--   SELECT auth.uid(), al.id FROM activity_log al
--   WHERE NOT EXISTS (
--     SELECT 1 FROM activity_log_reads alr
--     WHERE alr.activity_log_id = al.id AND alr.user_id = auth.uid()
--   )
--   ON CONFLICT DO NOTHING;
--
-- ===========================================

CREATE TABLE IF NOT EXISTS public.activity_log_reads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_log_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now(),
  CONSTRAINT activity_log_reads_pkey PRIMARY KEY (id),
  CONSTRAINT activity_log_reads_activity_fkey FOREIGN KEY (activity_log_id)
    REFERENCES public.activity_log(id) ON DELETE CASCADE,
  CONSTRAINT activity_log_reads_unique UNIQUE (user_id, activity_log_id)
);

-- Index for fast lookup: "give me all unread items for this user"
CREATE INDEX activity_log_reads_user_idx
  ON public.activity_log_reads(user_id);

-- Index for cleanup: "delete read markers for old activity entries"
CREATE INDEX activity_log_reads_activity_idx
  ON public.activity_log_reads(activity_log_id);

-- ===========================================
-- RLS POLICIES for activity_log_reads
-- ===========================================

ALTER TABLE public.activity_log_reads ENABLE ROW LEVEL SECURITY;

-- Users can only see their own read markers
CREATE POLICY "Users can view own activity_log_reads"
ON public.activity_log_reads FOR SELECT
USING (user_id = auth.uid());

-- Users can mark items as read (only for themselves)
CREATE POLICY "Users can insert own activity_log_reads"
ON public.activity_log_reads FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Users can remove their own read markers (mark as unread)
CREATE POLICY "Users can delete own activity_log_reads"
ON public.activity_log_reads FOR DELETE
USING (user_id = auth.uid());

-- No update needed — read markers are insert/delete only
