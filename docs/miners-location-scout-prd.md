# Product Requirements Document: The Miners Franchise Operations Platform

**Version:** 2.0
**Date:** January 2026
**Client:** The Miners (coffee chain franchise)

---

## 1. Overview

### Problem
The Miners is a coffee chain expanding through franchisees in Spain and Central Europe. Managing franchise expansion requires:
- **Location scouting:** Checking multiple sources (property listings, competitor cafes, foot traffic, transit access)
- **Revenue tracking:** Monitoring real-time profitability across existing locations
- **Competitor analysis:** Understanding market positioning and competitive threats
- **Approval workflows:** Coordinating multi-level approvals between franchisees and head office

This process is currently slow, scattered across multiple tools, and hard to coordinate between teams.

### Solution
A unified franchise operations management platform that:
- **Location Scouting:** Shows all relevant data on one map (properties, cafes, transit, traffic, etc.)
- **Multi-Level Approvals:** Lets franchisees submit location pitches through configurable approval workflows (Area Coordinator → Finance → Head Office)
- **Revenue & Profitability:** Tracks real-time performance across all locations with manual entry and POS integration
- **Competitor Analysis:** Monitors competitor locations, estimated revenue, market share, and trends
- **AI Scoring:** Provides AI-powered location scoring to highlight expansion opportunities
- **Operations Dashboard:** Centralized view of franchise portfolio health and expansion pipeline

### Cities
- Madrid (primary)
- Barcelona
- Prague

---

## 2. Users & Permissions

### User Roles

| Role | Description |
|------|-------------|
| **Super Admin** | System-wide access, user management, workflow configuration |
| **Head Office Exec** | Final approval authority (CEO/COO level), view all data |
| **Finance Reviewer** | Reviews financial aspects of pitches, access to revenue data |
| **Area Coordinator** | Coordinates multiple franchisees, first-level pitch approval |
| **Franchisee** | Coffee shop operators, creates pitches, views own locations |

### Permissions Matrix

| Action | Super Admin | Head Office Exec | Finance Reviewer | Area Coordinator | Franchisee |
|--------|-------------|------------------|------------------|------------------|------------|
| View all map data | ✅ | ✅ | ✅ | ✅ | ✅ |
| View other users' content | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create POIs, areas, lists, pitches | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit/delete own content | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit/delete others' content | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create new categories | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add new users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Change user permissions | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure approval workflows | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve pitches (Level 1 - Area) | ✅ | ✅ | ❌ | ✅ | ❌ |
| Approve pitches (Level 2 - Finance) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve pitches (Level 3 - Final) | ✅ | ✅ | ❌ | ❌ | ❌ |
| View revenue/profitability data | ✅ | ✅ | ✅ | ✅ | Own only |
| View full competitor analysis | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit scoring parameters | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit notification settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Access admin settings | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage approval assignments | ✅ | ✅ | ❌ | ❌ | ❌ |

### Approval Workflow

The system supports configurable multi-level approval workflows (2-4 levels). Admins can define approval chains per city or globally.

**Default workflow:**
```
Franchisee submits → Area Coordinator (Level 1) → Finance Reviewer (Level 2) → Head Office Exec (Level 3)
```

**Workflow rules:**
- Each level can approve (pass to next) or reject (return to submitter)
- Rejection at any level returns pitch with comments for revision
- Re-submitted pitches restart from Level 1
- Admins can skip levels for specific pitches if needed

### Scale
- Expected users: ~50 max (expanded for multi-role structure)
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

**@Mentions:**
- Users can tag others in comments using `@DisplayName` syntax
- Tagged users see a red badge on Activity Log with unread mention count
- Mentions tab shows all mentions with context (who, where, when)
- Clicking a mention navigates to the entity and highlights the comment
- Mentions are marked as read when viewed

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

**Feature:** Franchisees submit location pitches through configurable multi-level approval workflows.

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

**Pitch statuses (multi-level):**
- Draft
- Submitted
- Pending Level 1 Review (Area Coordinator)
- Pending Level 2 Review (Finance Reviewer)
- Pending Final Approval (Head Office Exec)
- Approved
- Rejected (with rejection level noted)
- Returned for Revision
- Proceed with Conditions

**Multi-Level Workflow:**
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────┐
│   Draft     │ ──► │  Submitted  │ ──► │  Level 1    │ ──► │  Level 2    │ ──► │  Level 3 │
│             │     │             │     │  (Area)     │     │  (Finance)  │     │  (Exec)  │
└─────────────┘     └─────────────┘     └──────┬──────┘     └──────┬──────┘     └────┬─────┘
                                               │                   │                  │
                                               ▼                   ▼                  ▼
                                        ┌──────────────────────────────────────────────┐
                                        │         Reject → Returned for Revision       │
                                        │         Approve → Pass to next level         │
                                        │         Final Approve → Approved             │
                                        └──────────────────────────────────────────────┘
```

**Workflow steps:**
1. Franchisee creates pitch (starts as Draft)
2. Franchisee submits (status → Submitted → Pending Level 1)
3. Area Coordinator reviews, approves (→ Level 2) or rejects (→ Returned for Revision)
4. Finance Reviewer reviews, approves (→ Level 3) or rejects
5. Head Office Exec gives final approval or rejects
6. If "Proceed with Conditions," approver adds condition notes

**Per-step tracking:**
- Each approval step records: approver, timestamp, decision, comments
- Rejection requires mandatory comment explaining why
- Full approval history visible on pitch detail page
- Re-submitted pitches show revision count and history

**Notifications:**
- Email to: configurable per approval level
- Email toggle: off by default
- In-app notification: always on for pending approvals
- Notify submitter when pitch advances or is returned

**Visibility:**
- All users can see all pitches and their current status
- Only creator can edit draft pitches
- Each approver can only act on pitches at their level
- Super Admin and Head Office Exec can override and skip levels

**Export:**
- PDF matching Lease Decision Brief template
- Miners logo (black) at top
- Option to include/exclude photos
- Include approval history and comments

---

### 3.10 Profitability Prediction

**Feature:** Estimate monthly profit potential for prospective cafe locations using map data and chain benchmarks.

**How it works:**
1. User identifies a location (Idealista property OR custom "Prospective Location" pin)
2. System automatically gathers location data (traffic, population, competition, nearby POIs)
3. System applies The Miners' business benchmarks (avg ticket, conversion rate, costs)
4. System calculates estimated monthly profit range
5. User sees prediction with confidence level and data caveats

---

#### 3.10.1 Data Inputs

**Automatic (from map data):**

| Data | Source | How It's Used |
|------|--------|---------------|
| Foot traffic | footfall_data (interpolated) | Estimate potential customers |
| Population density | density.csv by district | Adjust customer estimates |
| Competition | Cafe count within 500m | Apply competition penalty |
| Traffic generators | Transit/office/university within 500m | Apply location bonuses |

**Chain Benchmarks (admin-configured per city):**

| Benchmark | Description | Example (Madrid) |
|-----------|-------------|------------------|
| Average ticket price | Typical customer spend | €5.20 |
| Conversion rate | % of foot traffic who buy | 2.5% |
| Fixed monthly costs | Staff, utilities, supplies, insurance | €6,000 |
| Variable cost per customer | Coffee beans, cups, etc. | €1.50 |
| Typical setup cost | Build-out cost for new location | €80,000 |
| Operating hours per day | Typical daily hours | 12 |

**Per-city configuration required:** Costs vary significantly between Madrid, Barcelona, Prague, Vienna, and Zurich. Each city gets its own benchmark row.

**Location Multipliers (optional):**

| Multiplier | Effect | Default |
|------------|--------|---------|
| Near transit bonus | Increase traffic estimate | +15% |
| Near university bonus | Increase traffic estimate | +10% |
| Near office bonus | Increase traffic estimate | +5% |
| High competition penalty | Decrease conversion (3+ cafes nearby) | -15% |

**Property-Specific (from Idealista or manual entry):**
- Monthly rent
- Size (m²)
- Transfer fee

---

#### 3.10.2 Traffic Interpolation

Footfall data exists at specific measurement points. For any location, the system interpolates traffic using **Inverse Distance Weighting (IDW)**:

1. Find all footfall measurement points within 1km radius
2. Weight each point inversely by distance (closer = more weight)
3. Calculate weighted average traffic
4. If no points within 1km → mark as "Low confidence - insufficient traffic data"

---

#### 3.10.3 Profit Calculation

```
Step 1: Estimate daily traffic at location (interpolated)
Step 2: Apply location multipliers (transit, university, competition)
Step 3: Calculate daily customers = traffic × conversion rate
Step 4: Calculate monthly revenue = customers × avg ticket × 30 days
Step 5: Calculate monthly costs = rent + fixed costs + (customers × variable cost × 30)
Step 6: Calculate profit = revenue - costs
Step 7: Calculate payback = (setup cost + transfer fee) / monthly profit
```

**Output as ranges:** To avoid false precision, display profit as ±20% range:
- "€2,800 - €4,200 / month" (not "€3,412/month")

---

#### 3.10.4 Prospective Locations (New POI Type)

Users can drop a pin anywhere and mark it as a **"Prospective Location"** to evaluate spots not listed on Idealista.

**Creating a Prospective Location:**
1. User clicks "Add Prospective Location" tool or long-presses on map
2. User drops pin at desired location
3. Modal appears with fields:
   - Name (required)
   - Property details: Link to Idealista OR enter manually (rent, size, transfer fee)
   - Notes (optional)
4. System calculates prediction based on location
5. Prospective location saved and visible on map

**Idealista Linking:**
- User can link to a nearby Idealista property (within 200m)
- Auto-fills rent, size, and transfer fee from the linked listing
- Prediction updates automatically

**Visibility:**
- Users see their own prospective locations
- Admins see all prospective locations

---

#### 3.10.5 Prediction Display (UI)

**Prediction Card (in popup):**

```
┌─────────────────────────────────────────────────┐
│ PROFITABILITY ESTIMATE                    ⓘ    │
├─────────────────────────────────────────────────┤
│                                                 │
│ Monthly Profit                                  │
│ €2,800 - €4,200                                │
│ ████████████░░░░ Medium-High potential         │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│ Revenue        €12,000 - €15,000               │
│ Costs          €9,200 - €10,800                │
│ Payback        18 - 28 months                  │
│                                                 │
│ ─────────────────────────────────────────────  │
│                                                 │
│ Confidence: ●●○ Medium                         │
│ Based on 2 traffic points, known rent          │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Confidence Levels:**

| Level | Criteria | Display |
|-------|----------|---------|
| High | 3+ traffic points within 1km AND rent is known | Green ●●● |
| Medium | 1-2 traffic points OR rent is estimated | Yellow ●●○ |
| Low | No traffic points within 1km OR missing critical data | Red ●○○ |

---

#### 3.10.6 Data Caveat Tooltip (Required)

Every prediction MUST show an info icon (ⓘ) that displays this caveat on hover/click:

```
┌─────────────────────────────────────────────────┐
│ ABOUT THIS ESTIMATE                             │
├─────────────────────────────────────────────────┤
│                                                 │
│ This prediction is based on:                    │
│ • Pedestrian traffic data from [DATE]           │
│ • Population density from [DATE]                │
│ • The Miners' average business metrics          │
│                                                 │
│ Important considerations:                       │
│                                                 │
│ 📅 SEASONALITY                                  │
│ Traffic patterns vary by season. Summer         │
│ tourist areas may show inflated numbers.        │
│ Winter patterns may differ significantly.       │
│                                                 │
│ 🎉 EVENTS & ANOMALIES                          │
│ Data may have been collected during             │
│ festivals, holidays, or unusual periods         │
│ that don't reflect typical conditions.          │
│                                                 │
│ 😷 HISTORICAL EFFECTS                          │
│ If data is from 2020-2022, COVID-19 may        │
│ have significantly affected traffic patterns.   │
│ Post-pandemic patterns may differ.              │
│                                                 │
│ 💰 RENT NEGOTIATION                            │
│ Listed rents are asking prices. Actual          │
│ negotiated rent is typically 10-20% lower.      │
│ Use the scenario simulator to adjust.           │
│                                                 │
│ ⚠️ USE AS STARTING POINT                       │
│ This estimate helps compare locations and       │
│ prioritize due diligence. It is not a           │
│ guarantee of actual results.                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

#### 3.10.7 Admin Benchmark Settings

**Access:** Super Admin and Head Office Exec only

**Location:** Admin Settings panel, "Profitability Benchmarks" section

**UI:** City selector dropdown + form fields for all benchmarks

**Behavior:**
- Changes to benchmarks immediately affect all predictions
- Franchisees CANNOT edit benchmarks (view only in scenario simulator)
- Admins can edit benchmarks for any city

---

#### 3.10.8 Permissions

| Action | Admin | Franchisee |
|--------|-------|------------|
| View predictions on any location | ✅ | ✅ |
| Create prospective locations | ✅ | ✅ |
| Edit own prospective locations | ✅ | ✅ |
| View all prospective locations | ✅ | Own only |
| Edit city benchmarks | ✅ | ❌ |
| View underlying cafe performance data | ✅ | ❌ |

**Important:** Franchisees see predictions but NOT the underlying performance data used to validate benchmarks. That data is sensitive business information.

---

#### 3.10.9 Future Enhancements (Not V1)

| Feature | Description | Phase |
|---------|-------------|-------|
| Scenario Simulator | Sliders to adjust assumptions and see live prediction updates | V2 |
| Profit Potential Heat Map | Rough grid overlay showing profit potential across the city | V3 |
| Prediction Validation | Compare predictions to actual performance after cafe opens | V3 |

---

### 3.11 Revenue & Profitability Dashboard

**Feature:** Real-time tracking of revenue, costs, and profitability across all franchise locations.

**Data Sources:**
- Manual entry by franchisees/coordinators (always available)
- API integration with POS systems (configurable)
- CSV import for bulk data updates

**Revenue Metrics:**
- Daily/weekly/monthly revenue per location
- Revenue by time period (morning, lunch, afternoon, evening)
- Transaction count and average ticket size
- Revenue trends and growth rates
- Year-over-year comparisons

**Profitability Metrics:**
- Gross margin per location
- Operating costs (rent, labor, supplies)
- Net profit per location
- ROI calculation vs. initial investment
- Payback period tracking (forecast vs. actual)
- Break-even analysis with alerts

**Dashboard Views:**
- **Location detail:** Full P&L for single location
- **Portfolio summary:** All locations at a glance
- **Comparison view:** Side-by-side location comparison
- **Trend charts:** Revenue/profit over time
- **Map overlay:** Color-coded markers by profitability

**Forecasting:**
- Compare pitched projections vs. actual performance
- Alert when location underperforms forecast by X%
- Identify top/bottom performing locations

**Data Entry UI:**
- Simple form for daily revenue entry
- Bulk import via CSV
- Auto-sync from connected POS (when configured)
- Data validation and duplicate detection

**Permissions:**
- Franchisees see only their own locations
- Area Coordinators see locations in their region
- Finance Reviewers and above see all locations
- Export requires Finance Reviewer+ role

---

### 3.12 Competitor Analysis

**Feature:** Comprehensive tracking and analysis of competitor cafes to inform expansion decisions.

**Competitor Data Points:**
- Location (mapped with rich markers)
- Name, brand/chain affiliation
- Estimated revenue (manual or computed)
- Rating and review count (Google Maps)
- Price level (€, €€, €€€)
- Specialties (specialty coffee, food, etc.)
- Hours of operation
- Seating capacity (estimated)
- Date opened (if known)

**Market Analysis Features:**

**Market Share Visualization:**
- Choropleth showing competitor density by neighborhood
- Heat map of competitor concentration
- Our locations vs. competitor locations overlay

**Competitive Benchmarking:**
- Compare our locations to nearby competitors
- Rating comparison
- Price positioning analysis
- Specialty coffee market share

**Competitor Tracking:**
- Alert on new competitor openings in target areas
- Track competitor closings (opportunity signals)
- Monitor rating changes over time
- Identify competitor expansion patterns

**Trend Analysis:**
- Competitor growth/decline trends
- Market entry timing patterns
- Seasonal variations in competitor performance

**Data Sources:**
- Google Maps (Apify scraper) — ratings, reviews, hours
- EU Coffee Trip — specialty cafe data
- Manual entry — revenue estimates, additional intel
- Social media monitoring (future)

**Permissions:**
- All users can view competitor locations on map
- Full competitor analysis available to all roles
- Revenue estimates require Finance Reviewer+ to edit

---

### 3.13 Franchise Operations Dashboard

**Feature:** Centralized operations view for managing the entire franchise portfolio.

**Portfolio Overview:**
- Total locations (active, in development, closed)
- Total revenue across portfolio
- Average profitability per location
- Expansion pipeline status

**Location Status Tracking:**
| Status | Description |
|--------|-------------|
| Scouting | Location being evaluated |
| Pitch Submitted | Awaiting approval |
| Approved | Ready for development |
| In Development | Fit-out in progress |
| Active | Operating location |
| Underperforming | Below targets, needs attention |
| Closed | No longer operating |

**Key Metrics Cards:**
- Revenue this month (vs. last month)
- Locations meeting targets (%)
- Pending pitch approvals count
- New competitor openings this month

**Performance Rankings:**
- Top 5 performing locations
- Bottom 5 locations needing attention
- Most improved locations
- Newest locations performance

**Expansion Pipeline:**
- Pitches by status (Draft, Level 1, Level 2, Level 3, Approved)
- Average time to approval
- Approval rate by region
- Blocked/stalled pitches

**Alerts & Notifications:**
- Location underperforming targets
- Competitor opening nearby existing location
- Pitch pending approval > X days
- Lease renewal approaching

**Filters:**
- By city (Madrid, Barcelona, Prague)
- By region/area
- By franchisee
- By status
- Date range

---

### 3.14 CRM Integration (Future-Ready)

**Target:** ClickUp (project management)

**Sync options (to be defined):**
- Push scouting pitches to ClickUp as tasks
- Sync pitch status both ways
- Export lists to ClickUp
- Sync approval workflow steps

**Implementation:**
- API bridge ready
- Configurable in admin settings
- Webhook support for real-time sync

---

### 3.15 Admin Settings

**Accessible by:** Super Admin and Head Office Exec only

**Sections:**

**User Management:**
- Add new users (email invite)
- Set user role (Super Admin, Head Office Exec, Finance Reviewer, Area Coordinator, Franchisee)
- Assign users to regions/areas
- Assign approval responsibilities
- Deactivate users

**Approval Workflows:**
- Configure number of approval levels (2-4)
- Assign roles to each approval level
- Set approval rules (e.g., skip Level 2 for pitches under €X rent)
- Configure escalation timeouts

**Notifications:**
- Email recipients per approval level
- Email toggle (on/off, default off)
- Configure alert thresholds (underperformance, competitor openings)

**Scoring Parameters:**
- Adjust weights for each scoring factor
- Set opportunity threshold
- Configure competitor threat scoring

**Revenue Settings:**
- Set performance targets per location
- Configure forecast vs. actual thresholds
- Define profitability benchmarks

**Integrations:**
- ClickUp API key (placeholder)
- POS/Sales API endpoint configuration
- Webhook URLs for external systems

**Data Management:**
- Manual data import (CSV upload)
- View last refresh dates per data source
- Competitor data refresh schedule

---

### 3.16 User Mentions

**Feature:** Tag other users in comments with `@DisplayName` syntax to notify them.

**How it works:**
1. User types `@` in any comment field
2. Autocomplete dropdown shows matching users
3. Selecting a user inserts `@DisplayName` into the comment
4. On save, mentioned users receive an in-app notification

**Notification display:**
- Red badge on Activity Log showing unread mention count
- "Mentions" tab in Activity Log lists all mentions
- Each mention shows: who mentioned you, where, comment preview, timestamp
- Click to navigate directly to the comment

**Permissions:**
- All authenticated users can mention any other user
- Users can only see their own mentions
- Admins cannot see others' mentions (privacy)

**MVP scope:**
- In-app notifications only
- No email or Slack notifications

**Future enhancements:**
- Email notifications (with user preference toggle)
- Slack webhook integration
- `@all` to notify everyone with entity access

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

-- Scouting Pitches (with multi-level approval support)
CREATE TABLE pitches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id TEXT REFERENCES cities(id),
  place_id UUID REFERENCES places(id), -- linked property (optional)
  created_by UUID REFERENCES auth.users(id),
  workflow_id UUID REFERENCES approval_workflows(id), -- which workflow to use
  status TEXT DEFAULT 'draft', -- draft, submitted, pending_level_1, pending_level_2, pending_level_3, approved, rejected, returned_for_revision, proceed_with_conditions
  current_level INTEGER DEFAULT 0, -- which approval level (0 = not submitted)
  condition_notes TEXT, -- if proceed_with_conditions
  rejection_level INTEGER, -- which level rejected (if rejected)
  revision_count INTEGER DEFAULT 0, -- how many times resubmitted

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
  final_reviewed_at TIMESTAMPTZ,
  final_reviewed_by UUID REFERENCES auth.users(id),
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

-- Index for efficient comment queries by entity
CREATE INDEX comments_entity_idx ON comments(entity_type, entity_id);

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

-- Fast unread mentions lookup
CREATE INDEX mentions_user_unread_idx ON mentions(mentioned_user_id, is_read)
  WHERE is_read = false;
CREATE INDEX mentions_comment_idx ON mentions(comment_id);

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

-- Approval Workflows (configurable approval chains)
CREATE TABLE approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, -- e.g., "Default 3-Level", "Fast Track 2-Level"
  city_id TEXT REFERENCES cities(id), -- NULL = global default
  num_levels INTEGER NOT NULL DEFAULT 3, -- 2-4 levels supported
  level_1_role TEXT DEFAULT 'area_coordinator', -- role required for level 1
  level_2_role TEXT DEFAULT 'finance_reviewer',
  level_3_role TEXT DEFAULT 'head_office_exec',
  level_4_role TEXT, -- optional 4th level
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pitch Approvals (individual approval records per level)
CREATE TABLE pitch_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id UUID REFERENCES pitches(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL, -- 1, 2, 3, or 4
  approver_id UUID REFERENCES auth.users(id),
  decision TEXT NOT NULL, -- approved, rejected, returned_for_revision
  comments TEXT, -- mandatory for rejections
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX pitch_approvals_pitch_idx ON pitch_approvals(pitch_id);

-- Revenue Data (actual financial performance per location)
CREATE TABLE revenue_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  date DATE NOT NULL,
  source TEXT DEFAULT 'manual', -- manual, pos_api, csv_import

  -- Revenue
  daily_revenue NUMERIC,
  transaction_count INTEGER,
  avg_ticket_size NUMERIC,

  -- Costs
  rent_cost NUMERIC,
  labor_cost NUMERIC,
  supplies_cost NUMERIC,
  other_costs NUMERIC,
  total_costs NUMERIC,

  -- Profitability
  gross_profit NUMERIC,
  net_profit NUMERIC,
  margin_percent NUMERIC,

  -- Metadata
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(place_id, date)
);

CREATE INDEX revenue_data_place_date_idx ON revenue_data(place_id, date);

-- Competitor Metrics (rich competitor data)
CREATE TABLE competitor_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id) ON DELETE CASCADE,

  -- Estimated financials
  estimated_daily_revenue NUMERIC,
  estimated_monthly_revenue NUMERIC,
  revenue_confidence TEXT, -- high, medium, low

  -- Market position
  price_level TEXT, -- €, €€, €€€
  market_share_percent NUMERIC, -- in local area
  specialties TEXT[], -- specialty_coffee, food, pastries, etc.

  -- Competitive intel
  chain_affiliation TEXT, -- brand name if chain
  is_specialty_coffee BOOLEAN DEFAULT false,
  seating_capacity_estimate INTEGER,
  has_outdoor_seating BOOLEAN,

  -- Tracking
  opened_date DATE,
  closed_date DATE, -- NULL if still open
  last_rating NUMERIC,
  last_review_count INTEGER,
  rating_trend TEXT, -- improving, stable, declining

  notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Location Performance Targets (for alerts)
CREATE TABLE performance_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id UUID REFERENCES places(id),
  target_type TEXT NOT NULL, -- daily_revenue, monthly_revenue, margin_percent
  target_value NUMERIC NOT NULL,
  alert_threshold_percent NUMERIC DEFAULT 20, -- alert if X% below target
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance Data (for sales monitoring - expanded)
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

-- Scoring Parameters (legacy - see profitability_benchmarks for new approach)
CREATE TABLE scoring_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weight NUMERIC DEFAULT 0, -- 0 to 1
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PROFITABILITY PREDICTION TABLES
-- ============================================

-- Profitability Benchmarks (Admin-configured, per city)
CREATE TABLE profitability_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- City identifier (one row per city)
  city TEXT NOT NULL UNIQUE,  -- 'madrid', 'barcelona', 'prague', 'vienna', 'zurich'

  -- Revenue assumptions
  avg_ticket_price DECIMAL(10,2) NOT NULL,       -- € per customer
  conversion_rate DECIMAL(5,4) NOT NULL,          -- e.g., 0.025 = 2.5%
  operating_hours_per_day INTEGER NOT NULL,       -- e.g., 12

  -- Cost assumptions
  fixed_monthly_costs DECIMAL(10,2) NOT NULL,     -- € (staff, utilities, etc.)
  variable_cost_per_customer DECIMAL(10,2) NOT NULL, -- € per sale
  typical_setup_cost DECIMAL(10,2) NOT NULL,      -- € one-time

  -- Location multipliers (default to 1.0 if not set)
  near_transit_bonus DECIMAL(5,2) DEFAULT 1.15,   -- e.g., 1.15 = +15%
  near_university_bonus DECIMAL(5,2) DEFAULT 1.10,
  near_office_bonus DECIMAL(5,2) DEFAULT 1.05,
  high_competition_penalty DECIMAL(5,2) DEFAULT 0.85, -- e.g., 0.85 = -15%

  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prospective Locations (User-created POIs for evaluation)
CREATE TABLE prospective_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Location
  city_id TEXT NOT NULL REFERENCES cities(id),
  name TEXT NOT NULL,
  location GEOGRAPHY(POINT) NOT NULL,
  address TEXT,

  -- Property details (manual or from linked Idealista)
  monthly_rent DECIMAL(10,2),
  size_sqm DECIMAL(10,2),
  transfer_fee DECIMAL(10,2),

  -- Idealista linking
  linked_idealista_id UUID REFERENCES places(id),  -- Link to Idealista property

  -- Cached prediction (recalculated when inputs change)
  prediction_json JSONB,  -- Stores full prediction result
  prediction_calculated_at TIMESTAMPTZ,

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for prospective locations
CREATE INDEX prospective_locations_geo_idx
ON prospective_locations USING GIST(location);

-- Footfall Data (migrated from CSV, with collection metadata)
CREATE TABLE footfall_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  city_id TEXT NOT NULL REFERENCES cities(id),
  district TEXT,
  address TEXT,
  location GEOGRAPHY(POINT) NOT NULL,

  -- Hourly traffic counts (average pedestrians per hour)
  hour_0 DECIMAL(10,2),  -- 12am
  hour_1 DECIMAL(10,2),
  hour_2 DECIMAL(10,2),
  hour_3 DECIMAL(10,2),
  hour_4 DECIMAL(10,2),
  hour_5 DECIMAL(10,2),
  hour_6 DECIMAL(10,2),
  hour_7 DECIMAL(10,2),
  hour_8 DECIMAL(10,2),
  hour_9 DECIMAL(10,2),
  hour_10 DECIMAL(10,2),
  hour_11 DECIMAL(10,2),
  hour_12 DECIMAL(10,2),
  hour_13 DECIMAL(10,2),
  hour_14 DECIMAL(10,2),
  hour_15 DECIMAL(10,2),
  hour_16 DECIMAL(10,2),
  hour_17 DECIMAL(10,2),
  hour_18 DECIMAL(10,2),
  hour_19 DECIMAL(10,2),
  hour_20 DECIMAL(10,2),
  hour_21 DECIMAL(10,2),
  hour_22 DECIMAL(10,2),
  hour_23 DECIMAL(10,2),

  -- Data collection metadata (for caveat display)
  data_collection_date DATE,      -- When was this data collected?
  data_source TEXT,               -- e.g., 'municipal_sensors', 'manual_count'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for footfall data (critical for interpolation performance)
CREATE INDEX footfall_data_geo_idx
ON footfall_data USING GIST(location);

-- Cafe Performance (Admin-only, sensitive business data)
-- Used for validating and improving prediction accuracy
CREATE TABLE cafe_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which cafe (existing Miners location)
  place_id UUID NOT NULL REFERENCES places(id),

  -- Performance data
  month DATE NOT NULL,  -- First of month, e.g., '2026-01-01'
  monthly_revenue DECIMAL(10,2),
  monthly_costs DECIMAL(10,2),
  monthly_profit DECIMAL(10,2),
  avg_daily_customers INTEGER,

  -- Notes
  notes TEXT,

  -- Metadata
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One record per cafe per month
  UNIQUE(place_id, month)
);

CREATE INDEX cafe_performance_place_idx ON cafe_performance(place_id);

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
-- Extended user profile (with multi-role support)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT DEFAULT 'franchisee', -- super_admin, head_office_exec, finance_reviewer, area_coordinator, franchisee
  display_name TEXT,
  email TEXT,
  region_id TEXT, -- assigned region (for area coordinators)
  city_ids TEXT[], -- cities this user can access (NULL = all)
  can_approve_level INTEGER, -- which approval level (1, 2, 3, or 4)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Regions (for organizing users and locations)
CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city_id TEXT REFERENCES cities(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security will handle permissions based on role and region

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Profitability Benchmarks: Anyone can read, only admins can write
ALTER TABLE profitability_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view benchmarks"
ON profitability_benchmarks FOR SELECT USING (true);

CREATE POLICY "Only admins can modify benchmarks"
ON profitability_benchmarks FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('super_admin', 'head_office_exec')
  )
);

-- Prospective Locations: Users see their own, admins see all
ALTER TABLE prospective_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prospective locations"
ON prospective_locations FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('super_admin', 'head_office_exec')
  )
);

CREATE POLICY "Users can create own prospective locations"
ON prospective_locations FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own prospective locations"
ON prospective_locations FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own prospective locations"
ON prospective_locations FOR DELETE USING (user_id = auth.uid());

-- Cafe Performance: Only admins can see (sensitive business data)
ALTER TABLE cafe_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view cafe performance"
ON cafe_performance FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('super_admin', 'head_office_exec')
  )
);

CREATE POLICY "Only admins can modify cafe performance"
ON cafe_performance FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('super_admin', 'head_office_exec')
  )
);

-- Footfall Data: Anyone can read (needed for predictions)
ALTER TABLE footfall_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view footfall data"
ON footfall_data FOR SELECT USING (true);
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
| Approval Engine | Custom (Supabase functions) |
| Revenue Integration | POS API / Manual Entry |
| AI Coding Standards | Vercel Agent Skills (react-best-practices, web-design-guidelines) |

### Frontend Performance Patterns

Interactive map features (hover tooltips, shape editing, popup panels) require careful client-side caching to maintain smooth performance with Supabase backend.

**Key patterns:**
- Load all metadata for the current city upfront on map load
- Cache data in React state for instant hover/click responses
- Use SWR for automatic request deduplication and background refresh
- Apply optimistic updates (show changes immediately, sync in background)

See `database-migration-prd.md` Section 16 for detailed implementation patterns and code examples.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER (Browser)                             │
│   Super Admin | Head Office | Finance | Area Coord | Franchisee │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vercel)                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Next.js App                                              │   │
│  │  ├── /[city] — Map view (location scouting)              │   │
│  │  ├── /dashboard — Operations dashboard                   │   │
│  │  ├── /revenue — Revenue & profitability                  │   │
│  │  ├── /competitors — Competitor analysis                  │   │
│  │  ├── /approvals — Pitch approval queue                   │   │
│  │  ├── /pitch/[id] — Pitch detail/form                     │   │
│  │  ├── /list/[id] — List detail                            │   │
│  │  └── /admin — Admin settings                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Components                                               │   │
│  │  ├── MapView (mapcn)                                     │   │
│  │  ├── FilterPanel (glassmorphism)                         │   │
│  │  ├── CitySelector (glassmorphism)                        │   │
│  │  ├── ActivityLog (glassmorphism)                         │   │
│  │  ├── POIPopup (b&w, customized)                          │   │
│  │  ├── PitchForm (b&w)                                     │   │
│  │  ├── ApprovalWorkflow (multi-level review UI)            │   │
│  │  ├── RevenueDashboard (charts, KPIs)                     │   │
│  │  ├── CompetitorAnalysis (benchmarking, trends)           │   │
│  │  ├── OperationsDashboard (portfolio view)                │   │
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
│  │  (5 roles)   │ │  (all data)  │ │  (photos)    │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Edge Functions                                            │  │
│  │  ├── approval-workflow — Multi-level pitch approval       │  │
│  │  ├── revenue-sync — POS data ingestion                    │  │
│  │  └── alerts — Performance/competitor notifications        │  │
│  └──────────────────────────────────────────────────────────┘  │
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
│  │ Daily:     POS Systems → Revenue API → Supabase          │  │
│  │ Daily:     Competitor rating changes → Alert triggers     │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL APIS                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │
│  │ Apify  │ │  OSM   │ │  POS   │ │ClickUp │ │ Email  │        │
│  │        │ │Overpass│ │Systems │ │(future)│ │(alerts)│        │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### Approval Workflow Engine

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Franchisee  │     │    Area      │     │   Finance    │     │  Head Office │
│   submits    │ ──► │  Coordinator │ ──► │   Reviewer   │ ──► │    Exec      │
│   pitch      │     │  (Level 1)   │     │  (Level 2)   │     │  (Level 3)   │
└──────────────┘     └──────┬───────┘     └──────┬───────┘     └──────┬───────┘
                           │                    │                    │
                    ┌──────▼───────┐     ┌──────▼───────┐     ┌──────▼───────┐
                    │   Approve    │     │   Approve    │     │   Approve    │
                    │   Reject     │     │   Reject     │     │   Reject     │
                    │   Return     │     │   Return     │     │   Conditions │
                    └──────────────┘     └──────────────┘     └──────────────┘
```

### Revenue Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  POS System  │     │   n8n Sync   │     │  Supabase    │
│  (per store) │ ──► │   (daily)    │ ──► │  revenue_data│
└──────────────┘     └──────────────┘     └──────────────┘
        │                                        │
        │            ┌──────────────┐            │
        └──────────► │ Manual Entry │ ◄──────────┘
                     │ (fallback)   │
                     └──────────────┘
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

### @Mention Notifications

**Trigger:** User is mentioned in a comment with `@DisplayName`

**Display:** Red badge on Activity Log with count of unread mentions

**Behavior:**
- Badge appears immediately after being mentioned
- Count decreases as mentions are viewed
- Clicking mention navigates to source comment

**Future:** Email/Slack notifications (not in MVP)

---

## 10. Roadmap

### Phase 1: Core Map & Data
- [ ] Set up Supabase (schema, auth, RLS)
- [ ] Set up Next.js + mapcn
- [ ] Build city configs (Madrid, Barcelona, Prague)
- [ ] Import existing scraped data
- [ ] Build filter panel (glassmorphism)
- [ ] Build city selector
- [ ] Build POI popups (customized mapcn)
- [ ] Deploy to Vercel

### Phase 2: User Features & Multi-Role Auth
- [ ] User authentication flow with 5 roles
- [ ] Role-based permissions (RLS policies)
- [ ] User profile management
- [ ] Region/area assignments for users
- [ ] Lists (create, add items, visit logs)
- [ ] Custom POIs & categories
- [ ] Areas of interest (polygon drawing)
- [ ] Activity log component
- [ ] Comments & tags
- [ ] User mentions (@tagging in comments)
- [ ] Mentions notification badge in Activity Log

### Phase 3: Scouting & Basic Pitches
- [ ] Pitch form (all fields from brief)
- [ ] Basic pitch submission flow
- [ ] Scouting reports (quick reports)
- [ ] Badge counts on markers
- [ ] Email notifications (optional)

### Phase 4: Multi-Level Approval Workflow
- [ ] Approval workflow configuration UI
- [ ] 3-level approval flow (Area → Finance → Exec)
- [ ] Per-step approval tracking
- [ ] Rejection with mandatory comments
- [ ] Return for revision flow
- [ ] Approval queue dashboard per role
- [ ] Approval history on pitch detail

### Phase 5: Exports & Polish
- [ ] CSV export (lists, pitches)
- [ ] PDF export (branded, with photos option)
- [ ] Admin settings panel (expanded)
- [ ] User management UI (5 roles)
- [ ] Approval workflow settings UI
- [ ] Final UI polish

### Phase 6: Profitability Prediction

**6a: Core Algorithm & Data Setup**
- [ ] Create Supabase tables (profitability_benchmarks, footfall_data, prospective_locations, cafe_performance)
- [ ] Migrate footfall_data.csv to Supabase with collection date metadata
- [ ] Set up Row Level Security policies
- [ ] Build traffic interpolation function (Inverse Distance Weighting)
- [ ] Build profit calculation function
- [ ] Create `/api/predict` endpoint
- [ ] Seed initial benchmark values for each city (placeholders, to be updated by client)

**6b: Prospective Locations POI Type**
- [ ] Add "Prospective Location" as new POI category
- [ ] Create "Add Prospective Location" tool in draw toolbar
- [ ] Build prospective location creation modal
- [ ] Save prospective locations to Supabase
- [ ] Display prospective locations on map with distinct marker
- [ ] Add prospective locations toggle in sidebar filters

**6c: Prediction Display in Popups**
- [ ] Create ProfitabilityCard component
- [ ] Integrate into Idealista property popups
- [ ] Integrate into Prospective Location popups
- [ ] Build confidence indicator UI (●●● / ●●○ / ●○○)
- [ ] Build data caveat tooltip with full explanation
- [ ] Display profit as ranges (€X - €Y format)

**6d: Idealista Linking**
- [ ] Create "Link Idealista" modal component
- [ ] Build `/api/idealista/nearby` endpoint
- [ ] Add "Link to Idealista" option in prospective location creation
- [ ] Auto-fill rent/size when property is linked
- [ ] Recalculate prediction when property is linked

**6e: Admin Benchmark Settings**
- [ ] Create benchmark settings UI in Admin panel
- [ ] City selector dropdown
- [ ] Form fields for all benchmark values
- [ ] Save to Supabase with audit trail

### Phase 7: Revenue & Profitability Dashboard
- [ ] Revenue data entry UI (manual)
- [ ] CSV import for bulk revenue data
- [ ] Revenue dashboard (per location)
- [ ] Portfolio revenue summary
- [ ] Profitability KPIs (margin, ROI)
- [ ] Forecast vs. actual comparison
- [ ] Performance targets and alerts
- [ ] Map overlay (color by profitability)

### Phase 8: POS Integration
- [ ] POS API bridge (configurable endpoint)
- [ ] Daily revenue sync via n8n
- [ ] Data validation and deduplication
- [ ] Auto-alerts for missing data

### Phase 9: Competitor Analysis
- [ ] Competitor metrics data model
- [ ] Competitor detail popups (rich data)
- [ ] Market share visualization
- [ ] Competitive benchmarking view
- [ ] Competitor opening/closing alerts
- [ ] Rating trend tracking
- [ ] Revenue estimate UI (Finance Reviewer+)

### Phase 10: Franchise Operations Dashboard
- [ ] Portfolio overview dashboard
- [ ] Location status tracking
- [ ] Performance rankings
- [ ] Expansion pipeline view
- [ ] Alert center (all notifications)
- [ ] Multi-city filters

### Phase 11: Profitability Prediction V2 (Future)
- [ ] Scenario Simulator (sliders to adjust assumptions, live prediction updates)
- [ ] Save/compare multiple scenarios per location

### Phase 12: Profit Potential Heat Map (Future)
- [ ] Rough grid calculation across visible map area
- [ ] Toggle on/off like traffic overlay
- [ ] Color coding (green = high potential, red = low)
- [ ] Performance optimization (caching, background calculation)

### Phase 13: Prediction Validation (Future)
- [ ] Compare predictions to actual performance after cafe opens
- [ ] Track prediction accuracy over time
- [ ] Auto-adjust benchmarks based on real data

### Phase 14: Integrations (Future)
- [ ] ClickUp API integration
- [ ] Webhook support for external systems
- [ ] Additional POS system connectors

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
| **Profitability Prediction** | | |
| Provide avg ticket price per city | Not started | Client |
| Provide conversion rate estimate per city | Not started | Client |
| Provide fixed monthly costs breakdown per city | Not started | Client |
| Provide variable cost per customer per city | Not started | Client |
| Provide typical setup/build-out cost per city | Not started | Client |
| Provide footfall data collection date | Not started | Client/Dev |
| Provide location multipliers (transit bonus, etc.) | Not started | Client |
| Provide real cafe performance data (monthly revenue/profit) | Not started | Client |
| **Multi-Level Approvals** | | |
| Confirm approval level count (2-4) | Not started | Client |
| Define approval rules/conditions | Not started | Client |
| Assign initial users to roles | Not started | Client |
| **Revenue & Profitability** | | |
| Identify POS system for integration | Not started | Client |
| Define revenue KPIs and targets | Not started | Client |
| Provide sample revenue data format | Not started | Client |
| **Competitor Analysis** | | |
| Define competitor revenue estimation method | Not started | Dev/Client |
| Identify competitor data sources beyond Google Maps | Not started | Dev |
| Define market share calculation methodology | Not started | Dev/Client |

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

### C. Profitability Benchmark Defaults (Placeholders)

**⚠️ These are placeholder values. Replace with real data from The Miners before launch.**

| City | Avg Ticket | Conversion | Fixed Costs | Variable Cost | Setup Cost | Operating Hours |
|------|------------|------------|-------------|---------------|------------|-----------------|
| Madrid | €5.20 | 2.5% | €6,000 | €1.50 | €80,000 | 12 |
| Barcelona | €5.50 | 2.5% | €6,500 | €1.50 | €85,000 | 12 |
| Prague | €3.80 | 3.0% | €4,000 | €1.00 | €50,000 | 12 |
| Vienna | €6.00 | 2.0% | €8,000 | €1.80 | €100,000 | 12 |
| Zurich | €8.00 | 2.0% | €12,000 | €2.50 | €150,000 | 12 |

**Location Multipliers (all cities):**

| Multiplier | Default Value | Meaning |
|------------|---------------|---------|
| Near transit bonus | 1.15 | +15% traffic if transit within 500m |
| Near university bonus | 1.10 | +10% traffic if university within 500m |
| Near office bonus | 1.05 | +5% traffic if office center within 500m |
| High competition penalty | 0.85 | -15% conversion if 3+ cafes within 500m |

### D. File References

- Logo (black): `THEMINERS_LOGO_BLACK_UP.png`
- Logo (white): `THEMINERS_LOGO_WHITE_UP.png`
- Lease Decision Brief template: `Miners_Lease_Decision_Brief.docx`
