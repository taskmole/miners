import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseCoordinatesFromPlaceId } from "../place-id";
import { countryForCoordinates, withCountryReviewers } from "../notify-routing";

const KIRILL = "kirill.odintsov@theminers.eu";
const REVIEWERS = ["matus.husar@theminers.eu", "founders@taskmole.co"];

describe("country lookup", () => {
  it("works out the country from coordinates", () => {
    expect(countryForCoordinates(40.4168, -3.7038)).toBe("ES");   // Madrid centre
    expect(countryForCoordinates(40.2841, -3.7794)).toBe("ES");   // Getafe, a suburb
    expect(countryForCoordinates(50.06362, 14.40902)).toBe("CZ"); // Prague, real request
  });

  it("refuses to guess for a point nowhere near a known city", () => {
    expect(countryForCoordinates(52.52, 13.405)).toBeNull(); // Berlin
    expect(countryForCoordinates(NaN, NaN)).toBeNull();
  });
});

describe("a real place id end to end", () => {
  // The country is worked out from the coordinates inside the place id, so the
  // two have to be tested together. Spanish longitudes are negative, which puts
  // a double minus in the middle of the id ("...-40.41680--3.70380-...") - the
  // exact shape most likely to defeat the parser and silently drop Kirill off
  // a Madrid request.
  const countryForPlaceId = (placeId: string) => {
    const coords = parseCoordinatesFromPlaceId(placeId);
    return coords ? countryForCoordinates(coords.lat, coords.lon) : null;
  };

  it("routes a Madrid property to Spain despite the negative longitude", () => {
    expect(countryForPlaceId("property-40.41680--3.70380-4274e50b")).toBe("ES");
  });

  it("routes a Seville property to Spain", () => {
    expect(countryForPlaceId("property-37.38910--5.98450-abc12345")).toBe("ES");
  });

  it("leaves a real Prague request alone", () => {
    expect(countryForPlaceId("property-50.06362-14.40902-4274e50b")).toBe("CZ");
  });

  it("adds nobody when the place id carries no coordinates", () => {
    expect(countryForPlaceId("not-a-place-id")).toBeNull();
    expect(withCountryReviewers(REVIEWERS, countryForPlaceId("not-a-place-id"))).toEqual(REVIEWERS);
  });
});

describe("extra reviewers", () => {
  it("adds Spain's watcher to a Spanish request", () => {
    expect(withCountryReviewers(REVIEWERS, "ES")).toEqual([...REVIEWERS, KIRILL]);
  });

  it("leaves every other country untouched", () => {
    expect(withCountryReviewers(REVIEWERS, "CZ")).toEqual(REVIEWERS);
    expect(withCountryReviewers(REVIEWERS, null)).toEqual(REVIEWERS);
  });

  it("never mails the same person twice", () => {
    expect(withCountryReviewers([...REVIEWERS, KIRILL.toUpperCase()], "ES")).toEqual([
      ...REVIEWERS,
      KIRILL.toUpperCase(),
    ]);
  });

  it("still reaches the watcher when there are no reviewers at all", () => {
    expect(withCountryReviewers([], "ES")).toEqual([KIRILL]);
  });
});

describe("city catalogue stays in step with the picker", () => {
  it("puts every city the picker offers in the right country", () => {
    const selector = fs.readFileSync(
      path.resolve(__dirname, "../../components/CitySelector.tsx"),
      "utf-8",
    );

    // One city per line in CitySelector's array. Read each line on its own
    // rather than with a single expression across the whole file: a city's
    // `chip: { ... }` contains braces, which any "up to the closing brace"
    // pattern stops at, quietly matching one city and passing forever.
    const lines = selector
      .split("\n")
      .filter(line => line.includes('id: "') && line.includes("countryCode:"));

    expect(lines.length).toBeGreaterThan(3);

    for (const line of lines) {
      const cityId = line.match(/id:\s*"(\w+)"/)?.[1];
      const coords = line.match(/coordinates:\s*\[(-?[\d.]+),\s*(-?[\d.]+)\]/);
      const countryCode = line.match(/countryCode:\s*"(\w+)"/)?.[1];
      expect(coords, `Could not read coordinates for ${cityId}`).toBeTruthy();

      expect(
        countryForCoordinates(parseFloat(coords![2]), parseFloat(coords![1])),
        `A request in ${cityId} would be routed to the wrong country`,
      ).toBe(countryCode);
    }
  });
});
