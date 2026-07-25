import { describe, expect, it } from "vitest";
import {
  dedupeConcerts,
  dedupeStores,
  isValidRequestRange,
  mapGenres,
} from "./concert-api.mjs";

describe("isValidRequestRange", () => {
  it("accepts a well-formed range", () => {
    expect(
      isValidRequestRange({ dateStart: "2026-07-19", dateEnd: "2026-07-26", radiusKm: 4 }),
    ).toBe(true);
  });

  it("rejects a non-ISO date", () => {
    expect(
      isValidRequestRange({ dateStart: "19-07-2026", dateEnd: "2026-07-26", radiusKm: 4 }),
    ).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(
      isValidRequestRange({ dateStart: "2026-07-26", dateEnd: "2026-07-19", radiusKm: 4 }),
    ).toBe(false);
  });

  it("rejects a radius outside 1-50", () => {
    expect(
      isValidRequestRange({ dateStart: "2026-07-19", dateEnd: "2026-07-19", radiusKm: 0 }),
    ).toBe(false);
    expect(
      isValidRequestRange({ dateStart: "2026-07-19", dateEnd: "2026-07-19", radiusKm: 51 }),
    ).toBe(false);
  });
});

describe("dedupeConcerts", () => {
  it("drops concerts with the same name, date, and venue", () => {
    const concerts = [
      { name: "Jazz Night", date: "2026-07-20", venue: "Jamboree" },
      { name: "Jazz Night", date: "2026-07-20", venue: "Jamboree" },
      { name: "Jazz Night", date: "2026-07-21", venue: "Jamboree" },
    ];
    expect(dedupeConcerts(concerts)).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    const concerts = [
      { name: "Jazz Night", date: "2026-07-20", venue: "Jamboree" },
      { name: "JAZZ NIGHT", date: "2026-07-20", venue: "JAMBOREE" },
    ];
    expect(dedupeConcerts(concerts)).toHaveLength(1);
  });
});

describe("dedupeStores", () => {
  it("collapses known aliases to a single canonical key", () => {
    const stores = [
      { name: "Discos Revolver", address: "Carrer dels Tallers, 13" },
      { name: "Revolver Records", address: "A different address" },
    ];
    expect(dedupeStores(stores)).toHaveLength(1);
  });

  it("keeps unrelated stores separate", () => {
    const stores = [
      { name: "Discos Revolver", address: "Carrer dels Tallers, 13" },
      { name: "Daily Records", address: "Carrer de les Sitges, 9" },
    ];
    expect(dedupeStores(stores)).toHaveLength(2);
  });
});

describe("mapGenres", () => {
  it("detects jazz-related keywords", () => {
    expect(mapGenres(["Basement Jazz Session"])).toContain("Jazz");
  });

  it("detects electronic-related keywords", () => {
    expect(mapGenres(["Techno club night with resident DJs"])).toContain("Electronic");
  });

  it("falls back to Any mood when nothing matches", () => {
    expect(mapGenres(["A completely unrelated event title"])).toEqual(["Any mood"]);
  });

  it("is accent-insensitive", () => {
    expect(mapGenres(["Nit de flamenc a la Plaça"])).toContain("Global");
  });
});
