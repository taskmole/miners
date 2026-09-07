-- ===========================================
-- ROLLBACK: property_requests
-- ===========================================
-- Undoes supabase/migrations/20260906000001_create_property_requests.sql.
--
-- Safe to run: every object below was created by that migration and nothing
-- else in the app reads them. Dropping the table also drops its indexes,
-- trigger, and RLS policies.
--
-- Only run this if the request feature has to be pulled. Any requests that
-- have been made are deleted along with the table.
-- ===========================================

DROP TABLE IF EXISTS public.property_requests CASCADE;

DROP FUNCTION IF EXISTS public.update_property_requests_updated_at();
DROP FUNCTION IF EXISTS public.request_reviewer_emails();

-- Left in place by default: is_super_admin() is harmless on its own and is
-- not referenced by anything else. Uncomment to remove it too.
-- DROP FUNCTION IF EXISTS public.is_super_admin();
