const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const url = process.env.SUPABASE_DEV_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_DEV_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("NO_CONFIG");
  process.exit(0);
}

const sb = createClient(url, key);

async function checkRLS() {
  console.log("\n=== RLS STATUS ===");
  const { data, error } = await sb.rpc("check_rls_status").select();
  if (error) {
    // RLS check via rpc won't work without the function, try raw approach
    console.log("Cannot check RLS via rpc, trying alternative...");
    // We'll check by trying to query pg_catalog
    const { data: d2, error: e2 } = await sb.from("pg_tables").select("tablename,rowsecurity").eq("schemaname", "public");
    if (e2) {
      console.log("Cannot query pg_tables:", e2.message);
      console.log("Will need to check RLS via SQL editor or service role key");
    } else {
      console.log(JSON.stringify(d2, null, 2));
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

async function checkIndexes() {
  console.log("\n=== CHECKING INDEXES (via error messages) ===");
  // Try spatial queries that would use indexes
  const { data: d1, error: e1 } = await sb.from("places").select("id").limit(1);
  console.log("places query:", e1 ? "ERROR: " + e1.message : "OK");

  const { data: d2, error: e2 } = await sb.from("gravity_scores").select("id").limit(1);
  console.log("gravity_scores query:", e2 ? "ERROR: " + e2.message : "OK");
}

async function checkExtensions() {
  console.log("\n=== CHECKING POSTGIS ===");
  // Try a PostGIS function
  const { data, error } = await sb.rpc("st_asgeojson", { geom: "POINT(0 0)" });
  if (error) {
    console.log("PostGIS rpc test:", error.message);
  } else {
    console.log("PostGIS available:", data);
  }
}

async function checkFunctions() {
  console.log("\n=== CHECKING HELPER FUNCTIONS ===");
  // Try calling is_admin
  const { data: d1, error: e1 } = await sb.rpc("is_admin");
  console.log("is_admin():", e1 ? "ERROR: " + e1.message : "Result: " + d1);

  const { data: d2, error: e2 } = await sb.rpc("is_finance_plus");
  console.log("is_finance_plus():", e2 ? "ERROR: " + e2.message : "Result: " + d2);

  const { data: d3, error: e3 } = await sb.rpc("is_authenticated");
  console.log("is_authenticated():", e3 ? "ERROR: " + e3.message : "Result: " + d3);
}

async function checkColumns() {
  console.log("\n=== CHECKING TABLE COLUMNS (sample) ===");
  // Insert a test row and see if columns exist (dry run via select)
  const tables = ["cities", "places", "pitches", "revenue_data", "gravity_scores", "activity_log_reads"];
  for (const t of tables) {
    const { data, error } = await sb.from(t).select("*").limit(0);
    if (error) {
      console.log(`${t}: ERROR - ${error.message}`);
    } else {
      console.log(`${t}: OK (queryable)`);
    }
  }
}

async function main() {
  await checkFunctions();
  await checkRLS();
  await checkIndexes();
  await checkColumns();
}

main().catch(e => console.error("Fatal:", e));
