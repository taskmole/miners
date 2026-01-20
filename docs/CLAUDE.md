# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## About This Project

Location scouting tool for **The Miners** coffee franchise. Helps franchisees and head office find and evaluate new cafe locations across Madrid, Barcelona, and Prague. Shows an interactive map with cafes, properties, transit, offices, and other POIs.

**Full requirements**: See `miners-location-scout-prd.md` for complete PRD including database schema, user roles, and feature specifications.

## About Me

I am NOT a programmer. Explain everything simply. No jargon without explanation.

## Critical Rules

### Before ANY Code Change
1. Tell me which files you plan to modify
2. Explain what you're changing in plain English
3. Wait for my approval before writing code

### Never Do This
- Never modify files I didn't ask about
- Never refactor or "improve" code I didn't mention
- Never delete code without explicit permission
- Never change database schema without warning me first

### Always Do This
- Show me the exact files you're touching
- Explain errors like I'm 5 years old
- Add comments in code explaining what each section does
- Test your changes work before saying you're done
- Write simple, readable code. Avoid clever abstractions

## How to Help Me Find Files

When I describe something visual (like "the icons on the map"), YOU find the right file. I don't know file paths. Ask clarifying questions if needed.

## Build & Development Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Current Implementation Status

The codebase is a **Phase 1 prototype** with CSV-based data loading. The PRD describes the full vision with Supabase backend.

### What's Implemented
- Interactive map with MapLibre GL (custom React wrapper)
- POI markers: cafes, properties, transit, offices, shopping, universities, dorms
- Filter panel with layer toggles and rating slider
- Traffic heatmap overlay (by hour)
- Population density choropleth overlay
- City selector (basic)
- Drawing tools (polygons/lines via MapboxDraw, persisted to localStorage)
- Activity log component (UI shell)

### What's Planned (per PRD)
- Supabase backend (PostgreSQL + Auth + Storage)
- User authentication (Admin/Franchisee roles)
- Scouting Pitches workflow (draft → submitted → approved/rejected)
- Lists with visit logs
- Custom POIs & categories
- Comments & tags on any entity
- CSV/PDF exports
- AI location scoring with configurable weights
- ClickUp and POS integrations

## Architecture

### Current Data Flow (Prototype)

```
CSV files (root) → API routes → React hooks → Components
```

**CSV Data Sources**:
- `data.csv` - Main cafe data (**semicolon-delimited**, not comma)
- `cafe_info.csv` - Enriched cafe info (photos, social links)
- `idealista.csv` - Property rental listings
- `other.csv` - Transit, offices, shopping, universities, dorms
- `footfall_data.csv` - Pedestrian traffic by hour (**⚠️ has coordinate bug**: values like `40.430.469` need regex fix to `40.430469`)
- `density.csv` - Population density
- `metro.geojson` - Metro station boundaries

**API Routes** (`src/app/api/`):
- `/api/data?type=<data|cafes|properties|other|metro>` - CSV/GeoJSON → JSON
- `/api/traffic?hour=<0-23>` - GeoJSON for traffic heatmap
- `/api/population` - GeoJSON for population choropleth
- `/api/income` - GeoJSON for income distribution

### Target Architecture (per PRD)

```
Supabase (PostgreSQL + Auth + Storage)
    ↕
Next.js App (Vercel)
    ↕
n8n Data Pipeline → Apify scrapers, OSM Overpass
```

### Component Hierarchy

```
page.tsx (Home)
├── CitySelector          # City dropdown (top-left)
├── Sidebar               # Filter controls, traffic/population toggles
├── ActivityLog           # Event log panel
└── EnhancedMapContainer  # Main map with all markers
    ├── Map               # MapLibre GL wrapper
    ├── MapControls       # Zoom, locate, compass
    ├── OverlayLayerManager  # Traffic/population layers
    ├── MapDraw + DrawToolbar  # Polygon drawing
    └── MapMarker[]       # POI markers with popups
```

### Map Component System (`src/components/ui/map.tsx`)

Custom MapLibre GL wrapper:
- `Map` - Container with theme-aware style switching (Carto basemaps)
- `MapMarker` - Marker with `MarkerContent`, `MarkerPopup`, `MarkerTooltip`, `MarkerLabel` children
- `MapControls` - Configurable zoom/locate/compass buttons
- `MapRoute` - GeoJSON line rendering
- `MapClusterLayer` - Point clustering
- `useMap()` - Hook to access map instance

### Data Hooks (`src/hooks/`)

- `useMapData` - Fetches all POI data with module-level caching to prevent duplicate fetches
- `useOverlayData` - Lazy-loads traffic/population overlays on demand with per-hour caching
- `useMapDraw` - Manages MapboxDraw state, persists features to localStorage

## Tech Stack

- **Frontend**: React, Next.js
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Maps**: MapLibre GL (Carto basemaps: positron light, dark-matter dark)
- **Styling**: Tailwind CSS v4 with CSS variables, glassmorphism panels
- **UI components**: shadcn/ui (new-york style) with Radix primitives
- **Path alias**: `@/*` maps to `./src/*`
- **Drawing persistence**: localStorage key `miners-drawn-features`

## AI Coding Skills (Vercel Agent Skills)

This project uses [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills) for best practices enforcement. Skills are installed in `.claude/skills/`.

**Installed skills:**

| Skill | What it does | When it activates |
|-------|-------------|-------------------|
| `react-best-practices` | 45 React/Next.js performance rules | Writing/reviewing React code |
| `web-design-guidelines` | 100+ UI accessibility & UX rules | Reviewing UI code |
| `vercel-deploy-claimable` | One-command Vercel deployment | Say "deploy to Vercel" |

**Key React rules to follow:**
- Avoid barrel imports (import directly from source files)
- Use `Promise.all()` for parallel async operations
- Use `next/dynamic` for heavy components
- Minimize data passed to client components
- Use SWR for client-side data fetching

**To review UI code:** Ask "review my UI" or "check accessibility"

**To deploy:** Ask "deploy to Vercel"

## Project Structure

```
src/
  app/            # Next.js pages and API routes
    api/          # API endpoints (data, traffic, population)
  components/     # UI pieces (buttons, cards, map elements)
    ui/           # Reusable UI components (map, sliders, etc.)
  hooks/          # Reusable logic (useMapData, useOverlayData, useMapDraw)
  lib/            # Utilities, helpers
  types/          # TypeScript type definitions
```

## Key Patterns

- **Module-level caching**: `useMapData.ts` uses a global cache variable to prevent duplicate API calls across component re-renders
- **Zoom-based rendering**: Map shows clustered points at low zoom, individual icons at zoom level 14+
- **Lazy overlay loading**: Traffic/population data only fetched when user enables the toggle
- **Custom events**: Components communicate via `navigate-to-location` and `navigate-and-open-popup` window events
- **State persistence**: User drawings stored in localStorage key `miners-drawn-features`; lists stored via `ListsContext`

## Common Tasks

### Changing Map Icons
Files likely in: `src/components/MapContainer.tsx` or `src/components/ui/map.tsx` - look for MapMarker or icon rendering code

### Changing Sidebar Filters
Files likely in: `src/components/Sidebar.tsx` - look for filter toggles and sliders

### Database Changes
Always check Supabase dashboard first. Never run destructive queries without my approval. Current prototype uses CSV files, but target architecture uses Supabase.

## Git Workflow

- Commit after every working feature
- Use clear commit messages: "added X" or "fixed Y"
- Create branch for risky experiments

## When Something Breaks

1. Copy the full error message
2. Tell me which file the error is in
3. Explain what the error means simply
4. Suggest 2-3 possible fixes with tradeoffs
5. Wait for me to pick one

## Response Format

- Short sentences
- Bullet points for steps
- Code blocks with file paths as comments
- No unnecessary caveats or warnings

## POI Categories

Filter IDs: `cafe`, `eu_coffee_trip`, `regular_cafe`, `property`, `transit`, `metro`, `office`, `shopping`, `high_street`, `dorm`, `university`

## User Roles (Target)

| Role | Description |
|------|-------------|
| Admin | Head office - can approve pitches, manage users, edit scoring |
| Franchisee | Operators - can create pitches, lists, custom POIs |

## Database Schema

See PRD Section 5 for full Supabase schema. Key tables:
- `places` - All POIs with spatial index
- `pitches` - Scouting pitch submissions with workflow status
- `lists` / `list_items` - Saved POI collections with visit logs
- `areas` - User-drawn polygons
- `activity_log` - Track user changes
- `scoring_params` - AI scoring weights
