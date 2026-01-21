# Data Acquisition

This document explains where we get all location data, how we fetch it, and key details for replication.

---

## Quick Reference: All Data Sources

| Source | What it provides | Location |
|--------|-----------------|----------|
| data.csv | EU Coffee Trip cafes (Madrid) | `/public/data/` |
| cafe_info.csv | Cafe enrichment (photos, socials) | `/public/data/` |
| barcelona_cafe_info.csv | Barcelona cafes | `/public/data/` |
| idealista.csv | Property rental listings | `/public/data/` |
| other.csv | Transit, offices, shopping, universities, dorms | `/public/data/` |
| footfall_data.csv | Pedestrian traffic by hour | `/public/data/` |
| metro.geojson | Metro station locations | `/public/data/` |
| barrios_with_density.geojson | Neighborhood boundaries + population density | `/public/data/` |
| madrid_income_2023.geojson | Income distribution by census section | `/public/data/` |
| Google Places API | Specialty coffee locations (planned) | API |
| localStorage | User data (lists, drawings, comments) | Browser |

---

## 1. EU Coffee Trip Cafes (data.csv + cafe_info.csv)

**Source:** Scraped from [EU Coffee Trip](https://europeancoffeetrip.com/)

**File:** `data.csv` (223 records)
- **Delimiter:** Semicolon (`;`) - NOT comma
- **Fields:** name, link, address, lat, lon, categoryName, openingHours (7 days), rating, reviewCount, franchisePartner

**Enrichment file:** `cafe_info.csv` (90 records)
- **Fields:** link, featured_photo, website, instagram, facebook, premium, date_published
- **Merged by:** `link` field matches between both files

**API Route:** `GET /api/data?type=cafes`
- Merges both CSV files
- Returns JSON with photos and social links attached

---

## 2. Barcelona Cafes (barcelona_cafe_info.csv)

**Source:** Scraped from EU Coffee Trip (Barcelona)

**File:** `barcelona_cafe_info.csv` (41 records)
- **Fields:** name, link, address, latitude, longitude, featured_photo, website, instagram, facebook, premium, date_published

**API Route:** `GET /api/data?type=barcelona_cafes`

---

## 3. Property Listings (idealista.csv)

**Source:** Scraped from [Idealista](https://www.idealista.com/)

**File:** `idealista.csv` (84 records)
- **Fields:** address, latitude, longitude, price, size (m²), priceByArea (€/m²), district, features/hasAirConditioning, suggestedTexts/title, url, transfer

**API Route:** `GET /api/data?type=properties`

---

## 4. Other POIs (other.csv)

**Source:** Manually compiled + various sources

**File:** `other.csv` (82 records)
- **Fields:** Name, Category, Address, Lat, Lon, MapsURL

**Categories included:**
- Train Station
- Metro Station
- Office Center
- Shopping Center
- High Street
- University
- Student Dormitory

**API Route:** `GET /api/data?type=other`

---

## 5. Pedestrian Traffic (footfall_data.csv)

**Source:** Madrid city pedestrian counters

**File:** `footfall_data.csv` (719 records)
- **Fields:** hora (hour 0-23), distrito, direccion, latitude, longitude, avg_count

**Known bug:** Some coordinates have extra decimal point (e.g., `40.430.469` should be `40.430469`). The API route applies a regex fix.

**API Routes:**
- `GET /api/traffic?hour=14` - Get traffic for specific hour
- `GET /api/traffic?grouped=true` - Get all 24 hours per location

---

## 6. Metro Stations (metro.geojson)

**Source:** OpenStreetMap / Madrid transit data

**File:** `metro.geojson` (~100+ stations)
- **Format:** GeoJSON FeatureCollection
- **Properties:** name, website

**API Route:** `GET /api/data?type=metro`

---

## 7. Neighborhood Boundaries + Density (barrios_with_density.geojson)

**Source:** Madrid open data

**File:** `barrios_with_density.geojson` (~130 neighborhoods)
- **Format:** GeoJSON with Polygon geometries
- **Properties:** NOMBRE (name), density (hab/km²)

**API Route:** `GET /api/population`

---

## 8. Income Distribution (madrid_income_2023.geojson)

**Source:** Spanish National Statistics Institute (INE)

**File:** `madrid_income_2023.geojson`
- **Format:** GeoJSON with Polygon/MultiPolygon geometries
- **Properties:** district, districtName, municipality, avgIncome, avgHouseholdIncome, wealthyPct, year

**API Route:** `GET /api/income`

---

## 9. Google Places API (Planned - Specialty Coffee)

**Purpose:** Find specialty coffee locations not in EU Coffee Trip

**Endpoint:** `https://places.googleapis.com/v1/places:searchText`

### Why Text Search (Not Nearby Search)

| Feature | Text Search | Nearby Search |
|---------|-------------|---------------|
| Results per request | 20 | 20 |
| Pagination | Yes (60+ results) | No (stuck at 20) |
| Semantic understanding | Yes | No |
| Grid required | No | Yes |

**Decision:** Text Search - simpler, has pagination, semantic search finds relevant places.

### Query Parameters

**Madrid bounding box:**
```
low:  latitude 40.30, longitude -3.85
high: latitude 40.55, longitude -3.55
```

**Text query:** `"specialty coffee"`

**Language:** `languageCode: "en"` (returns English results)

**Field mask:** Controls returned fields and billing
- places.id, places.displayName, places.formattedAddress, places.location, places.rating, places.userRatingCount, places.primaryType

### Pagination

1. First request returns 20 results + `nextPageToken`
2. Include token in next request for more results
3. Repeat until no token returned

### Available Place Types

Valid for filtering: `cafe`, `coffee_shop`, `cat_cafe`, `dog_cafe`

**Note:** "espresso_bar" does NOT exist in the API. It's only a Google Maps display label.

### Pricing

- **Free tier:** 5,000 requests/month
- **After free tier:** ~$32 per 1,000 requests

### Sample Query

```bash
curl -X POST -d '{
  "textQuery": "specialty coffee",
  "languageCode": "en",
  "locationRestriction": {
    "rectangle": {
      "low": {"latitude": 40.30, "longitude": -3.85},
      "high": {"latitude": 40.55, "longitude": -3.55}
    }
  },
  "maxResultCount": 20
}' \
-H 'Content-Type: application/json' \
-H "X-Goog-Api-Key: YOUR_API_KEY" \
-H "X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.primaryType" \
https://places.googleapis.com/v1/places:searchText
```

---

## 10. User Data (localStorage)

User-generated content stored in browser localStorage:

| Key | What it stores |
|-----|---------------|
| `miners-location-lists` | User-created POI lists with visit logs |
| `miners-drawn-features` | User-drawn polygons/lines on map |
| `miners-poi-comments` | Comments on individual POIs |
| `miners-poi-attachments` | Images/PDFs attached to POIs (base64) |
| `miners-scouting-trips` | Scouting trip submissions |
| `miners-hidden-pois` | POIs the user has hidden |

**Limits:** Max 50MB per browser. Images compressed to 80% JPEG quality.

**Note:** This data is browser-specific. Will migrate to Supabase backend.

---

## Data Flow

```
CSV/GeoJSON files (public/data/)
         ↓
Next.js API Routes (src/app/api/)
         ↓
React Hooks (useMapData, useOverlayData)
         ↓
Components (map markers, overlays)
         ↓
localStorage (user modifications)
```

---

## How to Add New Data

### Adding a new CSV data source:

1. Place CSV file in `/public/data/`
2. Add parsing logic to `/src/app/api/data/route.ts`
3. Add new `type` parameter option
4. Update `useMapData.ts` hook to fetch new type

### Adding a new GeoJSON overlay:

1. Place GeoJSON file in `/public/data/`
2. Create new API route in `/src/app/api/`
3. Update `useOverlayData.ts` to fetch it

---

## Planned Data Sources (Not Yet Implemented)

| Source | Purpose |
|--------|---------|
| Supabase PostgreSQL | Main application database |
| Apify scrapers | Automated Google Maps data collection |
| OpenStreetMap Overpass API | Additional POIs |
| n8n data pipeline | Automated data collection workflows |
