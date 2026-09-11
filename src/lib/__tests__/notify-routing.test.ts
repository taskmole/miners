import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseCoordinatesFromPlaceId } from "../place-id";
import { cityForCoordinates, countryForCoordinates } from "../notify-routing";

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
  // The city is worked out from the coordinates inside the place id, so the
  // two have to be tested together. Spanish longitudes are negative, which
  // puts a double minus in the middle of the id ("...-40.41680--3.70380-...")
  // - the exact shape most likely to defeat the parser and silently send a
  // Madrid request to nobody.
  const cityForPlaceId = (placeId: string) => {
    const coords = parseCoordinatesFromPlaceId(placeId);
    return coords ? cityForCoordinates(coords.lat, coords.lon) : null;
  };

  it("routes a Madrid property to Madrid despite the negative longitude", () => {
    expect(cityForPlaceId("property-40.41680--3.70380-4274e50b")).toBe("madrid");
  });

  it("routes a Seville property to Seville, not to Madrid", () => {
    expect(cityForPlaceId("property-37.38910--5.98450-abc12345")).toBe("seville");
  });

  it("routes a real Prague request to Prague", () => {
    expect(cityForPlaceId("property-50.06362-14.40902-4274e50b")).toBe("prague");
  });

  it("tells Barcelona and Madrid apart", () => {
    expect(cityForPlaceId("property-41.38740-2.17340-abc12345")).toBe("barcelona");
  });

  it("returns nothing when the place id carries no coordinates", () => {
    expect(cityForPlaceId("not-a-place-id")).toBeNull();
  });

  it("refuses to guess for a point nowhere near a known city", () => {
    // Berlin. Under the old hardcoded country rule this mattered less; now it
    // decides who is emailed about a request, so a wrong guess is a request
    // landing in the wrong country's inbox.
    expect(cityForCoordinates(52.52, 13.405)).toBeNull();
  });
});

describe("city catalogue routes to the right country", () => {
  it("puts every city in the list in its own country", () => {
    const selector = fs.readFileSync(
      path.resolve(__dirname, "../cities.ts"),
      "utf-8",
    );

    // Routing derives the country from the nearest city centre, so a city
    // whose coordinates land closer to a neighbour in another country would be
    // routed wrong. That is how a Madrid request silently loses its Spanish
    // watcher, and it survives the two lists having been merged into one.
    //
    // One city per line. Read each line on its own rather than with a single
    // expression across the whole file: a city's `chip: { ... }` contains
    // braces, which any "up to the closing brace" pattern stops at, quietly
    // matching one city and passing forever.
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
