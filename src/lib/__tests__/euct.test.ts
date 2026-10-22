import { describe, it, expect } from "vitest";
import {
  checkSafety,
  linkKey,
  mergeCity,
  parseCafePage,
  parseCityPage,
  type CafeDetails,
  type EuctRow,
  type ListedCafe,
} from "../../../scripts/data-pipeline/lib/euct";

const BASE = "https://europeancoffeetrip.com";

function cityPage(cafes: object[]): string {
  return `<html><script>var cafesToMap = ${JSON.stringify(cafes)};</script></html>`;
}

function listed(slug: string, lat = "40.1", lon = "-3.1"): ListedCafe {
  return {
    name: slug,
    link: `${BASE}/cafe/${slug}/`,
    address: "Street 1",
    latitude: lat,
    longitude: lon,
    premium: "False",
    awards_winner: "False",
    featured_photo: "",
  };
}

function row(slug: string, overrides: Partial<EuctRow> = {}): EuctRow {
  return {
    city_name: "madrid",
    ...listed(slug),
    website: "",
    instagram: "",
    facebook: "",
    date_published: "2020-01-01T00:00:00+00:00",
    date_modified: "2020-01-01T00:00:00+00:00",
    ...overrides,
  };
}

const freshDetails: CafeDetails = {
  website: "https://new.example",
  instagram: "",
  facebook: "",
  date_published: "2020-01-01T00:00:00+00:00",
  date_modified: "2026-10-01T00:00:00+00:00",
};

describe("parseCityPage", () => {
  it("reads cafes, makes links absolute and writes premium as True/False", () => {
    const cafes = parseCityPage(
      cityPage([
        { name: "Slow", link: "/cafe/slow-madrid/", latitude: "40.4", longitude: "-3.7", premium: true },
        { name: "Hanso", link: `${BASE}/cafe/hanso-madrid/`, latitude: 40.41, longitude: -3.70 },
      ])
    );
    expect(cafes).toHaveLength(2);
    expect(cafes![0].link).toBe(`${BASE}/cafe/slow-madrid/`);
    expect(cafes![0].premium).toBe("True");
    expect(cafes![1].premium).toBe("False");
    expect(cafes![1].latitude).toBe("40.41");
  });

  it("skips Miners locations and cafes without coordinates", () => {
    const cafes = parseCityPage(
      cityPage([
        { name: "The Miners Plaza de España", link: "/cafe/theminers-madrid/", latitude: "40", longitude: "-3" },
        { name: "No pin", link: "/cafe/nopin/" },
      ])
    );
    expect(cafes).toEqual([]);
  });

  it("returns null for a blocked page", () => {
    expect(parseCityPage("<title>Just a moment...</title>")).toBeNull();
  });
});

describe("parseCafePage", () => {
  it("reads dates and social links", () => {
    const html = `
      <script>{"datePublished":"2023-02-05T09:16:12+00:00","dateModified":"2025-01-01T00:00:00+00:00"}</script>
      <a href="https://www.instagram.com/slow/"><img src="/icons/Social-Instagram.svg"></a>
      <a href="https://facebook.com/slow"><img src="/icons/Social-Facebook.svg"></a>
      <a href="https://slow.cafe"><img src="/icons/Social-Website.svg"></a>`;
    expect(parseCafePage(html)).toEqual({
      website: "https://slow.cafe",
      instagram: "https://www.instagram.com/slow/",
      facebook: "https://facebook.com/slow",
      date_published: "2023-02-05T09:16:12+00:00",
      date_modified: "2025-01-01T00:00:00+00:00",
    });
  });
});

describe("mergeCity", () => {
  it("keeps the exact old coordinates and link of a known cafe", () => {
    const existing = [row("a", { latitude: "40.435129700", longitude: "-3.707322100", link: `${BASE}/cafe/a/` })];
    const site = [{ ...listed("a", "40.4351", "-3.7073"), link: `${BASE}/CAFE/a` }];
    const { rows, stats } = mergeCity("madrid", existing, site, new Map([[linkKey(site[0].link), freshDetails]]));

    expect(rows[0].latitude).toBe("40.435129700");
    expect(rows[0].longitude).toBe("-3.707322100");
    expect(rows[0].link).toBe(`${BASE}/cafe/a/`);
    expect(rows[0].website).toBe("https://new.example");
    expect(stats).toEqual({ kept: 1, added: [], removed: [], relinked: [], detailFailures: 0 });
  });

  it("adds new cafes and drops cafes the site no longer lists", () => {
    const existing = [row("a"), row("gone")];
    const site = [listed("a"), listed("new", "41.5", "2.1")];
    const details = new Map(site.map((c) => [linkKey(c.link), freshDetails]));
    const { rows, stats } = mergeCity("madrid", existing, site, details);

    expect(rows.map((r) => r.name)).toEqual(["a", "new"]);
    expect(rows[1].latitude).toBe("41.5");
    expect(rows[1].city_name).toBe("madrid");
    expect(stats).toEqual({ kept: 1, added: ["new"], removed: ["gone"], relinked: [], detailFailures: 0 });
  });

  it("treats a new link at the same spot as the same cafe and keeps its coordinates", () => {
    const existing = [row("old-slug", { latitude: "50.0716900", longitude: "14.4458700" })];
    const site = [listed("new-slug", "50.07171", "14.44590")]; // ~3 m away
    const { rows, stats } = mergeCity("prague", existing, site, new Map([[linkKey(site[0].link), freshDetails]]));

    expect(rows[0]).toMatchObject({ link: site[0].link, latitude: "50.0716900", longitude: "14.4458700" });
    expect(stats.relinked).toEqual(["old-slug -> new-slug"]);
    expect(stats.removed).toEqual([]);
  });

  it("never hands a dropped Miners row's coordinates to another cafe", () => {
    const existing = [row("x", { name: "The Miners Karlin", latitude: "50.09238", longitude: "14.44431" })];
    const site = [listed("neighbour", "50.09239", "14.44432")];
    const { rows, stats } = mergeCity("prague", existing, site, new Map());

    expect(rows[0].latitude).toBe("50.09239");
    expect(stats.removed).toEqual(["The Miners Karlin"]);
  });

  it("keeps old details when a cafe page failed", () => {
    const existing = [row("a", { instagram: "https://instagram.com/a", date_published: "2019-05-05" })];
    const { rows, stats } = mergeCity("madrid", existing, [listed("a")], new Map([[linkKey(listed("a").link), null]]));

    expect(rows[0].instagram).toBe("https://instagram.com/a");
    expect(rows[0].date_published).toBe("2019-05-05");
    expect(stats.detailFailures).toBe(1);
  });
});

describe("checkSafety", () => {
  const existing = Array.from({ length: 10 }, (_, i) => row(`c${i}`));

  it("passes a normal refresh", () => {
    expect(checkSafety(existing, existing.map((r) => listed(r.name)))).toBeNull();
  });

  it("stops when the city page had no cafe list", () => {
    expect(checkSafety(existing, null)).toMatch(/no cafe list/);
  });

  it("stops when far fewer cafes come back", () => {
    expect(checkSafety(existing, existing.slice(0, 5).map((r) => listed(r.name)))).toMatch(/below 80%/);
  });

  it("stops when the link format changed and nothing matches", () => {
    const renamed = existing.map((r) => ({ ...listed(r.name), link: `${BASE}/coffee/${r.name}` }));
    expect(checkSafety(existing, renamed)).toMatch(/link format/);
  });
});
