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
- **403**: Blocked by DataDome/proxy. Retried 3 times with exponential backoff (2s, 4s, 8s).
- **500**: Proxy or server error. Same retry logic.
- **Timeout**: 30s for search pages, 60s for detail pages.

## Rate limiting

1.5 second delay between detail page requests to avoid proxy rate limits.

## Automation (GitHub Actions)

The scraper runs automatically via `.github/workflows/scraper-pipeline.yml`:

- Schedule: Monday and Thursday at 06:00 UTC
- Can also be triggered manually via GitHub Actions UI
- Writes directly to PROD in headless mode
- Required secrets: `XHR_API_KEY`, `SUPABASE_PROD_URL`, `SUPABASE_SERVICE_ROLE_KEY`
