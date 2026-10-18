-- Share links: the short /s/<code> URLs behind the "Copy" button on every
-- place card.
--
-- A row is a snapshot of what was shared (name, address, photo), so the
-- public preview page that WhatsApp, Slack and Teams fetch never has to look
-- the place up again. Those fetchers have no session, and every map table is
-- city-restricted, so the preview reads this table with the service role.
--
-- Row security is on with NO policies on purpose: anon and authenticated get
-- nothing at all. The only reader and writer is the server, through the
-- service role, after /api/share has checked the sharer holds View in the
-- place's city. Additive only: no existing table, function or grant changes.

CREATE TABLE IF NOT EXISTS public.share_links (
  -- 10 random base62 characters, made in the browser at click time so the
  -- copy can happen inside the click (Safari refuses it after an await).
  code        text PRIMARY KEY CHECK (code ~ '^[A-Za-z0-9]{10}$'),
  place_id    text NOT NULL,
  place_type  text NOT NULL,
  city_id     text NOT NULL,
  title       text NOT NULL,
  address     text,
  photo_url   text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- "How many times was this place shared?" and "what did this person share?"
CREATE INDEX IF NOT EXISTS share_links_place_id_idx ON public.share_links (place_id);
CREATE INDEX IF NOT EXISTS share_links_created_by_idx ON public.share_links (created_by);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- Belt and braces on top of RLS: the API roles hold no table privileges.
REVOKE ALL ON public.share_links FROM anon, authenticated;

COMMENT ON TABLE public.share_links IS
  'Snapshot behind each /s/<code> share link. Service role only; written by /api/share, read by the public preview page.';
