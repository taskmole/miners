-- ===========================================
-- MIGRATION: The file bucket stops being open to strangers
-- ===========================================
-- Verified against production on 2026-09-11 before this was written.
--
-- THE HOLE. storage.objects carries exactly one policy, "Allow all
-- operations", FOR ALL, granted to PUBLIC, with both USING and WITH CHECK set
-- to bucket_id = 'attachments'. PUBLIC includes anon. So a request carrying
-- the publishable key that ships in every page, with no session at all, can
-- list, read, overwrite and delete every one of the 13 files in the bucket -
-- scouting trip photos and PDFs included.
--
-- THE FIX. Same policy, same verbs, same bucket, scoped TO authenticated.
-- Nothing else changes.
--
-- WHY ALL THREE VERBS STAY. Every one of them is used by the server:
-- createSignedUploadUrl needs INSERT, createSignedUrl needs SELECT, and
-- .remove() needs DELETE (src/app/api/db/attachments/route.ts). Narrowing the
-- verbs would break uploads or deletes.
--
-- WHY THE GRANTS ARE LEFT ALONE. The table-level grants on storage.objects are
-- made by supabase_storage_admin and are relied on by the storage service
-- itself. Scoping the policy is enough: RLS is on (confirmed), so with no
-- policy matching anon, anon matches nothing. Revoking grants here would risk
-- disturbing Supabase's own plumbing for no extra safety.
--
-- WHY THIS NEEDS NO CODE DEPLOY. All 14 places the code touches the bucket run
-- on the server through createServerSupabase(token), which is the anon key
-- plus the caller's JWT, so the database sees the authenticated role. The
-- browser never talks to storage with a role at all: the only direct browser
-- call is the upload itself, and that is authorised by a one-time signed link
-- the server already minted. So this migration is safe to apply ahead of
-- everything else on the branch.
--
-- WHY NOT FOLDER-PER-PERSON. Colleagues' scouting files are shown to the whole
-- team and admins review other people's submissions, so an owner-scoped rule
-- would break those. Some existing files also sit in folders named after a
-- random browser id rather than a person, and would become unreadable to
-- everyone. Per-file access is handled in the route (stage 3), not here.
--
-- THE BUCKET IS PRIVATE. Confirmed: storage.buckets says public = false. Had
-- it been public, files would be reachable by a plain URL that ignores every
-- policy and this migration would have closed nothing for reads.
--
-- NOT REHEARSABLE END TO END. Uploads and downloads go through the storage
-- service, not the database API, so a rolled-back transaction cannot exercise
-- them. Apply this and test in the browser within the same minute, with the
-- undo at the bottom ready to paste.
-- ===========================================

DROP POLICY IF EXISTS "Allow all operations" ON storage.objects;

CREATE POLICY "Signed-in users manage attachments"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'attachments')
  WITH CHECK (bucket_id = 'attachments');

-- Undo, should the browser check fail:
--   DROP POLICY "Signed-in users manage attachments" ON storage.objects;
--   CREATE POLICY "Allow all operations" ON storage.objects FOR ALL
--     USING (bucket_id = 'attachments') WITH CHECK (bucket_id = 'attachments');
