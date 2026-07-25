export type ResultType = "concert" | "store" | "spot";

export type Mood =
  | "Any mood"
  | "Indie"
  | "Jazz"
  | "Electronic"
  | "Experimental"
  | "Rock"
  | "Global"
  | "Hiphop / Funk"
  | "Vinyl digging"
  | "Listening bar"
  | "Coffee";

export type Neighborhood =
  | "All Barcelona"
  | "Gracia"
  | "El Raval"
  | "Eixample"
  | "Poblenou"
  | "Gotic"
  | "Sant Antoni"
  | "Poble-sec";

export type Freshness = "Live API" | "Seeded" | "Needs check" | "Needs access";

export type ConcertProvider =
  | "Barcelona Open Data"
  | "Eventbrite"
  | "DICE"
  | "FNAC Spectacles"
  | "Ticketline"
  | "Ticketmaster"
  | "Bandsintown"
  | "Manual seed";

export type PlaceProvider =
  | "Google Places"
  | "OpenStreetMap"
  | "Foursquare"
  | "Yelp"
  | "Manual seed";

export interface BaseResult {
  id: string;
  type: ResultType;
  name: string;
  neighborhood: Neighborhood;
  address: string;
  distanceKm: number;
  moods: Mood[];
  source: ConcertProvider | PlaceProvider;
  freshness: Freshness;
  sourceUrl: string;
  mapUrl: string;
  note: string;
  confidence?: number;
  confidenceLabel?: string;
  lat?: number;
  lon?: number;
}

export interface ConcertResult extends BaseResult {
  type: "concert";
  date: string;
  time: string;
  venue: string;
  price: string;
  ticketUrl: string;
}

export interface StoreResult extends BaseResult {
  type: "store";
  hours: string;
  websiteUrl: string;
  specialties: string[];
}

export interface ListeningSpotResult extends BaseResult {
  type: "spot";
  hours: string;
  websiteUrl: string;
  specialties: string[];
}

export type PlaceResult = StoreResult | ListeningSpotResult;

export type SoundResult = ConcertResult | StoreResult | ListeningSpotResult;
