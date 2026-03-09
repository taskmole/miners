# Mobile UX Proposals -- Touch Target & Footfall Sprint

**Date:** 2026-03-09
**Target user:** Coffee chain scout walking a city one-handed on iPhone (375-428px screens)
**Design system reference:** `docs/design-system.md`
**Audit source:** `docs/mobile-audit.md`

---

## FIX 1: Map Markers & Filter Checkboxes

### Problem

The scout is walking down a busy street in Madrid, holding their phone in one hand, thumb doing all the work. They see a cluster of cafes on the map and need to tap one to check its details. The default markers are 36x36px and unclustered points are just 24px circles -- both fall below the Apple HIG 44pt minimum. On a moving thumb, the scout misses the marker, accidentally pans the map, and has to re-orient. It is especially bad at higher zoom levels where individual POI dots are tiny 12px (6px radius) circles with no label or icon.

The filter sidebar compounds the problem: checkboxes are 16x16px, so toggling "Show offices" or "Show transit" is a precision exercise. The slider thumb for the rating filter is also 16x16px -- nearly impossible to grab one-handed while walking. The custom switch toggles (18x32px for the traffic "Show Values" toggle) require the same fine motor control.

### Research Findings

**Apple HIG (iOS 17+):**
- Minimum tappable area: 44x44pt. This is the interactive region, not necessarily the visual size. Apple explicitly recommends invisible touch padding when the visual element must remain small.
- For map pins, Apple Maps uses ~40pt visual pins but with a generous hit area that extends below the pin tip (about 60pt total touch target).

**Material Design 3:**
- Minimum touch target: 48x48dp. Checkboxes must have 48dp touch targets even if the visual checkbox is 18dp -- the surrounding label and padding count.
- Slider thumbs: Material recommends a 20dp visual thumb with a 48dp touch target (invisible hit area around the thumb).
- Switches: Material uses a 52x32dp track with a 28dp thumb circle and 48dp touch area.

**Google Maps (iOS, 2025):**
- POI markers are approximately 28-32pt visually but have a ~50pt invisible tap region. When a user taps near overlapping markers, Google Maps shows a disambiguation sheet ("Did you mean...?" list) rather than requiring pixel-perfect aim.
- Cluster circles scale: small clusters ~36pt, medium ~44pt, large ~52pt. All have counts inside.

**Citymapper:**
- Station dots are small (~20pt) but tapping anywhere within a ~48pt radius triggers the info card. The app compensates for small visuals with large invisible hit zones.

**Zillow (iOS):**
- Property markers are 36-40pt pills showing the price. Tapping has a generous ~52pt hit area. At high density, tapping near overlapping pins triggers a "X homes" cluster tap that zooms or shows a list.

### Proposed Solution for Map Markers

**Custom React markers (MarkerContent component):**

| Size variant | Current visual | Proposed visual | Proposed tap target | Rationale |
|-------------|---------------|-----------------|--------------------|-----------|
| `small` | 28x28px (w-7 h-7) | 36x36px (w-9 h-9) | 48x48px | Used for non-primary POIs. 36px visual with 48px invisible tap zone meets Material target |
| `default` | 36x36px (w-9 h-9) | 44x44px (w-11 h-11) | 52x52px | Primary markers. 44px visual meets Apple HIG exactly. Extra 8px invisible padding gives breathing room |
| `large` | 44x44px (w-11 h-11) | 48x48px (w-12 h-12) | 56x56px | Featured/Miners partners. Visually distinct as the biggest marker |

**Implementation approach for invisible tap padding:**
- Wrap each MarkerContent `<div>` in an outer `<div>` with the tap target size, centered, with `cursor-pointer` but no visual background.
- The outer div catches the click; the inner div displays the icon. This avoids bloating the visual marker while ensuring the finger lands on something tappable.

**Zoom-based marker behavior:**
- At zoom levels 10-12 (city overview): Only clusters show. No individual markers. Cluster circles remain at 40px / 48px / 56px as they are now (20px / 30px / 40px radius) -- these are already decent because the count text needs space.
- At zoom levels 13-14 (neighborhood): Markers appear at `small` size (36px visual).
- At zoom levels 15+ (street level): Markers appear at `default` size (44px visual).
- This prevents marker overlap at wide zooms while giving fat targets at street level where the scout is actively tapping.

**Marker style adjustments:**
- Keep the existing rounded-full shape with 2px white border and shadow-lg. This already reads well.
- Add `active:scale-90` feedback so the scout sees a press response (currently only hover effects exist, which do not trigger on mobile).
- Remove `hover:scale-125` on mobile (touch devices do not hover; this only causes sticky hover states). Keep it on desktop.

**Unclustered circle points (MapClusterLayer):**

| Property | Current | Proposed | Rationale |
|----------|---------|----------|-----------|
| `circle-radius` | 6px | 10px | Visual dot doubles in area. Still not huge, but visible enough to tap |
| Touch target | 12px diameter | 44px | Add a transparent `circle-stroke-width` of 16px with `circle-stroke-opacity` 0 to create an invisible 42px tap zone around each 10px dot |
| `circle-stroke-color` | none | transparent | Invisible stroke extends tap target without visual clutter |

**Cluster circles (MapClusterLayer):**

| Cluster size | Current radius | Proposed radius | Rationale |
|-------------|---------------|-----------------|-----------|
| Small (<100 points) | 20px (40px diameter) | 24px (48px diameter) | Meets Material 48dp target |
| Medium (100-750) | 30px (60px diameter) | 30px (60px diameter) | Already adequate |
| Large (750+) | 40px (80px diameter) | 40px (80px diameter) | Already adequate |

### Proposed Solution for Filter Checkboxes

**Checkbox (Radix Checkbox primitive):**

The current Radix `<Checkbox>` uses `size-4` (16x16px). Rather than fighting the Radix styles, apply mobile-specific overrides:

| Property | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|----------|---------|----------------|--------------------|-----------|
| Checkbox visual size | 16x16px (`size-4`) | 22x22px (`size-[22px]`) | 16x16px (`size-4`) | 22px visual is comfortable. Combined with label tap area, the 48px target is met |
| Checkbox border-radius | 4px | 6px | 4px | Slightly rounder at larger size |
| Check icon inside | 14px (`size-3.5`) | 18px (`size-[18px]`) | 14px | Proportional to larger box |
| Label tap area | Label does not toggle checkbox | Entire row (including label text and icon) must be tappable -- wrap checkbox + label in a `<label>` or attach `htmlFor` | Same | Apple and Material both require tapping the label to toggle the control |
| Row height (each category item) | ~30px (`py-1.5`) | 48px (`py-3`) | ~30px | Meets design system accordion/list-item minimum of 48px |
| Spacing between checkbox rows | 4px (`space-y-1`) | 8px (`space-y-2`) | 4px | Prevents accidental adjacent taps. 8px gap + 48px rows = 56px center-to-center spacing, well above the 44px Fitts's Law sweet spot |

**Sidebar approach:** In the Sidebar, checkboxes are already inside a clickable `<div>` row (`onClick` on the parent div calls `handleToggle`). The fix is:
1. Increase the visual checkbox from `w-4 h-4` to `w-[22px] h-[22px]` on mobile (use `md:w-4 md:h-4` to keep desktop small).
2. Increase row padding from `py-1.5` to `py-3` on mobile.
3. Increase `space-y-1` to `space-y-2` on mobile.

**Switch toggles (traffic "Show Values", etc.):**

The sidebar uses a custom inline switch (not the Radix Switch component): `h-5 w-9` track with `h-4 w-4` thumb.

| Property | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|----------|---------|----------------|--------------------|-----------|
| Track height | 20px (`h-5`) | 28px (`h-7`) | 20px | Apple HIG switch is 31pt tall. 28px is close and looks proportional |
| Track width | 36px (`w-9`) | 48px (`w-12`) | 36px | Wider track gives thumb more travel and easier targeting |
| Thumb diameter | 16px (`h-4 w-4`) | 24px (`h-6 w-6`) | 16px | Matches Material 3 recommendation. Feels substantial under a thumb |
| Thumb translate when on | `translate-x-4` (16px) | `translate-x-5` (20px) | `translate-x-4` | Adjusted for wider track |
| Touch area | 20x36px (track only) | 48x48px minimum | 20x36px | Row container already handles this if row height is 48px |

**Radix Switch component (`ui/switch.tsx`):**

The Radix Switch has the same problem: `h-[1.15rem] w-8` (18.4x32px) track, `size-4` (16px) thumb.

| Property | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|----------|---------|----------------|--------------------|-----------|
| Track | 18.4x32px | 28x48px | 18.4x32px | Use responsive: `h-7 w-12 md:h-[1.15rem] md:w-8` |
| Thumb | 16x16px | 24x24px | 16x16px | Use responsive: `size-6 md:size-4` |

**Slider thumbs (Radix Slider):**

| Property | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|----------|---------|----------------|--------------------|-----------|
| Thumb visual size | 16x16px (`size-4`) | 28x28px (`size-7`) | 16x16px | Material 3 recommends 20dp visual with 48dp target. 28px visual is generous and easy to grab |
| Thumb touch area | 16x16px | 48x48px | 16x16px | Use `::before` pseudo-element at 48x48px centered on the thumb for invisible touch expansion |
| Track height | 6px (`h-1.5`) | 8px (`h-2`) | 6px | Slightly thicker track makes it easier to see and tap to jump |
| Thumb border | 2px solid primary | 2px solid primary + ring-2 ring-white shadow-md | Same | Drop shadow gives thumb more visual prominence so it's findable at a glance |

### Exact Measurements Table (Summary)

| Element | Current Size | Proposed Mobile Size | Proposed Tap Target | Rationale |
|---------|-------------|---------------------|--------------------|-----------|
| Marker (default) | 36x36px | 44x44px | 52x52px | Apple HIG 44pt visual minimum |
| Marker (small) | 28x28px | 36x36px | 48x48px | Material 48dp target with padding |
| Marker (large) | 44x44px | 48x48px | 56x56px | Featured markers stand out |
| Unclustered dot | 12px dia | 20px dia | 44px (invisible stroke) | Dot + transparent stroke = tappable |
| Small cluster | 40px dia | 48px dia | 48px | Meets Material 48dp |
| Checkbox | 16x16px | 22x22px | 48px (full row) | Row wraps checkbox + label |
| Checkbox row height | ~30px | 48px | 48px | Design system list-item min |
| Checkbox row gap | 4px | 8px | -- | Prevents mis-taps |
| Switch track | 18x32px | 28x48px | 48px (row) | Near-Apple-HIG switch size |
| Switch thumb | 16x16px | 24x24px | -- | Proportional to track |
| Slider thumb | 16x16px | 28x28px | 48x48px (pseudo) | Material 3 recommendation |
| Slider track | 6px tall | 8px tall | -- | Easier to see and direct-tap |

---

## FIX 2: All Buttons & Interactive Elements

### Problem

The scout is viewing a cafe popup and wants to tap "Add to list" or "Create trip" -- but these buttons are at `size="sm"` (32px height, though AddToListButton overrides with `min-h-10`). The "Scout" compact variant of CreateTripButton uses `h-auto py-1` which collapses to roughly 24-26px. The HideButton has no explicit size at all -- it relies on the icon's 20px plus padding, coming in around 28-30px.

In dropdown menus, each item is `py-1.5` (6px top + 6px bottom + ~20px text = ~32px). When the scout opens the "Add to list" dropdown to check a list, the items are packed tight and their thumb covers two rows at once.

Accordion headers in the sidebar (Places, Traffic, Population, Income) use `p-4` which gives decent padding but the visual hit zone is unclear -- there is no explicit height constraint, so it depends on text content (roughly 40-44px).

Input fields (like the "Create new list" dialog) are `h-9` (36px) -- below the 44px minimum. The scout has to carefully position their thumb to focus the input.

### Research Findings

**Apple HIG:**
- Primary actions should be at least 44pt tall. Apple's own buttons in Maps, Notes, and Reminders are 44-50pt.
- For secondary/tertiary actions, Apple uses 44pt minimum hit area even when the visual element (like a small icon button) is 28-34pt. The surrounding whitespace counts toward the target.
- In action sheets and dropdown lists, Apple enforces 44pt row height minimum.

**Material Design 3:**
- Buttons: Filled/Outlined buttons are 40dp tall with 48dp recommended touch height. The extra 8dp comes from surrounding padding.
- FABs (Floating Action Buttons): 56dp standard, 40dp small -- both with 48dp minimum touch area.
- Menu items: 48dp height minimum. Dense menus (desktop only) can go to 36dp.
- Text fields: 56dp recommended height. Minimum 48dp.

**Google Maps (iOS):**
- "Directions" and "Start" buttons are ~50pt tall.
- Action buttons inside the place detail sheet ("Save", "Share", "Directions") are 44pt icon-only circles.
- List items in "Your places" are 56pt tall.

**Zillow (iOS):**
- "Contact Agent" button is 48pt tall, full-width.
- Filter pills at the top are 36pt tall but have 44pt touch areas (extra padding).
- Dropdown selectors are 48pt row height.

**Citymapper:**
- "Go" button is 56pt tall.
- Route option rows are 64pt tall.
- Small icon buttons (share, favorite) are 44pt square.

### Proposed Sizing Hierarchy

**Tier 1 -- Primary Actions (most important, scout uses these constantly):**

These appear in popups and sheets. They are the "do something" buttons.

| Element | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|---------|---------|----------------|--------------------|-----------|
| "Open in Maps" button | h-9 (36px), default size | h-11 (44px), size="lg" | h-9 (36px) | Primary action in every popup. Must be effortless to tap |
| "Add to list" button (AddToListButton) | size="sm" + min-h-10 (40px) | size="lg" (44px), remove min-h-10 override | size="sm" | Standardize on the design system `lg` size |
| "Create trip" button (CreateTripButton default) | size="sm" + min-h-10 (40px) | size="lg" (44px) | size="sm" | Same rationale -- key action in popup |
| Dialog "Create" / "Cancel" buttons | default size h-9 (36px) | size="lg" (44px) | h-9 (36px) | Dialog footer buttons must be easy to confirm/dismiss |
| Dialog input fields | h-9 (36px) | h-11 (44px) | h-9 (36px) | Apple recommends 44pt text fields. Add `h-11 md:h-9` to Input component |

**Tier 2 -- Secondary Actions (used frequently but not the primary task):**

| Element | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|---------|---------|----------------|--------------------|-----------|
| "Scout" compact button (CreateTripButton compact) | h-auto py-1 (~26px) | h-10 (40px) py-2 | h-auto py-1 | Compact variant still needs 40px for thumb reach. Use `h-10 md:h-auto md:py-1` |
| Dropdown menu items (DropdownMenuItem) | py-1.5 (~32px) | py-3 min-h-[44px] | py-1.5 | Each row needs 44px height for comfortable thumb tapping |
| Dropdown checkbox items (DropdownMenuCheckboxItem) | py-1.5 (~32px) | py-3 min-h-[44px] | py-1.5 | Same as above |
| Sidebar section headers (Places, Traffic, etc.) | p-4 (~44px, but no min-height) | min-h-[48px] p-4 | p-4 | Explicitly enforce 48px per design system accordion spec |
| "All / New / Premium" segmented toggle pills | px-3 py-1.5 (~30px) | px-3 py-2 min-h-[40px] | px-3 py-1.5 | These are filter toggles the scout hits frequently |
| Hidden / Visible toggle pills | px-3 py-1.5 (~30px) | px-3 py-2 min-h-[40px] | px-3 py-1.5 | Same EUCT-style toggle |

**Tier 3 -- Tertiary / Icon-Only Actions (smaller but still tappable):**

| Element | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|---------|---------|----------------|--------------------|-----------|
| HideButton (eye/eye-off icon) | ~28-30px (no explicit size) | w-10 h-10 (40px) | ~28-30px | Icon stays at 20px but button gets explicit 40px container. Design system says close buttons are min w-10 h-10 |
| Popup close button (X on images) | `popup-image-btn` class (~32px) | w-10 h-10 (40px) | ~32px | Matches design system close button spec |
| Expand/collapse chevrons | w-4 h-4 (16px) + parent row tap | No change to icon | No change | These are not independent tap targets -- the entire row is tappable. Icon size is fine |
| Disambiguation list items | p-2.5 (~40px row) | p-3 min-h-[48px] | p-2.5 | Material 48dp list items. These are critical when markers overlap |

**Spacing between adjacent tappable elements:**

| Context | Current gap | Proposed Mobile gap | Rationale |
|---------|-----------|--------------------|-----------|
| Popup action buttons ("Add to list" next to "Create trip") | gap-2 (8px) | gap-3 (12px) | With 44px buttons, 12px gap gives 56px center-to-center -- well outside accidental tap range |
| Dropdown menu items | ~0px (items stack flush) | 4px gap between items | Small gap prevents thumb from hitting two items. Radix DropdownMenu has `p-1` on container which adds 4px on each side |
| Filter checkbox rows | space-y-1 (4px) | space-y-2 (8px) | Covered in Fix 1 above |
| Sidebar sections | border only | 8px padding between sections | Clearer section boundaries for thumb navigation |

**Important: Mobile-only changes**

All proposed changes use responsive Tailwind prefixes. The pattern is: set mobile value as default, then use `md:` prefix to restore the current desktop value.

Example for buttons: `size="lg"` on mobile wrapped in a conditional: `size={isMobile ? "lg" : "sm"}`, or use className overrides: `className="h-11 md:h-9"`.

Example for the Input component: change `h-9` to `h-11 md:h-9` in `ui/input.tsx`.

### Exact Measurements Table (Full Summary)

| Element | Current | Proposed Mobile | Desktop (unchanged) | Rationale |
|---------|---------|----------------|--------------------|-----------|
| Primary buttons (Open Maps, Add to list, Create trip) | 36-40px | 44px (h-11) | 36px (h-9) | Apple HIG minimum for primary actions |
| Dialog footer buttons | 36px (h-9) | 44px (h-11) | 36px (h-9) | Must be easy to confirm/dismiss |
| Compact "Scout" button | ~26px | 40px (h-10) | ~26px | Tier 2 secondary action |
| HideButton | ~28px | 40x40px (w-10 h-10) | ~28px | Design system icon button minimum |
| Popup close button | ~32px | 40x40px (w-10 h-10) | ~32px | Design system close button spec |
| Dropdown menu items | ~32px | 44px (min-h-[44px] py-3) | ~32px | Material 3 menu item minimum |
| Dropdown checkbox items | ~32px | 44px (min-h-[44px] py-3) | ~32px | Same as menu items |
| Accordion / section headers | ~40-44px | 48px (min-h-[48px]) | ~40-44px | Design system accordion spec |
| Segmented toggle pills | ~30px | 40px (min-h-[40px]) | ~30px | Frequent filter controls |
| Input fields | 36px (h-9) | 44px (h-11) | 36px (h-9) | Apple recommends 44pt text fields |
| Disambiguation list items | ~40px | 48px (min-h-[48px] p-3) | ~40px | Material list item minimum |
| Gap between popup buttons | 8px | 12px | 8px | Prevents accidental adjacent taps |
| Gap between dropdown items | 0px | 4px | 0px | Slight separation for thumb accuracy |

---

## FIX 3: Footfall Hours Slider

### Problem

The traffic/footfall hour selector is buried inside the sidebar's "Traffic" accordion section. To change the hour, the scout must: (1) tap the bottom nav "Filters" button, (2) scroll down past Places filters, (3) expand the Traffic section, (4) grab a tiny 16px slider thumb, (5) drag it to the desired hour. This is five steps and a precision drag while walking.

A coffee chain scout walking around Madrid at 1 PM wants to instantly see "where is it busy at lunch time?" vs "where is it busy at 8 AM when commuters want coffee?" This is one of the most powerful data points in the app -- it tells the scout which storefronts have high footfall at peak coffee hours. But the current UX hides it behind multiple taps and a fiddly slider that is unusable one-handed.

The existing TrafficValueCard component already renders a beautiful 24-hour bar chart with the current hour highlighted in blue. This visual language should be promoted to a first-class map control, not buried in a sidebar.

### Research Findings

**Google Maps "Popular times":**
- Shows a horizontal bar chart with 24 bars (one per hour). The current hour is highlighted.
- The user can tap any bar or swipe left/right to change the hour. There is no separate slider -- the bar chart IS the selector.
- The chart sits inside the place detail sheet, always visible when a place is open.
- Key insight: combining visualization with selection (tap a bar to select that hour) eliminates the need for a separate slider control.

**Citymapper (departure time selector):**
- Uses scrollable time pills ("Now", "8:00", "8:30", "9:00"...) in a horizontal scroll at the bottom of the screen.
- The selected pill is highlighted in blue. Tapping a pill instantly updates the results.
- Key insight: scrollable horizontal pills work well at the bottom of the screen because the thumb naturally arcs left-right.

**Transit App (iOS):**
- Time selector is a bottom bar with "Depart Now" and a time picker. Tapping "Depart Now" reveals a wheel picker.
- Key insight: default to "Now" and make the current-time experience zero-tap.

**Uber (iOS):**
- Time estimate is always visible at the bottom as a compact bar. Expanding it reveals a full schedule picker.
- Key insight: show the most useful info (current state) in a collapsed mini-bar, expand for full control.

**Thumb zone mapping (Steven Hoober research, updated for 6.1"+ phones):**
- Bottom center of screen (where bottom nav lives): easiest to reach with one thumb.
- Bottom 1/3 of screen: comfortable zone.
- Middle of screen: stretchable zone.
- Top 1/4 of screen: hard to reach one-handed.
- A footfall time control must live in the bottom 1/3 to be usable while walking.

### Proposed Component Design

**Component name:** `FootfallTimePicker`
**Position:** Fixed above the MobileBottomNav, only visible when traffic layer is enabled.

---

#### COLLAPSED STATE

| Property | Value | Rationale |
|----------|-------|-----------|
| Position | Fixed, bottom: 56px + safe-area-inset-bottom (directly above MobileBottomNav) | Thumb zone -- easiest to reach |
| Left/right margin | 16px from each edge | Design system mobile sheet horizontal padding |
| Height | 52px | Enough for a label + mini bar preview, plus 44px tap target for expand |
| Border radius | 16px | Design system panel radius |
| Background | rgba(255,255,255,0.75) with backdrop-filter: blur(16px) saturate(180%) | Design system glassmorphism |
| Border | 1px solid rgba(255,255,255,0.4) | Design system glass border |
| Shadow | 0 8px 32px rgba(0,0,0,0.12) | Design system depth shadow |
| Z-index | 40 (below bottom nav at 50, above map) | Layered correctly |

**Collapsed content (left to right):**
1. **Clock icon** -- 20px, zinc-500. Identifies the control at a glance.
2. **Current hour label** -- "1 PM" in 14px font-semibold text-zinc-900. Shows what hour is currently selected.
3. **Mini sparkline** -- A 120px-wide x 24px-tall simplified bar chart showing the 24-hour footfall shape. The current hour bar is highlighted in blue-500, others in zinc-200. This gives a quick visual of the daily pattern without expanding.
4. **People count** -- "1.2k" in 14px font-bold text-zinc-900, followed by "ppl/hr" in 11px text-zinc-400. Shows the aggregate footfall for the selected hour.
5. **Chevron up icon** -- 16px, zinc-400. Indicates expandability.

**How to expand:** Tap anywhere on the collapsed bar, or swipe up on it. The swipe up gesture is natural because the bar sits at the bottom.

**How to dismiss/collapse:** Tap the bar again when expanded, or swipe down, or tap the map behind it.

---

#### EXPANDED STATE

| Property | Value | Rationale |
|----------|-------|-----------|
| Height | 200px | Fits the bar chart (120px), time labels (16px), quick-pick pills (40px), and padding (24px). Tested against iPhone SE (568pt screen: 200px is ~35% of screen, well under the 50% partial snap) |
| Border radius | 24px top, 16px bottom | Design system sheet radius on top, panel radius on bottom where it meets the nav |
| Background | Same glassmorphism as collapsed | Consistency |
| Animation | 200ms ease-out slide up from collapsed height to expanded height | Design system sheet animation |
| Padding | 16px horizontal, 12px vertical | Design system mobile sheet padding |

**Expanded layout (top to bottom):**

1. **Drag handle** -- 40px wide, 4px tall, centered, rounded-full, bg-zinc-300. Standard sheet drag indicator per design system.

2. **Header row** (flex, justify-between, items-center, height 32px):
   - Left: "Footfall by hour" in 16px font-semibold text-zinc-900 (design system section header).
   - Right: Current value badge -- "1.2k ppl/hr" in a zinc-100 rounded-full pill, 12px font-medium.

3. **24-hour bar chart** (height 96px, full width):
   - 24 bars, evenly spaced with 2px gaps.
   - Each bar is a tappable column. The tap target is the full column height (96px) x column width (~13px on a 375px screen). Even though individual bars are narrow, the vertical extent of each column is generous for thumbs.
   - Bar colors: zinc-200 (default), blue-500 (selected hour), zinc-300 (hours with above-average footfall -- subtle emphasis).
   - The selected hour bar has a small blue-500 dot (6px) above it as an additional indicator.
   - On tap: the bar for the tapped hour becomes blue-500. The map immediately updates to show footfall data for that hour. A subtle haptic feedback (if available via the Vibration API) confirms the selection.
   - On horizontal swipe/drag across the chart: the selected hour follows the thumb position in real-time, scrubbing through hours. This is the "Google Maps Popular times" interaction -- the chart becomes a slider.

4. **Time labels** (flex, justify-between, height 16px):
   - Five labels evenly spaced: "12AM", "6AM", "12PM", "6PM", "12AM"
   - Typography: 11px font-medium text-zinc-400 (design system tiny labels)

5. **Quick-pick pills** (horizontal scroll, height 40px, gap 8px):
   - Pre-set time shortcuts: "Now", "Morning (7-9)", "Lunch (12-2)", "Evening (5-7)", "Night (8-11)"
   - Each pill: height 36px, px-12px, rounded-full, border 1px solid zinc-200, 13px font-medium text-zinc-600.
   - Selected pill: bg-zinc-900 text-white border-zinc-900 (design system primary action color).
   - Tapping "Morning" selects hour 8 (peak of the 7-9 range based on data). Tapping "Lunch" selects hour 13. These are smart defaults -- the component picks the hour within the range that has the highest footfall count.
   - "Now" uses `new Date().getHours()` to select the current hour. This is the default when traffic is first enabled.
   - The pills scroll horizontally with `-webkit-overflow-scrolling: touch` and `overscroll-behavior: contain`.

**Visual feedback when time changes:**
- The selected bar transitions color in 150ms (design system fade duration).
- The header value badge animates with a brief scale-up pulse (scale(1.05) over 100ms) when the count changes.
- The heatmap on the map cross-fades over 200ms to the new hour's data (existing `trafficHour` state update triggers data reload; this is already implemented).

**How the map update works:**
- When the user selects an hour, the component calls `onTrafficHourChange(selectedHour)` -- the same callback that the existing sidebar slider uses.
- No new API calls are needed. The existing `/api/traffic?hour=N` endpoint serves the data.
- The existing heatmap rendering in `EnhancedMapContainer` (`addTrafficLayers`) already handles hour-filtered GeoJSON.

---

#### EDGE CASES

**POI with no footfall data:**
- The FootfallTimePicker is a map-level control, not per-POI. It filters the heatmap overlay across the whole map. If a location has no data, it simply does not appear in the heatmap -- no special indicator needed.
- In the future, if per-POI footfall data is shown in popups, use a "No data available" message in zinc-400 with a BarChart3 icon instead of the bar chart.

**Very short screens (iPhone SE at 568pt / 320px width):**
- Collapsed bar: 52px is fine. Uses 9% of screen height.
- Expanded: 200px is 35% of the 568pt screen. This leaves 368pt for the map + bottom nav. Acceptable.
- Quick-pick pills scroll horizontally -- they do not need to all fit on screen at once.
- If the screen height is below 600px, reduce bar chart height from 96px to 72px (save 24px). Detect via CSS: `@media (max-height: 600px) { .footfall-chart { height: 72px } }`.

**Landscape mode:**
- In landscape on iPhone (height ~375px), the expanded state would consume over 50% of vertical space. Solution: in landscape, the FootfallTimePicker only shows in collapsed mode. The expanded state is disabled. The scout can use the quick-pick pills in collapsed mode if we add a horizontally scrolling row of pills to the collapsed state when in landscape.
- Detect via CSS: `@media (orientation: landscape)` or via JS `window.innerHeight < window.innerWidth`.

**Coexistence with MobileBottomNav:**
- MobileBottomNav is `fixed bottom-0` at z-50, height 56px + safe-area-inset-bottom.
- FootfallTimePicker positions itself at `bottom: calc(56px + env(safe-area-inset-bottom))`.
- When the filter sidebar is open (which also rises from the bottom), the FootfallTimePicker hides to avoid stacking. It only appears when the sidebar is closed.
- When traffic is disabled (toggle is off), the FootfallTimePicker does not render at all.

**First-time use:**
- When the scout enables traffic for the first time, the FootfallTimePicker appears in expanded state with "Now" pre-selected and a brief tooltip: "Tap a bar to see footfall at that hour" (auto-dismisses after 3 seconds, stored in localStorage so it only shows once).

---

#### DATA FORMAT EXPECTED

The component needs the 24-hour summary data to render the mini sparkline and bar chart. Two options:

**Option A (preferred): Use the grouped endpoint**
- Endpoint: `GET /api/traffic?grouped=true`
- Response shape:
```
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
- The `hourly` array is 24 numbers (index 0 = midnight, index 12 = noon, etc.).
- For the collapsed sparkline and expanded bar chart, the component aggregates across all locations: sum or average the `hourly[hour]` values to show a city-wide footfall curve.
- This endpoint already exists and is already implemented.

**Option B: Precompute city-wide hourly averages**
- If aggregating 100+ locations client-side is too slow, add a `GET /api/traffic?summary=true` endpoint that returns a single 24-element array of city-wide average counts per hour.
- Response: `{ "hourlyAverage": [12, 8, 5, 3, ...] }`
- This is an optimization; Option A works for now.

**For map filtering (selecting a specific hour):**
- Endpoint: `GET /api/traffic?hour=13`
- This returns GeoJSON filtered to that hour's data only.
- Already implemented and used by the existing sidebar slider.

---

#### REFERENCE APPS (what to borrow from each)

1. **Google Maps "Popular times"** -- Borrow the interaction pattern of tapping/scrubbing across a bar chart to select a time. The chart IS the control. This eliminates the need for a separate slider and makes the data immediately visual.

2. **Citymapper departure pills** -- Borrow the quick-pick pill pattern ("Now", "Morning", "Lunch", "Evening") for rapid one-tap time selection. This is faster than scrubbing when the scout has a specific time window in mind. Citymapper places these pills in a horizontal scroll at the bottom of the screen -- perfect for thumb reach.

3. **Uber pickup ETA bar** -- Borrow the collapsed/expanded pattern. Show a minimal bar with the key info (current hour + count), expand for full control. This keeps the map visible and uncluttered until the scout actively wants to change the time.

---

#### EXACT MEASUREMENTS TABLE

| Property | Value | Rationale |
|----------|-------|-----------|
| Collapsed bar height | 52px | 44px tap target + 8px padding for content |
| Collapsed bar left/right margin | 16px | Design system mobile horizontal padding |
| Collapsed bar bottom offset | 56px + safe-area-inset-bottom | Sits directly above MobileBottomNav |
| Collapsed bar border-radius | 16px | Design system panel radius |
| Collapsed mini sparkline | 120px wide x 24px tall | Compact but readable daily shape |
| Collapsed hour label | 14px font-semibold | Design system body text |
| Expanded total height | 200px | Fits all content, uses <35% of screen on iPhone SE |
| Expanded border-radius | 24px top, 16px bottom | Sheet top, panel bottom |
| Expanded padding | 16px horizontal, 12px vertical | Design system mobile sheet padding |
| Drag handle | 40px x 4px, centered | Design system sheet drag handle |
| Section header | 16px font-semibold | Design system section header |
| Bar chart height | 96px (72px on screens < 600px tall) | Bars are tall enough to tap and to show meaningful data differences |
| Bar gap | 2px | 24 bars with 2px gaps = 46px of gaps, rest is bars. On 375px screen minus 32px padding = 343px usable. Each bar ~12.4px wide. Narrow but the full-height column is the tap target |
| Bar colors | zinc-200 default, blue-500 selected | Design system primary action for selected state |
| Selected hour indicator | 6px blue-500 dot above bar | Clear without clutter |
| Time labels | 11px font-medium text-zinc-400 | Design system tiny labels |
| Quick-pick pill height | 36px | Between sm (32px) and default (40px) button sizes -- compact but tappable in a row |
| Quick-pick pill padding | 12px horizontal | Enough for text like "Morning (7-9)" |
| Quick-pick pill gap | 8px | Design system sm spacing |
| Quick-pick selected pill | bg-zinc-900 text-white | Design system primary action color |
| Animation duration | 200ms ease-out (expand/collapse), 150ms ease (bar selection) | Design system animation timings |
| Z-index | 40 | Below bottom nav (50), above map layers |
| Glassmorphism bg | rgba(255,255,255,0.75), blur(16px) saturate(180%) | Design system light glass |
| Glassmorphism border | 1px solid rgba(255,255,255,0.4) | Design system glass border |
| Glassmorphism shadow | 0 0 0 1px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.5) | Design system full glass shadow |
