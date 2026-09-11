# Idealista Scraper

Fetches commercial rental listings from Idealista and writes them directly to Supabase.

## How to run

```bash
# Interactive (picks city, asks before writing to PROD)
npm run fetch:idealista

# Headless / CI (writes straight to PROD, no prompts)
npm run fetch:idealista -- --headless --city madrid
```

## What it does

1. Scrapes all search result pages for a city (pagination handled automatically)
2. For each listing, fetches the detail page to get coordinates, amenities, and all gallery photos
3. Writes everything to Supabase (upsert: inserts new listings, updates existing ones)
4. Marks listings no longer on Idealista as inactive (soft delete)

## How deduplication works

Each listing gets a `source_id` from its Idealista listing ID (the number in the URL):

```
URL:       https://www.idealista.com/en/inmueble/107482935/
source_id: "107482935"
```

The database has a unique constraint on `(source, source_id)`. When a listing is scraped again, it gets updated instead of duplicated. The Idealista ID is unique per listing, so two units in the same building each get their own row.

## How gallery photos are extracted

The scraper visits each listing's detail page (it already does this for coordinates). From the page HTML, it pulls all image URLs matching this pattern:

```
https://img{N}.idealista.com/blur/WEB_DETAIL/0/.../{imageId}.jpg
```

Multiple sizes/formats of the same image exist on the page. The scraper deduplicates by the numeric image ID, keeping one URL per unique photo.

Photos are stored as an array in the `photos` column (Postgres text[]).

## How price change detection works

Before updating a listing, the scraper reads the current price from the database. If the price changed:

- The old price and date get appended to `metadata.price_history`
- `metadata.price_changed` is set to `true`

This lets the UI and email digest show "Price dropped from X to Y".

## How to add a new city

1. In `scripts/data-pipeline/config/cities.ts`, add the city with an `idealistaArea` value (the city slug Idealista uses in URLs, like "madrid" or "barcelona")
2. In `scripts/data-pipeline/config/idealista.ts`, add a filter entry in `CITY_FILTERS` for the new city
3. If the city is outside Spain, add a coordinate validation range in `COORD_RANGES`

## Search filters

Filters are configured per city in `config/idealista.ts`. They control the Idealista search URL parameters:

- `maxSqm`: Maximum size in square meters
- `propertyType`: "locales" (commercial premises)
- `streetLevel`: Only street-level properties
- `rentalOnly`: Exclude properties for sale
- `useType`: "restauracion", "oficinas", etc.

## Error handling

- **404**: Listing removed from Idealista. Skipped silently.
- **403 / 502**: Provider or anti-bot error. Retried twice (5s, 15s).
- **Timeout**: 90s. Bright Data's Web Unlocker solves the anti-bot challenge
  itself, which measured 15-25s per page on Idealista, so short timeouts abort
  requests that were about to succeed.

## Provider

Pages are fetched through **Bright Data Web Unlocker** in native proxy mode
(`brd.superproxy.io:44445`), pinned to Spanish exit IPs. It returns the raw
Idealista page, so all parsing is unchanged. Billed per successful request only.

This replaced xhr.dev in September 2026 after that provider stopped responding.

## Speed

Detail pages are fetched 6 at a time (`detailConcurrency`). There are no
artificial delays: Web Unlocker does its own pacing. Measured ~0.9 min for 12
listings, so a full Madrid rental run is roughly 20 minutes and a transfer run
roughly 45, both well inside the 6h GitHub Actions cap.

A circuit breaker aborts the run after 8 consecutive failures, so an outage at
the provider does not burn credits.

## When the scraper refuses to mark listings inactive

Marking a listing inactive hides it from the dashboard and the digest, so it is
only safe when the run actually saw the whole catalogue. The run is treated as
**incomplete**, and inactivation is skipped entirely, if any of these happen:

- Any search page failed (one lost page silently drops ~30 listings)
- The circuit breaker aborted the run
- More than 20% of detail pages came back without coordinates
- `--limit` was used

`markUnseenAsInactive`'s own "did I see at least 50%" guard is not enough on its
own: a run that dies at 70% passes that guard and would still wrongly hide the
remaining 30%.

Two related rules:

- **`seenIds` is built from the search results, not the enriched results.**
  Appearing on a search page proves a listing still exists. Coordinates are
  required to publish it, not to prove it exists. Building `seenIds` from the
  enriched set made a detail-page failure look identical to a delisting.
- An incomplete run still **publishes** what it scraped (upserts are
  idempotent). It just does not delete anything, and it reports
  `safetyGuardTripped` so the run is visibly flagged.

If the report says the safety guard tripped, stale listings will linger until
the next clean run. That is the intended trade: a stale listing is invisible and
self-heals, a wrongly hidden one is customer-visible.

## Testing without writing to the database

```bash
npm run fetch:idealista -- --headless --city madrid --dry-run --limit 12
```

`--dry-run` skips all Supabase writes. `--limit N` caps how many detail pages
are fetched. Useful because the dev Supabase project is paused.

The GitHub Actions workflow has the same escape hatch: trigger it manually and
tick **dry_run** to exercise the real CI environment (secrets, runner, Node
version) against 20 listings without touching production.

## Automation (GitHub Actions)

The scraper runs automatically via `.github/workflows/scraper-pipeline.yml`:

- Schedule: Monday and Thursday at 06:00 UTC
- Can also be triggered manually via GitHub Actions UI
- Writes directly to PROD in headless mode
- Required secrets: `BRIGHTDATA_CUSTOMER_ID`, `BRIGHTDATA_ZONE`, `BRIGHTDATA_PASSWORD`, `SUPABASE_PROD_URL`, `SUPABASE_SERVICE_ROLE_KEY`
