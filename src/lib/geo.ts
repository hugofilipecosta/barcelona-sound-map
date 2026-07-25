import type { Neighborhood, SoundResult } from "../types";

export const BARCELONA_CENTER: [number, number] = [41.3874, 2.1686];

const neighborhoodCenters: Record<Neighborhood, [number, number]> = {
  "All Barcelona": BARCELONA_CENTER,
  Gracia: [41.4036, 2.1527],
  "El Raval": [41.3801, 2.1686],
  Eixample: [41.3888, 2.159],
  Poblenou: [41.4036, 2.2044],
  Gotic: [41.3833, 2.177],
  "Sant Antoni": [41.3765, 2.159],
  "Poble-sec": [41.3745, 2.1613],
};

/**
 * A deterministic small offset so results sharing a neighborhood fallback
 * point don't render as a single stacked marker.
 */
function jitter(seed: string): [number, number] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  const latOffset = ((hash % 100) / 100 - 0.5) * 0.006;
  const lonOffset = (((hash >> 8) % 100) / 100 - 0.5) * 0.006;
  return [latOffset, lonOffset];
}

export function resultPosition(result: SoundResult): [number, number] {
  if (typeof result.lat === "number" && typeof result.lon === "number") {
    return [result.lat, result.lon];
  }
  const [lat, lon] = neighborhoodCenters[result.neighborhood] ?? BARCELONA_CENTER;
  const [latJitter, lonJitter] = jitter(result.id);
  return [lat + latJitter, lon + lonJitter];
}
