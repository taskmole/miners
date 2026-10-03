import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import turfArea from "@turf/area";
import turfIntersect from "@turf/intersect";
import { featureCollection } from "@turf/helpers";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import {
    calculatePopulation,
    calculateAverageIncome,
    generateWalkingCircle,
    getCachedStats,
    clearStatsCache,
} from "@/lib/area-calculations";

function load(file: string): FeatureCollection {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", file), "utf-8"));
}

const income = load("madrid_income_2023.geojson");
const density = load("barrios_with_density.geojson");

function square(lon: number, lat: number, d: number): Feature<Polygon> {
    return {
        type: "Feature",
        properties: {},
        geometry: {
            type: "Polygon",
            coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]],
        },
    };
}

// The pre-bbox-filter implementations, kept here as the reference answer.
function bruteIncome(drawn: Feature<Polygon>): number {
    let w = 0, a = 0;
    for (const s of income.features) {
        try {
            if (s.geometry.type !== "Polygon" && s.geometry.type !== "MultiPolygon") continue;
            const x = turfIntersect(featureCollection([drawn, s as Feature<Polygon>]));
            if (!x) continue;
            const km2 = turfArea(x) / 1e6;
            const v = s.properties?.avgIncome || 0;
            if (v > 0) { w += km2 * v; a += km2; }
        } catch { continue; }
    }
    return a === 0 ? 0 : Math.round(w / a);
}

function brutePopulation(drawn: Feature<Polygon>): number {
    let t = 0;
    for (const n of density.features) {
        try {
            if (n.geometry.type !== "Polygon" && n.geometry.type !== "MultiPolygon") continue;
            const x = turfIntersect(featureCollection([drawn, n as Feature<Polygon>]));
            if (x) t += (turfArea(x) / 1e6) * (n.properties?.density || 0);
        } catch { continue; }
    }
    return Math.round(t);
}

describe("area stats with the bounding-box prefilter", () => {
    const shapes: [string, Feature<Polygon>][] = [
        ["Sol, small", square(-3.7038, 40.4168, 0.004)],
        ["Salamanca, medium", square(-3.68, 40.43, 0.01)],
        ["walking circle", generateWalkingCircle([-3.70, 40.42], 800)!],
        ["outside Madrid (Prague)", square(14.43, 50.08, 0.01)],
    ];

    it.each(shapes)("matches the unfiltered answer: %s", (_, shape) => {
        expect(calculateAverageIncome(shape, income)).toBe(bruteIncome(shape));
        expect(calculatePopulation(shape, density)).toBe(brutePopulation(shape));
    });

    it("central Madrid has real numbers", () => {
        const shape = square(-3.7038, 40.4168, 0.004);
        expect(calculateAverageIncome(shape, income)).toBeGreaterThan(0);
        expect(calculatePopulation(shape, density)).toBeGreaterThan(0);
    });
});

describe("getCachedStats", () => {
    it("does not cache a zero answer computed before the data loaded", () => {
        clearStatsCache();
        const shape = square(-3.7038, 40.4168, 0.004);
        const early = getCachedStats("shape-1", shape, null, null);
        expect(early.population).toBe(0);
        const later = getCachedStats("shape-1", shape, density, income);
        expect(later.population).toBeGreaterThan(0);
        expect(later.income).toBeGreaterThan(0);
    });
});
