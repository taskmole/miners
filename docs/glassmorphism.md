# Glassmorphism Design System

This document describes the glassmorphism styling used throughout the Miners Location Scout app.

## Overview

Glassmorphism creates a frosted glass effect using:
- Background blur
- Semi-transparent backgrounds
- Subtle borders
- Layered shadows (outer + inner glow)

---

## Light Glass (`.glass`)

Used for panels and buttons that sit over the map in light mode.

```css
.glass {
  position: relative;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px) saturate(180%);
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15),
    inset 0 4px 20px rgba(255, 255, 255, 0.4);
}
```

### Properties Breakdown

| Property | Value | What it does |
|----------|-------|--------------|
| Background | `rgba(255, 255, 255, 0.5)` | White at 50% opacity (more solid) |
| Border | `rgba(255, 255, 255, 0.6)` | White at 60% opacity, 1px thick |
| Blur | `8px` | Medium frosted effect |
| Saturation | `180%` | Makes colors behind glass more vibrant |
| Outer shadow | `0 8px 32px rgba(31, 38, 135, 0.15)` | Soft blue-tinted drop shadow |
| Inner glow | `inset 0 4px 20px rgba(255, 255, 255, 0.4)` | Strong white highlight from top |

### Used On
- Sidebar filter panel
- Filter toggle button
- Draw toolbar
- Map style switcher
- Activity log toggle button
- City selector button

---

## Dark Glass (`.glass-dark`)

Used for dropdown menus and expanded panels that need more contrast.

```css
.glass-dark {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(18px) saturate(180%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 4px 20px rgba(255, 255, 255, 0.05);
}
```

### Properties Breakdown

| Property | Value | What it does |
|----------|-------|--------------|
| Background | `rgba(0, 0, 0, 0.3)` | Black at 30% opacity |
| Border | `rgba(255, 255, 255, 0.1)` | White at 10% opacity, 1px thick |
| Blur | `18px` | Strong frosted effect |
| Saturation | `180%` | Makes colors behind glass more vibrant |
| Outer shadow | `0 8px 32px rgba(0, 0, 0, 0.4)` | Dark drop shadow |
| Inner glow | `inset 0 4px 20px rgba(255, 255, 255, 0.05)` | Very subtle white highlight |

### Used On
- Activity log expanded panel
- City selector dropdown menu

---

## Interactive States

Buttons and interactive elements inside glass panels follow this opacity hierarchy:

| State | Class | Opacity |
|-------|-------|---------|
| Default | `bg-white/30` | 30% white |
| Hover | `bg-white/50` | 50% white |
| Active/Selected | `bg-blue-500` | Solid blue |

### Hover Effects on Glass Panels
- Light glass panels: `hover:bg-white/20`
- Buttons inside panels: `hover:bg-white/50`

---

## Border Styles

| Panel Type | Border Class | Opacity |
|------------|--------------|---------|
| Light glass | `border-white/40` | 40% white |
| Dark glass | `border-white/10` | 10% white |

---

## Text Colors

| Background | Text Color | Class |
|------------|------------|-------|
| Light glass | Dark gray | `text-zinc-900` |
| Dark glass | White | `text-white` |

---

## Corner Radius

| Element Type | Radius | Class |
|--------------|--------|-------|
| Panels | 16px | `rounded-2xl` |
| Buttons | 12px | `rounded-xl` |
| Small elements | 8px | `rounded-lg` |
| Toggle buttons | Full circle | `rounded-full` |

---

## Shadow Layers

The glass effect uses two shadow layers:

1. **Outer shadow** - Creates depth/elevation
   - Light: Blue-tinted `rgba(31, 38, 135, 0.15)`
   - Dark: Black `rgba(0, 0, 0, 0.4)`

2. **Inner shadow (inset)** - Creates the glass highlight
   - Light: White glow `rgba(255, 255, 255, 0.4)`
   - Dark: Subtle white `rgba(255, 255, 255, 0.05)`

---

## File Location

All glassmorphism styles are defined in:
```
src/app/globals.css (lines 119-135)
```

---

## Component Reference

| Component | File | Glass Type |
|-----------|------|------------|
| City Selector Button | `CitySelector.tsx:26` | `.glass` |
| City Dropdown | `CitySelector.tsx:32` | `.glass-dark` |
| Filter Toggle | `Sidebar.tsx:157` | `.glass` |
| Filter Panel | `Sidebar.tsx:170` | `.glass` |
| Draw Panel | `DrawToolbar.tsx:90` | `.glass` |
| Activity Log Panel | `ActivityLog.tsx:25` | `.glass-dark` |
| Activity Log Button | `ActivityLog.tsx:58` | `.glass` |
| Map Style Switcher | `MapStyleSwitcher.tsx:34` | `.glass` |

---

## Quick Copy Reference

### Light Glass
```css
background: rgba(255, 255, 255, 0.5);
border: 1px solid rgba(255, 255, 255, 0.6);
backdrop-filter: blur(8px) saturate(180%);
box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15),
  inset 0 4px 20px rgba(255, 255, 255, 0.4);
```

### Dark Glass
```css
background: rgba(0, 0, 0, 0.3);
border: 1px solid rgba(255, 255, 255, 0.1);
backdrop-filter: blur(18px) saturate(180%);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
  inset 0 4px 20px rgba(255, 255, 255, 0.05);
```
