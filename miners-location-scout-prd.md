# Product Requirements Document: The Miners Location Scout

**Version:** 1.0  
**Date:** January 2026  
**Client:** The Miners (coffee chain franchise)

---

## 1. Overview

### Problem
The Miners is a coffee chain expanding through franchisees in Spain and Central Europe. Finding good locations requires checking multiple sources: property listings, competitor cafes, foot traffic data, transit access. This process is slow, scattered, and hard to coordinate between head office and franchisees.

### Solution
A unified map-based scouting tool that:
- Shows all relevant data on one map (properties, cafes, transit, traffic, etc.)
- Lets franchisees submit location pitches for head office approval
- Tracks scouting progress and performance across locations
- Provides AI-powered location scoring to highlight opportunities

### Cities
- Madrid (primary)
- Barcelona
- Prague

---

## 2. Users & Permissions

### User Roles

| Role | Description |
|------|-------------|
| **Admin** | Miners head office staff (execs, expansion managers) |
| **Franchisee** | Coffee shop operators looking for new locations |

### Permissions Matrix

| Action | Admin | Franchisee |
|--------|-------|------------|
| View all map data | ✅ | ✅ |
| View other users' content (POIs, areas, lists, pitches) | ✅ | ✅ |
| Create POIs, areas, lists, pitches | ✅ | ✅ |
| Edit/delete own content | ✅ | ✅ |
| Edit/delete others' content | ✅ | ❌ |
| Create new categories | ✅ | ✅ |
| Add new users | ✅ | ❌ |
| Change user permissions | ✅ | ❌ |
| Approve/reject pitches | ✅ | ❌ |
| Edit scoring parameters | ✅ | ❌ |
| Edit notification settings | ✅ | ❌ |
| Access admin settings | ✅ | ❌ |

### Scale
- Expected users: ~20 max
- Language: English only

---

## 3. Features

### 3.1 Interactive Map

Full-screen map using mapcn (MapLibre). All data displayed as toggleable layers.

**POI Layers:**

| Layer | Icon | Source | Badge |
|-------|------|--------|-------|
| Available properties | 🏠 | Idealista (Apify) | — |
| Cafes (competitors) | ☕ | Google Maps (Apify) | "NEW" if < 2 months |
| EU Coffee Trip cafes | ☕✨ | Own scraper | "NEW" if < 2 months |
| Office centers | 🏢 | OSM Overpass | — |
| Shopping centers | 🛒 | OSM Overpass | — |
| Metro stations | 🚇 | OSM Overpass | — |
| Train stations | 🚂 | OSM Overpass | — |
| Universities | 🎓 | OSM Overpass | — |
| Student dorms | 🏘️ | OSM Overpass | — |
| New developments | 🏗️ | Manual entry | — |
| Business areas | 💼 | Manual polygons | — |
| High streets | 🛍️ | Manual polygons | — |
| Custom POIs | 📍 | User-created | — |

**Data Layers (overlays):**

| Layer | Type | Source |
|-------|------|--------|
| Foot traffic | Heatmap | Madrid City Council |
| Population density | Choropleth | Madrid City Council |
| Barrios (neighborhoods) | Polygon boundaries | Manual / city data |
| Areas of interest | User-drawn polygons | User-created |
| AI Opportunity Zones | Highlighted areas | Computed |

**Marker Badges:**
- Red circle with number on POI icons = count of scouting reports attached
- "NEW" chip = added in last 2 months

---

### 3.2 City Selector

**Location:** Top-left corner

**Design:** Glassmorphism dropdown showing city silhouettes (Prague, Madrid, Barcelona). Small and unobtrusive.

**Behavior:** Selecting a city pans map to that city's bounds and loads city-specific data.

---

### 3.3 Filter Panel

**Location:** Right side of screen

**Design:** Glassmorphism (backdrop blur, semi-transparent, as per Nume reference)

**Filters:**
- Layer toggles (show/hide each POI type)
- Rating filter (e.g., cafes 4.5+ only)
- "Specialty only" toggle for cafes
- "NEW" filter (show only items added in last 2 months)
- Property filters (price range, size, type)
- Date range for foot traffic data

---

### 3.4 Activity Log

**Location:** Bottom-right corner

**Design:** Small pill button showing "[number] changes" or "View changes"

**Behavior:**
- Shows count of content changes by OTHER users (not data refreshes)
- Changes include: new POIs, new areas, new pitches, new comments, edits
- On hover: smoothly expands upward showing last 5 changes
  - Each item: timestamp + 10-word max summary
  - Scrollable to see more
- Once viewed, counter resets; button shows "View changes" on next login

**What counts as a change:**
- New custom POI added
- New area drawn
- New scouting pitch submitted
- New comment/tag added
- Edits to existing content

**What doesn't count:**
- Automated data refreshes (Apify, OSM)
- User's own changes

---

### 3.5 POI Popups

**Design:** Black and white (mapcn/shadcn default), customizable

**Content varies by POI type:**

**Cafe popup:**
- Name, address
- Rating, review count
- Hours
- "NEW" badge if applicable
- Specialty tags
- Scouting report count badge
- Buttons: [Save to List] [Add Report] [View Reports]

**Property popup:**
- Address, price, size (m²)
- Property type
- Link to Idealista listing
- Scouting report count badge
- Buttons: [Save to List] [Add Report] [Submit Pitch]

**Custom POI popup:**
- Name, category, description
- Created by, date
- Tags
- Comments
- Buttons: [Edit] [Delete] (if owner/admin)

---

### 3.6 Areas of Interest

**Feature:** Users can draw polygons on the map to mark areas to explore.

**Fields:**
- Name
- Tags (multi-select or freeform)
- Comments (freeform text)
- Color (for visual distinction)

**Permissions:**
- Anyone can create
- Visible to all users
- Only creator or admin can edit/delete

---

### 3.7 Custom POIs & Categories

**Feature:** Users can add points not in the base data.

**Creating a POI:**
- Click location on map
- Enter: name, category (existing or new), description, tags
- Optionally upload photos (up to 30)

**Creating a category:**
- Any user can create
- Category has: name, icon, color
- Visible to all users

**Permissions:**
- Anyone can create POIs and categories
- Visible to all
- Only creator or admin can edit/delete

---

### 3.8 Lists

**Feature:** Users can save POIs to named lists for later reference.

**List metadata:**
- Name
- Created by
- Creation date

**List items can include optional visit log:**
- Visit date
- Visit time
- Weather (manual entry)
- Traffic observation (manual entry)
- Comments

**Export options:**
- CSV (all data)
- PDF (branded with Miners logo)
  - Include photos: Yes/No prompt
  - Header: Miners logo (black version on white background)
  - Shows: list name, creator, all items with their metadata

---

### 3.9 Scouting Pitches

**Feature:** Franchisees submit location pitches for admin approval.

**Pitch form fields (based on Lease Decision Brief):**

**Location:**
- Address (text)
- Area m² (number)
- Storage m² (number)
- Property type (dropdown)
- Footfall estimate (pedestrians/day)
- Neighbourhood profile (text)
- Nearby competitors (text)

**Financial:**
- Monthly rent (€)
- Service fees (€)
- Deposit (€)
- Fit-out cost estimate (€)
- Opening investment total (€)
- Expected daily revenue (€)
- Monthly revenue range (€)
- Payback period (months)

**Operational:**
- Ventilation: OK / Needs upgrade
- Water/Waste: OK / Complex
- Power capacity: OK / Needs upgrade
- Visibility: Strong / Medium / Weak
- Delivery access: Good / Average / Bad
- Seating capacity (number)
- Outdoor seating: Yes / No

**Other:**
- Risks (freeform text, multiple entries)
- Photos (up to 30)
- Linked property POI (optional)

**Pitch statuses:**
- Draft
- Submitted
- Under Review
- Approved
- Rejected
- Proceed with Conditions

**Workflow:**
1. Franchisee creates pitch (starts as Draft)
2. Franchisee submits (status → Submitted)
3. Admin receives notification (in-app + optional email)
4. Admin reviews, changes status
5. If "Proceed with Conditions," admin adds condition notes

**Notifications:**
- Email to: configurable (default: matus.husar@theminers.eu)
- Email toggle: off by default
- In-app notification: always on

**Visibility:**
- All users can see all pitches
- Only creator can edit draft pitches
- Only admin can change status after submission

**Export:**
- PDF matching Lease Decision Brief template
- Miners logo (black) at top
- Option to include/exclude photos

---

### 3.10 AI Location Scoring

**Feature:** Rule-based scoring system that highlights opportunity areas.

**How it works:**
1. Admin sets weights for scoring factors
2. System calculates score for each area/point
3. High-scoring areas highlighted on map as "Opportunity Zones"

**Scoring factors (configurable by admin):**

| Factor | Weight (adjustable) | Source |
|--------|---------------------|--------|
| Foot traffic | 0-100% | Traffic data |
| Population density | 0-100% | Density data |
| Competitor saturation (inverse) | 0-100% | Cafe count |
| Transit proximity | 0-100% | Metro/train distance |
| University proximity | 0-100% | University distance |
| Rent affordability | 0-100% | Property prices |

**Manual inputs (for demo/custom):**
- Sales per 1000 people
- Avg. sale value (€)
- Estimated ROI given investment amount

**Output:**
- Score 0-100 per grid cell or area
- Visual overlay showing high-opportunity zones
- Adjustable threshold for what counts as "high"

---

### 3.11 Performance Monitoring (Future-Ready)

**Feature:** Connect to sales/POS data to track location performance.

**Placeholder fields:**
- Traffic per hour
- Conversion rate (traffic → customers) %
- Avg. customer spend (€)
- Daily/weekly/monthly revenue
- Custom metrics (extensible)

**Integration:**
- API bridge ready (endpoint TBD)
- Data stored per location
- Displayable on map as layer or in popup

---

### 3.12 CRM Integration (Future-Ready)

**Target:** ClickUp (project management)

**Sync options (to be defined):**
- Push scouting pitches to ClickUp as tasks
- Sync pitch status both ways
- Export lists to ClickUp

**Implementation:**
- API bridge ready
- Configurable in admin settings

---

### 3.13 Admin Settings

**Accessible by:** Admin only

**Sections:**

**User Management:**
- Add new users (email invite)
- Set user role (Admin / Franchisee)
- Deactivate users

**Notifications:**
- Email recipient for pitch submissions
- Email toggle (on/off, default off)

**Scoring Parameters:**
- Adjust weights for each scoring factor
- Set opportunity threshold

**Integrations:**
- ClickUp API key (placeholder)
- POS/Sales API endpoint (placeholder)

**Data Management:**
- Manual data import (CSV upload)
- View last refresh dates per data source

---

## 4. Data Sources

### Data Inventory

| Data | Source | Scraper/Method | Refresh | Status |
|------|--------|----------------|---------|--------|
| Available properties | Idealista | Apify | Weekly | In progress |
| Cafes | Google Maps | Apify | Monthly | Done |
| EU Coffee Trip | Own scraper | Custom | Monthly | Done |
| Office centers | OSM | Overpass API | Quarterly | Done |
| Shopping centers | OSM | Overpass API | Quarterly | Done |
| Metro stations | OSM | Overpass API | Quarterly | Done |
| Train stations | OSM | Overpass API | Quarterly | Done |
| Universities | OSM | Overpass API | Annually | Done |
| Student dorms | OSM | Overpass API | Annually | Done |
| New developments | Manual | User entry | As needed | Not started |
| High streets | Manual | Admin polygons | As needed | Not started |
| Business areas | Manual | Admin polygons | As needed | Not started |
| Foot traffic | Madrid City Council | Manual import | Annually | Done |
| Population density | Madrid City Council | Manual import | Annually | Done |
| Barrios | City data | Manual import | One-time | Not started |

### Data Pipeline

**Tool:** n8n (self-hosted locally)

**Schedule:**
- Weekly: Idealista properties
- Monthly: Cafes (Google Maps), EU Coffee Trip
- Quarterly: OSM POIs (offices, shopping, metro, train)
- Annually: Universities, dorms, traffic, population

**Sync logic:**
- Upsert on `source_id` (no duplicates)
- Mark missing items as `inactive` (never delete)
- Track `last_seen_at` timestamp

---

## 5. Database Schema

### Core Tables

```sql
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
  is_system BOOLEAN DEFAULT false, -- true for built-in categories
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Places (all POIs)
CREATE TABLE places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  category_id UUID REFERENCES categories(id),
  source TEXT NOT NULL, -- 'idealista', 'google', 'osm', 'eu_coffee_trip', 'user'
  source_id TEXT, -- external ID for deduping
  name TEXT NOT NULL,
  address TEXT,
  location GEOGRAPHY(POINT) NOT NULL,
  metadata JSONB, -- hours, rating, price, size, etc.
  photos TEXT[], -- array of URLs
  is_new BOOLEAN DEFAULT false, -- added in last 2 months
  status TEXT DEFAULT 'active', -- active, inactive
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source, source_id)
);

-- Spatial index
CREATE INDEX places_location_idx ON places USING GIST(location);
CREATE INDEX places_city_category_idx ON places(city_id, category_id);

-- Areas of Interest
CREATE TABLE areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  name TEXT NOT NULL,
  geometry GEOGRAPHY(POLYGON) NOT NULL,
  tags TEXT[],
  color TEXT,
  comments TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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
  condition_notes TEXT, -- if proceed_with_conditions
  
  -- Location
  address TEXT,
  area_sqm NUMERIC,
  storage_sqm NUMERIC,
  property_type TEXT,
  footfall_estimate INTEGER,
  neighbourhood_profile TEXT,
  nearby_competitors TEXT,
  
  -- Financial
  monthly_rent NUMERIC,
  service_fees NUMERIC,
  deposit NUMERIC,
  fitout_cost NUMERIC,
  opening_investment NUMERIC,
  expected_daily_revenue NUMERIC,
  monthly_revenue_range TEXT,
  payback_months INTEGER,
  
  -- Operational
  ventilation TEXT, -- ok, needs_upgrade
  water_waste TEXT, -- ok, complex
  power_capacity TEXT, -- ok, needs_upgrade
  visibility TEXT, -- strong, medium, weak
  delivery_access TEXT, -- good, average, bad
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

-- Activity Log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  city_id TEXT REFERENCES cities(id),
  action_type TEXT NOT NULL, -- poi_created, area_created, pitch_submitted, comment_added, etc.
  entity_type TEXT, -- place, area, pitch, list
  entity_id UUID,
  summary TEXT, -- max 10 words
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Activity View State (tracks what user has seen)
CREATE TABLE user_activity_state (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  last_viewed_at TIMESTAMPTZ DEFAULT now()
);

-- Comments (on any entity)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- place, area, pitch
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

-- Traffic Data (for performance monitoring - future)
CREATE TABLE traffic_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  location GEOGRAPHY(POINT),
  source TEXT,
  data JSONB,
  period DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance Data (for sales monitoring - future)
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

-- Scoring Parameters
CREATE TABLE scoring_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weight NUMERIC DEFAULT 0, -- 0 to 1
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- App Settings
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Polygon Layers (barrios, high streets, business areas)
CREATE TABLE polygon_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  layer_type TEXT NOT NULL, -- barrio, high_street, business_area
  name TEXT NOT NULL,
  geometry GEOGRAPHY(POLYGON) NOT NULL,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### User Management (Supabase Auth + Custom)

```sql
-- Extended user profile
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT DEFAULT 'franchisee', -- admin, franchisee
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security will handle permissions
```

---

## 6. UI Specifications

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ [City Dropdown]                                    [User Menu]  │
│  (top-left)                                        (top-right)  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                                                                 │
│                                                    ┌──────────┐ │
│                                                    │ FILTERS  │ │
│                                                    │          │ │
│                         MAP                        │ (glass)  │ │
│                                                    │          │ │
│                                                    │          │ │
│                                                    └──────────┘ │
│                                                                 │
│                                                                 │
│                                           [5 changes ▲]        │
│                                           (bottom-right)        │
└─────────────────────────────────────────────────────────────────┘
```

### Theme Specifications

**Glassmorphism (filters, dropdowns, city selector, activity log):**
```css
background: rgba(255, 255, 255, 0.1);
backdrop-filter: blur(20px) saturate(180%);
border: 1px solid rgba(255, 255, 255, 0.2);
border-radius: 16px;
```

**POI Popups & Forms (mapcn/shadcn black & white):**
- Background: white
- Text: black
- Borders: light gray
- Buttons: black background, white text
- Fully customizable for added fields/buttons

### Branding

**Logo files:**
- `THEMINERS_LOGO_BLACK_UP.png` — use on white/light backgrounds
- `THEMINERS_LOGO_WHITE_UP.png` — use on dark backgrounds

**Exports:**
- PDF header: black logo on white background
- Consistent placement top-center

---

## 7. Technical Architecture

### Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js (App Router) |
| Hosting | Vercel |
| Database | Supabase (PostgreSQL + Auth) |
| Maps | mapcn (MapLibre + shadcn/ui) |
| Styling | Tailwind CSS |
| Data Pipeline | n8n (self-hosted) |
| Scrapers | Apify (Idealista, Google Maps) |
| File Storage | Supabase Storage |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER (Browser)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Next.js App                                              │   │
│  │  ├── /[city] — Map view                                  │   │
│  │  ├── /admin — Admin settings                             │   │
│  │  ├── /pitch/[id] — Pitch detail/form                     │   │
│  │  └── /list/[id] — List detail                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Components                                               │   │
│  │  ├── MapView (mapcn)                                     │   │
│  │  ├── FilterPanel (glassmorphism)                         │   │
│  │  ├── CitySelector (glassmorphism)                        │   │
│  │  ├── ActivityLog (glassmorphism)                         │   │
│  │  ├── POIPopup (b&w, customized)                          │   │
│  │  ├── PitchForm (b&w)                                     │   │
│  │  └── AreaDrawer (mapcn polygon tool)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Config                                                   │   │
│  │  └── /cities/{madrid,barcelona,prague}.json              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │   Auth       │ │   Database   │ │   Storage    │            │
│  │  (users)     │ │  (all data)  │ │  (photos)    │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    DATA PIPELINE (n8n)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Weekly:    Idealista → Apify → Supabase                  │  │
│  │ Monthly:   Google Maps → Apify → Supabase                │  │
│  │ Monthly:   EU Coffee Trip → Custom scraper → Supabase    │  │
│  │ Quarterly: OSM → Overpass API → Supabase                 │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL APIS                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │ Apify  │ │  OSM   │ │ClickUp │ │  POS   │                   │
│  │        │ │Overpass│ │(future)│ │(future)│                   │
│  └────────┘ └────────┘ └────────┘ └────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Export Specifications

### CSV Export

**Available for:** Lists, Pitches, POIs

**Format:** Standard CSV with headers

**Fields:** All relevant data for the entity type

### PDF Export

**Available for:** Lists, Pitches

**Template:**
- Header: Miners logo (black) centered
- Title: Document type + name
- Date generated
- Created by

**For Pitches:**
- Follow Lease Decision Brief layout exactly
- All form fields in structured sections
- Photos: optional (prompt user)
- Include decision status if available

**For Lists:**
- Table format with all items
- Include visit logs if populated
- Photos: optional (prompt user)

---

## 9. Notifications

### In-App Notifications

**Trigger:** New pitch submitted

**Display:** Badge on admin menu or dedicated notification area

### Email Notifications

**Trigger:** New pitch submitted

**Recipient:** Configurable (default: matus.husar@theminers.eu)

**Toggle:** Off by default, admin can enable in settings

**Content:**
- Subject: "New Location Pitch Submitted: [Address]"
- Body: Franchisee name, address, quick link to review

---

## 10. Roadmap

### Phase 1: Core Map & Data (2 weeks)
- [ ] Set up Supabase (schema, auth, RLS)
- [ ] Set up Next.js + mapcn
- [ ] Build city configs (Madrid, Barcelona, Prague)
- [ ] Import existing scraped data
- [ ] Build filter panel (glassmorphism)
- [ ] Build city selector
- [ ] Build POI popups (customized mapcn)
- [ ] Deploy to Vercel

### Phase 2: User Features (1.5 weeks)
- [ ] User authentication flow
- [ ] Lists (create, add items, visit logs)
- [ ] Custom POIs & categories
- [ ] Areas of interest (polygon drawing)
- [ ] Activity log component
- [ ] Comments & tags

### Phase 3: Scouting & Pitches (1.5 weeks)
- [ ] Pitch form (all fields from brief)
- [ ] Pitch workflow (statuses, submission)
- [ ] Scouting reports (quick reports)
- [ ] Admin pitch review UI
- [ ] Email notifications (optional)
- [ ] Badge counts on markers

### Phase 4: Exports & Polish (1 week)
- [ ] CSV export (lists, pitches)
- [ ] PDF export (branded, with photos option)
- [ ] Admin settings panel
- [ ] User management UI
- [ ] Final UI polish

### Phase 5: AI Scoring (0.5 weeks)
- [ ] Scoring parameters UI
- [ ] Rule-based scoring engine
- [ ] Opportunity zones layer
- [ ] Manual demo data

### Phase 6: Integrations (Future)
- [ ] ClickUp API integration
- [ ] POS/Sales API bridge
- [ ] Performance data layer

---

## 11. Costs

| Item | Monthly Cost |
|------|--------------|
| Vercel hosting | $0 (free tier) |
| Supabase | $0 (free tier, 500MB) |
| n8n (self-hosted) | $0 |
| Apify (Idealista + Google Maps) | ~$50 |
| OSM Overpass | $0 |
| **Total** | **~$50/month** |

**Note:** If data volume grows significantly, may need Supabase Pro ($25/mo).

---

## 12. Open Items

| Item | Status | Owner |
|------|--------|-------|
| Idealista Apify actor selection | In progress | Dev |
| EU Coffee Trip scraper | Done | Dev |
| Barrios data import | Not started | Dev |
| High streets polygons | Not started | Client to provide |
| Business areas polygons | Not started | Client to provide |
| ClickUp API scope definition | Not started | Client |
| POS system identification | Not started | Client |
| Historical sales data for scoring | Not started | Client |

---

## 13. Appendix

### A. City Config Example

```json
{
  "id": "madrid",
  "name": "Madrid",
  "country": "ES",
  "center": [40.4168, -3.7038],
  "bounds": [[40.3, -3.9], [40.5, -3.5]],
  "osmAreaId": 3600340422,
  "silhouette": "/images/cities/madrid-silhouette.svg",
  "enabled": true
}
```

### B. Scoring Parameters Default

| Parameter | Default Weight |
|-----------|---------------|
| foot_traffic | 0.25 |
| population_density | 0.15 |
| competitor_saturation | 0.20 |
| transit_proximity | 0.15 |
| university_proximity | 0.10 |
| rent_affordability | 0.15 |

### C. File References

- Logo (black): `THEMINERS_LOGO_BLACK_UP.png`
- Logo (white): `THEMINERS_LOGO_WHITE_UP.png`
- Lease Decision Brief template: `Miners_Lease_Decision_Brief.docx`
