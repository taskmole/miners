# Original Popup Reference - from index.html

This document extracts ALL popup styling and structure from the original `index.html` file.

---

## 1. POPUP CONTAINER (`.custom-popup`)

```css
.custom-popup {
    min-width: 411px;
    max-width: 486px;
    width: auto;
    padding: 0;
    box-sizing: border-box;
    word-wrap: break-word;
    overflow-wrap: break-word;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

**Description**: The outer wrapper for ALL popups. Fixed width range 411-486px.

---

## 2. IMAGE/CAROUSEL CONTAINER (`.popup-carousel-container`)

```css
.popup-carousel-container {
    position: relative;
    width: 100%;
    height: 300px;          /* FIXED 300px height */
    background: #F7F7F7;
    margin: 0;
    overflow: hidden;       /* Clips image to container */
    border-radius: 8px 8px 0 0;
}
```

**Description**: Contains the hero image. CRITICAL: `height: 300px` is fixed, `overflow: hidden` clips the image.

### Image inside carousel:
```css
.popup-carousel-slide img {
    width: 100%;
    height: 100%;
    object-fit: cover;      /* Fills container, crops excess */
}
```

---

## 3. FLOATING ACTION BUTTONS (`.popup-floating-actions`)

```css
.popup-floating-actions {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    z-index: 20;
}
```

**Description**: Container for buttons that float over the image (eye, close, etc.)

### Action Button Style (`.popup-action-btn`)
```css
.popup-action-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: white;
    border: 1px solid rgba(0,0,0,0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}

.popup-action-btn:hover {
    background: #F7F7F7;
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
```

---

## 4. "NEW" RIBBON (`.euct-new-ribbon`)

```css
.euct-new-ribbon {
    position: absolute;
    top: -3px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 0 0 8px 8px;
    box-shadow: 0 2px 8px rgba(255, 165, 0, 0.4);
    z-index: 15;
    white-space: nowrap;
    letter-spacing: 0.3px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
```

**Description**: Golden ribbon at top center of image saying "Added in the last 3 months"

---

## 5. POPUP HEADER (`.popup-header`)

```css
.popup-header {
    padding: 20px 20px 0 20px;
    margin-bottom: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}
```

### Title (`.popup-title`)
```css
.popup-title {
    font-weight: 600;
    color: #222222;
    font-size: 16px;
    line-height: 1.3;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
}
```

---

## 6. ADDRESS (`.popup-address`)

```css
.popup-address {
    color: #9C9C9C;
    font-size: 14px;
    margin-top: -5px;
    margin-bottom: 12px;
    line-height: 1.4;
    padding: 0 20px;
}
```

---

## 7. RATING ROW (`.popup-rating`)

```css
.popup-rating {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 16px;
    font-size: 14px;
    color: #222222;
    padding: 0 20px;
}
```

---

## 8. FOOTER (`.popup-footer`)

```css
.popup-footer {
    margin-top: 0;
    padding: 16px 20px 20px 20px;
    border-top: 1px solid #EBEBEB;
}

.popup-view-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
}
```

---

## 9. SOCIAL/VIEW BUTTONS (`.popup-view-btn`)

```css
.popup-view-btn {
    background: white;
    border: none;
    padding: 0;
    border-radius: 4px;
    cursor: pointer;
    transition: transform 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 33px;
    height: 33px;
}

.popup-view-btn.maps-btn {
    background: #F5F5F5;  /* Gray background for Google Maps */
}

.popup-view-btn.full-logo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
}
```

---

## 10. HTML STRUCTURE (EU Coffee Trip Popup)

```html
<div class="custom-popup">
    <!-- 1. IMAGE SECTION (if has photo) -->
    <div class="popup-carousel-container single-image">
        <div class="popup-carousel">
            <div class="popup-carousel-slide active">
                <img src="..." style="width: 100%; height: 100%; object-fit: cover;">
            </div>
        </div>
        <!-- NEW ribbon if recently added -->
        <div class="euct-new-ribbon">Added in the last 3 months</div>
        <!-- Action buttons floating over image -->
        <div class="popup-floating-actions">
            <button class="popup-action-btn">...</button>
        </div>
    </div>

    <!-- 2. HEADER (name + badges) -->
    <div class="popup-header">
        <div class="popup-title">Cafe Name <span class="premium-badge">Premium</span></div>
    </div>

    <!-- 3. ADDRESS -->
    <div class="popup-address">Street Address, City</div>

    <!-- 4. RATING ROW -->
    <div class="popup-rating">
        ★ 4.4 (35) · €1-10 · Open
    </div>

    <!-- 5. FOOTER with social buttons -->
    <div class="popup-footer">
        <div class="popup-view-buttons">
            <div style="display: flex; gap: 8px;">
                <button class="popup-view-btn full-logo">EU Coffee Trip logo</button>
                <button class="popup-view-btn maps-btn">Google Maps</button>
                <!-- Social icons -->
            </div>
            <div>Add to list</div>
        </div>
    </div>
</div>
```

---

## CRITICAL POINTS

1. **Image container MUST be 300px fixed height with overflow:hidden**
2. **Popup container uses min-width/max-width, NOT fixed width**
3. **Floating actions positioned at top:12px right:12px**
4. **All padding uses 20px horizontal**
5. **Footer has border-top: 1px solid #EBEBEB**
