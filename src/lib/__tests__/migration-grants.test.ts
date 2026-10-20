import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// From 2026-10-30 Supabase no longer grants API roles access to new tables (and
// views) in "public". One without an explicit GRANT answers "permission denied",
// and with no test database that would first show up in production. This test
// reads every migration and fails when a new table is missing a grant.

// Tables created before the change. They kept their automatic grants in prod.
const GRANDFATHERED = new Set([
  "activity_log_reads", "ai_feedback", "ai_profiles", "ai_ratings", "ai_suggestions",
  "cafe_financials", "cafe_profiles", "customers", "drawn_features", "inbox_reads",
  "property_assignments", "property_requests", "share_links", "team_members",
  "teams", "user_city_grants",
]);

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

type Migration = { file: string; sql: string };

// Lowercase statements. Dollar-quote markers ($$, $fn$) become statement breaks,
// so a CREATE TABLE inside a DO block is still seen. Strings, odd quoted names
// and comments are blanked, since they can hold ";" or SQL that never runs.
function statements(sql: string): string[] {
  return sql
    .replace(/"(\w+)"/g, "$1")
    .replace(/\$\w*\$/g, ";")
    .replace(/\b[eE]'(?:[^'\\]|\\.)*'|'(?:[^']|'')*'|"[^"]*"|--[^\n]*|\/\*[\s\S]*?\*\//g, " ")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
}

// "public.a, b" -> ["a", "b"]. Used for both table and role lists.
const names = (s: string) => s.split(",").map((x) => x.trim().replace(/^public\./, ""));

/**
 * Reads migrations in order and returns one message per missing grant.
 * Checks across files, so a policy added in a later migration still counts.
 * Not checked: which verbs are granted, REVOKEs, and sequence grants.
 */
function grantProblems(migrations: Migration[], grandfathered = GRANDFATHERED): string[] {
  const created = new Map<string, string>(); // table -> file that created it
  const needsAuthenticated = new Set<string>();
  const granted = new Set<string>(); // "role:table"

  for (const { file, sql } of migrations) {
    for (const s of statements(sql)) {
      let m = s.match(/\bcreate (?:or replace )?(?:unlogged )?(?:materialized )?(?:table|view) (?:if not exists )?(?:(\w+)\.)?(\w+)/);
      if (m && (!m[1] || m[1] === "public") && !grandfathered.has(m[2]) && !created.has(m[2])) {
        created.set(m[2], file);
      }

      // "ON ALL TABLES IN SCHEMA" is not counted: it skips tables made after it.
      m = s.match(/\bgrant .+? on (?:table )?(.+?) to (.+?)(?: with grant option| granted by \w+)*$/);
      if (m) for (const role of names(m[2])) for (const t of names(m[1])) granted.add(`${role}:${t}`);

      // A policy for signed-in users (or everyone) means the browser reads it.
      m = s.match(/\bcreate policy (?:\w+ )?on (?:public\.)?(\w+)(.*)$/);
      if (m) {
        const roles = m[2].match(/ to (.+?)(?: using| with check|$)/);
        const applies = roles ? names(roles[1]) : ["public"];
        if (applies.includes("authenticated") || applies.includes("public")) needsAuthenticated.add(m[1]);
      }
    }
  }

  const has = (role: string, t: string) => granted.has(`${role}:${t}`) || granted.has(`public:${t}`);

  const problems: string[] = [];
  for (const [t, file] of created) {
    if (!has("service_role", t)) problems.push(`${file}: add "GRANT ALL ON public.${t} TO service_role;"`);
    if (needsAuthenticated.has(t) && !has("authenticated", t)) {
      problems.push(`${file}: ${t} has policies for signed-in users, add "GRANT SELECT ... ON public.${t} TO authenticated;"`);
    }
  }
  return problems;
}

describe("every migration grants access to the tables it creates", () => {
  const migrations = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));

  it("finds the migrations", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("has no missing grants", () => {
    expect(grantProblems(migrations)).toEqual([]);
  });
});

describe("grantProblems", () => {
  const check = (...sqls: string[]) => grantProblems(sqls.map((sql, i) => ({ file: `${i}.sql`, sql })));
  const serviceOnly = "CREATE TABLE public.a (id uuid); GRANT ALL ON public.a TO service_role;";

  it("flags a new table with no grant", () => {
    expect(check("CREATE TABLE IF NOT EXISTS public.cities (id uuid);")).toEqual([
      expect.stringContaining("public.cities TO service_role"),
    ]);
  });

  it("passes once service_role is granted", () => {
    expect(check("create table cities (id uuid); grant all on public.cities to service_role;")).toEqual([]);
  });

  it("reads multi-table and multi-role grants", () => {
    expect(check(`CREATE TABLE public.a (id uuid); CREATE TABLE public.b (id uuid);
      CREATE POLICY "read a" ON public.a FOR SELECT TO authenticated USING (true);
      GRANT SELECT ON public.a, public.b TO authenticated, service_role;`)).toEqual([]);
  });

  it("needs an authenticated grant for a TO authenticated policy", () => {
    expect(check(`${serviceOnly} CREATE POLICY p ON public.a FOR SELECT TO authenticated USING (true);`)).toEqual([
      expect.stringContaining("TO authenticated"),
    ]);
  });

  it("needs an authenticated grant for a policy with no TO (applies to everyone)", () => {
    expect(check(`${serviceOnly} CREATE POLICY p ON public.a FOR SELECT USING (true);`)).toHaveLength(1);
  });

  it("checks a policy added in a later migration", () => {
    expect(check(serviceOnly, `CREATE POLICY "Owner's rows" ON public.a FOR SELECT TO authenticated USING (true);`))
      .toEqual([expect.stringContaining("TO authenticated")]);
  });

  it("sees a table created inside a DO block", () => {
    expect(check("DO $$ BEGIN IF to_regclass('public.x') IS NULL THEN CREATE TABLE public.x (id uuid); END IF; END $$;"))
      .toHaveLength(1);
  });

  it("is not fooled by an apostrophe in a quoted name", () => {
    expect(check(`CREATE POLICY "Owner's rows" ON public.teams USING (true); CREATE TABLE public.x (id uuid); SELECT 'ok';`))
      .toHaveLength(1);
  });

  it("does not count a blanket grant on all tables", () => {
    expect(check("GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; CREATE TABLE public.x (id uuid);")).toHaveLength(1);
  });

  it("ignores tables in comments, strings and other schemas", () => {
    expect(check(`-- CREATE TABLE public.x (id int);
      /* CREATE TABLE public.y (id int); */
      COMMENT ON SCHEMA public IS 'create table z; ok';
      CREATE TABLE private.v (id int);`)).toEqual([]);
  });

  it("skips grandfathered tables", () => {
    expect(check("CREATE TABLE public.teams (id uuid);")).toEqual([]);
  });
});
