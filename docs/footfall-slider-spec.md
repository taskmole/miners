# Footfall Time Picker — Data Format Specification

## Component
`src/components/FootfallTimePicker.tsx`

## Data Source
Uses the existing traffic API endpoint — no new endpoints needed.

### Grouped endpoint (for 24h bar chart)
```
GET /api/traffic?grouped=true
```

**Response shape:**
```json
{
  "locations": [
    {
      "distrito": "Centro",
      "direccion": "Gran Via 42",
      "lat": 40.4201,
      "lon": -3.7058,
      "hourly": [12, 8, 5, 3, 2, 4, 15, 45, 82, 95, 110, 125, 140, 135, 120, 115, 130, 145, 120, 95, 70, 45, 30, 18]
    }
  ]
}
```

- `hourly` array: 24 numbers (index 0 = midnight, index 12 = noon)
- Component aggregates across all locations by averaging `hourly[hour]` per hour
- Cached for 1 hour on the server

### Hourly filtering endpoint (for map update)
```
GET /api/traffic?hour=13
```

- Returns GeoJSON FeatureCollection filtered to that hour
- Already used by the existing sidebar slider
- Component calls `onTrafficHourChange(hour)` which updates the parent state — no direct API call needed from this component for map filtering

## Database Tables

**`traffic_data`** (normalized):
- `hora` (integer 0-23) — hour of day
- `avg_count` (numeric) — average pedestrian count
- `distrito`, `direccion` — location identifiers
- `location` (geography POINT) — coordinates

**`footfall_data`** (denormalized):
- `hour_0` through `hour_23` (numeric) — one column per hour
- `district`, `address` — location identifiers
- `location` (geography POINT) — coordinates

## Component Props
```typescript
interface FootfallTimePickerProps {
  trafficEnabled: boolean;      // Show component when true
  trafficHour: number;          // Current selected hour (0-23)
  onTrafficHourChange: (hour: number) => void;  // Callback to update hour
}
```

## Behavior
- Only visible on mobile (< 640px) when `trafficEnabled` is true
- Hides when any bottom sheet is open (detected via SheetContext)
- Collapsed state: 52px bar with hour, mini sparkline, count
- Expanded state: 200px with drag handle, bar chart, time labels, quick-pick pills
- In landscape mode, only shows collapsed state
- Bar chart supports tap and drag/scrub interaction via pointer events
- Quick-pick pills: Now, Morning (7-9), Lunch (12-2), Evening (5-7), Night (8-11)
- First-time tooltip auto-dismisses after 3 seconds, stored in localStorage
