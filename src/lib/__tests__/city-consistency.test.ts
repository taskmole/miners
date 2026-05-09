import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CITIES } from "../../../scripts/data-pipeline/config/cities";

const selectorPath = path.resolve(__dirname, "../../components/CitySelector.tsx");
const selectorContent = fs.readFileSync(selectorPath, "utf-8");

const routePath = path.resolve(__dirname, "../../app/api/data/route.ts");
const routeContent = fs.readFileSync(routePath, "utf-8");

// Parse active city IDs from CitySelector.tsx by matching the pattern: { id: "cityId", ..., active: true, ... }
const cityEntryPattern = /\{\s*id:\s*"(\w+)"[^}]*active:\s*true[^}]*\}/g;
const activeFrontendCities: string[] = [];
let match;
while ((match = cityEntryPattern.exec(selectorContent)) !== null) {
    activeFrontendCities.push(match[1]);
}

// Parse all city IDs (including coming-soon) from CitySelector.tsx
const allCityPattern = /\{\s*id:\s*"(\w+)"/g;
const allFrontendCities: string[] = [];
while ((match = allCityPattern.exec(selectorContent)) !== null) {
    allFrontendCities.push(match[1]);
}

const pipelineCityIds = Object.keys(CITIES);

describe("city configuration consistency", () => {
    it("found active cities in CitySelector.tsx", () => {
        expect(activeFrontendCities.length).toBeGreaterThan(0);
    });

    it("every active frontend city exists in pipeline config", () => {
        for (const cityId of activeFrontendCities) {
            expect(
                pipelineCityIds,
                `City "${cityId}" is in the city picker but missing from scripts/data-pipeline/config/cities.ts`,
            ).toContain(cityId);
        }
    });

    it("every pipeline city exists in frontend city picker", () => {
        for (const cityId of pipelineCityIds) {
            expect(
                allFrontendCities,
                `City "${cityId}" is in the pipeline config but missing from CitySelector.tsx`,
            ).toContain(cityId);
        }
    });

    it("API route has google_places entry for each active city", () => {
        for (const cityId of activeFrontendCities) {
            expect(
                routeContent,
                `Missing "google_places_${cityId}" in src/app/api/data/route.ts FILE_MAP`,
            ).toContain(`google_places_${cityId}`);
        }
    });

    it("API route has gyms entry for each active city", () => {
        for (const cityId of activeFrontendCities) {
            expect(
                routeContent,
                `Missing "gyms_${cityId}" in src/app/api/data/route.ts FILE_MAP`,
            ).toContain(`gyms_${cityId}`);
        }
    });
});
