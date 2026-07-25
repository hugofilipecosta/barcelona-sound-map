import { describe, expect, it } from "vitest";
import type { ConcertResult, ListeningSpotResult, StoreResult } from "../types";
import { buildRoute, reasonForResult, searchSoundMap } from "./search";

function concert(overrides: Partial<ConcertResult> = {}): ConcertResult {
  return {
    id: "concert-1",
    type: "concert",
    name: "Test Show",
    neighborhood: "Gotic",
    address: "Test address",
    distanceKm: 1,
    moods: ["Jazz"],
    source: "Manual seed",
    freshness: "Seeded",
    sourceUrl: "https://example.com",
    mapUrl: "https://example.com/map",
    note: "note",
    date: "2026-07-20",
    time: "20:00",
    venue: "Test Venue",
    price: "Free",
    ticketUrl: "https://example.com/tickets",
    ...overrides,
  };
}

function store(overrides: Partial<StoreResult> = {}): StoreResult {
  return {
    id: "store-1",
    type: "store",
    name: "Test Records",
    neighborhood: "El Raval",
    address: "Test address",
    distanceKm: 0.5,
    moods: ["Vinyl digging"],
    source: "Manual seed",
    freshness: "Seeded",
    sourceUrl: "https://example.com",
    mapUrl: "https://example.com/map",
    note: "note",
    hours: "Check today",
    websiteUrl: "https://example.com",
    specialties: ["vinyl"],
    ...overrides,
  };
}

function spot(overrides: Partial<ListeningSpotResult> = {}): ListeningSpotResult {
  return {
    id: "spot-1",
    type: "spot",
    name: "Test Listening Bar",
    neighborhood: "Gracia",
    address: "Test address",
    distanceKm: 1.5,
    moods: ["Listening bar"],
    source: "Manual seed",
    freshness: "Seeded",
    sourceUrl: "https://example.com",
    mapUrl: "https://example.com/map",
    note: "note",
    hours: "Evening bar",
    websiteUrl: "https://example.com",
    specialties: ["vinyl nights"],
    ...overrides,
  };
}

const baseFilters = {
  dateStart: "2026-07-19",
  dateEnd: "2026-07-26",
  neighborhood: "All Barcelona" as const,
  radiusKm: 4,
  mood: "Any mood" as const,
};

describe("searchSoundMap", () => {
  it("excludes concerts outside the date range", () => {
    const inRange = concert({ id: "in-range", date: "2026-07-20" });
    const outOfRange = concert({ id: "out-of-range", date: "2026-08-01" });
    const results = searchSoundMap(baseFilters, [inRange, outOfRange], [], []);
    expect(results.map((r) => r.id)).toEqual(["in-range"]);
  });

  it("does not date-filter stores or spots", () => {
    const results = searchSoundMap(baseFilters, [], [store()], [spot()]);
    expect(results).toHaveLength(2);
  });

  it("excludes results beyond the radius", () => {
    const near = store({ id: "near", distanceKm: 1 });
    const far = store({ id: "far", distanceKm: 10 });
    const results = searchSoundMap(baseFilters, [], [near, far], []);
    expect(results.map((r) => r.id)).toEqual(["near"]);
  });

  it("filters by neighborhood when one is selected", () => {
    const gotic = store({ id: "gotic", neighborhood: "Gotic" });
    const raval = store({ id: "raval", neighborhood: "El Raval" });
    const results = searchSoundMap(
      { ...baseFilters, neighborhood: "Gotic" },
      [],
      [gotic, raval],
      [],
    );
    expect(results.map((r) => r.id)).toEqual(["gotic"]);
  });

  it("filters by mood when one is selected", () => {
    const jazzConcert = concert({ id: "jazz", moods: ["Jazz"] });
    const rockConcert = concert({ id: "rock", moods: ["Rock"] });
    const results = searchSoundMap(
      { ...baseFilters, mood: "Jazz" },
      [jazzConcert, rockConcert],
      [],
      [],
    );
    expect(results.map((r) => r.id)).toEqual(["jazz"]);
  });

  it("sorts higher-confidence results first", () => {
    const lowConfidence = store({ id: "low", confidence: 20 });
    const highConfidence = store({ id: "high", confidence: 90 });
    const results = searchSoundMap(baseFilters, [], [lowConfidence, highConfidence], []);
    expect(results.map((r) => r.id)).toEqual(["high", "low"]);
  });
});

describe("buildRoute", () => {
  it("picks the first store, spot, and concert from the result list", () => {
    const results = [spot({ id: "spot-a" }), store({ id: "store-a" }), concert({ id: "concert-a" })];
    const route = buildRoute(results);
    expect(route.spot?.id).toBe("spot-a");
    expect(route.store?.id).toBe("store-a");
    expect(route.concert?.id).toBe("concert-a");
  });

  it("leaves a stop undefined when no matching result exists", () => {
    const route = buildRoute([store()]);
    expect(route.store).toBeDefined();
    expect(route.spot).toBeUndefined();
    expect(route.concert).toBeUndefined();
  });
});

describe("reasonForResult", () => {
  it("includes the matched neighborhood and mood", () => {
    const result = store({ neighborhood: "Gotic", moods: ["Vinyl digging", "Jazz"] });
    const reason = reasonForResult(result, { ...baseFilters, neighborhood: "Gotic", mood: "Jazz" });
    expect(reason).toContain("matches Gotic");
    expect(reason).toContain("fits jazz");
  });

  it("always includes the distance", () => {
    const result = store({ distanceKm: 2.3 });
    const reason = reasonForResult(result, baseFilters);
    expect(reason).toContain("2.3 km away");
  });
});
