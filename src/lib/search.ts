import { concerts, listeningSpots, stores } from "../data/seed";
import type { ListeningSpotResult, Mood, Neighborhood, SoundResult } from "../types";

export interface SearchFilters {
  dateStart: string;
  dateEnd: string;
  neighborhood: Neighborhood;
  radiusKm: number;
  mood: Mood;
}

export function searchSoundMap(
  filters: SearchFilters,
  concertResults = concerts,
  storeResults = stores,
  spotResults: ListeningSpotResult[] = listeningSpots,
): SoundResult[] {
  const allResults: SoundResult[] = [...concertResults, ...storeResults, ...spotResults];

  return allResults
    .filter((result) => {
      if (result.distanceKm > filters.radiusKm) return false;
      if (
        filters.neighborhood !== "All Barcelona" &&
        result.neighborhood !== filters.neighborhood
      ) {
        return false;
      }
      if (filters.mood !== "Any mood" && !result.moods.includes(filters.mood)) {
        return false;
      }
      if (
        result.type === "concert" &&
        (result.date < filters.dateStart || result.date > filters.dateEnd)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const freshnessScore = {
        "Live API": 0,
        Seeded: 1,
        "Needs check": 2,
        "Needs access": 3,
      };
      const confidenceDiff = (b.confidence ?? 50) - (a.confidence ?? 50);
      if (confidenceDiff) return confidenceDiff;
      return (
        freshnessScore[a.freshness] - freshnessScore[b.freshness] ||
        a.distanceKm - b.distanceKm
      );
    });
}

export function buildRoute(results: SoundResult[]) {
  const store = results.find((result) => result.type === "store");
  const spot = results.find((result) => result.type === "spot");
  const concert = results.find((result) => result.type === "concert");
  return { store, spot, concert };
}

export function reasonForResult(result: SoundResult, filters: SearchFilters) {
  const reasons = [];
  if (filters.neighborhood === result.neighborhood) {
    reasons.push(`matches ${result.neighborhood}`);
  }
  if (filters.mood !== "Any mood" && result.moods.includes(filters.mood)) {
    reasons.push(`fits ${filters.mood.toLowerCase()}`);
  }
  if (result.confidenceLabel) {
    reasons.push(result.confidenceLabel.toLowerCase());
  }
  reasons.push(`${result.distanceKm.toFixed(1)} km away`);
  return reasons.join(" · ");
}
