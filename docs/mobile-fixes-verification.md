# Mobile UX Fixes — Verification Report

**Date:** 2026-03-09
**Build status:** PASS (npm run build succeeds)

## Fix 1: Map Markers & Filter Checkboxes

| Element | Spec Says | Actual | Status |
|---------|-----------|--------|--------|
| Checkbox mobile | 22px | size-[22px] md:size-4 | PASS |
| Checkbox desktop | 16px | md:size-4 | PASS |
| Checkbox border-radius | 6px mobile | rounded-[6px] md:rounded-[4px] | PASS |
| Check icon mobile | 18px | size-[18px] md:size-3.5 | PASS |
| Slider thumb mobile | 28px | size-7 md:size-4 | PASS |
| Slider track mobile | 8px | h-2 md:h-1.5 | PASS |
| Slider thumb shadow | shadow-md mobile | shadow-md md:shadow-sm | PASS |
| Switch track mobile | 28×48px | h-7 w-12 md:h-[1.15rem] md:w-8 | PASS |
| Switch thumb mobile | 24px | size-6 md:size-4 | PASS |
| Unclustered points | radius 10 (was 6) | circle-radius: 10 | PASS |
| Unclustered tap zone | invisible stroke | circle-stroke-width: 12, opacity: 0 | PASS |
| Small cluster | radius 24 (was 20) | 24 at both paint locations | PASS |
| Marker default mobile | 44px | w-11 h-11 md:w-9 md:h-9 | PASS |
| Marker small mobile | 36px | w-9 h-9 md:w-7 md:h-7 | PASS |
| Marker large mobile | 48px | w-12 h-12 md:w-11 md:h-11 | PASS |
| Marker tap feedback | active:scale-90 | active:scale-90 | PASS |
| Marker hover desktop-only | md:hover:scale-125 | md:hover:scale-125 | PASS |
| Sidebar row padding | py-3 md:py-1.5 | py-3 md:py-1.5 | PASS |
| Sidebar row spacing | space-y-2 md:space-y-1 | space-y-2 md:space-y-1 | PASS |
| Sidebar inline switch | h-7 w-12 md:h-5 md:w-9 | h-7 w-12 md:h-5 md:w-9 | PASS |
| Toggle buttons | py-2.5 md:py-1.5 | py-2.5 md:py-1.5 | PASS |

## Fix 2: All Buttons & Interactive Elements

| Element | Spec Says | Actual | Status |
|---------|-----------|--------|--------|
| Input height | h-11 md:h-9 | h-11 md:h-9 | PASS |
| Dropdown items | py-3 md:py-1.5 min-h-[44px] | py-3 md:py-1.5 min-h-[44px] md:min-h-0 | PASS |
| Dropdown checkbox items | py-3 md:py-1.5 min-h-[44px] | py-3 md:py-1.5 min-h-[44px] md:min-h-0 | PASS |
| Dialog close button | w-10 h-10 mobile | w-10 h-10 md:w-auto md:h-auto | PASS |
| AddToListButton | size="lg" | size="lg" md:h-8 | PASS |
| CreateTripButton default | size="lg" | size="lg" md:h-8 | PASS |
| CreateTripButton compact | h-10 mobile | h-10 md:h-auto | PASS |
| HideButton | w-10 h-10 | w-10 h-10 | PASS |
| Disambiguation items | min-h-[48px] mobile | p-3 md:p-2.5 min-h-[48px] md:min-h-0 | PASS |
| Popup button gaps | gap-3 md:gap-1.5 | gap-3 md:gap-1.5 | PASS |

## Fix 3: Footfall Hours Slider

| Element | Spec Says | Actual | Status |
|---------|-----------|--------|--------|
| Component exists | FootfallTimePicker.tsx | Created | PASS |
| Collapsed height | 52px | h-[52px] | PASS |
| Glassmorphism bg | white/75 blur(16px) | bg-white/75 backdrop-blur-[16px] | PASS |
| Glassmorphism border | white/40 | border-white/40 | PASS |
| Glassmorphism shadow | Full spec | Exact match | PASS |
| Border radius collapsed | 16px | rounded-[16px] | PASS |
| Border radius expanded | 24px top, 16px bottom | rounded-t-[24px] rounded-b-[16px] | PASS |
| Z-index | 40 | z-40 | PASS |
| Position | Above bottom nav + safe area | bottom-[calc(56px+env(safe-area-inset-bottom))] | PASS |
| Clock icon | 20px zinc-500 | w-5 h-5 text-zinc-500 | PASS |
| Hour label | 14px font-semibold | text-sm font-semibold | PASS |
| Mini sparkline | flex, 24px tall | flex h-6 | PASS |
| Count display | font-bold + ppl/hr | text-sm font-bold + text-[11px] ppl/hr | PASS |
| Drag handle | 40×4px | w-10 h-1 | PASS |
| Bar chart height | 96px / 72px short | h-24 max-h-[72px] sm:max-h-24 | PASS |
| Bar gap | 2px | gap-[2px] | PASS |
| Selected bar | blue-500 | bg-blue-500 | PASS |
| Selected dot | 6px blue-500 | w-1.5 h-1.5 bg-blue-500 | PASS |
| Time labels | 11px font-medium zinc-400 | text-[11px] font-medium text-zinc-400 | PASS |
| Quick picks | 5 presets | Now, Morning, Lunch, Evening, Night | PASS |
| Quick pick height | 36px | h-9 | PASS |
| Quick pick selected | zinc-900 text-white | bg-zinc-900 text-white border-zinc-900 | PASS |
| Touch/drag support | Pointer events | onPointerDown/Move/Up/Cancel | PASS |
| Data endpoint | /api/traffic?grouped=true | fetch("/api/traffic?grouped=true") | PASS |
| Hides when sheet open | activeSheet check | Returns null when activeSheet truthy | PASS |
| Mobile only | isMobile check | Returns null when !isMobile | PASS |
| Landscape collapsed only | isLandscape check | canExpand = !isLandscape | PASS |
| First-time tooltip | 3s, localStorage | localStorage + 3000ms timer | PASS |
| Wired in page.tsx | Above MobileBottomNav | Rendered before MobileBottomNav | PASS |
| Data spec doc | docs/footfall-slider-spec.md | Created with full spec | PASS |

## Desktop Preservation

| Element | Desktop Value | Preserved Via | Status |
|---------|-------------|---------------|--------|
| Checkboxes | 16px | md:size-4 | PASS |
| Slider thumb | 16px | md:size-4 | PASS |
| Switch | 18×32px | md:h-[1.15rem] md:w-8 | PASS |
| Input | 36px | md:h-9 | PASS |
| Dropdown items | ~32px | md:py-1.5 md:min-h-0 | PASS |
| Buttons | sm sizes | md:h-8 | PASS |
| Markers | 36px default | md:w-9 md:h-9 | PASS |
| FootfallTimePicker | Not rendered | isMobile guard | PASS |

---

## Summary

**Total checks: 65**
**PASS: 65**
**FAIL: 0**

All implementations match the approved proposals. Desktop UI is preserved via responsive breakpoints.
