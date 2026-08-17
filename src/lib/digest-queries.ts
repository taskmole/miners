import { createClient } from "@supabase/supabase-js";

export type DigestSource = "idealista" | "sreality";

// Maps a digest source to the underlying `source` values stored in the
// `places` table. Idealista has two scrape modes (rental + transfer) that
// share one logical source for the digest.
const SOURCE_DB_VALUES: Record<DigestSource, string[]> = {
  idealista: ["idealista", "idealista_transfer"],
  sreality: ["sreality"],
};

export interface Listing {
  address: string;
  district: string;
  sizeSqm: number;
  monthlyRent: number;
  score?: number;
  photoUrl: string;
  reason?: string;
  monthlyEbitda?: number;
  paybackMonths?: number | null;
  qualitativeScore?: number;
  listingUrl?: string;
  listedDaysAgo?: number;
}

export interface DigestRecipient {
  email: string;
  cities: string[];
  sources: DigestSource[];
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_PROD_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function getSubscribedUsers(): Promise<DigestRecipient[]> {
  return [
    {
      email: "founders@taskmole.co",
      cities: ["madrid", "prague"],
      sources: ["idealista", "sreality"],
    },
  ];
}

export async function getNewListingsForCityAndSource(
  city: string,
  source: DigestSource,
): Promise<Listing[]> {
  const supabase = getSupabase();

  // Anchor on the most recent insert for this source+city. A single scrape
  // session inserts all rows within minutes, so a 12h window backward from
  // the latest row captures only that scrape's batch (next-most-recent
  // scrape happens days earlier on Mon/Thu cadence).
  const { data: anchor } = await supabase
    .from("places")
    .select("created_at")
    .in("source", SOURCE_DB_VALUES[source])
    .eq("city_id", city)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!anchor) return [];

  const cutoff = new Date(anchor.created_at);
  cutoff.setHours(cutoff.getHours() - 12);

  const { data, error } = await supabase
    .from("places")
    .select("address, metadata, photos, score, image_analysis, created_at")
    .in("source", SOURCE_DB_VALUES[source])
    .eq("city_id", city)
    .gte("created_at", cutoff.toISOString())
    .not("photos", "eq", "{}")
    .order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const now = new Date();

  const listings = data.map((row) => {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const createdAt = new Date(row.created_at);
    const daysAgo = Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const aiText = (row.image_analysis as Record<string, unknown>)?.text as
      | Record<string, unknown>
      | undefined;

    const gravityScore = row.score != null ? Number(row.score) : undefined;
    const aiScore =
      aiText?.qualitative_score != null
        ? Number(aiText.qualitative_score)
        : undefined;

    return {
      address: row.address ?? "Unknown address",
      district: (meta.district as string) ?? "",
      sizeSqm: (meta.size as number) ?? 0,
      monthlyRent: (meta.price as number) ?? 0,
      // Cities without gravity data (e.g. Prague) fall back to the AI score
      // so the digest still shows a badge and ranks meaningfully.
      score: gravityScore ?? aiScore,
      photoUrl: row.photos[0],
      reason: (aiText?.reason as string) ?? undefined,
      qualitativeScore: aiScore,
      listingUrl: (meta.url as string) ?? undefined,
      listedDaysAgo: daysAgo,
    };
  });

  // Re-sort: the SQL orders by gravity score only, which is null for cities
  // without gravity data. Sort by effective score, unscored last.
  return listings.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export const SAMPLE_LISTINGS: Listing[] = [
  {
    address: "Calle de la Palma 42",
    district: "Malasaña",
    sizeSqm: 140,
    monthlyRent: 4300,
    score: 87,
    photoUrl:
      "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600&h=600&fit=crop&q=80",
    reason: "High foot traffic near major metro hub.",
    listedDaysAgo: 2,
  },
  {
    address: "Calle de Atocha 112",
    district: "Huertas",
    sizeSqm: 120,
    monthlyRent: 3200,
    score: 84,
    photoUrl:
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=600&fit=crop&q=80",
    reason: "Tourist-heavy, two competitors closed.",
    listedDaysAgo: 5,
  },
  {
    address: "Calle del Almirante 18",
    district: "Chueca",
    sizeSqm: 95,
    monthlyRent: 3300,
    score: 81,
    photoUrl:
      "https://images.unsplash.com/photo-1567521464027-f127ff144326?w=600&h=600&fit=crop&q=80",
    reason: "High-spending locals, low competition.",
    listedDaysAgo: 1,
  },
];
