import type { ConcertResult, StoreResult } from "../types";

export interface EventProvider {
  name: string;
  access: "public-api-key" | "partner-token" | "affiliate-feed";
  searchConcerts(params: {
    date: string;
    city: "Barcelona";
    radiusKm: number;
  }): Promise<ConcertResult[]>;
}

export interface PlaceProvider {
  name: string;
  searchRecordStores(params: {
    city: "Barcelona";
    radiusKm: number;
  }): Promise<StoreResult[]>;
}

export const eventbriteProvider: EventProvider = {
  name: "Eventbrite API",
  access: "public-api-key",
  async searchConcerts() {
    // Server-side target:
    // GET https://www.eventbriteapi.com/v3/events/search/
    // with location.address=Barcelona, categories/music filters, and start_date range.
    return [];
  },
};

export const dicePartnerProvider: EventProvider = {
  name: "DICE Partner GraphQL",
  access: "partner-token",
  async searchConcerts() {
    // DICE's documented GraphQL endpoint is partner-token based.
    // Use only with approved DICE partner access or an approved data partner.
    return [];
  },
};

export const fnacSpectaclesProvider: EventProvider = {
  name: "FNAC Spectacles / France Billet feed",
  access: "affiliate-feed",
  async searchConcerts() {
    // FNAC/France Billet advertises affiliate XML catalogue feeds via Awin.
    // Ingest the feed server-side, then normalize concert rows into ConcertResult.
    return [];
  },
};

export const ticketlineProvider: EventProvider = {
  name: "Ticketline feed",
  access: "affiliate-feed",
  async searchConcerts() {
    // Use an approved Ticketline export/feed if available.
    return [];
  },
};

export const ticketmasterProvider: EventProvider = {
  name: "Ticketmaster Discovery API",
  access: "public-api-key",
  async searchConcerts() {
    // Server-side target:
    // GET https://app.ticketmaster.com/discovery/v2/events.json
    // with city=Barcelona, countryCode=ES, classificationName=music, date range, and apikey.
    return [];
  },
};

export const bandsintownProvider: EventProvider = {
  name: "Bandsintown API",
  access: "partner-token",
  async searchConcerts() {
    // Bandsintown's public API is artist-event oriented. Use BANDSINTOWN_ARTISTS
    // for tracked artists, or approved partnership access for broader city discovery.
    return [];
  },
};

export const googlePlacesProvider: PlaceProvider = {
  name: "Google Places API",
  async searchRecordStores() {
    // Live integration belongs server-side so API keys stay private.
    return [];
  },
};
