-- Silence the "RLS Disabled in Public" advisor warning for public.spatial_ref_sys.
--
-- spatial_ref_sys is a PostGIS system table (static list of map projections).
-- It is owned by supabase_admin, so we cannot ENABLE ROW LEVEL SECURITY on it.
-- Instead we remove it from the PostgREST API surface by revoking access from
-- the two roles PostgREST uses. The table stays fully usable inside the
-- database for PostGIS itself.
--
-- Safe here: the app stores geography columns but never calls PostGIS
-- functions (no ST_Transform / ST_DWithin / ST_AsGeoJSON anywhere in src/).
--
-- To undo:
--   grant select on table public.spatial_ref_sys to anon, authenticated;

revoke all on table public.spatial_ref_sys from anon, authenticated;
