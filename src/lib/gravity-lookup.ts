// Gravity score lookup for rental properties.
// Loads pre-computed gravity GeoJSON (100m cells with a 0-1 normalizedScore)
// and exposes getScoreAt(lat, lon, city) returning the nearest cell's score
// scaled to 0-100.
//
// Strategy: ~1km bucket index. Each query scans a 3x3 bucket window so the
// nearest cell is found even when the target sits near a bucket boundary.

type GridCell = { lat: number; lon: number; score: number };

type CityCache = {
    buckets: Map<string, GridCell[]>;
};

const cityCaches = new Map<string, CityCache>();
const loadPromises = new Map<string, Promise<CityCache | null>>();

// Cities with pre-computed gravity data. Extend as more grids get generated.
const SUPPORTED_CITIES = new Set(["madrid"]);

function bucketKey(lat: number, lon: number): string {
    return `${Math.floor(lat * 100)},${Math.floor(lon * 100)}`;
}

async function loadCity(city: string): Promise<CityCache | null> {
    if (!SUPPORTED_CITIES.has(city)) return null;

    const existing = cityCaches.get(city);
    if (existing) return existing;

    const active = loadPromises.get(city);
    if (active) return active;

    const promise = (async () => {
        try {
            const res = await fetch(`/data/gravity_${city}.geojson`);
            if (!res.ok) return null;
            const geojson = await res.json();

            const buckets = new Map<string, GridCell[]>();
            for (const feat of geojson.features ?? []) {
                const coords = feat?.geometry?.coordinates;
                const score = feat?.properties?.normalizedScore;
                if (!Array.isArray(coords) || typeof score !== "number") continue;
                const [lon, lat] = coords;
                const cell: GridCell = { lat, lon, score };
                const key = bucketKey(lat, lon);
                const list = buckets.get(key);
                if (list) list.push(cell);
                else buckets.set(key, [cell]);
            }

            const cache: CityCache = { buckets };
            cityCaches.set(city, cache);
            return cache;
        } catch {
            return null;
        } finally {
            loadPromises.delete(city);
        }
    })();

    loadPromises.set(city, promise);
    return promise;
}

// Pre-load a city's gravity grid. Subsequent getScoreAt calls use the cache.
export async function preloadGravity(city: string): Promise<void> {
    await loadCity(city);
}

// Synchronous lookup. Returns undefined if the city has no data or the cache
// isn't loaded yet. Always call preloadGravity first.
export function getScoreAt(
    lat: number,
    lon: number,
    city: string,
): number | undefined {
    const cache = cityCaches.get(city);
    if (!cache) return undefined;

    const centerLatBucket = Math.floor(lat * 100);
    const centerLonBucket = Math.floor(lon * 100);

    let bestDistSq = Infinity;
    let bestCell: GridCell | undefined;

    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {
            const list = cache.buckets.get(
                `${centerLatBucket + dLat},${centerLonBucket + dLon}`,
            );
            if (!list) continue;
            for (const cell of list) {
                const dy = cell.lat - lat;
                const dx = cell.lon - lon;
                const d2 = dy * dy + dx * dx;
                if (d2 < bestDistSq) {
                    bestDistSq = d2;
                    bestCell = cell;
                }
            }
        }
    }

    if (!bestCell) return undefined;
    return Math.round(bestCell.score * 100);
}

// Tier classification for score badges/chips. Shared so map pin, popup badge,
// and mobile sheet header all agree on color.
export type ScoreTier = "prime" | "strong" | "moderate" | "weak";

export function scoreTier(score: number): ScoreTier {
    if (score >= 80) return "prime";
    if (score >= 65) return "strong";
    if (score >= 45) return "moderate";
    return "weak";
}

// Tailwind background color classes per tier. Used on the filled circle/chip.
export const SCORE_TIER_BG: Record<ScoreTier, string> = {
    prime: "bg-green-600",
    strong: "bg-amber-500",
    moderate: "bg-zinc-500",
    weak: "bg-red-600",
};
