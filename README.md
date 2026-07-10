# Barcelona Sound Map

Search-first MVP for discovering concerts and record stores around Barcelona by date, neighborhood, radius, and mood.

## What Works Now

- Seeded Barcelona concert and record-store data.
- Date, neighborhood, radius, and mood filters.
- Plan, Concerts, and Record stores views.
- Source and freshness labels on every result.
- Map, ticket, and website actions.
- Local saved favorites.
- Route panel that pairs one record-store stop with one show.

## Run Locally

```bash
npm install
npm run dev:api
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`.

Run `dev:api` and `dev` in two terminals. The app will still run without the
concert API, but Fetch will fall back to provider-shaped sample rows.

## Concert Data Integrations

Live providers should be called server-side so API keys, partner tokens, and feed URLs stay private:

- Eventbrite API for public event search.
- DICE Partner GraphQL or approved DICE data partner access.
- FNAC Spectacles / France Billet affiliate XML feed through Awin.
- Ticketline feed or partner export.
- Ticketmaster Discovery API.
- Bandsintown artist-events API, or partnership access for broader discovery.
- Barcelona Open Data cultural agenda for public/local cultural events.
- OpenStreetMap Overpass for record-store discovery.
- Google Places API for record stores and opening hours.

Provider-shaped stubs live in `src/lib/providers.ts`.

Expanded source strategy lives in `DATA_SOURCES.md`.

The local fetch server lives in `server/concert-api.mjs` and reads:

- `EVENTBRITE_TOKEN`
- `DICE_PARTNER_TOKEN`
- `FNAC_FEED_URL`
- `TICKETLINE_FEED_URL`
- `TICKETMASTER_API_KEY`
- `BANDSINTOWN_APP_ID`
- `BANDSINTOWN_ARTISTS` as a comma-separated artist list
- `BARCELONA_OPEN_DATA_AGENDA_URL`
- `OVERPASS_API_URL`
- `CONCERT_API_PORT`
- `CONCERT_API_ALLOWED_ORIGINS` as a comma-separated browser-origin allowlist
- `CONCERT_API_REQUESTS_PER_MINUTE` for basic per-client throttling
- `CONCERT_API_EXPOSE_PROVIDER_STATUS=1` only when you want debug provider status in API responses

Copy `.env.example` to `.env` and fill whichever sources you have. The local
API and jobs load `.env` automatically.

Security defaults:

- Provider tokens stay server-side in `.env` or deployment environment variables.
- Browser clients only receive public result data by default, not provider status or missing-token diagnostics.
- The API rejects unknown browser origins, non-GET methods, invalid date/radius input, and excessive repeated requests.

## Always-On Search And Model Layer

Simple local pipeline:

```bash
npm run dev:api
npm run refresh:catalog
npm run rank:catalog
```

To keep searching every few hours:

```bash
npm run watch:catalog
```

The full setup is documented in `AI_SEARCH_PIPELINE.md`.

## Product Direction

The app follows the product/design docs in `../Product brain` and intentionally avoids Hatch Conf, Manychat, and design-system transformation aesthetics.

## Design System Sources

The app's visual system is documented in `DESIGN_SYSTEM.md`.

Primary visual references:

- Neobrutalism portfolio: https://neobrutalism-portfolio.netlify.app/
- Neobrutalism portfolio template repo: https://github.com/neobrutalism-templates/portfolio
