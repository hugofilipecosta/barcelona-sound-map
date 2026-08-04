import { useEffect, useMemo, useRef, useState } from "react";
import { MapIcon, SearchIcon, TicketIcon } from "./components/Icons";
import { RouteMap } from "./components/RouteMap";
import {
  concerts as seededConcerts,
  listeningSpots as seededListeningSpots,
  stores as seededStores,
} from "./data/seed";
import { buildRoute, searchSoundMap } from "./lib/search";
import type {
  ConcertResult,
  ListeningSpotResult,
  Mood,
  Neighborhood,
  SoundResult,
  StoreResult,
} from "./types";

const neighborhoods: Neighborhood[] = [
  "All Barcelona",
  "Gracia",
  "El Raval",
  "Eixample",
  "Poblenou",
  "Gotic",
  "Sant Antoni",
  "Poble-sec",
];

const moods: Mood[] = [
  "Any mood",
  "Indie",
  "Jazz",
  "Electronic",
  "Experimental",
  "Rock",
  "Global",
  "Hiphop / Funk",
];

type ViewMode = "Concerts" | "Record stores" | "Listening bars";
type FetchState = "idle" | "loading" | "partial" | "live" | "fallback" | "error";
type DateRangeOption = "this-week" | "next-week" | "this-month" | "next-month";

interface ApiPayload {
  concerts?: ConcertResult[];
  stores?: StoreResult[];
  spots?: ListeningSpotResult[];
  providerStatus?: Record<string, string>;
  cache?: {
    state?: "fresh" | "stale-refreshing" | "warming";
    updatedAt?: string | null;
  };
}

export function App() {
  const [dateRange, setDateRange] = useState<DateRangeOption>("next-month");
  const [neighborhood, setNeighborhood] =
    useState<Neighborhood>("All Barcelona");
  const [radiusKm, setRadiusKm] = useState(12);
  const [mood, setMood] = useState<Mood>("Any mood");
  const [viewMode, setViewMode] = useState<ViewMode>("Concerts");
  const [concertResults, setConcertResults] =
    useState<ConcertResult[]>(seededConcerts);
  const [storeResults, setStoreResults] = useState<StoreResult[]>(seededStores);
  const [spotResults, setSpotResults] =
    useState<ListeningSpotResult[]>(seededListeningSpots);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [providerMessage, setProviderMessage] = useState(
    "Using provider-shaped samples until access is configured.",
  );
  const autoFetched = useRef(false);

  const selectedDateRange = useMemo(() => getDateRange(dateRange), [dateRange]);

  const filters = useMemo(
    () => ({
      dateStart: selectedDateRange.start,
      dateEnd: selectedDateRange.end,
      neighborhood,
      radiusKm,
      mood,
    }),
    [selectedDateRange, neighborhood, radiusKm, mood],
  );

  const results = useMemo(
    () => searchSoundMap(filters, concertResults, storeResults, spotResults),
    [filters, concertResults, storeResults, spotResults],
  );
  const visibleResults = results.filter((result) => {
    if (viewMode === "Concerts") return result.type === "concert";
    if (viewMode === "Record stores") return result.type === "store";
    return result.type === "spot";
  });
  const concertCount = results.filter((result) => result.type === "concert").length;
  const storeCount = results.filter((result) => result.type === "store").length;
  const spotCount = results.filter((result) => result.type === "spot").length;
  const route = buildRoute(results);
  const routeStops = [route.spot, route.store, route.concert].filter(
    (stop): stop is SoundResult => Boolean(stop),
  );

  useEffect(() => {
    if (autoFetched.current) return;
    autoFetched.current = true;
    void fetchConcerts();
  }, []);

  async function fetchConcerts() {
    setFetchState("loading");
    setProviderMessage("Showing partial results while the live sources connect.");
    try {
      setStoreResults((current) => (current.length ? current : seededStores));
      setSpotResults((current) => (current.length ? current : seededListeningSpots));

      const fastPayload = await fetchApiPayload({ fast: "1" });
      applyApiPayload(fastPayload, "partial");

      if (fastPayload.cache?.state !== "fresh") {
        const refreshedPayload = await fetchApiPayload({ refresh: "1" });
        applyApiPayload(refreshedPayload, "live");
      }
    } catch {
      setConcertResults((current) => (current.length ? current : seededConcerts));
      setStoreResults((current) => (current.length ? current : seededStores));
      setSpotResults((current) => (current.length ? current : seededListeningSpots));
      setFetchState("error");
      setProviderMessage(
        "Live sources are still connecting. Keeping the best partial list visible.",
      );
    }
  }

  async function fetchApiPayload(params: Record<string, string>) {
    const configuredUrl = import.meta.env.VITE_CONCERT_API_URL?.trim();
    const baseUrl = configuredUrl || "/api/concerts";
    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set("dateStart", selectedDateRange.start);
    url.searchParams.set("dateEnd", selectedDateRange.end);
    url.searchParams.set("radiusKm", String(radiusKm));
    url.searchParams.set("format", "json");
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Concert API returned ${response.status}`);
    return (await response.json()) as ApiPayload;
  }

  function applyApiPayload(payload: ApiPayload, mode: "partial" | "live") {
    const hasConcerts = (payload.concerts?.length ?? 0) > 0;
    const hasStores = (payload.stores?.length ?? 0) > 0;
    const hasSpots = (payload.spots?.length ?? 0) > 0;
    const nextConcerts = hasConcerts ? payload.concerts ?? [] : seededConcerts;
    const nextStores = hasStores ? payload.stores ?? [] : seededStores;
    const nextSpots = hasSpots ? payload.spots ?? [] : seededListeningSpots;

    setConcertResults(nextConcerts);
    setStoreResults(nextStores);
    setSpotResults(nextSpots);

    if (hasConcerts || hasStores || hasSpots) {
      const state = payload.cache?.state;
      const partial = state === "warming" || state === "stale-refreshing";
      setFetchState(partial ? "partial" : "live");
      setProviderMessage(sourceMessage(payload, partial));
      return;
    }

    setFetchState("fallback");
    setProviderMessage(providerStatusMessage(payload.providerStatus));
  }

  function sourceMessage(payload: ApiPayload, partial: boolean) {
    const countText = `${payload.concerts?.length ?? 0} concerts, ${
      payload.stores?.length ?? 0
    } record stores, and ${payload.spots?.length ?? 0} listening spots`;
    if (partial) {
      return `Showing ${countText} from cached/curated sources while APIs keep connecting.`;
    }
    return `Updated ${countText} from live and configured sources.`;
  }

  function providerStatusMessage(status?: Record<string, string>) {
    return status
      ? Object.entries(status)
          .map(([name, value]) => `${name}: ${value}`)
          .join(" · ")
      : "No configured provider returned results yet.";
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">BSM</span>
          <span>Barcelona Sound Map</span>
        </div>
        <p className="topbar-subtitle">
          {concertCount} concerts, {storeCount} record stores and {spotCount}{" "}
          listening bars found
        </p>
      </header>

      <section className="search-panel" aria-label="Search Barcelona music">
        <div className="intro">
          <h1>Find tonight's record-store stop and show.</h1>
        </div>

        <form className="filters">
          <label>
            <span>Date</span>
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as DateRangeOption)}
            >
              <option value="this-week">This week</option>
              <option value="next-week">Next week</option>
              <option value="this-month">This month</option>
              <option value="next-month">Next month</option>
            </select>
          </label>
          <label>
            <span>Neighborhood</span>
            <select
              value={neighborhood}
              onChange={(event) =>
                setNeighborhood(event.target.value as Neighborhood)
              }
            >
              {neighborhoods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Radius</span>
            <select
              value={radiusKm}
              onChange={(event) => setRadiusKm(Number(event.target.value))}
            >
              <option value={2}>2 km</option>
              <option value={4}>4 km</option>
              <option value={8}>8 km</option>
              <option value={12}>12 km</option>
            </select>
          </label>
          <label>
            <span>Mood</span>
            <select value={mood} onChange={(event) => setMood(event.target.value as Mood)}>
              {moods.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button className="search-button" type="button" onClick={fetchConcerts}>
            <SearchIcon />
            <span>Search</span>
          </button>
        </form>
        {isConnecting(fetchState) ? (
          <SourceStatus state={fetchState} message={providerMessage} />
        ) : null}
      </section>

      <section className="workspace">
        <div className="results-column">
          <nav className="view-switcher" aria-label="Result view">
            {(["Concerts", "Record stores", "Listening bars"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={viewMode === mode ? "active" : ""}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </nav>

          <div className="result-count">
            <span>
              <strong>{visibleResults.length}</strong> useful matches
            </span>
            <span>{resultStatusLabel(fetchState)}</span>
          </div>

          {isConnecting(fetchState) ? (
            <div className="content-preloader" role="status" aria-label="Fetching results">
              <span className="brand-mark loading">BSM</span>
              <span>Fetching results…</span>
            </div>
          ) : null}

          <div className="results-list">
            {visibleResults.length > 0 ? (
              visibleResults.map((result) => (
                <ResultRow key={result.id} result={result} />
              ))
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        <aside className="route-panel" aria-label="Music-first stops">
          <div className="panel-header">
            <span>Music-first stops</span>
            <strong>{selectedDateRange.label}</strong>
          </div>
          <RouteMap stops={routeStops} />
          <RouteStep
            step="01"
            label="Coffee / hi-fi"
            result={route.spot}
            fallback="Open Listening bars for a music-first cafe or bar."
          />
          <RouteStep
            step="02"
            label="Dig"
            result={route.store}
            fallback="Open Record stores to pick a crate-digging stop."
          />
          <RouteStep
            step="03"
            label="Show"
            result={route.concert}
            fallback="Try another date or broaden the mood."
          />
        </aside>
      </section>
    </main>
  );
}

function ResultRow({ result }: { result: SoundResult }) {
  const isConcert = result.type === "concert";
  const moodTags = result.moods.filter((mood) => mood !== "Any mood");
  const primaryUrl = isConcert ? result.ticketUrl : result.websiteUrl;
  const primaryLabel = isConcert
    ? result.ticketUrl.includes("barcelonacultura")
      ? "Agenda"
      : "Tickets"
    : result.type === "spot"
      ? "Website"
      : "Shop";

  return (
    <article className="result-row">
      <div className="result-main">
        <div className="result-topline">
          {isConcert ? <span className="date-badge">{formatConcertDate(result.date)}</span> : null}
          <span>{isConcert ? result.time : result.hours}</span>
          <span>{result.neighborhood}</span>
          <span>{result.distanceKm.toFixed(1)} km</span>
        </div>
        <h2>{result.name}</h2>
        <p>{isConcert ? result.venue : result.specialties.join(", ")}</p>
        <p className="note">{result.note}</p>
        {moodTags.length > 0 || isConcert ? (
          <div className="detail-line">
            {moodTags.map((mood) => (
              <span key={mood}>{mood}</span>
            ))}
            {isConcert ? <span>{result.price}</span> : null}
          </div>
        ) : null}
      </div>
      <div className="result-actions">
        <a className="action-link" href={result.mapUrl} target="_blank" rel="noreferrer">
          <MapIcon />
          <span>Map</span>
        </a>
        <a
          className="action-link primary"
          href={primaryUrl}
          target="_blank"
          rel="noreferrer"
        >
          <TicketIcon />
          <span>{primaryLabel}</span>
        </a>
        <a className="action-link" href={result.sourceUrl} target="_blank" rel="noreferrer">
          <span>Website</span>
        </a>
      </div>
    </article>
  );
}

function SourceStatus({ state, message }: { state: FetchState; message: string }) {
  return (
    <div className="source-status" role="status" aria-live="polite">
      <strong>{state === "loading" ? "Connecting" : "Partial results visible"}</strong>
      <div>
        <span>BSM</span>
        <p>{message}</p>
      </div>
    </div>
  );
}

function isConnecting(fetchState: FetchState) {
  return fetchState === "loading" || fetchState === "partial";
}

function getDateRange(option: DateRangeOption) {
  const today = startOfDay(new Date());
  const monday = startOfWeek(today);

  if (option === "next-week") {
    const start = addDays(monday, 7);
    return {
      start: toDateInputValue(start),
      end: toDateInputValue(addDays(start, 6)),
      label: "Next week",
    };
  }

  if (option === "this-month") {
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: toDateInputValue(today),
      end: toDateInputValue(end),
      label: "This month",
    };
  }

  if (option === "next-month") {
    const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    return {
      start: toDateInputValue(start),
      end: toDateInputValue(end),
      label: "Next month",
    };
  }

  return {
    start: toDateInputValue(today),
    end: toDateInputValue(addDays(monday, 6)),
    label: "This week",
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(date, mondayOffset);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatConcertDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function resultStatusLabel(fetchState: FetchState) {
  if (fetchState === "loading") return "Showing partial list while sources connect";
  if (fetchState === "partial") return "Partial results visible; live sources still connecting";
  if (fetchState === "live") return "Updated from live and configured sources";
  if (fetchState === "error") return "Partial results kept visible";
  return "Sources shown on every result";
}

function RouteStep({
  step,
  label,
  result,
  fallback,
}: {
  step: string;
  label: string;
  result?: SoundResult;
  fallback: string;
}) {
  return (
    <div className="route-step">
      <div className="step-index">{step}</div>
      <div>
        <span className="step-label">{label}</span>
        {result ? (
          <>
            <h3>{result.name}</h3>
            <p>{result.neighborhood} · {result.distanceKm.toFixed(1)} km</p>
          </>
        ) : (
          <p>{fallback}</p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <h2>No confident matches yet.</h2>
      <p>
        Try a wider radius, switch to Any mood, or pick another date. The app
        should suggest useful alternatives instead of pretending the city is
        empty.
      </p>
    </div>
  );
}
