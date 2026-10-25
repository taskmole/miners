import { describe, it, expect, beforeEach } from "vitest";
import {
  SHARE_CODE_RE,
  PENDING_TTL_MS,
  cleanShareInput,
  clearPendingFocus,
  isAllowedPhotoUrl,
  makeShareCode,
  pendingPlaceCity,
  readPendingFocus,
  savePendingFocus,
  shareUrl,
} from "@/lib/share";

const PROPERTY_ID = "property-50.08353-14.45230-1a2b3c4d";
const MADRID_POI_ID = "metro-40.41680--3.70380";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    code: "Abc123XYZ9",
    placeId: PROPERTY_ID,
    placeType: "property",
    title: "Pronájem obchodního prostoru 24 m²",
    address: "Bořivojova, Žižkov, Praha",
    photoUrl: "https://d18-a.sdn.cz/d_18/c_img/abc.png?fl=res,749,562,3|shr,,20|jpg,90",
    ...overrides,
  };
}

describe("makeShareCode", () => {
  it("makes 10 base62 characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(makeShareCode()).toMatch(SHARE_CODE_RE);
    }
  });

  it("does not repeat", () => {
    const codes = new Set(Array.from({ length: 1000 }, makeShareCode));
    expect(codes.size).toBe(1000);
  });
});

describe("shareUrl", () => {
  it("builds the /s/ link on the given origin", () => {
    expect(shareUrl("https://theminers.vercel.app", "Abc123XYZ9")).toBe("https://theminers.vercel.app/s/Abc123XYZ9");
  });
});

describe("isAllowedPhotoUrl", () => {
  it.each([
    "https://img4.idealista.com/blur/WEB_DETAIL/0/x.jpg",
    "https://img.idealista.com/x.jpg",
    "https://d18-a.sdn.cz/d_18/x.png?fl=res,749,562,3",
    "https://europeancoffeetrip.com/wp-content/uploads/x.jpg",
  ])("allows %s", (url) => {
    expect(isAllowedPhotoUrl(url)).toBe(true);
  });

  it.each([
    "http://img4.idealista.com/x.jpg", // not https
    "https://evil.com/x.jpg",
    "https://idealista.com.evil.com/x.jpg",
    "https://notsdn.cz/x.jpg",
    "https://169.254.169.254/latest/meta-data",
    "javascript:alert(1)",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isAllowedPhotoUrl(url)).toBe(false);
  });
});

describe("cleanShareInput", () => {
  it("accepts a well-formed share and reads coordinates from the place id", () => {
    const clean = cleanShareInput(validInput());
    expect(clean).toMatchObject({ code: "Abc123XYZ9", placeType: "property", lat: 50.08353, lon: 14.4523 });
  });

  it("reads negative longitudes (Spain)", () => {
    const clean = cleanShareInput(validInput({ placeId: MADRID_POI_ID, placeType: "metro", photoUrl: null }));
    expect(clean).toMatchObject({ lat: 40.4168, lon: -3.7038 });
  });

  it.each([
    ["a short code", { code: "abc" }],
    ["a code with symbols", { code: "Abc123XYZ!" }],
    ["a place id with no coordinates", { placeId: "property-nowhere" }],
    ["an odd place type", { placeType: "DROP TABLE" }],
    ["a missing title", { title: "   " }],
    ["a non-string title", { title: 42 }],
  ])("refuses %s", (_label, overrides) => {
    expect(cleanShareInput(validInput(overrides))).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(cleanShareInput(null)).toBeNull();
    expect(cleanShareInput(undefined)).toBeNull();
  });

  it("drops a photo from a host that is not allowed, keeping the share", () => {
    const clean = cleanShareInput(validInput({ photoUrl: "https://evil.com/x.jpg" }));
    expect(clean?.photoUrl).toBeNull();
  });

  it("trims long text and collapses whitespace", () => {
    const clean = cleanShareInput(validInput({ title: `  A\n\nB  ${"x".repeat(500)}`, address: "x".repeat(500) }));
    expect(clean?.title.startsWith("A B ")).toBe(true);
    expect(clean?.title.length).toBe(160);
    expect(clean?.address?.length).toBe(200);
  });

  it("treats an empty address as none", () => {
    expect(cleanShareInput(validInput({ address: "" }))?.address).toBeNull();
  });
});

describe("pending focus", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("remembers a place until cleared", () => {
    savePendingFocus(PROPERTY_ID);
    expect(readPendingFocus()).toBe(PROPERTY_ID);
    clearPendingFocus();
    expect(readPendingFocus()).toBeNull();
  });

  it("forgets it after the time limit", () => {
    savePendingFocus(PROPERTY_ID, 1_000);
    expect(readPendingFocus(1_000 + PENDING_TTL_MS - 1)).toBe(PROPERTY_ID);
    expect(readPendingFocus(1_000 + PENDING_TTL_MS + 1)).toBeNull();
  });

  it("lets a newer link replace an older one", () => {
    savePendingFocus(PROPERTY_ID);
    savePendingFocus(MADRID_POI_ID);
    expect(readPendingFocus()).toBe(MADRID_POI_ID);
  });

  it("ignores junk in storage", () => {
    sessionStorage.setItem("miners:pending-focus", "{not json");
    expect(readPendingFocus()).toBeNull();
  });
});

describe("pendingPlaceCity", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("is the waiting place's city, worked out from its id", () => {
    savePendingFocus(PROPERTY_ID);
    expect(pendingPlaceCity()?.id).toBe("prague");
    savePendingFocus(MADRID_POI_ID);
    expect(pendingPlaceCity()?.id).toBe("madrid");
  });

  it("accepts ids in any case, like focusPlace", () => {
    savePendingFocus("PROPERTY-40.43578--3.70034-184BF122");
    expect(pendingPlaceCity()?.id).toBe("madrid");
  });

  it("is null for a place in a city that is not live yet", () => {
    savePendingFocus("cafe-41.38740-2.17340"); // Barcelona
    expect(pendingPlaceCity()).toBeNull();
  });

  it("is null for a place in no city", () => {
    savePendingFocus("cafe-52.52000-13.40500"); // Berlin
    expect(pendingPlaceCity()).toBeNull();
  });

  it("is null for an id without coordinates", () => {
    savePendingFocus("not-a-place");
    expect(pendingPlaceCity()).toBeNull();
  });

  it("is null when no link is waiting, or it is stale", () => {
    expect(pendingPlaceCity()).toBeNull();
    savePendingFocus(PROPERTY_ID, 1_000);
    expect(pendingPlaceCity(1_000 + PENDING_TTL_MS + 1)).toBeNull();
  });
});
