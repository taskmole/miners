const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("NO_CONFIG - Supabase env vars not set");
  process.exit(0);
}

console.log("Connected to:", url);
const sb = createClient(url, key);

async function check() {
  const tables = [
    "cities","app_settings","categories","scoring_params","regions","comments",
    "tags","user_profiles","user_activity_state","hidden_pois","mentions",
    "places","areas","polygon_layers","traffic_data","footfall_data",
    "lists","list_items","scouting_reports","activity_log",
    "approval_workflows","pitches","pitch_approvals",
    "cafe_performance","revenue_data","performance_data",
    "performance_targets","competitor_metrics",
    "gravity_scores","gravity_batches",
    "profitability_benchmarks","prospective_locations",
    "activity_log_reads"
  ];

  console.log("\n=== TABLE STATUS ===");
  for (const t of tables) {
    const { data, error, count } = await sb.from(t).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`${t}: ERROR - ${error.message} (code: ${error.code})`);
    } else {
      console.log(`${t}: ${count} rows`);
    }
  }

  // Now check actual data in seeded tables
  console.log("\n=== SEED DATA CHECK ===");

  const { data: cities } = await sb.from("cities").select("*");
  console.log("cities:", JSON.stringify(cities));

  const { data: categories } = await sb.from("categories").select("*");
  console.log("categories:", JSON.stringify(categories));

  const { data: settings } = await sb.from("app_settings").select("*");
  console.log("app_settings:", JSON.stringify(settings));

  const { data: params } = await sb.from("scoring_params").select("id, name, weight");
  console.log("scoring_params:", JSON.stringify(params));
}

check().catch(e => console.error("Fatal:", e));
