# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Location scouting tool for **The Miners** coffee franchise. Helps franchisees and head office find and evaluate new cafe locations across Madrid, Barcelona, and Prague.

**Full requirements**: See `miners-location-scout-prd.md` for complete PRD including database schema, user roles, and feature specifications.

## Working Guidelines

You are helping a non-technical founder build software.
- Explain what you're doing in simple terms before doing it.
- Never modify files I didn't ask you to change.
- Always ask before deleting or rewriting existing code.
- When you make changes, list exactly which files you touched.
- If you're unsure, ask me first.
- Write simple, readable code. Avoid clever abstractions.
- Add comments explaining what each section does.

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
- `data.csv` - Main cafe data (semicolon-delimited)
- `cafe_info.csv` - Enriched cafe info (photos, social links)
- `idealista.csv` - Property rental listings
- `other.csv` - Transit, offices, shopping, universities, dorms
- `footfall_data.csv` - Pedestrian traffic by hour
- `density.csv` - Population density

**API Routes** (`src/app/api/`):
- `/api/data?type=<data|cafes|properties|other>` - CSV → JSON
- `/api/traffic?hour=<0-23>` - GeoJSON for traffic heatmap
- `/api/population` - GeoJSON for population choropleth

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

## Key Technical Details

- **Path alias**: `@/*` maps to `./src/*`
- **Styling**: Tailwind CSS v4 with CSS variables, glassmorphism panels
- **UI components**: shadcn/ui (new-york style) with Radix primitives
- **Map tiles**: Carto basemaps (positron light, dark-matter dark)
- **Drawing persistence**: localStorage key `miners-drawn-features`

## POI Categories

Filter IDs: `cafe`, `eu_coffee_trip`, `regular_cafe`, `property`, `transit`, `office`, `shopping`, `high_street`, `dorm`, `university`

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
