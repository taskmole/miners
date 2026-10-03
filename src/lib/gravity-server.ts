import fs from "fs/promises";
import path from "path";
import { buildGravityIndex, type GravityIndex } from "./gravity-grid";

/**
 * Server-side gravity grids, one per city that has one.
 *
 * Properties used to be scored in the browser, which meant every map load
 * downloaded the whole 11.5 MB Madrid grid before a single property pin could
 * appear. The grid now stays on the server: the places route scores each
 * property here and sends just the number.
 *
 * Paths are spelled out in full (not built from the city id) so Next.js file
 * tracing bundles exactly these files into the places function on Vercel.
 */
const GRID_FILES: Record<string, string> = {
    madrid: path.join(process.cwd(), "public", "data", "gravity_madrid.geojson"),
};

// One load per city per server instance. A failed load is forgotten so the
// next request tries again instead of serving unscored pins forever.
const indexes = new Map<string, Promise<GravityIndex | null>>();

export function getGravityIndex(city: string): Promise<GravityIndex | null> {
    const file = GRID_FILES[city];
    if (!file) return Promise.resolve(null);

    let pending = indexes.get(city);
    if (!pending) {
        pending = fs
            .readFile(file, "utf-8")
            .then((text) => buildGravityIndex(JSON.parse(text)))
            .catch((err) => {
                console.error(`[gravity] failed to load grid for ${city}:`, err);
                indexes.delete(city);
                return null;
            });
        indexes.set(city, pending);
    }
    return pending;
}
