# Mobile UX Audit — Miners Location Scout

**Date:** 2026-03-09
**Viewport tested:** iPhone SE (375×667)
**Design system reference:** /docs/design-system.md (44px minimum touch target)

---

## Summary

Most interactive elements are **below the 44px minimum touch target**. The app is usable on desktop but frustrating on mobile — checkboxes, buttons, sliders, and map markers are all too small to tap reliably with a thumb.

---

## 1. Map Markers & Clustering

| Element | File | Current Size | Minimum | Status |
|---------|------|-------------|---------|--------|
| Default POI marker | ui/map.tsx | 36×36px (w-9 h-9) | 44px | FAIL |
| Small POI marker | ui/map.tsx | 28×28px (w-7 h-7) | 44px | FAIL |
| Large POI marker | ui/map.tsx | 44×44px (w-11 h-11) | 44px | PASS |
| Unclustered point | ui/map.tsx | 24px diameter (r=6) | 44px | FAIL |
| Small cluster | ui/map.tsx | 40px diameter (r=20) | 44px | BORDERLINE |
| Medium cluster | ui/map.tsx | 60px diameter (r=30) | 44px | PASS |
| Large cluster | ui/map.tsx | 80px diameter (r=40) | 44px | PASS |
| Popup close button | ui/map.tsx | 44×44 mobile / 40×40 desktop | 44px | MIXED |

**How markers work:** MapLibre GL HTML markers (DOM-based, not canvas). Touch handlers with 10px drag threshold. Native clustering at source level (radius 50, max zoom 14).

---

## 2. Filter Checkboxes & Controls

| Element | File | Current Size | Minimum | Status |
|---------|------|-------------|---------|--------|
| All checkboxes | ui/checkbox.tsx | 16×16px (size-4) | 44px | FAIL |
| Slider thumb | ui/slider.tsx | 16×16px (size-4) | 44px | FAIL |
| Slider track | ui/slider.tsx | 6px height (h-1.5) | 44px | FAIL |
| Switch toggle | ui/switch.tsx | 18×32px container | 44px | FAIL |
| Switch thumb | ui/switch.tsx | 16×16px | 44px | FAIL |

**15+ filter controls in sidebar**, all undersized.

---

## 3. Buttons & Interactive Elements

| Element | File | Current Size | Minimum | Status |
|---------|------|-------------|---------|--------|
| Button default | ui/button.tsx | 36px (h-9) | 44px | FAIL |
| Button sm | ui/button.tsx | 32px (h-8) | 44px | FAIL |
| Button lg | ui/button.tsx | 40px (h-10) | 44px | BORDERLINE |
| Button touch | ui/button.tsx | 48px (h-12) | 44px | PASS |
| Icon button | ui/button.tsx | 36×36px (size-9) | 44px | FAIL |
| Icon-sm button | ui/button.tsx | 32×32px (size-8) | 44px | FAIL |
| Icon-lg button | ui/button.tsx | 40×40px (size-10) | 44px | BORDERLINE |
| Icon-touch button | ui/button.tsx | 48×48px (size-12) | 44px | PASS |
| AddToListButton | AddToListButton.tsx | 32px (size="sm") | 44px | FAIL |
| CreateTripButton | CreateTripButton.tsx | 32px (size="sm") | 44px | FAIL |
| CreateTripButton compact | CreateTripButton.tsx | ~24px (h-auto py-1) | 44px | FAIL |
| HideButton | HideButton.tsx | ~20×20px icon only | 44px | FAIL |
| MobilePanel close | mobile-panel.tsx | 28×28px (w-7 h-7) | 44px | FAIL |
| BottomSheet close | bottom-sheet.tsx | 40×40px | 44px | BORDERLINE |
| Dialog close | dialog.tsx | auto (not sized) | 44px | FAIL |
| Dropdown items | dropdown-menu.tsx | ~32px height | 44px | FAIL |
| Accordion trigger | accordion.tsx | ~32px + text | 44px | BORDERLINE |
| Input fields | input.tsx | 36px (h-9) | 44px | FAIL |

---

## 4. Elements That PASS

| Element | File | Size | Status |
|---------|------|------|--------|
| MobileBottomNav items | MobileBottomNav.tsx | 56px height | PASS |
| MobileSelect trigger | mobile-select.tsx | 48px height | PASS |
| MobileSelect options | mobile-select.tsx | 56px height | PASS |
| MapStyleSwitcher (mobile) | MapStyleSwitcher.tsx | 44×44px | PASS |
| DrawToolbar collapsed | DrawToolbar.tsx | 44×44px | PASS |

---

## 5. Footfall / Traffic Data Available

| Aspect | Details |
|--------|---------|
| Data source | public/data/footfall_data.csv (720 rows) |
| Granularity | Hourly (24 hours per location) |
| Columns | hora, distrito, direccion, latitude, longitude, avg_count |
| DB tables | `traffic_data` (normalized), `footfall_data` (denormalized hour_0–hour_23) |
| API endpoint | /api/traffic?hour=N or ?grouped=true |
| Current UI | Toggle in sidebar + hour number selector (desktop-only UX) |
| Missing | No mobile-friendly bottom slider for hour selection |

---

## Files Requiring Changes

1. `src/components/ui/checkbox.tsx` — 16px → needs enlargement
2. `src/components/ui/slider.tsx` — 16px thumb → needs enlargement
3. `src/components/ui/switch.tsx` — 18×32px → needs enlargement
4. `src/components/ui/button.tsx` — default sizes too small for mobile
5. `src/components/ui/map.tsx` — marker sizes, cluster point sizes
6. `src/components/EnhancedMapContainer.tsx` — marker variant selection
7. `src/components/ui/dropdown-menu.tsx` — item height
8. `src/components/ui/accordion.tsx` — trigger height
9. `src/components/AddToListButton.tsx` — button size
10. `src/components/CreateTripButton.tsx` — button size
11. `src/components/HideButton.tsx` — touch target
12. `src/components/ui/mobile-panel.tsx` — close button
13. `src/components/ui/bottom-sheet.tsx` — close button
14. `src/components/ui/dialog.tsx` — close button
15. `src/components/ui/input.tsx` — height
16. **NEW:** Footfall hours slider component (bottom of mobile screen)
