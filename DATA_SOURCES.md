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
