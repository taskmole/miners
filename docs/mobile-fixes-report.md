# Mobile UX Fixes — Sprint Report

**Date:** 2026-03-09
**Branch:** `mobile-ux-fixes`
**Target user:** Coffee chain scout, one-handed iPhone use

---

## What Was Done

### Fix 1: Map Markers & Filter Checkboxes
**Problem:** Map markers (36px), checkboxes (16px), sliders (16px), and switches (18×32px) were too small to tap one-handed on iPhone.

**Solution:**
- Map markers: 36→44px (default), 28→36px (small), 44→48px (large) on mobile
- Unclustered dots: 12→20px with invisible 12px stroke for ~44px touch zone
- Small clusters: 40→48px diameter
- Checkboxes: 16→22px with full-row 48px tap targets
- Slider thumbs: 16→28px with 8px track
- Switches: 18×32→28×48px
- Added active:scale-90 tap feedback, removed sticky hover states on mobile
- All changes mobile-only via `md:` prefix — desktop unchanged

**Files changed:** checkbox.tsx, slider.tsx, switch.tsx, map.tsx, EnhancedMapContainer.tsx, Sidebar.tsx

### Fix 2: All Buttons & Interactive Elements
**Problem:** Default buttons (36px), small buttons (32px), dropdown items (~32px), and icon buttons were below 44px minimum touch target.

**Solution:**
- AddToListButton: sm→lg (44px) on mobile
- CreateTripButton: sm→lg (44px) on mobile, compact→40px
- HideButton: explicit 40×40px container
- Input fields: 36→44px
- Dropdown menu items: 32→44px min-height
- Dialog close button: explicit 40×40px
- Disambiguation list items: 48px min-height
- Button gaps: 8→12px on mobile

**Files changed:** input.tsx, dropdown-menu.tsx, dialog.tsx, AddToListButton.tsx, CreateTripButton.tsx, HideButton.tsx, EnhancedMapContainer.tsx, DisambiguationPopup.tsx

### Fix 3: Footfall Hours Slider (New Feature)
**Problem:** Traffic hour selector buried in sidebar, requires precision drag — unusable one-handed while walking.

**Solution:** New `FootfallTimePicker` component:
- Fixed above bottom nav in the thumb zone
- Collapsed: 52px glassmorphism bar with hour, mini sparkline, pedestrian count
- Expanded: 24h bar chart (tap/scrub to select hour), quick-pick pills (Now, Morning, Lunch, Evening, Night)
- Uses existing `/api/traffic?grouped=true` — no backend changes
- Hides when sheets are open, landscape-aware, first-time tooltip
- Follows design system: glassmorphism, spacing, typography, colors

**Files created:** FootfallTimePicker.tsx, footfall-slider-spec.md
**Files changed:** page.tsx

---

## Verification

| Phase | Result |
|-------|--------|
| Audit | 15+ undersized elements identified |
| UX proposals | Researched, specific, approved by orchestrator |
| Implementation | All 3 fixes match approved proposals |
| Build | npm run build passes after every commit |
| Verification | 65/65 checks PASS |
| Desktop | All changes use responsive md: prefix — desktop unchanged |

---

## Git Log

```
bac98ca feat: add footfall hours time picker for mobile
cf6bb54 fix: enlarge all buttons and interactive elements for mobile touch targets
d5672df fix: enlarge map markers and filter controls for mobile touch targets
```

---

## Documentation Created

- `/docs/mobile-audit.md` — Pre-fix audit of all interactive elements
- `/docs/mobile-ux-proposals.md` — Researched UX proposals (approved)
- `/docs/footfall-slider-spec.md` — Data format for the time picker
- `/docs/mobile-fixes-verification.md` — Element-by-element verification
- `/docs/mobile-fixes-report.md` — This report
