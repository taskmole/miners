import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// PostGIS moved from "public" to "extensions" in 20261020000001. A function
// that pins its search_path without "extensions" can no longer find ST_* and
// only fails when it runs (city_for_place_id runs on every property request).
// An extension installed into "public" puts its tables on the API, which is
// how the move became necessary. This test holds every later migration to both.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

// Functions and extensions from before this were fixed by the move itself.
const MOVED_IN = "20261020000001";

// Whole CREATE FUNCTION statements: header, $tag$ body $tag$, trailing options.
const FUNCTION = /\bcreate\s+(?:or\s+replace\s+)?function\s+([\w."]+)[\s\S]*?(\$\w*\$)[\s\S]*?\2[^;]*/gi;
const USES_POSTGIS = /\b(?:st_\w+|geography|geometry)\b/i;
const PINNED_PATH = /\bset\s+search_path\s*(?:=|to)\s*([^\n;]*)/i;
// An empty path ('' or "") forces fully qualified names, which is safe.
const EMPTY_PATH = /^(?:''|"")/;
const EXTENSION = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?([\w"]+)([^;]*)/gi;

/** One message per function or extension that breaks the rules above. */
function postgisProblems(file: string, sql: string): string[] {
  const code = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  const problems: string[] = [];
  for (const [statement, name] of code.matchAll(FUNCTION)) {
    const pinned = statement.match(PINNED_PATH);
    const searchPath = pinned?.[1].trim() ?? "";
    if (pinned && !EMPTY_PATH.test(searchPath) && !/extensions/i.test(searchPath) && USES_POSTGIS.test(statement)) {
      problems.push(`${file}: ${name} uses PostGIS, so its search_path needs "extensions" too`);
    }
  }
  for (const [, name, rest] of code.matchAll(EXTENSION)) {
    if (!/\bschema\s+extensions\b/i.test(rest)) {
      problems.push(`${file}: create extension ${name} WITH SCHEMA extensions, never in public`);
    }
  }
  return problems;
}

describe("PostGIS and other extensions stay out of public", () => {
  const later = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && f >= MOVED_IN)
    .sort();

  it("finds the move migration", () => {
    expect(later[0]).toMatch(MOVED_IN);
  });

  it("has no problems in any later migration", () => {
    const problems = later.flatMap((f) => postgisProblems(f, fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")));
    expect(problems).toEqual([]);
  });
});

describe("postgisProblems", () => {
  const check = (sql: string) => postgisProblems("x.sql", sql);

  it("flags a pinned public-only path", () => {
    expect(check(`CREATE OR REPLACE FUNCTION public.f() RETURNS text LANGUAGE plpgsql
      SET search_path TO 'public' AS $fn$ BEGIN RETURN ST_AsText(NULL::geography); END $fn$;`)).toHaveLength(1);
  });

  it("flags a path set after the body", () => {
    expect(check(`CREATE FUNCTION f() RETURNS float LANGUAGE sql AS $$ SELECT ST_Distance(a, b) $$
      SET search_path = public;`)).toHaveLength(1);
  });

  it("passes when extensions is on the path, or the path is empty", () => {
    expect(check(`CREATE FUNCTION f() RETURNS text SET search_path = public, extensions
      AS $$ SELECT ST_AsText(x) $$ LANGUAGE sql;
      CREATE FUNCTION g() RETURNS text SET search_path = ''
      AS $$ SELECT extensions.ST_AsText(x) $$ LANGUAGE sql;`)).toEqual([]);
  });

  it("passes a function with no pinned path or no PostGIS", () => {
    expect(check(`CREATE FUNCTION f() RETURNS text AS $$ SELECT ST_AsText(x) $$ LANGUAGE sql;
      CREATE FUNCTION g() RETURNS int SET search_path = public AS $$ SELECT 1 $$ LANGUAGE sql;`)).toEqual([]);
  });

  it("ignores functions in comments", () => {
    expect(check(`-- CREATE FUNCTION f() SET search_path = public AS $$ SELECT ST_X(p) $$;
      /* CREATE FUNCTION g() SET search_path = public AS $$ SELECT ST_X(p) $$; */`)).toEqual([]);
  });

  it("flags an extension created outside the extensions schema", () => {
    expect(check("CREATE EXTENSION IF NOT EXISTS pg_trgm;")).toHaveLength(1);
    expect(check("create extension pg_trgm with schema public;")).toHaveLength(1);
    expect(check("CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;")).toEqual([]);
  });
});
