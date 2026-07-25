import { describe, expect, it } from "vitest";
import { matchVenue } from "./venue-registry.mjs";

describe("matchVenue", () => {
  it("matches a venue by exact name", () => {
    const match = matchVenue("Concert at Jamboree tonight");
    expect(match?.name).toBe("Jamboree");
  });

  it("matches accented aliases regardless of accents in the input", () => {
    const match = matchVenue("Concert", "Palau de la Musica", "");
    expect(match?.name).toBe("Palau de la Musica");
  });

  it("matches venue names containing punctuation like Paral.lel", () => {
    const match = matchVenue("Show at Paral·lel 62");
    expect(match?.name).toBe("Paral.lel 62");
  });

  it("returns undefined when no alias matches", () => {
    expect(matchVenue("Some completely unrelated venue name")).toBeUndefined();
  });

  it("returns real coordinates for a matched venue", () => {
    const match = matchVenue("Jamboree");
    expect(match?.lat).toBeCloseTo(41.3802, 2);
    expect(match?.lon).toBeCloseTo(2.1745, 2);
  });
});
