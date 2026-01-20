# PRD: Database Migration - CSV to Supabase

**Version:** 1.0
**Date:** January 2026
**Project:** The Miners Location Scout

---

## 1. Overview

### 1.1 Purpose

Migrate the Location Scout app from CSV-based data loading to a proper Supabase PostgreSQL database. This enables:

- Fast filtering and queries (indexed)
- Multi-user data (shared across all users)
- User-generated content (custom POIs, drawn areas)
- Monthly data updates without duplicates
- Foundation for future features (auth, pitches, lists)

### 1.2 Current State

The app reads 6 CSV files on every request:

| File | Records | Purpose |
|------|---------|---------|
| data.csv | 223 | EU Coffee Trip cafes |
| cafe_info.csv | 90 | Enriched cafe data (photos, socials) |
| idealista.csv | 84 | Property listings |
| other.csv | 82 | Transit, offices, shopping, dorms, universities |
| footfall_data.csv | 719 | Pedestrian traffic by hour |
| density.csv | 151 | Population density by district |
| barrios_with_density.geojson | ~130 | Neighborhood boundaries |

**Problems with current approach:**
- Every request re-reads and parses entire CSV files
- No caching at database level
- Data only in one user's browser (localStorage for drawings)
- Can't filter efficiently (all filtering happens in browser)
- Monthly updates risk creating duplicates

### 1.3 Target State

All data stored in Supabase PostgreSQL with:
- Spatial indexing for map queries
- JSONB for flexible metadata
- Proper foreign keys and relationships
- Row Level Security for future auth
- Real-time subscriptions ready

---

## 2. Data Analysis

### 2.1 Current Data Issues

| File | Issue | Severity | Fix |
|------|-------|----------|-----|
| footfall_data.csv | Corrupted coordinates (40.430.469 instead of 40.430469) | Critical | Regex to remove extra dots |
| data.csv | All opening hours columns empty | Medium | Leave as null, fix scraper later |
| data.csv | Uses semicolon delimiter | Low | Handle in migration script |
| cafe_info.csv | Only 90 of 223 cafes have enriched data | Medium | Import what exists |
| other.csv | Low coordinate precision (4 decimals) | Low | Accept as-is |
| other.csv | Some vague addresses ("Various locations...") | Low | Accept as-is |
| All CSVs | Inconsistent boolean formats (TRUE vs True) | Low | Normalize in migration |

### 2.2 Data Relationships

```
Current: No relationships (flat CSV files)

Target:
cities (1) ──→ (many) places
cities (1) ──→ (many) areas
cities (1) ──→ (many) polygon_layers
categories (1) ──→ (many) places
users (1) ──→ (many) places (created_by)
users (1) ──→ (many) areas (created_by)
places (1) ──→ (many) list_items
places (1) ──→ (many) comments
places (1) ──→ (many) tags
```

---

## 3. Database Schema

### 3.1 Tables Overview

| Table | Purpose | Records After Migration |
|-------|---------|------------------------|
| cities | Madrid, Barcelona, Prague | 3 |
| categories | POI types (cafes, transit, etc.) | 11 |
| places | All POIs unified | ~389 |
| areas | User-drawn polygons | 0 (existing localStorage drawings) |
| polygon_layers | Barrios, density, high streets | ~130 |
| traffic_data | Footfall by hour/location | ~719 |
| lists | User-created lists | 0 |
| list_items | POIs saved to lists | 0 |
| pitches | Scouting submissions | 0 |
| scouting_reports | Quick reports on POIs | 0 |
| comments | Comments on any entity | 0 |
| tags | Tags on any entity | 0 |
| activity_log | User action tracking | 0 |
| user_activity_state | Last viewed timestamp | 0 |
| mentions | User @mentions in comments | 0 |
| scoring_params | AI scoring weights | 6 |
| app_settings | System configuration | ~5 |
| user_profiles | Extended user data | 0 |
| performance_data | Future sales data | 0 |

### 3.2 Core Tables SQL

```sql
-- =====================
-- FOUNDATION TABLES
-- =====================

-- Cities
CREATE TABLE cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  center GEOGRAPHY(POINT),
  bounds GEOGRAPHY(POLYGON),
  config JSONB,
  enabled BOOLEAN DEFAULT true
);

-- POI Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  is_system BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- App Settings
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scoring Parameters
CREATE TABLE scoring_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weight NUMERIC DEFAULT 0,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- USER MANAGEMENT
-- =====================

-- Extended user profile (works with Supabase Auth)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT DEFAULT 'franchisee', -- admin, franchisee
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- MAIN DATA TABLES
-- =====================

-- Places (all POIs unified)
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  category_id UUID REFERENCES categories(id),
  source TEXT NOT NULL, -- 'eu_coffee_trip', 'google', 'idealista', 'osm', 'user'
  source_id TEXT, -- external ID for deduplication
  name TEXT NOT NULL,
  address TEXT,
  location GEOGRAPHY(POINT) NOT NULL,
  metadata JSONB, -- flexible: rating, price, hours, socials, etc.
  photos TEXT[], -- array of URLs
  is_new BOOLEAN DEFAULT false, -- added in last 2 months
  status TEXT DEFAULT 'active', -- active, inactive, pending
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, source_id) -- prevents duplicates from same source
);

-- Areas of Interest (user-drawn polygons)
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  name TEXT NOT NULL,
  link TEXT,  -- External URL (e.g., Idealista listing)
  geometry GEOGRAPHY(POLYGON) NOT NULL,
  tags TEXT[],
  color TEXT,
  comments TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Polygon Layers (barrios, density, high streets, business areas)
CREATE TABLE polygon_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  layer_type TEXT NOT NULL, -- 'barrio', 'density', 'high_street', 'business_area', 'income'
  name TEXT NOT NULL,
  geometry GEOGRAPHY(POLYGON) NOT NULL,
  metadata JSONB, -- density values, income data, etc.
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Traffic Data (footfall by hour)
CREATE TABLE traffic_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  location GEOGRAPHY(POINT),
  distrito TEXT,
  direccion TEXT,
  hora INTEGER, -- 0-23
  avg_count NUMERIC,
  source TEXT,
  period DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================
-- USER CONTENT TABLES
-- =====================

-- User Lists
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- List Items
CREATE TABLE list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES lists(id) ON DELETE CASCADE,
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,
  visit_date DATE,
  visit_time TIME,
  weather TEXT,
  traffic_observation TEXT,
  comments TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

-- Scouting Pitches
CREATE TABLE pitches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  place_id UUID REFERENCES places(id), -- linked property (optional)
  created_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'draft', -- draft, submitted, under_review, approved, rejected, proceed_with_conditions
  condition_notes TEXT,

  -- Location fields
  address TEXT,
  area_sqm NUMERIC,
  storage_sqm NUMERIC,
  property_type TEXT,
  footfall_estimate INTEGER,
  neighbourhood_profile TEXT,
  nearby_competitors TEXT,

  -- Financial fields
  monthly_rent NUMERIC,
  service_fees NUMERIC,
  deposit NUMERIC,
  fitout_cost NUMERIC,
  opening_investment NUMERIC,
  expected_daily_revenue NUMERIC,
  monthly_revenue_range TEXT,
  payback_months INTEGER,

  -- Operational fields
  ventilation TEXT,
  water_waste TEXT,
  power_capacity TEXT,
  visibility TEXT,
  delivery_access TEXT,
  seating_capacity INTEGER,
  outdoor_seating BOOLEAN,

  -- Other
  risks TEXT[],
  photos TEXT[],

  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scouting Reports (quick reports on any POI)
CREATE TABLE scouting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  created_by UUID REFERENCES auth.users(id),
  notes TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Comments (on any entity)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'place', 'area', 'pitch'
  entity_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tags (on any entity)
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  tag TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity Log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  city_id TEXT REFERENCES cities(id),
  action_type TEXT NOT NULL, -- 'poi_created', 'area_created', 'pitch_submitted', etc.
  entity_type TEXT,
  entity_id UUID,
  summary TEXT, -- max 10 words
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Activity View State
CREATE TABLE user_activity_state (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  last_viewed_at TIMESTAMPTZ DEFAULT now()
);

-- User Mentions (for @tagging in comments)
CREATE TABLE mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id),
  mentioned_by_user_id UUID NOT NULL REFERENCES auth.users(id),
  entity_type TEXT NOT NULL,  -- 'place', 'area', 'pitch' (denormalized from comment)
  entity_id UUID NOT NULL,    -- (denormalized for fast queries)
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(comment_id, mentioned_user_id)
);

-- Performance Data (future - for sales/POS integration)
CREATE TABLE performance_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  date DATE,
  traffic_per_hour NUMERIC,
  conversion_rate NUMERIC,
  avg_spend NUMERIC,
  revenue NUMERIC,
  custom_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.3 Indexes for Performance

```sql
-- =====================
-- PERFORMANCE INDEXES
-- =====================

-- Fast spatial queries (points within map viewport)
CREATE INDEX places_location_idx ON places USING GIST(location);
CREATE INDEX areas_geometry_idx ON areas USING GIST(geometry);
CREATE INDEX polygon_layers_geometry_idx ON polygon_layers USING GIST(geometry);
CREATE INDEX traffic_data_location_idx ON traffic_data USING GIST(location);

-- Fast category filtering
CREATE INDEX places_category_idx ON places(category_id);
CREATE INDEX places_city_category_idx ON places(city_id, category_id);

-- Fast rating filtering (JSONB field)
CREATE INDEX places_rating_idx ON places((metadata->>'rating'));

-- Fast source lookups (for deduplication)
CREATE INDEX places_source_idx ON places(source, source_id);

-- Fast status filtering
CREATE INDEX places_status_idx ON places(status);

-- Fast layer type filtering
CREATE INDEX polygon_layers_type_idx ON polygon_layers(city_id, layer_type);

-- Fast traffic queries by hour
CREATE INDEX traffic_data_hour_idx ON traffic_data(city_id, hora);

-- Fast unread mentions lookup
CREATE INDEX mentions_user_unread_idx ON mentions(mentioned_user_id, is_read)
  WHERE is_read = false;
CREATE INDEX mentions_comment_idx ON mentions(comment_id);
```

**Query performance after indexing:**

| Query | Expected Time |
|-------|---------------|
| All EU Coffee Trip cafes in Madrid | < 10ms |
| Cafes with rating > 4.5 | < 10ms |
| POIs within map viewport | < 20ms |
| Traffic data for hour 12 | < 10ms |
| Barrio polygons for Madrid | < 10ms |

---

## 4. Categories

### 4.1 System Categories (11 total)

```sql
INSERT INTO categories (name, icon, color, is_system) VALUES
('EU Coffee Trip', 'coffee', '#8B4513', true),
('Regular Cafe', 'coffee', '#6B7280', true),
('The Miners', 'coffee', '#000000', true),
('Property', 'building', '#3B82F6', true),
('Transit Station', 'train', '#10B981', true),
('Office Center', 'briefcase', '#6366F1', true),
('Shopping Center', 'shopping-cart', '#EC4899', true),
('High Street', 'map-pin', '#F59E0B', true),
('University', 'graduation-cap', '#8B5CF6', true),
('Student Dorm', 'home', '#14B8A6', true),
('New Development', 'construction', '#F97316', true);
```

### 4.2 Category Usage

| Category | Source | Filter Toggle |
|----------|--------|---------------|
| EU Coffee Trip | data.csv + cafe_info.csv | "EU Coffee Trip" |
| Regular Cafe | Future Google Maps scraper | "Regular cafes" |
| The Miners | Manual entry | "The Miners" |
| Property | idealista.csv | "Properties" |
| Transit Station | other.csv (Train/Metro) | "Transit" |
| Office Center | other.csv | "Offices" |
| Shopping Center | other.csv | "Shopping" |
| High Street | other.csv | "High streets" |
| University | other.csv | "Universities" |
| Student Dorm | other.csv | "Dorms" |
| New Development | User-created | "New developments" |

---

## 5. Data Migration

### 5.1 Migration Mapping

#### CSV: data.csv + cafe_info.csv → places

| CSV Field | → places Column | Notes |
|-----------|-----------------|-------|
| name | name | Direct copy |
| address | address | Direct copy |
| lat | location | Combined into GEOGRAPHY point |
| lon | location | Combined into GEOGRAPHY point |
| link | source_id | Use as unique identifier |
| link | metadata.sourceUrl | Also store in metadata |
| rating | metadata.rating | As number |
| reviewCount | metadata.reviewCount | As number |
| openingHours/* | metadata.hours | As object (if not empty) |
| franchisePartner | metadata.franchisePartner | As boolean |
| featured_photo | photos[0] | From cafe_info.csv |
| instagram | metadata.instagram | From cafe_info.csv |
| facebook | metadata.facebook | From cafe_info.csv |
| — | city_id | 'madrid' (hardcoded for now) |
| — | category_id | UUID of 'EU Coffee Trip' category |
| — | source | 'eu_coffee_trip' |
| — | status | 'active' |

#### CSV: idealista.csv → places

| CSV Field | → places Column | Notes |
|-----------|-----------------|-------|
| address | name | Use address as name |
| address | address | Direct copy |
| latitude | location | Combined into GEOGRAPHY point |
| longitude | location | Combined into GEOGRAPHY point |
| url | source_id | Use URL as unique ID |
| price | metadata.price | As number |
| size | metadata.size | As number (m²) |
| priceByArea | metadata.priceByArea | As number (€/m²) |
| bathrooms | metadata.bathrooms | As number |
| district | metadata.district | As string |
| features/hasAirConditioning | metadata.hasAirConditioning | As boolean |
| suggestedTexts/title | metadata.title | As string |
| detailedType/transfer | metadata.isTransfer | As boolean |
| — | city_id | 'madrid' |
| — | category_id | UUID of 'Property' category |
| — | source | 'idealista' |

#### CSV: other.csv → places

| CSV Field | → places Column | Notes |
|-----------|-----------------|-------|
| Name | name | Direct copy |
| Address | address | Direct copy |
| Lat | location | Combined into GEOGRAPHY point |
| Lon | location | Combined into GEOGRAPHY point |
| MapsURL | metadata.mapsUrl | As string |
| MapsURL | source_id | Use as unique ID |
| Category | category_id | Map to category UUID (see below) |
| — | city_id | 'madrid' |
| — | source | 'osm' |

**Category mapping for other.csv:**

| CSV Category | → Database Category |
|--------------|---------------------|
| Train Station | Transit Station |
| Metro Station | Transit Station |
| Metro | Transit Station |
| Office Center | Office Center |
| Shopping Center | Shopping Center |
| High Street | High Street |
| University | University |
| Student Dormitory | Student Dorm |

#### CSV: footfall_data.csv → traffic_data

| CSV Field | → traffic_data Column | Notes |
|-----------|----------------------|-------|
| hora | hora | Parse to 0-23 integer |
| distrito | distrito | Direct copy |
| direccion | direccion | Direct copy |
| latitude | location | Fix format first (remove extra dots) |
| longitude | location | Fix format first |
| avg_count | avg_count | As number |
| — | city_id | 'madrid' |
| — | source | 'madrid_city_council' |

**Coordinate fix required:**
```javascript
// Before: "40.430.469"
// After: "40.430469"
const fixCoord = (s) => {
  const parts = s.split('.');
  return parts[0] + '.' + parts.slice(1).join('');
};
```

#### GeoJSON: barrios_with_density.geojson → polygon_layers

| GeoJSON Field | → polygon_layers Column | Notes |
|---------------|------------------------|-------|
| properties.NOMBRE | name | Barrio name |
| properties.density | metadata.density | hab/km² |
| geometry | geometry | Polygon coordinates |
| — | city_id | 'madrid' |
| — | layer_type | 'barrio' |

#### GeoJSON: madrid_income_2023.geojson → polygon_layers

| GeoJSON Field | → polygon_layers Column | Notes |
|---------------|------------------------|-------|
| properties.cusec | name | Census section ID (primary key) |
| properties.district | metadata.district | District code (01-21) |
| properties.districtName | metadata.districtName | District name (Madrid city only) |
| properties.municipality | metadata.municipality | Municipality name |
| properties.avgIncome | metadata.avgIncome | € per person |
| properties.avgHouseholdIncome | metadata.avgHouseholdIncome | € per household |
| properties.wealthyPct | metadata.wealthyPct | % above 200% median |
| properties.year | metadata.year | 2023 |
| properties.source | metadata.source | 'INE ADRH' |
| geometry | geometry | Polygon/MultiPolygon |
| — | city_id | 'madrid' |
| — | layer_type | 'income' |

### 5.2 Seed Data

#### Cities

```sql
INSERT INTO cities (id, name, country, center, enabled) VALUES
('madrid', 'Madrid', 'ES', ST_Point(-3.7038, 40.4168), true),
('barcelona', 'Barcelona', 'ES', ST_Point(2.1734, 41.3851), true),
('prague', 'Prague', 'CZ', ST_Point(14.4378, 50.0755), true);
```

#### Default Scoring Parameters

```sql
INSERT INTO scoring_params (name, weight) VALUES
('foot_traffic', 0.25),
('population_density', 0.15),
('competitor_saturation', 0.20),
('transit_proximity', 0.15),
('university_proximity', 0.10),
('rent_affordability', 0.15);
```

---

## 6. Metadata Schemas (JSONB)

### 6.1 Cafe Metadata

```json
{
  "rating": 4.2,
  "reviewCount": 156,
  "hours": {
    "monday": "8:00-18:00",
    "tuesday": "8:00-18:00"
  },
  "instagram": "@cafename",
  "facebook": "cafename",
  "sourceUrl": "https://europeancoffeetrip.com/...",
  "franchisePartner": false,
  "specialty": true
}
```

### 6.2 Property Metadata

```json
{
  "price": 1800,
  "size": 51,
  "priceByArea": 35,
  "bathrooms": 2,
  "district": "Chamberí",
  "hasAirConditioning": true,
  "isTransfer": false,
  "title": "Local comercial en alquiler"
}
```

### 6.3 Other POI Metadata

```json
{
  "mapsUrl": "https://maps.google.com/...",
  "originalCategory": "Train Station"
}
```

### 6.4 Barrio Metadata

```json
{
  "density": 27812.82,
  "densityUnit": "hab/km²"
}
```

### 6.5 Income Layer Metadata

```json
{
  "cusec": "2807901001",
  "district": "04",
  "districtName": "Salamanca",
  "municipality": "Madrid",
  "avgIncome": 24133.82,
  "avgHouseholdIncome": 51617.02,
  "wealthyPct": 35.24,
  "year": 2023,
  "source": "INE ADRH"
}
```

**Field descriptions:**
- `cusec`: Census section ID (INE identifier)
- `district`: District code (01-21 for Madrid city)
- `districtName`: Human-readable district name (only for Madrid city sections)
- `municipality`: Municipality name (suburbs show their actual name, Madrid city shows "Madrid")
- `avgIncome`: Average annual income per person (€)
- `avgHouseholdIncome`: Average annual income per household (€)
- `wealthyPct`: Percentage of population above 200% of median income
- `year`: Data year (2023)
- `source`: Data source (INE ADRH = Atlas de Distribución de la Renta de los Hogares)

**Madrid district codes:**
| Code | District Name |
|------|---------------|
| 01 | Centro |
| 02 | Arganzuela |
| 03 | Retiro |
| 04 | Salamanca |
| 05 | Chamartín |
| 06 | Tetuán |
| 07 | Chamberí |
| 08 | Fuencarral-El Pardo |
| 09 | Moncloa-Aravaca |
| 10 | Latina |
| 11 | Carabanchel |
| 12 | Usera |
| 13 | Puente de Vallecas |
| 14 | Moratalaz |
| 15 | Ciudad Lineal |
| 16 | Hortaleza |
| 17 | Villaverde |
| 18 | Villa de Vallecas |
| 19 | Vicálvaro |
| 20 | San Blas-Canillejas |
| 21 | Barajas |

> For census sections in Madrid municipality, the `districtName` field maps to these district names.
> For suburbs (Leganés, Móstoles, etc.), the municipality name is used directly.

---

## 7. User Features

### 7.1 Custom POIs (Draggable Points)

**User flow:**
1. User clicks "Add POI" button in UI
2. Draggable marker appears at map center
3. User drags marker to desired location
4. Form modal opens with fields:
   - Name (required)
   - Category (dropdown of all categories)
   - Address (optional, can auto-fill from reverse geocoding)
   - Description (optional)
5. User clicks "Save"
6. POI saved to `places` table with `source: 'user'`

**Technical implementation:**
- Uses mapcn's `MapMarker` with `draggable={true}`
- `onDragEnd` callback captures final coordinates
- Form uses existing shadcn/ui components
- API call: `POST /api/places`

**Database insert:**
```sql
INSERT INTO places (city_id, category_id, source, name, address, location, created_by)
VALUES ($1, $2, 'user', $3, $4, ST_Point($5, $6), $7)
RETURNING *;
```

### 7.2 Area Drawing (Freehand Polygons)

**User flow:**
1. User clicks "Draw" panel to expand
2. Clicks "Polygon" tool
3. Clicks points on map to draw shape
4. Double-clicks to finish polygon
5. Form modal opens with fields:
   - Name (required)
   - Color (color picker)
   - Tags (multi-select or freeform)
   - Comments (textarea)
6. User clicks "Save"
7. Area saved to `areas` table

**Editing:**
- Click polygon to select
- Drag corner vertices to reshape
- Drag entire shape to move
- Click "Delete" to remove

**Technical implementation:**
- Uses existing MapboxDraw integration
- `onFeaturesChange` callback triggers save
- Change from localStorage to Supabase API

**Database insert:**
```sql
INSERT INTO areas (city_id, name, geometry, color, tags, comments, created_by)
VALUES ($1, $2, ST_GeomFromGeoJSON($3), $4, $5, $6, $7)
RETURNING *;
```

---

## 8. Monthly Data Updates

### 8.1 Update Strategy

**Pattern:** Upsert (update if exists, insert if new)

```sql
INSERT INTO places (source, source_id, name, address, location, metadata, category_id, city_id, updated_at, last_seen_at)
VALUES ($1, $2, $3, $4, ST_Point($5, $6), $7, $8, $9, now(), now())
ON CONFLICT (source, source_id)
DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  location = EXCLUDED.location,
  metadata = EXCLUDED.metadata,
  updated_at = now(),
  last_seen_at = now();
```

### 8.2 Handling Removed Listings

When a property or cafe is no longer in the source data:

```sql
-- Mark as inactive (don't delete - preserve history)
UPDATE places
SET status = 'inactive', updated_at = now()
WHERE source = 'idealista'
  AND last_seen_at < now() - INTERVAL '7 days';
```

### 8.3 "NEW" Badge Logic

```sql
-- Update is_new flag based on created_at
UPDATE places
SET is_new = (created_at > now() - INTERVAL '2 months');
```

Run this as a scheduled job or on each data refresh.

---

## 9. API Changes

### 9.1 Current API Routes

| Route | Current Behavior |
|-------|------------------|
| `GET /api/data?type=cafes` | Reads data.csv + cafe_info.csv |
| `GET /api/data?type=properties` | Reads idealista.csv |
| `GET /api/data?type=other` | Reads other.csv |
| `GET /api/traffic?hour=12` | Reads footfall_data.csv |
| `GET /api/population` | Reads barrios_with_density.geojson |

### 9.2 New API Routes

| Route | New Behavior |
|-------|--------------|
| `GET /api/places?city=madrid&category=cafe` | Query Supabase places table |
| `GET /api/places?city=madrid&rating_gte=4.5` | Filtered query |
| `POST /api/places` | Create custom POI |
| `PUT /api/places/:id` | Update POI |
| `DELETE /api/places/:id` | Delete POI |
| `GET /api/areas?city=madrid` | Query Supabase areas table |
| `POST /api/areas` | Create drawn area |
| `PUT /api/areas/:id` | Update area |
| `DELETE /api/areas/:id` | Delete area |
| `GET /api/traffic?city=madrid&hour=12` | Query traffic_data table |
| `GET /api/layers?city=madrid&type=barrio` | Query polygon_layers table |
| `GET /api/layers?city=madrid&type=income` | Query income census sections |

### 9.3 Query Examples

**Get all cafes in Madrid:**
```typescript
const { data } = await supabase
  .from('places')
  .select('*, categories(name, icon, color)')
  .eq('city_id', 'madrid')
  .in('category_id', [euCoffeeTripId, regularCafeId, theMinersId])
  .eq('status', 'active');
```

**Get cafes with rating > 4.5:**
```typescript
const { data } = await supabase
  .from('places')
  .select('*')
  .eq('city_id', 'madrid')
  .eq('category_id', euCoffeeTripId)
  .gte('metadata->rating', 4.5);
```

**Get traffic data for hour 12:**
```typescript
const { data } = await supabase
  .from('traffic_data')
  .select('*')
  .eq('city_id', 'madrid')
  .eq('hora', 12);
```

---

## 10. Files to Modify

### 10.1 New Files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client configuration |
| `scripts/migrate-csv-to-supabase.ts` | One-time migration script |
| `scripts/seed-data.sql` | SQL for cities, categories, scoring params |
| `scripts/create-tables.sql` | All CREATE TABLE statements |
| `scripts/create-indexes.sql` | All CREATE INDEX statements |

### 10.2 Modified Files

| File | Changes |
|------|---------|
| `.env.local` | Add SUPABASE_URL, SUPABASE_ANON_KEY |
| `package.json` | Add @supabase/supabase-js dependency |
| `src/app/api/data/route.ts` | Replace CSV reading with Supabase queries |
| `src/app/api/traffic/route.ts` | Replace CSV reading with Supabase query |
| `src/app/api/population/route.ts` | Replace GeoJSON reading with Supabase query |
| `src/hooks/useMapData.ts` | Update to use Supabase client |
| `src/hooks/useOverlayData.ts` | Update to use Supabase client |
| `src/components/ui/map-draw.tsx` | Save to Supabase instead of localStorage |
| `src/components/DrawToolbar.tsx` | Add save confirmation after drawing |
| `src/components/ActivityLog.tsx` | Replace mock data with Supabase queries, add mentions tab |

### 10.3 Unchanged Files

These files won't change (UI stays the same):
- All marker components
- Sidebar filters
- Map controls
- Popup components
- CSS/styling

---

## 11. Migration Steps

### Step 1: Supabase Setup (Two Projects)

We use **two separate Supabase projects** - one for development, one for production:

| Environment | Supabase Project | Purpose |
|-------------|------------------|---------|
| Development | `miners-dev` | Testing, experiments, safe to break |
| Production | `miners-prod` | Real users, live data |

**Why two projects?**
- Dev has test data, prod has real data - never mixed
- Break things in dev without affecting real users
- Test database changes before applying to production
- Both projects are free tier (Supabase gives you 2 free projects)

**Setup Steps:**

1. Create two Supabase projects at [supabase.com](https://supabase.com):
   - Project 1: `miners-dev` (for development)
   - Project 2: `miners-prod` (for production)

2. Create `.env.local` on your laptop (for local development):
```
# Development Supabase (connects when running locally)
NEXT_PUBLIC_SUPABASE_URL=https://[your-dev-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-dev-anon-key]

# Optional: Service role for admin tasks (migrations, seeding)
SUPABASE_SERVICE_ROLE_KEY=[your-dev-service-key]
```

3. Set production environment variables in **Vercel Dashboard → Settings → Environment Variables**:
```
NEXT_PUBLIC_SUPABASE_URL=https://[your-prod-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-prod-anon-key]
```

4. Install Supabase client: `npm install @supabase/supabase-js`

**How environment switching works:**
- Run `npm run dev` locally → Reads `.env.local` → Connects to dev Supabase
- Deploy to Vercel → Reads Vercel env vars → Connects to prod Supabase
- Code is identical, environment determines which database

**Important:**
- Never commit `.env.local` to GitHub (it's already in `.gitignore`)
- When adding new tables, create them in BOTH projects (dev first, then prod)
- Table structure must match in both projects; data is intentionally different

### Step 2: Create Tables
1. Run `create-tables.sql` in Supabase SQL Editor
2. Verify all 18 tables created

### Step 3: Create Indexes
1. Run `create-indexes.sql` in Supabase SQL Editor
2. Verify indexes created

### Step 4: Seed Reference Data
1. Run `seed-data.sql` for cities, categories, scoring params
2. Verify data inserted

### Step 5: Migrate CSV Data
1. Run migration script
2. Verify record counts:
   - places: ~389 rows
   - traffic_data: ~719 rows
   - polygon_layers: ~130 rows

### Step 6: Update API Routes
1. Update `/api/data/route.ts`
2. Update `/api/traffic/route.ts`
3. Update `/api/population/route.ts`

### Step 7: Update React Hooks
1. Update `useMapData.ts`
2. Update `useOverlayData.ts`

### Step 8: Update Drawing
1. Update `map-draw.tsx` to save to Supabase
2. Migrate any existing localStorage drawings

### Step 9: Test
1. Run dev server
2. Verify map loads with markers
3. Verify filters work
4. Verify traffic heatmap works
5. Verify population choropleth works
6. Verify drawing saves to database

---

## 12. Verification Checklist

### Data Integrity

- [ ] All 223 EU Coffee Trip cafes imported
- [ ] All 84 properties imported
- [ ] All 82 other POIs imported
- [ ] All 719 traffic records imported
- [ ] All barrio polygons imported
- [ ] No duplicate records
- [ ] Coordinates render correctly on map

### Performance

- [ ] Map loads in < 2 seconds
- [ ] Category filter responds in < 100ms
- [ ] Rating filter responds in < 100ms
- [ ] Traffic layer switches in < 500ms

### Features

- [ ] Can toggle each POI category on/off
- [ ] Can filter cafes by rating
- [ ] Can view traffic heatmap by hour
- [ ] Can view population density choropleth
- [ ] Can draw polygon and save
- [ ] Can edit drawn polygon
- [ ] Can delete drawn polygon
- [ ] Can add custom POI with draggable marker
- [ ] Popup shows correct data for each POI type

---

## 13. Future Considerations

### Not In Scope (This Migration)

- User authentication UI
- Scouting pitch form UI
- Lists UI
- Comments/tags UI
- PDF/CSV exports
- AI scoring calculation
- Email notifications
- Real-time subscriptions

### Ready After Migration

All database tables and relationships are in place for:
- Adding auth (just need UI + RLS policies)
- Adding pitches (table exists)
- Adding lists (tables exist)
- Adding activity tracking (table exists)
- Adding comments/tags (tables exist)

---

## 14. Rollback Plan

If migration fails:

1. **Keep CSV files** - Don't delete original data
2. **Git branch** - All changes in feature branch
3. **Revert API routes** - Can switch back to CSV reading
4. **Supabase data** - Can drop and recreate tables

No data loss possible because:
- Original CSVs remain unchanged
- Supabase is additive (new tables, not replacing anything)
- Code changes are in version control

---

## 15. Row Level Security (RLS) Policies

Row Level Security ensures proper access control at the database level. These policies enforce:
- **Anyone can view** all content
- **Only creator OR admin** can edit/delete their own content

### 15.1 Enable RLS on Tables

```sql
-- Enable RLS on user-content tables
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scouting_reports ENABLE ROW LEVEL SECURITY;
```

### 15.2 Areas Policies

**Access rules:**
- Anyone can view all areas
- Authenticated users can create areas
- Only creator OR admin can update/delete

```sql
-- Anyone can view all areas
CREATE POLICY "areas_select_all" ON areas
  FOR SELECT USING (true);

-- Authenticated users can create areas
CREATE POLICY "areas_insert_authenticated" ON areas
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only creator or admin can update
CREATE POLICY "areas_update_owner_or_admin" ON areas
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'head_office_exec')
    )
  );

-- Only creator or admin can delete
CREATE POLICY "areas_delete_owner_or_admin" ON areas
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'head_office_exec')
    )
  );
```

### 15.3 Places Policies (Custom POIs)

```sql
-- Anyone can view all places
CREATE POLICY "places_select_all" ON places
  FOR SELECT USING (true);

-- Authenticated users can create places
CREATE POLICY "places_insert_authenticated" ON places
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only creator or admin can update user-created places
CREATE POLICY "places_update_owner_or_admin" ON places
  FOR UPDATE USING (
    source = 'user' AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'head_office_exec')
      )
    )
  );

-- Only creator or admin can delete user-created places
CREATE POLICY "places_delete_owner_or_admin" ON places
  FOR DELETE USING (
    source = 'user' AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'super_admin', 'head_office_exec')
      )
    )
  );
```

### 15.4 Comments Policies

```sql
-- Anyone can view all comments
CREATE POLICY "comments_select_all" ON comments
  FOR SELECT USING (true);

-- Authenticated users can create comments
CREATE POLICY "comments_insert_authenticated" ON comments
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only creator or admin can update their comments
CREATE POLICY "comments_update_owner_or_admin" ON comments
  FOR UPDATE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'head_office_exec')
    )
  );

-- Only creator or admin can delete their comments
CREATE POLICY "comments_delete_owner_or_admin" ON comments
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'head_office_exec')
    )
  );
```

### 15.5 Tags Policies

```sql
-- Anyone can view all tags
CREATE POLICY "tags_select_all" ON tags
  FOR SELECT USING (true);

-- Authenticated users can create tags
CREATE POLICY "tags_insert_authenticated" ON tags
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Only creator or admin can delete tags
CREATE POLICY "tags_delete_owner_or_admin" ON tags
  FOR DELETE USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'head_office_exec')
    )
  );
```

### 15.6 User Profiles Policy

```sql
-- Users can read their own profile (or admin can read all)
CREATE POLICY "profiles_select_own_or_admin" ON user_profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin')
    )
  );

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON user_profiles
  FOR UPDATE USING (id = auth.uid());
```

### 15.7 Admin Roles Reference

| Role | Can Edit/Delete All Areas? | Description |
|------|---------------------------|-------------|
| `super_admin` | ✅ Yes | Full system access |
| `head_office_exec` | ✅ Yes | Head office executives |
| `admin` | ✅ Yes | System administrators |
| `finance_reviewer` | ❌ Own only | Finance team |
| `area_coordinator` | ❌ Own only | Regional coordinators |
| `franchisee` | ❌ Own only | Franchise operators |

### 15.8 Mentions Policies

```sql
-- Enable RLS on mentions table
ALTER TABLE mentions ENABLE ROW LEVEL SECURITY;

-- Users can view their own mentions
CREATE POLICY "mentions_select_own" ON mentions
  FOR SELECT USING (mentioned_user_id = auth.uid());

-- Authenticated users can create mentions
CREATE POLICY "mentions_insert_authenticated" ON mentions
  FOR INSERT WITH CHECK (mentioned_by_user_id = auth.uid());

-- Users can mark their own mentions as read
CREATE POLICY "mentions_update_own" ON mentions
  FOR UPDATE USING (mentioned_user_id = auth.uid());
```

---

## 16. Client-Side Performance Patterns

When moving from localStorage to Supabase, the client-side code must be carefully designed to avoid performance issues. The current localStorage implementation is fast because it's local. Database queries add network latency, so we need smart caching.

### 16.1 The Problem: Don't Query on Every Interaction

**Bad pattern (will cause lag):**
```typescript
// DON'T DO THIS - queries Supabase on every mouse move
async function handleMouseMove(e) {
  const featureId = getHoveredFeatureId(e);
  const metadata = await supabase
    .from('areas')
    .select('name, tags')
    .eq('id', featureId)
    .single();
  showTooltip(metadata);
}
```

This would fire hundreds of database requests per second as the user moves their mouse.

### 16.2 The Solution: Load Once, Cache in React State

**Good pattern:**
```typescript
// Load ALL area metadata when map loads
const [areaMetadata, setAreaMetadata] = useState<Record<string, AreaMeta>>({});

useEffect(() => {
  async function loadMetadata() {
    const { data } = await supabase
      .from('areas')
      .select('id, name, tags, link')
      .eq('city_id', currentCity);

    // Convert to lookup map for O(1) access
    const lookup = Object.fromEntries(
      data.map(area => [area.id, area])
    );
    setAreaMetadata(lookup);
  }
  loadMetadata();
}, [currentCity]);

// Then in hover handler - instant lookup, no network call
function handleMouseMove(e) {
  const featureId = getHoveredFeatureId(e);
  const metadata = areaMetadata[featureId]; // Instant!
  showTooltip(metadata);
}
```

### 16.3 Use SWR for Automatic Caching

SWR (stale-while-revalidate) provides automatic caching, deduplication, and background revalidation.

```typescript
import useSWR from 'swr';

// Fetcher function
const fetcher = async (url: string) => {
  const res = await fetch(url);
  return res.json();
};

// In component - SWR handles caching automatically
function useAreaMetadata(cityId: string) {
  const { data, mutate } = useSWR(
    `/api/areas/metadata?city=${cityId}`,
    fetcher,
    {
      revalidateOnFocus: false,  // Don't refetch when tab regains focus
      dedupingInterval: 60000,   // Dedupe requests within 60 seconds
    }
  );

  return { metadata: data, refresh: mutate };
}
```

**Benefits of SWR:**
- Multiple components can call the same hook - only one request fires
- Data is cached across page navigations
- Background refresh keeps data fresh without blocking UI

### 16.4 Optimistic Updates

When the user saves a change (name, tags, comments), show the change immediately in the UI, then sync to database in the background.

```typescript
async function saveName(areaId: string, newName: string) {
  // 1. Update local state FIRST (instant feedback)
  setAreaMetadata(prev => ({
    ...prev,
    [areaId]: { ...prev[areaId], name: newName }
  }));

  // 2. Then sync to database (can happen in background)
  await supabase
    .from('areas')
    .update({ name: newName })
    .eq('id', areaId);

  // 3. Optionally: Show toast if save failed and revert
}
```

With SWR:
```typescript
async function saveName(areaId: string, newName: string) {
  // Optimistic update with SWR
  mutate(
    `/api/areas/metadata?city=${cityId}`,
    (current) => ({
      ...current,
      [areaId]: { ...current[areaId], name: newName }
    }),
    { revalidate: false } // Don't refetch yet
  );

  // Then persist
  await supabase.from('areas').update({ name: newName }).eq('id', areaId);

  // Revalidate to ensure consistency
  mutate(`/api/areas/metadata?city=${cityId}`);
}
```

### 16.5 When to Fetch/Invalidate

| Event | Action |
|-------|--------|
| Map loads for a city | Fetch all POIs, areas, metadata for that city |
| User creates new area | Add to local cache, save to DB |
| User edits area | Update local cache, save to DB |
| User deletes area | Remove from local cache, delete from DB |
| User switches city | Fetch all data for new city |
| App regains focus | Optionally revalidate in background (SWR handles) |

### 16.6 What to Cache Client-Side

| Data Type | Cache Strategy | Why |
|-----------|----------------|-----|
| Area metadata (name, tags, link) | Load all for city on map load | Needed for hover tooltips |
| Area geometries | Already in MapboxDraw state | Draw library manages this |
| Comments | Load on popup open | Only needed when viewing details |
| POI markers | Load all for city on map load | Always visible on map |
| Traffic data | Load on overlay enable | Only needed when layer is on |
| Population data | Load on overlay enable | Only needed when layer is on |

### 16.7 Implementation Checklist

When updating components for Supabase:

- [ ] **ShapeHoverTooltip** - Use cached metadata from parent state, not direct DB queries
- [ ] **ShapeComments** - Load comments on popup open, cache during session
- [ ] **useMapData** - Replace CSV fetch with Supabase query, use SWR
- [ ] **useOverlayData** - Replace CSV fetch with Supabase query, lazy load
- [ ] **map-draw.tsx** - Save geometries to DB, but keep local state for instant rendering

### 16.8 Expected Performance

With proper caching:

| Action | Expected Latency |
|--------|------------------|
| Hover over shape | < 1ms (cached lookup) |
| Show tooltip | < 5ms (React render) |
| Open popup | 50-200ms (may fetch comments) |
| Save name/tag | < 50ms perceived (optimistic), 200-500ms actual (DB write) |
| Create new area | < 50ms perceived, 200-500ms actual |

Without proper caching:

| Action | Expected Latency |
|--------|------------------|
| Hover over shape | 100-300ms (DB query) - UNACCEPTABLE |
| Show tooltip | Flickers/jumps - BAD UX |

---
