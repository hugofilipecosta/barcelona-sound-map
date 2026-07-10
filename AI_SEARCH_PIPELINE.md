# AI Search Pipeline

This is the simple version of "the app keeps searching and learning."

## What Runs All The Time

Scheduled jobs fetch new data from concert, party, and record-store sources.

The model does not crawl the internet by itself. It reads the catalog we build, cleans it up, classifies it, ranks it, and explains it.

## Simple Steps

1. Get source access.
   Add whichever credentials you have to `.env`:
   - `EVENTBRITE_TOKEN`
   - `TICKETMASTER_API_KEY`
   - `BANDSINTOWN_APP_ID`
   - `BANDSINTOWN_ARTISTS`
   - `DICE_PARTNER_TOKEN`
   - `FNAC_FEED_URL`
   - `TICKETLINE_FEED_URL`

2. Start the concert API.
   ```bash
   npm run dev:api
   ```

3. Refresh the local catalog.
   ```bash
   npm run refresh:catalog
   ```

4. Keep refreshing automatically.
   ```bash
   npm run watch:catalog
   ```

5. Add model ranking.
   Add `OPENAI_API_KEY` to `.env`, then run:
   ```bash
   npm run rank:catalog
   ```

6. Show recommendations in the app.
   Next UI step: read `server/data/recommendations.json` and show a "Best tonight" section.

## Current Local Files

- `server/concert-api.mjs`: fetches from configured sources.
- `server/jobs/refresh-catalog.mjs`: stores fetched concerts in `server/data/catalog.json`.
- `server/jobs/watch-catalog.mjs`: refreshes repeatedly.
- `server/jobs/rank-catalog.mjs`: ranks the catalog with OpenAI when available, or transparent local scoring when not.

## What The Model Learns From

For now, learning means saved structured memory:

- what sources return good data
- which events are duplicates
- genres and moods inferred from titles/descriptions
- user saved items later
- user ignored/clicked items later

When the app has real users, add:

- saved events
- clicked ticket links
- preferred neighborhoods
- preferred sources
- disliked genres
- night-out patterns
