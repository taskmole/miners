// Gravity score grid: pre-computed 100m cells with a 0-1 normalizedScore.
//
// Pure functions only, so the same lookup runs on the server (where the
// places route attaches a score to each property) and in tests.
//
// Strategy: ~1km bucket index. Each query scans a 3x3 bucket window so the
// nearest cell is found even when the target sits near a bucket boundary.

type GridCell = { lat: number; lon: number; score: number };

export type GravityIndex = Map<string, GridCell[]>;

function bucketKey(latBucket: number, lonBucket: number): string {
    return `${latBucket},${lonBucket}`;
}

/** Build the bucket index from a GeoJSON FeatureCollection of grid points. */
export function buildGravityIndex(geojson: unknown): GravityIndex {
    const index: GravityIndex = new Map();
    const features = (geojson as { features?: unknown[] })?.features ?? [];
    for (const feat of features as any[]) {
        const coords = feat?.geometry?.coordinates;
        const score = feat?.properties?.normalizedScore;
        if (!Array.isArray(coords) || typeof score !== "number") continue;
        const [lon, lat] = coords;
        const key = bucketKey(Math.floor(lat * 100), Math.floor(lon * 100));
        const list = index.get(key);
        if (list) list.push({ lat, lon, score });
        else index.set(key, [{ lat, lon, score }]);
    }
    return index;
}

/** Score (0-100) of the grid cell nearest to a point, or undefined if none is near. */
export function scoreAt(index: GravityIndex, lat: number, lon: number): number | undefined {
    const centerLatBucket = Math.floor(lat * 100);
    const centerLonBucket = Math.floor(lon * 100);

    let bestDistSq = Infinity;
    let bestCell: GridCell | undefined;

    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {
            const list = index.get(bucketKey(centerLatBucket + dLat, centerLonBucket + dLon));
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
