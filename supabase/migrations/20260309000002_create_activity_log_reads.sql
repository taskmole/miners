-- ===========================================
-- MIGRATION: Create activity_log_reads table
-- ===========================================
-- Junction table for per-user read/unread tracking of activity_log entries.
-- If a row exists for (user_id, activity_log_id), it's read.
-- If no row exists, it's unread for that user.
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
