/**
 * Gravity Model Parameters
 *
 * Configuration for the Huff gravity model calculations.
 * These values are currently hardcoded but designed for easy DB migration.
 *
 * Migration path:
 * 1. These defaults match the seed-data.sql scoring_params entries
 * 2. When ready, replace getGravityParams() to fetch from Supabase
 * 3. Add admin UI to edit values in scoring_params table
 *
 * @see supabase/seed-data.sql for the database defaults
 */

// ===========================================
// TYPES
// ===========================================

export interface GravityWeights {
  population: number; // People living nearby
  income: number; // Wealth level of area
  metro: number; // Proximity to metro stations
  traffic: number; // Pedestrian footfall
  poi: number; // Other businesses nearby
}

export interface InfluenceRadii {
  population: number; // meters
  income: number; // meters
  metro: number; // meters
  traffic: number; // meters
  poi: number; // meters
}

export interface PoiTypeWeights {
  cafe: number;
  metro: number;
  gym: number;
  other: number;
}

export interface GravityParams {
  weights: GravityWeights;
  beta: number; // Distance decay exponent
  resolution: number; // Grid resolution in meters
  influence: InfluenceRadii;
  poiTypeWeights: PoiTypeWeights;
  version: string; // For tracking which params were used
}

// ===========================================
// DEFAULT VALUES
// ===========================================

/**
 * Default weights - tuned for cafe-friendly locations
 * Higher weight = more impact on final score
 *
 * Priority: Traffic > Metro > POI > Income > Population
 * Rationale: Foot traffic and transit access matter most for cafes
 */
export const DEFAULT_WEIGHTS: GravityWeights = {
  population: 2,   // Background factor, not primary
  income: 3,       // Matters for premium positioning
  metro: 7,        // Very important - commuters = customers
  traffic: 10,     // Most important - people walking by
  poi: 6,          // Good sign of commercial activity
};

/**
 * Distance decay parameter
 * Higher = score drops off faster with distance (more local influence)
 * 1.5 = gentle fade, 2.5 = sharp hotspots, 3.0+ = very tight clusters
 */
export const DEFAULT_BETA = 2.5;

/**
 * Grid resolution in meters
 * Lower = more points, better accuracy, slower calculation
 */
export const DEFAULT_RESOLUTION = 100;

/**
 * Influence radius for each factor in meters
 * Points beyond this distance have zero effect
 *
 * SMALLER = more contrast/hotspots (good for finding specific spots)
 * LARGER = smoother coverage (less useful for location scouting)
 */
export const DEFAULT_INFLUENCE: InfluenceRadii = {
  population: 400,   // Was 1500 - now only immediate neighborhood
  income: 400,       // Was 1500 - now only immediate neighborhood
  metro: 500,        // Was 800 - need to be close to station
  traffic: 350,      // Was 500 - foot traffic is very localized
  poi: 300,          // Was 400 - business clusters are tight
};

/**
 * Weight multipliers for different POI types
 * Used when calculating POI density score
 */
export const DEFAULT_POI_TYPE_WEIGHTS: PoiTypeWeights = {
  cafe: 0.3,
  metro: 0.4,
  gym: 0.2,
  other: 0.1,
};

/**
 * Current version string
 * Increment this when changing default values
 */
export const PARAMS_VERSION = 'v2.0';

// ===========================================
// GETTER FUNCTIONS
// ===========================================

/**
 * Get the gravity model parameters
 *
 * Currently returns hardcoded defaults.
 * TODO: Replace with database fetch when ready:
 *
 *   export async function getGravityParams(): Promise<GravityParams> {
 *     const { data } = await supabase
 *       .from('scoring_params')
 *       .select('name, weight');
 *
 *     const params: Record<string, number> = {};
 *     for (const row of data || []) {
 *       params[row.name] = row.weight;
 *     }
 *
 *     return {
 *       weights: {
 *         population: params.gravity_population ?? DEFAULT_WEIGHTS.population,
 *         income: params.gravity_income ?? DEFAULT_WEIGHTS.income,
 *         // ... etc
 *       },
 *       // ... rest of params
 *     };
 *   }
 */
export function getGravityParams(): GravityParams {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    beta: DEFAULT_BETA,
    resolution: DEFAULT_RESOLUTION,
    influence: { ...DEFAULT_INFLUENCE },
    poiTypeWeights: { ...DEFAULT_POI_TYPE_WEIGHTS },
    version: PARAMS_VERSION,
  };
}

/**
 * Get a single weight value by name
 */
export function getWeight(name: keyof GravityWeights): number {
  return DEFAULT_WEIGHTS[name];
}

/**
 * Get the total of all weights (for normalization)
 */
export function getTotalWeight(): number {
  return Object.values(DEFAULT_WEIGHTS).reduce((sum, w) => sum + w, 0);
}

/**
 * Log current params to console (useful for debugging)
 */
export function logParams(): void {
  const params = getGravityParams();
  console.log('Gravity Model Parameters:');
  console.log(`  Version: ${params.version}`);
  console.log(`  Weights: pop=${params.weights.population}, inc=${params.weights.income}, metro=${params.weights.metro}, traffic=${params.weights.traffic}, poi=${params.weights.poi}`);
  console.log(`  Beta: ${params.beta}`);
  console.log(`  Resolution: ${params.resolution}m`);
}
