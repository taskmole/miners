import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildGravityIndex, scoreAt } from "@/lib/gravity-grid";

function point(lon: number, lat: number, normalizedScore: number) {
    return { type: "Feature", properties: { normalizedScore }, geometry: { type: "Point", coordinates: [lon, lat] } };
}

describe("gravity grid", () => {
    const index = buildGravityIndex({
        type: "FeatureCollection",
        features: [point(-3.700, 40.400, 0.9), point(-3.690, 40.400, 0.2), { bad: true }],
    });

    it("returns the nearest cell's score on a 0-100 scale", () => {
        expect(scoreAt(index, 40.4001, -3.6999)).toBe(90);
        expect(scoreAt(index, 40.4001, -3.6901)).toBe(20);
    });

    it("finds the nearest cell across a bucket boundary", () => {
        // -3.6999 and -3.7001 fall in different 0.01-degree buckets.
        expect(scoreAt(index, 40.4, -3.7001)).toBe(90);
    });

    it("returns undefined far from any cell", () => {
        expect(scoreAt(index, 50.08, 14.43)).toBeUndefined();
    });

    it("tolerates junk input", () => {
        expect(buildGravityIndex(null).size).toBe(0);
        expect(buildGravityIndex({}).size).toBe(0);
    });

    it("loads the real Madrid grid and scores central Madrid", () => {
        const file = path.join(process.cwd(), "public", "data", "gravity_madrid.geojson");
        const real = buildGravityIndex(JSON.parse(fs.readFileSync(file, "utf-8")));
        const s = scoreAt(real, 40.4168, -3.7038); // Puerta del Sol
        expect(typeof s).toBe("number");
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
    });
});
