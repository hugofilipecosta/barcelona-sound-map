# Data Sources Expansion Plan

Updated: 2026-05-08

Status:

- Barcelona Open Data Agenda is now wired into the local API.
- OpenStreetMap Overpass is now wired into the local API for record stores.
- Manual record-store seeds were expanded so the app has better coverage before
  every live source returns data.

The app should combine several source types:

- Broad event APIs for volume.
- Barcelona-specific public data for local texture.
- Direct venue/promoter feeds for accuracy.
- POI sources for record stores, venues, and opening hours.
- A dedupe/ranking layer so the same show does not appear six times.

## Best First Sources

These give the best ratio of coverage, legitimacy, and implementation speed.

### 1. Barcelona Open Data Agenda

Use for:

- public cultural events
- concerts
- festivals
- neighborhood activities
- free/municipal events

Why:

- official Barcelona source
- no ticketing lock-in
- broad cultural coverage
- useful for local specificity

Data:

- Cultural agenda JSON/CSV from Open Data BCN / datos.gob.es.

### 2. Ticketmaster Discovery API

Use for:

- larger ticketed concerts
- mainstream venues
- touring artists

Why:

- proper city/date/category event search
- official API
- returns source URLs and venue metadata

Needs:

- `TICKETMASTER_API_KEY`

### 3. Eventbrite API

Use for:

- smaller events
- workshops
- independent promoters
- some parties and community music events

Why:

- public event search API
- good for long-tail discovery

Needs:

- `EVENTBRITE_TOKEN`

### 4. Google Places + OpenStreetMap

Use for:

- record stores
- venues
- clubs
- opening hours
- maps links

Why:

- record-store discovery needs POI data more than event data
- Google is strong for hours and links
- OpenStreetMap is useful as a free baseline

Needs:

- `GOOGLE_PLACES_API_KEY` later, if we add it

## Strong Second Wave

### 5. Foursquare Places API

Use for:

- record stores
- venues
- clubs
- richer place metadata

Why:

- strong POI database
- can search by query/location
- good fallback or comparison source against Google Places

Needs:

- Foursquare API key

### 6. Bandsintown

Use for:

- artist-following mode
- tracked artist events
- personalized alerts

Why:

- useful once users follow artists
- not ideal for generic city-wide search

Needs:

- `BANDSINTOWN_APP_ID`
- `BANDSINTOWN_ARTISTS`
- partnership approval for broader use

### 7. Shotgun

Use for:

- parties
- club nights
- electronic music
- promoter/organizer data

Why:

- strong for nightlife and club culture
- has organizer/API-token flow

Needs:

- organizer access or partner access

## Partner / Feed Sources

These are valuable but need commercial/partner setup or approved feed access.

### 8. DICE

Use for:

- quality curated concerts
- club events
- independent ticketing

Needs:

- `DICE_PARTNER_TOKEN`

### 9. FNAC Spectacles / France Billet

Use for:

- ticketed concerts
- theatre/spectacle overlap
- larger listed events

Needs:

- `FNAC_FEED_URL`

### 10. Ticketline

Use for:

- ticketed concerts and events where Ticketline has inventory

Needs:

- `TICKETLINE_FEED_URL`

### 11. Songkick

Use for:

- broad concert/tour-date aggregation (6M+ upcoming and past concerts)
- event search by artist, venue, date, location, or metro area
- artist-level tour tracking, similar-artist recommendations

Why:

- aggregates listings across many ticketing sources
- useful backstop for shows Ticketmaster/Eventbrite don't cover directly

Needs:

- A paid partnership: per https://www.songkick.com/developer, Songkick is "not
  approving API requests for student projects, educational purposes or hobbyist
  purposes" — access requires signing a partnership agreement and paying a
  "standard license fee" via their inquiry form. Not a self-serve API key.

## Media / Directory Sources (no public API)

These surface real events but don't offer official developer APIs — the only way
in is scraping their public listing pages, which is fragile (breaks whenever they
redesign) and often against their terms of service. Documented here as candidates
only; not wired into the app unless a legitimate access path shows up (partner
API, licensed feed, official data-share agreement).

### 12. Time Out Barcelona

Use for:

- editorial event picks
- nightlife and one-off events
- cultural coverage broader than ticketed shows (pop-ups, market shows, free events)

Why:

- strong local editorial curation
- catches things ticketing APIs miss

Needs:

- No public API or RSS feed. Scraping timeout.com/barcelona is the only technical
  path, or a licensing/partner conversation with Time Out.

### 13. Resident Advisor (RA)

Use for:

- electronic music and club nights
- promoter/venue listings for nightlife

Why:

- the reference directory for Barcelona's electronic scene
- strong promoter and lineup data

Needs:

- No public API. RA has historically been protective of scraping its listings —
  same caveat as Time Out.

### 14. DondeGo

A local Barcelona/Madrid news outlet (EVENTOS&LUGARES AGREGADOR S.L.) building an
events/places/news API, announced at
https://dev.to/dondego/we-built-an-api-for-events-places-and-local-news-in-barcelona-and-madrid-1409.
Different from Time Out/RA above: this one is heading toward a real API, just
not usable yet — no path to reach it by scraping either.

Use for:

- general local events and places (not concert-specific; music-category depth
  is unconfirmed)
- possible local-news texture alongside Barcelona Open Data

Why:

- purpose-built for Barcelona/Madrid, not a generic aggregator
- author is explicitly inviting outreach from projects that need this data

Needs:

- No live endpoint, documented auth, or pricing found as of this writing. The
  article's example requests (`/api/v1/events/?lat=...&lon=...&date=hoy`) omit
  a real host, and the linked GitHub repo (`revanbcn/DondeGo-API`) 404s.
- Access is "opening gradually" per the author — the actual next step is
  emailing bcn@dondego.es to ask directly, not a self-serve signup.

## Local Barcelona Venue Layer

This is how the app becomes genuinely useful instead of generic.

Create a curated venue registry for:

- Razzmatazz
- Sala Apolo
- Jamboree
- Sidecar
- Heliogabal
- Laut
- Upload
- Paral.lel 62
- L'Auditori
- Palau de la Musica
- Harlem Jazz Club
- Moog
- Nitsa
- Freedonia
- Garage 442
- Meteoro

Use it to:

- normalize venue names
- infer neighborhoods
- dedupe events across platforms
- patch missing source data
- create direct venue links

## Record Store Sources

Use a combined approach:

### API / POI

- Google Places
- Foursquare Places
- OpenStreetMap Overpass
- Yelp Places API, optional

### Manual Seed

Keep a curated list for high-signal stores:

- Revolver Records
- Disco 100
- Ultra-Local Records
- Wah Wah Records
- Discos Paradiso
- Daily Records
- Surco Records
- Small Black Dots
- Marilians Records
- Rhythm Control

## Recommended Order

1. Add Barcelona Open Data Agenda.
2. Add Ticketmaster.
3. Add Eventbrite.
4. Add OpenStreetMap Overpass for record stores.
5. Add Google Places for hours and maps.
6. Add curated Barcelona venue/store registry.
7. Add Bandsintown artist-following mode.
8. Add DICE/FNAC/Ticketline when access is available.
9. Add Shotgun if nightlife/party coverage becomes a priority.
10. Add Songkick if the license fee and paid-partnership path make sense.
11. Revisit Time Out / Resident Advisor only if a partner or licensed data path
    opens up — no scraping.
12. Follow up with DondeGo (bcn@dondego.es) if their API opens more broadly.

## Product Rule

Do not show source volume as quality.

Rank by:

- source freshness
- venue confidence
- date/time confidence
- distance
- music relevance
- whether there is a real ticket/source link
- whether the event appears in more than one source
