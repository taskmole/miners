export interface Listing {
  address: string;
  district: string;
  sizeSqm: number;
  monthlyRent: number;
  score?: number;
  photoUrl: string;
  reason?: string;
  listingUrl?: string;
  listedDaysAgo?: number;
}

export interface DigestRecipient {
  email: string;
  cities: string[];
}

// Swap this for a Supabase query on user_profiles where receives_listing_emails = true
export async function getSubscribedUsers(): Promise<DigestRecipient[]> {
  return [
    { email: "founders@taskmole.co", cities: ["Madrid"] },
  ];
}

// Sample listings for email preview and stub queries.
// Used by the email template as default prop values.
export const SAMPLE_LISTINGS: Listing[] = [
  {
    address: "Calle de la Palma 42",
    district: "Malasaña",
    sizeSqm: 140,
    monthlyRent: 4300,
    score: 87,
    photoUrl: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600&h=600&fit=crop&q=80",
    reason: "High foot traffic near major metro hub.",
    listedDaysAgo: 2,
  },
  {
    address: "Calle de Atocha 112",
    district: "Huertas",
    sizeSqm: 120,
    monthlyRent: 3200,
    score: 84,
    photoUrl: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=600&fit=crop&q=80",
    reason: "Tourist-heavy, two competitors closed.",
    listedDaysAgo: 5,
  },
  {
    address: "Calle del Almirante 18",
    district: "Chueca",
    sizeSqm: 95,
    monthlyRent: 3300,
    score: 81,
    photoUrl: "https://images.unsplash.com/photo-1567521464027-f127ff144326?w=600&h=600&fit=crop&q=80",
    reason: "High-spending locals, low competition.",
    listedDaysAgo: 1,
  },
];

// Swap this for a Supabase query on the scraped properties table
export async function getNewListingsForCity(city: string): Promise<Listing[]> {
  return SAMPLE_LISTINGS;
}
