# Glassmorphism Design System (Original)

This is the **original** glassmorphism style for reference. To restore this look, copy these values back into `src/app/globals.css`.

---

## Light Glass (`.glass`) - Original

```css
.glass {
  position: relative;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(2px) saturate(180%);
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.2),
    inset 0 4px 20px rgba(255, 255, 255, 0.3);
}
```

| Property | Value | What it does |
|----------|-------|--------------|
| Background | `rgba(255, 255, 255, 0.15)` | White at 15% opacity (very transparent) |
| Border | `rgba(255, 255, 255, 0.8)` | White at 80% opacity, 1px thick |
| Blur | `2px` | Subtle frosted effect |
| Saturation | `180%` | Makes colors behind glass more vibrant |
| Outer shadow | `0 8px 32px rgba(31, 38, 135, 0.2)` | Blue-tinted drop shadow |
| Inner glow | `inset 0 4px 20px rgba(255, 255, 255, 0.3)` | White highlight from top |

---

## Dark Glass (`.glass-dark`) - Original

```css
.glass-dark {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 4px 20px rgba(255, 255, 255, 0.05);
}
```

| Property | Value | What it does |
|----------|-------|--------------|
| Background | `rgba(0, 0, 0, 0.3)` | Black at 30% opacity |
| Border | `rgba(255, 255, 255, 0.1)` | White at 10% opacity, 1px thick |
| Blur | `12px` | Strong frosted effect |
| Saturation | `180%` | Makes colors behind glass more vibrant |
| Outer shadow | `0 8px 32px rgba(0, 0, 0, 0.4)` | Dark drop shadow |
| Inner glow | `inset 0 4px 20px rgba(255, 255, 255, 0.05)` | Very subtle white highlight |

---

## Why We Changed

The original style had very low opacity (15%) and minimal blur (2px), which made text hard to read over the light map background. We switched to a more opaque style for better readability.
