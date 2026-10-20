-- Move PostGIS out of "public" and into "extensions".
--
-- WHY
--   Supabase emails a weekly "Table publicly accessible" alert
--   (rls_disabled_in_public) about public.spatial_ref_sys. It is PostGIS's own
--   reference table of coordinate systems. It belongs to supabase_admin, so no
--   migration can turn on row security or revoke grants on it: both "succeed"
--   and change nothing (see 20260907000005 and 20260911000020). While PostGIS
--   lives in "public", the API serves that table to anyone holding the key that
--   ships in every page, writes included.
--
--   "extensions" is not served by the API, so moving PostGIS there takes the
--   table off the internet. That is the fix Supabase recommends, and it also
--   clears the "extension in public" warning.
--
-- HOW
--   PostGIS cannot simply be moved; it has to be dropped and re-created. A plain
--   drop would delete every location in the database with it, so first:
--     1. Every map column (geography or geometry) is turned into plain text,
--        which keeps the exact value (hex EWKB, lossless).
--     2. Indexes on those columns are noted and dropped.
--   Then PostGIS is dropped and re-created in "extensions", and both steps are
--   reversed with the column types and index definitions exactly as they were.
--
--   Database functions that pin their search_path (city_for_place_id does, and
--   it runs on every property request insert) would stop finding ST_* once it
--   moves, so "extensions" is added to their search_path.
--
-- SAFETY
--   * One transaction. Any error and nothing changes.
--   * The drop is RESTRICT, never CASCADE. If anything not handled here depends
--     on PostGIS (a view, policy, default or function argument), the drop
--     refuses and the whole migration rolls back untouched.
--   * Runs again harmlessly: it does nothing once PostGIS is out of "public".
--   * Tables holding map columns are locked for the few seconds this takes.
--
-- Rehearsed on a copy of the schema with PostGIS owned by supabase_admin:
-- every row of every table byte-identical afterwards, same column types,
-- same indexes, and city_for_place_id, the property request trigger and
-- insert_miners_place all give the same answers. A view on a map column, a
-- function naming public.st_*, and a role not allowed to drop PostGIS each
-- rolled the whole thing back with nothing changed.
--
-- Undo: the same steps the other way round (drop from "extensions", create
-- in "public"). Nothing in the app names the schema, so it should not be
-- needed.

BEGIN;

-- Columns and index definitions are read and written with both schemas in
-- view, so type names come out unqualified ("geography(Point,4326)") and
-- resolve again after the move.
SET LOCAL search_path = public, extensions;

DO $move$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'PostGIS is not in public. Nothing to do.';
    RETURN;
  END IF;

  -- Every user table column whose type comes from PostGIS.
  CREATE TEMP TABLE map_columns ON COMMIT DROP AS
  SELECT a.attrelid::regclass AS tbl, a.attname AS col,
         format_type(a.atttypid, a.atttypmod) AS col_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_depend d ON d.classid = 'pg_type'::regclass AND d.objid = a.atttypid AND d.deptype = 'e'
  JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'postgis'
  WHERE c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped;

  -- Every index that has a PostGIS-typed key (e.g. the GIST indexes on areas
  -- and polygon_layers).
  CREATE TEMP TABLE map_indexes ON COMMIT DROP AS
  SELECT DISTINCT i.indexrelid::regclass AS idx, pg_get_indexdef(i.indexrelid) AS def
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indexrelid
  JOIN pg_depend d ON d.classid = 'pg_type'::regclass AND d.objid = a.atttypid AND d.deptype = 'e'
  JOIN pg_extension e ON e.oid = d.refobjid AND e.extname = 'postgis';

  FOR r IN SELECT * FROM map_indexes LOOP
    EXECUTE format('DROP INDEX %s', r.idx);
  END LOOP;

  FOR r IN SELECT * FROM map_columns LOOP
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE text USING %I::text', r.tbl, r.col, r.col);
  END LOOP;

  DROP EXTENSION postgis RESTRICT;
  CREATE EXTENSION postgis WITH SCHEMA extensions;

  FOR r IN SELECT * FROM map_columns LOOP
    EXECUTE format('ALTER TABLE %s ALTER COLUMN %I TYPE %s USING %I::%s',
                   r.tbl, r.col, r.col_type, r.col, r.col_type);
  END LOOP;

  FOR r IN SELECT * FROM map_indexes LOOP
    EXECUTE r.def;
  END LOOP;

  -- The rewrites wiped the planner's statistics; refresh them now rather than
  -- waiting for autovacuum.
  FOR r IN SELECT DISTINCT tbl FROM map_columns LOOP
    EXECUTE format('ANALYZE %s', r.tbl);
  END LOOP;

  -- Our functions that pin a search_path and mention PostGIS by name get
  -- "extensions" added to it (city_for_place_id and insert_miners_place both
  -- do). Functions without a pinned path already see it: Supabase's default
  -- search_path includes "extensions".
  FOR r IN
    SELECT p.oid::regprocedure AS fn, substr(cfg, length('search_path=') + 1) AS path
    FROM pg_proc p
    CROSS JOIN LATERAL unnest(p.proconfig) AS cfg
    WHERE p.proowner = current_user::regrole
      AND cfg LIKE 'search_path=%'
      AND cfg NOT LIKE '%extensions%'
      AND cfg <> 'search_path=""'
      AND p.prosrc ~* '\m(st_\w+|geography|geometry)\M'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s, extensions', r.fn, r.path);
  END LOOP;
END
$move$;

-- Prove it, or roll everything back.
DO $check$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    RAISE EXCEPTION 'public.spatial_ref_sys still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis' AND n.nspname = 'extensions'
  ) THEN
    RAISE EXCEPTION 'PostGIS is not in the extensions schema';
  END IF;

  -- A function that names PostGIS as public.st_* would break after the move.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proowner = current_user::regrole
      AND p.prosrc ~* 'public\.(st_\w+|geography|geometry)\M'
  ) THEN
    RAISE EXCEPTION 'A function still calls PostGIS as public.*';
  END IF;
END
$check$;

-- Tell the API to pick up the new layout straight away.
NOTIFY pgrst, 'reload schema';

COMMIT;
