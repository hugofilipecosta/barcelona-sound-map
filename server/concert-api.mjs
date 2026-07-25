import { createServer } from "node:http";
import { curatedListeningSpots, curatedStores } from "./curated-stores.mjs";
import { loadEnv } from "./env.mjs";
import { matchVenue } from "./venue-registry.mjs";

loadEnv();

const PORT = Number(process.env.CONCERT_API_PORT ?? 8787);
const BARCELONA_AGENDA_RESOURCE_ID =
  process.env.BARCELONA_OPEN_DATA_AGENDA_RESOURCE_ID ??
  "3abb2414-1ee0-446e-9c25-380e938adb73";
const BARCELONA_AGENDA_DATASTORE_URL =
  process.env.BARCELONA_OPEN_DATA_AGENDA_DATASTORE_URL ??
  "https://opendata-ajuntament.barcelona.cat/data/api/3/action/datastore_search";
const BARCELONA_AGENDA_URL =
  process.env.BARCELONA_OPEN_DATA_AGENDA_URL ??
  "https://opendata-ajuntament.barcelona.cat/data/dataset/2767159c-1c98-46b8-a686-2b25b40cb053/resource/3abb2414-1ee0-446e-9c25-380e938adb73/download";
const OVERPASS_API_URL =
  process.env.OVERPASS_API_URL ?? "https://overpass.kumi.systems/api/interpreter";
const CACHE_TTL_MS = Number(process.env.CONCERT_CACHE_TTL_MS ?? 1000 * 60 * 5);
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "https://barcelonasoundmap.netlify.app",
  "https://barcelona-sound-map-hugo.netlify.app",
];
const ALLOWED_ORIGINS = new Set(
  (process.env.CONCERT_API_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const REQUESTS_PER_MINUTE = Number(process.env.CONCERT_API_REQUESTS_PER_MINUTE ?? 60);
const EXPOSE_PROVIDER_STATUS = process.env.CONCERT_API_EXPOSE_PROVIDER_STATUS === "1";
const payloadCache = new Map();
const requestBuckets = new Map();

export async function handleNodeRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const origin = request.headers.origin;

  setBaseSecurityHeaders(response);
  setCorsHeaders(response, origin);

  if (request.method === "OPTIONS") {
    response.writeHead(isAllowedOrigin(origin) ? 204 : 403);
    response.end();
    return;
  }

  if (url.pathname !== "/api/concerts") {
    writeJson(response, 404, { error: "Not found" });
    return;
  }

  if (!isAllowedOrigin(origin)) {
    writeJson(response, 403, { error: "Origin not allowed" });
    return;
  }

  if (request.method !== "GET") {
    writeJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (isRateLimited(request)) {
    writeJson(response, 429, { error: "Too many requests" });
    return;
  }

  const dateStart = url.searchParams.get("dateStart") ?? url.searchParams.get("date") ?? today();
  const dateEnd = url.searchParams.get("dateEnd") ?? dateStart;
  const radiusKm = Number(url.searchParams.get("radiusKm") ?? 8);

  if (!isValidRequestRange({ dateStart, dateEnd, radiusKm })) {
    writeJson(response, 400, {
      error: "Invalid request. Use YYYY-MM-DD dates and radiusKm between 1 and 50.",
    });
    return;
  }

  if (wantsHtml(request, url)) {
    writeHtml(response, 200, renderHtml({ date: dateStart, city: "Barcelona", radiusKm }));
    return;
  }

  const payload = await getConcertPayload({
    dateStart,
    dateEnd,
    radiusKm,
    fast: url.searchParams.get("fast") === "1",
    refresh: url.searchParams.get("refresh") === "1",
  });

  writeJson(response, 200, payload);
}

if (isMainModule()) {
  createServer(handleNodeRequest).listen(PORT, "127.0.0.1", () => {
  console.log(`Concert API listening on http://127.0.0.1:${PORT}/api/concerts`);
  startPayloadRefresh({ dateStart: today(), dateEnd: today(), radiusKm: 8 });
  });
}

export async function getConcertPayload({ dateStart, dateEnd, radiusKm, fast, refresh }) {
  const key = payloadCacheKey(dateStart, dateEnd, radiusKm);
  const cached = payloadCache.get(key);
  const now = Date.now();
  const hasFreshPayload =
    cached?.payload && !refresh && now - cached.updatedAt < CACHE_TTL_MS;

  if (hasFreshPayload) {
    return withCacheState(cached.payload, "fresh", cached.updatedAt);
  }

  if (cached?.payload && !refresh) {
    startPayloadRefresh({ dateStart, dateEnd, radiusKm });
    return withCacheState(cached.payload, "stale-refreshing", cached.updatedAt);
  }

  if (fast) {
    startPayloadRefresh({ dateStart, dateEnd, radiusKm });
    return withCacheState(fallbackPayload({ dateStart, dateEnd }), "warming", Date.now());
  }

  return withCacheState(await refreshPayload({ dateStart, dateEnd, radiusKm }), "fresh", Date.now());
}

function startPayloadRefresh({ dateStart, dateEnd, radiusKm }) {
  const key = payloadCacheKey(dateStart, dateEnd, radiusKm);
  const cached = payloadCache.get(key);
  if (cached?.inFlight) return cached.inFlight;

  const inFlight = refreshPayload({ dateStart, dateEnd, radiusKm })
    .catch((error) => {
      const previous = payloadCache.get(key);
      payloadCache.set(key, {
        ...previous,
        payload:
          previous?.payload ??
          fallbackPayload({
            dateStart,
            dateEnd,
            error: error instanceof Error ? error.message : String(error),
          }),
        updatedAt: previous?.updatedAt ?? Date.now(),
        inFlight: undefined,
      });
    });

  payloadCache.set(key, {
    payload: cached?.payload,
    updatedAt: cached?.updatedAt ?? 0,
    inFlight,
  });
  return inFlight;
}

async function refreshPayload({ dateStart, dateEnd, radiusKm }) {
  const key = payloadCacheKey(dateStart, dateEnd, radiusKm);
  const payload = await buildPayload({ dateStart, dateEnd, radiusKm });
  payloadCache.set(key, {
    payload,
    updatedAt: Date.now(),
    inFlight: undefined,
  });
  return payload;
}

async function buildPayload({ dateStart, dateEnd, radiusKm }) {
  const providerStatus = {};
  const providerResults = await Promise.allSettled([
    fetchBarcelonaOpenDataConcerts({ dateStart, dateEnd, providerStatus }),
    fetchEventbriteConcerts({ dateStart, dateEnd, radiusKm, providerStatus }),
    fetchDiceConcerts({ dateStart, dateEnd, providerStatus }),
    fetchFnacConcerts({ dateStart, dateEnd, providerStatus }),
    fetchTicketlineConcerts({ dateStart, dateEnd, providerStatus }),
    fetchTicketmasterConcerts({ dateStart, dateEnd, radiusKm, providerStatus }),
    fetchBandsintownConcerts({ dateStart, dateEnd, providerStatus }),
  ]);
  const placeResults = await Promise.allSettled([
    fetchOpenStreetMapRecordStores({ providerStatus }),
  ]);

  const concerts = dedupeConcerts(
    providerResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  )
    .map(enrichConcertConfidence)
    .sort((a, b) => {
      const scoreDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
      return scoreDiff || a.time.localeCompare(b.time);
    });
  const stores = dedupeStores([
    ...curatedStores,
    placeResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  ].flat()).sort((a, b) => a.distanceKm - b.distanceKm);
  const spots = curatedListeningSpots
    .filter((spot) => spot.distanceKm <= radiusKm)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.distanceKm - b.distanceKm);

  return {
    date: dateStart,
    dateStart,
    dateEnd,
    city: "Barcelona",
    concerts,
    stores,
    spots,
    ...(EXPOSE_PROVIDER_STATUS ? { providerStatus } : {}),
  };
}

function fallbackPayload({ dateStart, dateEnd, error }) {
  return {
    date: dateStart,
    dateStart,
    dateEnd,
    city: "Barcelona",
    concerts: [],
    stores: curatedStores,
    spots: curatedListeningSpots,
    ...(EXPOSE_PROVIDER_STATUS
      ? {
          providerStatus: {
            "Fast preview": error
              ? "using curated stores while refresh recovers"
              : "warming live concert sources",
            "Barcelona Open Data": "refreshing in background",
            OpenStreetMap: "refreshing in background",
          },
        }
      : {}),
  };
}

function withCacheState(payload, state, updatedAt) {
  return {
    ...payload,
    cache: {
      state,
      updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      ttlSeconds: Math.round(CACHE_TTL_MS / 1000),
    },
  };
}

function payloadCacheKey(dateStart, dateEnd, radiusKm) {
  return `${dateStart}|${dateEnd}|${radiusKm}`;
}

async function fetchBarcelonaOpenDataConcerts({ dateStart, dateEnd, providerStatus }) {
  try {
    const { rows, source } = await fetchBarcelonaAgendaRows();
    const dateMatchedRows = rows.filter((row) => eventCoversRange(row, dateStart, dateEnd));
    const events = dateMatchedRows.filter((row) => looksLikeMusicEvent(row)).slice(0, 120);

    providerStatus["Barcelona Open Data"] =
      source + ": " + rows.length + " rows, " + dateMatchedRows.length + " date-matched, " + events.length + " music-like agenda events";
    return events.map((row) =>
      normalizeBarcelonaAgendaEvent(row, eventDateForRange(row, dateStart)),
    );
  } catch (error) {
    providerStatus["Barcelona Open Data"] =
      error instanceof Error ? "error: " + error.message : "error";
    return [];
  }
}

async function fetchBarcelonaAgendaRows() {
  try {
    const endpoint = new URL(BARCELONA_AGENDA_DATASTORE_URL);
    endpoint.searchParams.set("resource_id", BARCELONA_AGENDA_RESOURCE_ID);
    endpoint.searchParams.set("limit", "5000");
    const data = await fetchJson(endpoint, undefined, 8500);
    const records = data?.result?.records;
    if (Array.isArray(records)) return { rows: records, source: "datastore" };
  } catch {
    // Fall through to the CSV download endpoint.
  }

  const response = await fetchWithTimeout(
    BARCELONA_AGENDA_URL,
    {
      headers: {
        Accept: "text/csv, text/plain, */*",
        "User-Agent": "barcelona-sound-map/0.1 (+https://barcelonasoundmap.netlify.app)",
      },
    },
    8500,
  );
  if (!response.ok) throw new Error("Open Data BCN returned " + response.status);
  const text = await decodeResponseText(response);
  return { rows: parseCsv(text), source: "csv" };
}

async function fetchEventbriteConcerts({ dateStart, dateEnd, radiusKm, providerStatus }) {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) {
    providerStatus.Eventbrite = "missing EVENTBRITE_TOKEN";
    return [];
  }

  const endpoint = new URL("https://www.eventbriteapi.com/v3/events/search/");
  endpoint.searchParams.set("location.address", "Barcelona, Spain");
  endpoint.searchParams.set("location.within", `${radiusKm}km`);
  endpoint.searchParams.set("categories", "103");
  endpoint.searchParams.set("expand", "venue,ticket_availability");
  endpoint.searchParams.set("start_date.range_start", `${dateStart}T00:00:00`);
  endpoint.searchParams.set("start_date.range_end", `${dateEnd}T23:59:59`);
  endpoint.searchParams.set("sort_by", "date");

  const data = await fetchJson(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const events = Array.isArray(data.events) ? data.events : [];
  providerStatus.Eventbrite = `${events.length} raw events`;

  return events.map((event) => normalizeEventbriteEvent(event, dateFromDateTime(event.start?.local) ?? dateStart));
}

async function fetchDiceConcerts({ dateStart, dateEnd, providerStatus }) {
  const token = process.env.DICE_PARTNER_TOKEN;
  if (!token) {
    providerStatus.DICE = "missing DICE_PARTNER_TOKEN";
    return [];
  }

  const query = `
    query BarcelonaEvents {
      viewer {
        events(first: 100) {
          edges {
            node {
              id
              name
              startDatetime
              endDatetime
              url
              genres
              genreTypes
              venues {
                name
              }
            }
          }
        }
      }
    }
  `;

  const data = await fetchJson("https://partners-endpoint.dice.fm/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  const edges = data?.data?.viewer?.events?.edges ?? [];
  const events = edges
    .map((edge) => edge.node)
    .filter((event) => dateInRange(dateFromDateTime(event?.startDatetime), dateStart, dateEnd));
  providerStatus.DICE = `${events.length} partner events`;

  return events.map((event) => normalizeDiceEvent(event, dateFromDateTime(event.startDatetime) ?? dateStart));
}

async function fetchFnacConcerts({ dateStart, dateEnd, providerStatus }) {
  const feedUrl = process.env.FNAC_FEED_URL;
  if (!feedUrl) {
    providerStatus["FNAC Spectacles"] = "missing FNAC_FEED_URL";
    return [];
  }

  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`FNAC feed returned ${response.status}`);
  }
  const text = await response.text();
  const items = extractTicketFeedItems(text).filter((item) =>
    dateInRange(item.date, dateStart, dateEnd),
  );
  providerStatus["FNAC Spectacles"] = `${items.length} feed items`;
  return items.map((item) => normalizeFnacItem(item, item.date || dateStart));
}

async function fetchTicketlineConcerts({ dateStart, dateEnd, providerStatus }) {
  const feedUrl = process.env.TICKETLINE_FEED_URL;
  if (!feedUrl) {
    providerStatus.Ticketline = "missing TICKETLINE_FEED_URL";
    return [];
  }

  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`Ticketline feed returned ${response.status}`);
  const text = await response.text();
  const items = extractTicketFeedItems(text).filter((item) =>
    dateInRange(item.date, dateStart, dateEnd),
  );
  providerStatus.Ticketline = `${items.length} feed items`;
  return items.map((item) => normalizeTicketlineItem(item, item.date || dateStart));
}

async function fetchTicketmasterConcerts({ dateStart, dateEnd, radiusKm, providerStatus }) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    providerStatus.Ticketmaster = "missing TICKETMASTER_API_KEY";
    return [];
  }

  const endpoint = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  endpoint.searchParams.set("apikey", apiKey);
  endpoint.searchParams.set("city", "Barcelona");
  endpoint.searchParams.set("countryCode", "ES");
  endpoint.searchParams.set("classificationName", "music");
  endpoint.searchParams.set("startDateTime", `${dateStart}T00:00:00Z`);
  endpoint.searchParams.set("endDateTime", `${dateEnd}T23:59:59Z`);
  endpoint.searchParams.set("radius", String(radiusKm));
  endpoint.searchParams.set("unit", "km");
  endpoint.searchParams.set("size", "100");
  endpoint.searchParams.set("sort", "date,asc");

  const data = await fetchJson(endpoint);
  const events = data?._embedded?.events ?? [];
  providerStatus.Ticketmaster = `${events.length} raw events`;
  return events.map((event) =>
    normalizeTicketmasterEvent(
      event,
      event.dates?.start?.localDate ?? dateFromDateTime(event.dates?.start?.dateTime) ?? dateStart,
    ),
  );
}

async function fetchBandsintownConcerts({ dateStart, dateEnd, providerStatus }) {
  const appId = process.env.BANDSINTOWN_APP_ID;
  const artists = (process.env.BANDSINTOWN_ARTISTS ?? "")
    .split(",")
    .map((artist) => artist.trim())
    .filter(Boolean);

  if (!appId) {
    providerStatus.Bandsintown = "missing BANDSINTOWN_APP_ID";
    return [];
  }
  if (artists.length === 0) {
    providerStatus.Bandsintown = "missing BANDSINTOWN_ARTISTS";
    return [];
  }

  const results = await Promise.allSettled(
    artists.map(async (artist) => {
      const endpoint = new URL(
        `https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events`,
      );
      endpoint.searchParams.set("app_id", appId);
      endpoint.searchParams.set("date", `${dateStart},${dateEnd}`);
      const data = await fetchJson(endpoint);
      return Array.isArray(data) ? data : [];
    }),
  );

  const events = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((event) =>
      (event.venue?.city?.toLowerCase() ?? "").includes("barcelona"),
    );

  providerStatus.Bandsintown = `${events.length} artist events`;
  return events.map((event) =>
    normalizeBandsintownEvent(event, dateFromDateTime(event.datetime) ?? dateStart),
  );
}

async function fetchOpenStreetMapRecordStores({ providerStatus }) {
  const query = `
    [out:json][timeout:25];
    (
      nwr["shop"~"^(music|records)$"](41.320,2.050,41.480,2.250);
      nwr["name"~"(records|discos|vinyl|vinilo|disc)",i](41.320,2.050,41.480,2.250);
    );
    out center tags;
  `;

  try {
    const data = await fetchJson(
      OVERPASS_API_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "barcelona-sound-map/0.1",
        },
        body: `data=${encodeURIComponent(query)}`,
      },
      6500,
    );
    const elements = Array.isArray(data.elements) ? data.elements : [];
    providerStatus.OpenStreetMap = `${elements.length} raw place elements`;
    return elements
      .map(normalizeOpenStreetMapStore)
      .filter(Boolean)
      .slice(0, 40);
  } catch (error) {
    providerStatus.OpenStreetMap =
      error instanceof Error ? `error: ${error.message}` : "error";
    return [];
  }
}

function normalizeBarcelonaAgendaEvent(row, date) {
  const name = pickField(row, ["name"]) ?? "Barcelona agenda event";
  const rawVenue =
    pickField(row, ["institution_name"]) ??
    pickField(row, ["addresses_road_name"]) ??
    "Barcelona venue";
  const roadType = pickField(row, ["addresses_roadtype_name"]) ?? "";
  const road = pickField(row, ["addresses_road_name"]) ?? "";
  const number = pickField(row, ["addresses_start_street_number"]) ?? "";
  const address = [roadType, road, number].filter(Boolean).join(" ") || "Barcelona";
  const sourceUrl = "https://www.barcelona.cat/barcelonacultura/en/agenda";
  const matchedVenue = matchVenue(name, rawVenue, address);
  const venue = matchedVenue?.name ?? rawVenue;
  const rowLat = Number(pickField(row, ["geo_epgs_4326_lat"]));
  const rowLon = Number(pickField(row, ["geo_epgs_4326_lon"]));

  return {
    id: `barcelona-open-data-${pickField(row, ["register_id"]) ?? slug(name)}-${date}`,
    type: "concert",
    name: stripHtml(name),
    venue: stripHtml(venue),
    neighborhood: matchedVenue?.neighborhood ?? guessNeighborhood(
      `${pickField(row, ["addresses_neighborhood_name"]) ?? ""} ${address} ${venue}`,
    ),
    address,
    distanceKm: matchedVenue?.distanceKm ?? distanceFromBarcelonaCenter(row),
    lat: matchedVenue?.lat ?? (Number.isFinite(rowLat) ? rowLat : undefined),
    lon: matchedVenue?.lon ?? (Number.isFinite(rowLon) ? rowLon : undefined),
    moods: mapGenres([
      name,
      venue,
      pickField(row, ["secondary_filters_name"]) ?? "",
      pickField(row, ["secondary_filters_fullpath"]) ?? "",
      pickField(row, ["values_value"]) ?? "",
      pickField(row, ["values_description"]) ?? "",
    ]),
    source: "Barcelona Open Data",
    freshness: "Live API",
    sourceUrl,
    mapUrl: mapSearchUrl(venue, address),
    ticketUrl: sourceUrl,
    date,
    time: timeFromAgenda(row),
    price: "Check agenda",
    note: matchedVenue
      ? `Fetched from Barcelona's open cultural agenda and matched to ${matchedVenue.name}.`
      : "Fetched from Barcelona's open cultural agenda.",
  };
}

function normalizeOpenStreetMapStore(element) {
  const tags = element.tags ?? {};
  const name = tags.name;
  if (!name) return null;
  if (!isLikelyRecordStore(name, tags)) return null;
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const address = osmAddress(tags);
  const mapUrl =
    lat && lon
      ? `https://maps.google.com/?q=${lat},${lon}`
      : `https://maps.google.com/?q=${encodeURIComponent(`${name} Barcelona`)}`;
  const websiteUrl = tags.website ?? tags["contact:website"] ?? mapUrl;

  return {
    id: `osm-${element.type}-${element.id}`,
    type: "store",
    name,
    neighborhood: guessNeighborhood(`${name} ${address}`),
    address,
    distanceKm: distanceKm(41.3874, 2.1686, Number(lat), Number(lon)) || 2,
    lat: Number.isFinite(Number(lat)) ? Number(lat) : undefined,
    lon: Number.isFinite(Number(lon)) ? Number(lon) : undefined,
    moods: ["Vinyl digging"],
    source: "OpenStreetMap",
    freshness: "Live API",
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    mapUrl,
    websiteUrl,
    hours: tags.opening_hours ?? "Check today",
    specialties: storeSpecialties(name, tags),
    note: "Fetched from OpenStreetMap. Google Places can enrich hours and website confidence later.",
  };
}

function isLikelyRecordStore(name, tags) {
  const lower = name.toLowerCase();
  const shop = String(tags.shop ?? "").toLowerCase();
  if (["music", "records"].includes(shop)) return true;

  const obviousFalseMatches = [
    "discau",
    "discount",
    "joieria",
    "associació",
    "associacio",
    "discapacitat",
    "disco bar",
    "disco club",
  ];
  if (obviousFalseMatches.some((term) => lower.includes(term))) return false;
  if (["bar", "nightclub", "restaurant", "supermarket"].includes(shop)) return false;
  if (["bar", "nightclub", "restaurant"].includes(String(tags.amenity ?? ""))) {
    return false;
  }

  return /\b(records?|vinyl|discos?)\b/.test(lower);
}

function normalizeEventbriteEvent(event, date) {
  const start = event.start?.local ?? `${date}T00:00:00`;
  const venueName = event.venue?.name ?? "Venue TBA";
  const address =
    event.venue?.address?.localized_address_display ??
    event.venue?.address?.address_1 ??
    "Barcelona";
  const eventbriteLat = Number(event.venue?.address?.latitude);
  const eventbriteLon = Number(event.venue?.address?.longitude);

  return {
    id: `eventbrite-${event.id}`,
    type: "concert",
    name: event.name?.text ?? event.name?.html ?? "Untitled Eventbrite event",
    venue: venueName,
    neighborhood: guessNeighborhood(`${venueName} ${address}`),
    address,
    distanceKm: 2,
    lat: Number.isFinite(eventbriteLat) ? eventbriteLat : undefined,
    lon: Number.isFinite(eventbriteLon) ? eventbriteLon : undefined,
    moods: mapGenres([
      event.name?.text,
      event.name?.html,
      event.summary,
      event.description?.text,
    ]),
    source: "Eventbrite",
    freshness: "Live API",
    sourceUrl: event.url,
    mapUrl: mapSearchUrl(venueName, address),
    ticketUrl: event.url,
    date,
    time: start.slice(11, 16),
    price: event.is_free ? "Free" : "Check Eventbrite",
    note: event.summary ?? "Fetched from Eventbrite.",
  };
}

function normalizeDiceEvent(event, date) {
  const venue = event.venues?.[0]?.name ?? "Venue TBA";
  return {
    id: `dice-${event.id}`,
    type: "concert",
    name: event.name ?? "Untitled DICE event",
    venue,
    neighborhood: guessNeighborhood(venue),
    address: "Barcelona",
    distanceKm: 2,
    moods: mapGenres([...(event.genres ?? []), ...(event.genreTypes ?? [])]),
    source: "DICE",
    freshness: "Live API",
    sourceUrl: event.url ?? "https://dice.fm/browse/barcelona",
    mapUrl: mapSearchUrl(venue, "Barcelona"),
    ticketUrl: event.url ?? "https://dice.fm/browse/barcelona",
    date,
    time: (event.startDatetime ?? `${date}T00:00:00`).slice(11, 16),
    price: "Check DICE",
    note: "Fetched from DICE partner access.",
  };
}

function normalizeFnacItem(item, date) {
  const venue = item.venue || "Venue TBA";
  return {
    id: `fnac-${slug(item.name)}-${date}`,
    type: "concert",
    name: item.name,
    venue,
    neighborhood: guessNeighborhood(`${venue} ${item.address}`),
    address: item.address || "Barcelona",
    distanceKm: 2,
    moods: mapGenres([item.category, item.description].filter(Boolean)),
    source: "FNAC Spectacles",
    freshness: "Live API",
    sourceUrl: item.url,
    mapUrl: mapSearchUrl(venue, item.address || "Barcelona"),
    ticketUrl: item.url,
    date,
    time: item.time || "20:00",
    price: item.price || "Check FNAC",
    note: "Fetched from FNAC/France Billet affiliate feed.",
  };
}

function normalizeTicketlineItem(item, date) {
  const venue = item.venue || "Venue TBA";
  return {
    id: `ticketline-${slug(item.name)}-${date}`,
    type: "concert",
    name: item.name,
    venue,
    neighborhood: guessNeighborhood(`${venue} ${item.address}`),
    address: item.address || "Barcelona",
    distanceKm: 2,
    moods: mapGenres([item.category, item.description].filter(Boolean)),
    source: "Ticketline",
    freshness: "Live API",
    sourceUrl: item.url,
    mapUrl: mapSearchUrl(venue, item.address || "Barcelona"),
    ticketUrl: item.url,
    date,
    time: item.time || "20:00",
    price: item.price || "Check Ticketline",
    note: "Fetched from Ticketline feed.",
  };
}

function normalizeTicketmasterEvent(event, date) {
  const venue = event?._embedded?.venues?.[0];
  const venueName = venue?.name ?? "Venue TBA";
  const address = venue?.address?.line1 ?? venue?.city?.name ?? "Barcelona";
  const dateTime =
    event.dates?.start?.localTime ??
    event.dates?.start?.dateTime?.slice(11, 16) ??
    "20:00";
  const ticketmasterLat = Number(venue?.location?.latitude);
  const ticketmasterLon = Number(venue?.location?.longitude);

  return {
    id: `ticketmaster-${event.id}`,
    type: "concert",
    name: event.name ?? "Untitled Ticketmaster event",
    venue: venueName,
    neighborhood: guessNeighborhood(`${venueName} ${address}`),
    address,
    distanceKm: 2,
    lat: Number.isFinite(ticketmasterLat) ? ticketmasterLat : undefined,
    lon: Number.isFinite(ticketmasterLon) ? ticketmasterLon : undefined,
    moods: mapGenres(
      [
        event.classifications?.[0]?.genre?.name,
        event.classifications?.[0]?.subGenre?.name,
      ].filter(Boolean),
    ),
    source: "Ticketmaster",
    freshness: "Live API",
    sourceUrl: event.url,
    mapUrl: mapSearchUrl(venueName, address),
    ticketUrl: event.url,
    date,
    time: dateTime,
    price: priceFromTicketmaster(event),
    note: "Fetched from Ticketmaster Discovery API.",
  };
}

function normalizeBandsintownEvent(event, date) {
  const venue = event.venue?.name ?? "Venue TBA";
  const offers = Array.isArray(event.offers) ? event.offers : [];
  const ticketUrl = offers[0]?.url ?? event.url;
  const bandsintownLat = Number(event.venue?.latitude);
  const bandsintownLon = Number(event.venue?.longitude);
  return {
    id: `bandsintown-${event.id}`,
    type: "concert",
    name: event.title ?? event.lineup?.join(", ") ?? "Bandsintown event",
    venue,
    neighborhood: guessNeighborhood(`${venue} ${event.venue?.city ?? ""}`),
    address: event.venue?.location ?? event.venue?.city ?? "Barcelona",
    distanceKm: 2,
    lat: Number.isFinite(bandsintownLat) ? bandsintownLat : undefined,
    lon: Number.isFinite(bandsintownLon) ? bandsintownLon : undefined,
    moods: mapGenres([event.title, ...(event.lineup ?? []), event.description]),
    source: "Bandsintown",
    freshness: "Live API",
    sourceUrl: event.url,
    mapUrl: mapSearchUrl(venue, event.venue?.location ?? "Barcelona"),
    ticketUrl,
    date,
    time: (event.datetime ?? `${date}T20:00:00`).slice(11, 16),
    price: "Check Bandsintown",
    note: "Fetched from Bandsintown artist-events API.",
  };
}

function extractTicketFeedItems(text) {
  const itemBlocks = [...text.matchAll(/<(?:item|product|offer)\b[\s\S]*?<\/(?:item|product|offer)>/gi)].map(
    (match) => match[0],
  );

  return itemBlocks.map((block) => ({
    name:
      pickTag(block, ["title", "name", "product_name"]) ??
      "Untitled FNAC event",
    date: normalizeDate(
      pickTag(block, ["date", "event_date", "start_date", "date_debut"]) ?? "",
    ),
    time: pickTag(block, ["time", "event_time", "heure"]),
    venue: pickTag(block, ["venue", "location", "salle"]),
    address: pickTag(block, ["address", "adresse"]),
    category: pickTag(block, ["category", "categorie"]),
    description: pickTag(block, ["description", "summary"]),
    price: pickTag(block, ["price", "prix"]),
    url: pickTag(block, ["link", "url", "deeplink"]) ?? "https://www.fnacspectacles.com/",
  }));
}

function priceFromTicketmaster(event) {
  const range = event.priceRanges?.[0];
  if (!range) return "Check Ticketmaster";
  if (range.min && range.max && range.min !== range.max) {
    return `${range.min}-${range.max} ${range.currency ?? ""}`.trim();
  }
  if (range.min) return `${range.min} ${range.currency ?? ""}`.trim();
  return "Check Ticketmaster";
}

function pickTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match?.[1]) return decodeXml(match[1].trim());
  }
  return undefined;
}

function normalizeDate(value) {
  const iso = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const eu = value.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
  return value.slice(0, 10);
}

export function mapGenres(values) {
  const text = normalizeGenreText(values.join(" "));
  const moods = [];

  addMoodIf(moods, "Jazz", /\b(jazz|blues|swing|big band|jam session)\b/.test(text));
  addMoodIf(
    moods,
    "Hiphop / Funk",
    /\b(hip[ -]?hop|hiphop|rap|r&b|trap|funk|soul|groove|disco)\b/.test(text),
  );
  addMoodIf(
    moods,
    "Electronic",
    /\b(electro|electronic|electronica|techno|house|club|dj|dance|rave|ambient)\b/.test(text),
  );
  addMoodIf(moods, "Rock", /\b(rock|punk|metal|hardcore|psych|guitar)\b/.test(text));
  addMoodIf(moods, "Indie", /\b(indie|alternative|alt pop|dream pop|shoegaze)\b/.test(text));
  addMoodIf(
    moods,
    "Experimental",
    /\b(experimental|avant|leftfield|noise|impro|improv|free jazz)\b/.test(text),
  );
  addMoodIf(
    moods,
    "Global",
    /\b(world music|world|global|latin|latino|afro|afri|reggae|dub|salsa|flamenc|flamenco|rumba|cumbia|samba|bossa|fado|gnawa|habana|havana|cuba|cubano|cubana|brasil|brazil|andalucia|andalusia|pachito|melao)\b/.test(
      text,
    ),
  );

  return moods.length ? moods : ["Any mood"];
}

function addMoodIf(moods, mood, shouldAdd) {
  if (shouldAdd && !moods.includes(mood)) moods.push(mood);
}

function normalizeGenreText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function enrichConcertConfidence(concert) {
  const matchedVenue = matchVenue(concert.name, concert.venue, concert.address);
  const venue = matchedVenue?.name ?? concert.venue;
  const vagueVenue = /^(barcelona venue|venue tba|barcelona)$/i.test(venue);
  let confidence = 45;

  if (concert.source !== "Manual seed") confidence += 10;
  if (concert.source !== "Barcelona Open Data") confidence += 8;
  if (matchedVenue) confidence += 28;
  if (!vagueVenue) confidence += 10;
  if (concert.ticketUrl && !concert.ticketUrl.includes("barcelonacultura")) confidence += 8;
  if (concert.name.toLowerCase().includes("concert")) confidence += 5;
  if (concert.name.toLowerCase().includes("festival")) confidence -= vagueVenue ? 12 : 2;
  if (vagueVenue) confidence -= 20;
  if (concert.distanceKm > 6) confidence -= 8;

  confidence = Math.max(5, Math.min(100, confidence));

  return {
    ...concert,
    venue,
    neighborhood: matchedVenue?.neighborhood ?? concert.neighborhood,
    distanceKm: matchedVenue?.distanceKm ?? concert.distanceKm,
    lat: matchedVenue?.lat ?? concert.lat,
    lon: matchedVenue?.lon ?? concert.lon,
    mapUrl: matchedVenue
      ? mapSearchUrl(matchedVenue.name, "Barcelona")
      : concert.mapUrl,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
  };
}

function confidenceLabel(confidence) {
  if (confidence >= 80) return "High confidence";
  if (confidence >= 58) return "Good signal";
  return "Needs venue check";
}

function guessNeighborhood(text) {
  const lower = text.toLowerCase();
  if (lower.includes("poblenou") || lower.includes("razzmatazz")) return "Poblenou";
  if (lower.includes("raval") || lower.includes("tallers")) return "El Raval";
  if (lower.includes("gracia") || lower.includes("gràcia")) return "Gracia";
  if (lower.includes("apolo") || lower.includes("poble-sec")) return "Poble-sec";
  if (lower.includes("jamboree") || lower.includes("gòtic") || lower.includes("gotic")) return "Gotic";
  if (lower.includes("sant antoni")) return "Sant Antoni";
  if (lower.includes("eixample")) return "Eixample";
  return "All Barcelona";
}

function eventCoversRange(row, dateStart, dateEnd) {
  const start = normalizeDate(pickField(row, ["start_date"]) ?? "");
  const end = normalizeDate(pickField(row, ["end_date"]) ?? "") || start;
  if (!start) return false;
  return start <= dateEnd && end >= dateStart;
}

function eventDateForRange(row, dateStart) {
  const start = normalizeDate(pickField(row, ["start_date"]) ?? "");
  if (!start || start < dateStart) return dateStart;
  return start;
}

function dateFromDateTime(value) {
  return typeof value === "string" ? value.slice(0, 10) : undefined;
}

function dateInRange(date, dateStart, dateEnd) {
  return Boolean(date && date >= dateStart && date <= dateEnd);
}

function looksLikeMusicEvent(row) {
  const title = (pickField(row, ["name"]) ?? "").toLowerCase();
  const text = [
    title,
    pickField(row, ["secondary_filters_name"]),
    pickField(row, ["secondary_filters_fullpath"]),
    pickField(row, ["values_value"]),
    pickField(row, ["values_description"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const noisyFormats = [
    "taller",
    "workshop",
    "familiar",
    "nadons",
    "infants",
    "ioga",
    "yoga",
    "dansa",
    "sensibilització",
    "estimulació",
    "aprendre a cantar",
    "fotografia",
  ];
  if (noisyFormats.some((keyword) => title.includes(keyword))) return false;

  return [
    "concert",
    "concerts",
    "festival",
    "festa",
    "jam session",
    "jamboree",
    "guitar bcn",
    "mas i mas",
    "jazz",
    "blues",
    "soul",
    "funk",
    "hip hop",
    "hiphop",
    "rap",
    "rock",
    "punk",
    "metal",
    "dj",
    "flamenc",
    "flamenco",
    "reggae",
    "salsa",
    "latin",
    "afro",
  ].some((keyword) => text.includes(keyword));
}

function timeFromAgenda(row) {
  const timetable = pickField(row, ["timetable"]) ?? "";
  const fromText = timetable.match(/\b([01]?\d|2[0-3])[:.][0-5]\d\b/)?.[0];
  if (fromText) return fromText.replace(".", ":").padStart(5, "0");
  const start = pickField(row, ["start_date"]) ?? "";
  const time = start.slice(11, 16);
  return time && time !== "03:00" && time !== "00:00" ? time : "20:00";
}

function distanceFromBarcelonaCenter(row) {
  const lat = Number(pickField(row, ["geo_epgs_4326_lat"]));
  const lon = Number(pickField(row, ["geo_epgs_4326_lon"]));
  return distanceKm(41.3874, 2.1686, lat, lon) || 2;
}

function osmAddress(tags) {
  const parts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:postcode"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Barcelona";
}

function mapSearchUrl(name, address) {
  const place = String(address ?? "").trim();
  const query = /barcelona$/i.test(place)
    ? `${name} ${place}`
    : `${name} ${place} Barcelona`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}`;
}

function storeSpecialties(name, tags) {
  const text = `${name} ${tags.description ?? ""} ${tags.shop ?? ""}`.toLowerCase();
  const specialties = ["vinyl"];
  if (text.includes("jazz")) specialties.push("jazz");
  if (text.includes("electro")) specialties.push("electronic");
  if (text.includes("rock")) specialties.push("rock");
  if (text.includes("second") || text.includes("used")) specialties.push("used records");
  return specialties;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat2) || !Number.isFinite(lon2)) return 2;
  const radius = 6371;
  const dLat = degToRad(lat2 - lat1);
  const dLon = degToRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

export function dedupeConcerts(concerts) {
  const seen = new Set();
  return concerts.filter((concert) => {
    const key = `${concert.name.toLowerCase()}-${concert.date}-${concert.venue.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dedupeStores(stores) {
  const seen = new Set();
  return stores.filter((store) => {
    const key = storeDedupeKey(store);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function storeDedupeKey(store) {
  const name = store.name.toLowerCase();
  if (name.includes("revolver")) return "revolver";
  if (name.includes("daily records")) return "daily-records";
  if (name.includes("discos paradiso")) return "discos-paradiso";
  if (name.includes("wah wah")) return "wah-wah-records";
  if (name.includes("disco100") || name.includes("disco 100")) return "disco-100";
  if (name.includes("surco")) return "surco";
  if (name.includes("lostracks")) return "lostracks";
  if (name.includes("bcore")) return "bcore";
  if (name.includes("nut records")) return "nut-records";
  return `${name}-${store.address.toLowerCase()}`;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = timeoutMs
    ? setTimeout(() => controller?.abort(), timeoutMs)
    : undefined;
  try {
    return await fetch(url, { ...init, signal: controller?.signal });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchJson(url, init, timeoutMs) {
  const response = await fetchWithTimeout(url, init, timeoutMs);
  if (!response.ok) throw new Error(fetchTarget(url) + " returned " + response.status);
  return response.json();
}

async function decodeResponseText(response) {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 64));
  const hasNullBytes = bytes.some((byte, index) => index % 2 === 1 && byte === 0);
  if (hasNullBytes || (bytes[0] === 0xff && bytes[1] === 0xfe)) {
    return new TextDecoder("utf-16le").decode(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function parseCsv(text) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    const next = cleaned[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...dataRows] = rows;
  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index]?.trim() ?? ""])),
  );
}

function pickField(row, names) {
  for (const name of names) {
    if (row[name]) return decodeXml(row[name]);
  }
  return undefined;
}

function stripHtml(value) {
  return decodeXml(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function writeJson(response, status, payload) {
  response.setHeader("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function writeHtml(response, status, html) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(html);
}

function setBaseSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function setCorsHeaders(response, origin) {
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function isRateLimited(request) {
  if (!Number.isFinite(REQUESTS_PER_MINUTE) || REQUESTS_PER_MINUTE <= 0) return false;

  const forwardedFor = request.headers["x-forwarded-for"];
  const client =
    String(Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor ?? "")
      .split(",")[0]
      .trim() ||
    request.socket.remoteAddress ||
    "unknown";
  const now = Date.now();
  const windowStart = now - 60_000;
  const bucket = (requestBuckets.get(client) ?? []).filter((timestamp) => timestamp > windowStart);
  bucket.push(now);
  requestBuckets.set(client, bucket);
  return bucket.length > REQUESTS_PER_MINUTE;
}

export function isValidRequestRange({ dateStart, dateEnd, radiusKm }) {
  if (!isIsoDate(dateStart) || !isIsoDate(dateEnd)) return false;
  if (dateEnd < dateStart) return false;
  return Number.isFinite(radiusKm) && radiusKm >= 1 && radiusKm <= 50;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function fetchTarget(url) {
  try {
    const parsed = new URL(String(url));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "Request";
  }
}

function isMainModule() {
  return process.argv[1]?.endsWith("server/concert-api.mjs") ?? false;
}

function wantsHtml(request, url) {
  if (url.searchParams.get("format") === "json") return false;
  if (url.searchParams.get("format") === "html") return true;
  return request.headers.accept?.includes("text/html") ?? false;
}

function renderHtml({ date, city, radiusKm }) {
  const jsonUrl = `/api/concerts?date=${encodeURIComponent(date)}&radiusKm=${encodeURIComponent(radiusKm)}&format=json&fast=1`;
  const refreshJsonUrl = `/api/concerts?date=${encodeURIComponent(date)}&radiusKm=${encodeURIComponent(radiusKm)}&format=json&refresh=1`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(city)} Sound Map API Preview</title>
    <style>
      :root {
        color-scheme: dark;
        --black: #050505;
        --white: #fffaf0;
        --orange: #ff6b00;
        --line: #050505;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--black);
        color: var(--black);
        min-height: 100vh;
      }
      a { color: inherit; }
      .shell {
        max-width: 1180px;
        margin: 0 auto;
        padding: 18px;
      }
      .hero, .card, .status {
        background: var(--white);
        border: 3px solid var(--line);
        box-shadow: 7px 7px 0 var(--orange);
      }
      .hero {
        padding: 20px;
        margin-bottom: 18px;
      }
      .kicker {
        display: inline-block;
        padding: 6px 9px;
        background: var(--orange);
        border: 2px solid var(--line);
        font-weight: 900;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0 8px;
        font-size: clamp(36px, 8vw, 92px);
        line-height: .9;
        letter-spacing: 0;
        text-transform: uppercase;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .pill {
        padding: 8px 10px;
        border: 2px solid var(--line);
        background: #fff;
        font-weight: 800;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 18px 0;
      }
      .button {
        display: inline-flex;
        align-items: center;
        min-height: 42px;
        padding: 9px 13px;
        border: 3px solid var(--line);
        background: var(--orange);
        color: var(--black);
        font-weight: 900;
        text-decoration: none;
        box-shadow: 4px 4px 0 var(--white);
      }
      .section-title {
        color: var(--white);
        margin: 24px 0 10px;
        font-size: 24px;
        text-transform: uppercase;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 14px;
      }
      .card {
        padding: 14px;
      }
      .card h2 {
        margin: 8px 0;
        font-size: 22px;
        line-height: 1;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 13px;
        font-weight: 800;
      }
      .tag {
        padding: 5px 7px;
        border: 2px solid var(--line);
        background: #fff;
      }
      .note {
        margin: 10px 0;
        line-height: 1.35;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .mini-link {
        padding: 7px 9px;
        border: 2px solid var(--line);
        background: var(--black);
        color: var(--white);
        font-weight: 900;
        text-decoration: none;
      }
      .status {
        padding: 14px;
        margin-top: 12px;
      }
      .status-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 8px;
      }
      .loader {
        min-height: 52vh;
        display: grid;
        place-items: center;
        padding: 22px;
      }
      .loader-card {
        width: min(720px, 100%);
        background: var(--orange);
        border: 4px solid var(--line);
        box-shadow: 9px 9px 0 var(--white);
        padding: 22px;
        text-align: center;
      }
      .loader-stage {
        position: relative;
        width: min(320px, 74vw);
        aspect-ratio: 1;
        margin: 4px auto 18px;
        perspective: 760px;
      }
      .instrument {
        position: absolute;
        inset: 50% auto auto 50%;
        display: grid;
        place-items: center;
        width: 148px;
        height: 148px;
        border: 3px solid var(--line);
        background: var(--white);
        box-shadow: 7px 7px 0 var(--black);
        color: var(--black);
        opacity: 0;
        transform: translate(-50%, -50%) rotateY(-90deg) rotateZ(0deg) scale(.72);
        transform-style: preserve-3d;
        animation: icon-swap 3.2s cubic-bezier(.2, .9, .2, 1) infinite;
      }
      .instrument:nth-child(1) { animation-delay: 0s; }
      .instrument:nth-child(2) { animation-delay: .8s; }
      .instrument:nth-child(3) { animation-delay: 1.6s; }
      .instrument:nth-child(4) { animation-delay: 2.4s; }
      .instrument svg {
        width: 96px;
        height: 96px;
        display: block;
      }
      .duo-fill { fill: var(--orange); }
      .duo-line {
        fill: none;
        stroke: var(--black);
        stroke-width: 7;
        stroke-linecap: square;
        stroke-linejoin: miter;
      }
      .pulse {
        position: absolute;
        inset: 35%;
        border: 4px solid var(--line);
        background: var(--white);
        box-shadow: 5px 5px 0 var(--black);
        animation: pulse 0.8s steps(2, end) infinite;
      }
      .loader-title {
        margin: 0;
        font-size: clamp(30px, 7vw, 64px);
        line-height: .92;
        text-transform: uppercase;
      }
      .loader-copy {
        margin: 12px auto 0;
        max-width: 540px;
        font-weight: 800;
      }
      .progress {
        height: 18px;
        margin-top: 18px;
        border: 3px solid var(--line);
        background: var(--white);
        overflow: hidden;
      }
      .progress span {
        display: block;
        width: 42%;
        height: 100%;
        background: var(--black);
        animation: scan 1.2s linear infinite;
      }
      .error-box {
        background: var(--white);
        border: 3px solid var(--line);
        box-shadow: 7px 7px 0 var(--orange);
        padding: 18px;
        margin-top: 18px;
      }
      .hidden { display: none; }
      @keyframes icon-swap {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) rotateY(-100deg) rotateX(24deg) rotateZ(-60deg) scale(.62);
        }
        7% {
          opacity: 1;
          transform: translate(-50%, -50%) rotateY(120deg) rotateX(-18deg) rotateZ(360deg) scale(1.04);
        }
        18% {
          opacity: 1;
          transform: translate(-50%, -50%) rotateY(360deg) rotateX(0deg) rotateZ(760deg) scale(1);
        }
        25% {
          opacity: 0;
          transform: translate(-50%, -50%) rotateY(540deg) rotateX(20deg) rotateZ(1080deg) scale(.68);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) rotateY(540deg) rotateX(20deg) rotateZ(1080deg) scale(.68);
        }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); background: var(--white); }
        50% { transform: scale(1.16); background: var(--black); }
      }
      @keyframes scan {
        0% { transform: translateX(-110%); }
        100% { transform: translateX(250%); }
      }
      @media (max-width: 640px) {
        .shell { padding: 12px; }
        .hero, .card, .status { box-shadow: 5px 5px 0 var(--orange); }
        .instrument {
          width: 118px;
          height: 118px;
        }
        .instrument svg { width: 76px; height: 76px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="kicker">API Preview</span>
        <h1>${escapeHtml(city)} Sound Map</h1>
        <p>Shareable HTML render of the live local source payload for ${escapeHtml(date)}.</p>
        <div class="meta">
          <span class="pill" id="concert-count">Loading concerts</span>
          <span class="pill" id="store-count">Loading stores</span>
          <span class="pill" id="spot-count">Loading listening spots</span>
          <span class="pill" id="cache-state">Tuning sources</span>
          <span class="pill">${escapeHtml(date)}</span>
        </div>
      </section>
      <nav class="toolbar">
        <a class="button" href="/api/concerts?date=${encodeURIComponent(date)}&radiusKm=${encodeURIComponent(radiusKm)}">Refresh HTML</a>
        <a class="button" href="${jsonUrl}">View JSON</a>
        <a class="button" href="${refreshJsonUrl}">Force Refresh</a>
        <a class="button" href="http://localhost:5173/">Open App</a>
      </nav>
      <section id="loader" class="loader">
        <div class="loader-card">
          <div class="loader-stage" aria-hidden="true">
            <span class="instrument">
              <svg viewBox="0 0 120 120" role="img">
                <path class="duo-fill" d="M77 16h17v30L74 66l-12-12 15-15V16Z" />
                <path class="duo-fill" d="M31 67c11-13 31-13 43 0s11 30-1 38c-15 10-41 7-51-7-7-10-1-19 9-31Z" />
                <path class="duo-line" d="M84 16h10v29L65 74" />
                <path class="duo-line" d="M39 61c-16 17-22 31-10 42 12 12 38 9 49-4 10-12 6-29-7-38-9-7-22-7-32 0Z" />
                <path class="duo-line" d="M47 73l28 28M54 56l14 14M77 27l16 16" />
              </svg>
            </span>
            <span class="instrument">
              <svg viewBox="0 0 120 120" role="img">
                <path class="duo-fill" d="M28 46h64v38c0 14-14 24-32 24S28 98 28 84V46Z" />
                <path class="duo-line" d="M28 46h64v38c0 14-14 24-32 24S28 98 28 84V46Z" />
                <path class="duo-line" d="M28 46c0 11 14 20 32 20s32-9 32-20-14-20-32-20-32 9-32 20Z" />
                <path class="duo-line" d="M37 72h46M44 100V65M76 100V65M18 30l21 14M102 30 81 44" />
              </svg>
            </span>
            <span class="instrument">
              <svg viewBox="0 0 120 120" role="img">
                <path class="duo-fill" d="M72 15h23v19H78v32c16 3 26 13 26 26 0 15-12 24-29 24-22 0-38-15-38-36V37h35V15Z" />
                <path class="duo-line" d="M72 15h23v19H78v32c16 3 26 13 26 26 0 15-12 24-29 24-22 0-38-15-38-36V37h35V15Z" />
                <path class="duo-line" d="M37 56h41M51 72h13M50 88h13M78 82c10 0 15 4 15 10s-6 10-18 10" />
              </svg>
            </span>
            <span class="instrument">
              <svg viewBox="0 0 120 120" role="img">
                <path class="duo-fill" d="M17 32h86v56H17V32Z" />
                <path class="duo-line" d="M17 32h86v56H17V32Z" />
                <path class="duo-line" d="M27 32v56M38 32v56M49 32v56M60 32v56M71 32v56M82 32v56M93 32v56" />
                <path class="duo-line" d="M33 32v31M55 32v31M66 32v31M88 32v31" />
                <path class="duo-line" d="M17 65h86" />
              </svg>
            </span>
            <span class="pulse"></span>
          </div>
          <h2 class="loader-title">Tuning Barcelona</h2>
          <p class="loader-copy">Pulling concerts, parties, record stores, source status, and map links.</p>
          <div class="progress"><span></span></div>
        </div>
      </section>
      <section id="error" class="error-box hidden"></section>
      <section id="status" class="status hidden">
        <strong>Source Status</strong>
        <div id="status-list" class="status-list"></div>
      </section>
      <h2 class="section-title">Concerts</h2>
      <section id="concerts" class="grid"></section>
      <h2 class="section-title">Record Stores</h2>
      <section id="stores" class="grid"></section>
      <h2 class="section-title">Listening Bars & Coffee</h2>
      <section id="spots" class="grid"></section>
    </main>
    <script>
      const jsonUrl = ${JSON.stringify(jsonUrl)};
      let pollCount = 0;
      const byId = (id) => document.getElementById(id);

      loadData();

      function loadData() {
        fetch(jsonUrl)
        .then((response) => {
          if (!response.ok) throw new Error("API returned " + response.status);
          return response.json();
        })
        .then((payload) => {
          byId("loader").classList.add("hidden");
          byId("status").classList.remove("hidden");
          byId("concert-count").textContent = payload.concerts.length + " concerts";
          byId("store-count").textContent = payload.stores.length + " record stores";
          byId("spot-count").textContent = (payload.spots || []).length + " listening spots";
          byId("cache-state").textContent = cacheLabel(payload.cache && payload.cache.state);
          byId("status-list").innerHTML = Object.entries(payload.providerStatus)
            .map(([name, value]) => '<span class="tag">' + escapeHtml(name) + ": " + escapeHtml(value) + "</span>")
            .join("");
          byId("concerts").innerHTML = payload.concerts.map(renderConcertCard).join("");
          byId("stores").innerHTML = payload.stores.map(renderStoreCard).join("");
          byId("spots").innerHTML = (payload.spots || []).map(renderStoreCard).join("");
          if (shouldPoll(payload.cache && payload.cache.state)) {
            pollCount += 1;
            setTimeout(loadData, 1800);
          }
        })
        .catch((error) => {
          byId("loader").classList.add("hidden");
          byId("error").classList.remove("hidden");
          byId("error").innerHTML = "<strong>Could not load source data.</strong><p>" + escapeHtml(error.message) + "</p>";
        });
      }

      function shouldPoll(state) {
        return ["warming", "stale-refreshing"].includes(state) && pollCount < 8;
      }

      function cacheLabel(state) {
        if (state === "fresh") return "Fresh data";
        if (state === "stale-refreshing") return "Showing cached data";
        if (state === "warming") return "Fast preview";
        return "Source status";
      }

      function renderConcertCard(concert) {
        return '<article class="card">' +
          '<div class="row">' +
            '<span class="tag">' + escapeHtml(concert.time) + '</span>' +
            '<span class="tag">' + escapeHtml(concert.neighborhood) + '</span>' +
            '<span class="tag">' + escapeHtml(concert.source) + '</span>' +
          '</div>' +
          '<h2>' + escapeHtml(concert.name) + '</h2>' +
          '<p class="note"><strong>' + escapeHtml(concert.venue) + '</strong><br />' + escapeHtml(concert.address) + '</p>' +
          '<p class="note">' + escapeHtml(concert.note) + '</p>' +
          '<div class="actions">' +
            '<a class="mini-link" href="' + escapeAttr(concert.ticketUrl) + '">Ticket</a>' +
            '<a class="mini-link" href="' + escapeAttr(concert.mapUrl) + '">Map</a>' +
          '</div>' +
        '</article>';
      }

      function renderStoreCard(store) {
        return '<article class="card">' +
          '<div class="row">' +
            '<span class="tag">' + escapeHtml(store.hours) + '</span>' +
            '<span class="tag">' + escapeHtml(store.neighborhood) + '</span>' +
            '<span class="tag">' + escapeHtml(store.source) + '</span>' +
          '</div>' +
          '<h2>' + escapeHtml(store.name) + '</h2>' +
          '<p class="note">' + escapeHtml((store.specialties || []).join(", ")) + '</p>' +
          '<p class="note">' + escapeHtml(store.address) + '</p>' +
          '<div class="actions">' +
            '<a class="mini-link" href="' + escapeAttr(store.websiteUrl) + '">Website</a>' +
            '<a class="mini-link" href="' + escapeAttr(store.mapUrl) + '">Map</a>' +
          '</div>' +
        '</article>';
      }

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function escapeAttr(value) {
        return escapeHtml(value);
      }
    </script>
  </body>
</html>`;
}

function renderConcertCard(concert) {
  return `<article class="card">
    <div class="row">
      <span class="tag">${escapeHtml(concert.time)}</span>
      <span class="tag">${escapeHtml(concert.neighborhood)}</span>
      <span class="tag">${escapeHtml(concert.source)}</span>
    </div>
    <h2>${escapeHtml(concert.name)}</h2>
    <p class="note"><strong>${escapeHtml(concert.venue)}</strong><br />${escapeHtml(concert.address)}</p>
    <p class="note">${escapeHtml(concert.note)}</p>
    <div class="actions">
      <a class="mini-link" href="${escapeAttr(concert.ticketUrl)}">Ticket</a>
      <a class="mini-link" href="${escapeAttr(concert.mapUrl)}">Map</a>
    </div>
  </article>`;
}

function renderStoreCard(store) {
  return `<article class="card">
    <div class="row">
      <span class="tag">${escapeHtml(store.hours)}</span>
      <span class="tag">${escapeHtml(store.neighborhood)}</span>
      <span class="tag">${escapeHtml(store.source)}</span>
    </div>
    <h2>${escapeHtml(store.name)}</h2>
    <p class="note">${escapeHtml(store.specialties.join(", "))}</p>
    <p class="note">${escapeHtml(store.address)}</p>
    <div class="actions">
      <a class="mini-link" href="${escapeAttr(store.websiteUrl)}">Website</a>
      <a class="mini-link" href="${escapeAttr(store.mapUrl)}">Map</a>
    </div>
  </article>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

const BOM = String.fromCharCode(0xfeff);

function decodeXml(value) {
  return value
    .replaceAll(BOM, "")
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
