import { test, expect } from '@playwright/test';
import path from 'path';

const screenshotDir = path.join(__dirname, 'screenshots');

// Helper: dismiss the landing page so we can interact with the map UI
async function dismissLanding(page: import('@playwright/test').Page) {
  // The landing page has a "Go to Demo" button that appears after a 2.4s animation delay
  const demoButton = page.locator('button:has-text("Go to Demo")');
  // Wait for the button to become visible (animation delay + render time)
  await expect(demoButton).toBeVisible({ timeout: 10000 });
  await demoButton.click();
  // Wait for landing page fade-out animation (0.4s) + extra buffer
  await page.waitForTimeout(1000);
}

// Helper: wait for map canvas to appear
async function waitForMap(page: import('@playwright/test').Page) {
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20000 });
}

// ─── Desktop Viewport Tests (1280x720) ───────────────────────────────────────

test.describe('Desktop Chrome viewport', () => {

  test('Page loads and map renders', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Take screenshot of initial state (landing page)
    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-landing.png'),
      fullPage: false,
    });

    // Dismiss landing page
    await dismissLanding(page);

    // Wait for the map canvas to appear (maplibre renders a <canvas> element)
    await waitForMap(page);

    // Take full page screenshot after map loads
    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-full.png'),
      fullPage: false,
    });
  });

  test('No horizontal overflow on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    // Check that document width does not exceed viewport width
    const overflows = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewportWidth = window.innerWidth;
      return {
        documentWidth: docWidth,
        viewportWidth: viewportWidth,
        overflows: docWidth > viewportWidth,
      };
    });

    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-overflow-check.png'),
      fullPage: false,
    });

    expect(overflows.overflows).toBe(false);
  });

  test('Sidebar filter button is visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    // On desktop, the sidebar filter button is a collapsed icon button with title="Open filters"
    const filtersButton = page.locator('button[title="Open filters"]');
    const isVisible = await filtersButton.isVisible().catch(() => false);

    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-sidebar.png'),
      fullPage: false,
    });

    expect(isVisible).toBe(true);
  });

  test('City selector is visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    // CitySelector should be somewhere on the page - look for common city names or selectors
    const citySelector = page.locator('button:has-text("Madrid"), button:has-text("Prague"), button:has-text("Vienna"), button:has-text("Budapest"), select').first();
    const isVisible = await citySelector.isVisible().catch(() => false);

    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-city-selector.png'),
      fullPage: false,
    });

    // Log result - city selector should be present
    console.log('City selector visible:', isVisible);
    expect(isVisible).toBe(true);
  });
});

// ─── Mobile Viewport Tests (375x667) ─────────────────────────────────────────

test.describe('Mobile viewport tests', () => {

  test('Page loads and map renders on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });

    // Screenshot landing page on mobile
    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-landing.png'),
      fullPage: false,
    });

    await dismissLanding(page);
    await waitForMap(page);

    // Take full screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-full.png'),
      fullPage: false,
    });
  });

  test('No horizontal scrollbar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    const overflows = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth;
      const viewportWidth = window.innerWidth;
      return {
        documentWidth: docWidth,
        viewportWidth: viewportWidth,
        overflows: docWidth > viewportWidth,
      };
    });

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-overflow-check.png'),
      fullPage: false,
    });

    expect(overflows.overflows).toBe(false);
  });

  test('Bottom nav is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    // MobileBottomNav has buttons: Filters, Draw, Lists, Trips, Activity
    const filtersBtn = page.locator('button:has-text("Filters")');
    const tripsBtn = page.locator('button:has-text("Trips")');
    const listsBtn = page.locator('button:has-text("Lists")');
    const drawBtn = page.locator('button:has-text("Draw")');
    const activityBtn = page.locator('button:has-text("Activity")');

    const results = {
      filters: await filtersBtn.isVisible().catch(() => false),
      trips: await tripsBtn.isVisible().catch(() => false),
      lists: await listsBtn.isVisible().catch(() => false),
      draw: await drawBtn.isVisible().catch(() => false),
      activity: await activityBtn.isVisible().catch(() => false),
    };

    console.log('Bottom nav buttons visible:', results);

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-bottom-nav.png'),
      fullPage: false,
    });

    // At least some bottom nav buttons should be visible
    const anyVisible = Object.values(results).some(v => v);
    expect(anyVisible).toBe(true);
  });

  test('Page content is not cut off on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    // Check that the main container fills the viewport
    const mainDimensions = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) return null;
      const rect = main.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
      };
    });

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-content-check.png'),
      fullPage: false,
    });

    expect(mainDimensions).not.toBeNull();
    if (mainDimensions) {
      // Main should cover the full viewport width
      expect(mainDimensions.width).toBeGreaterThanOrEqual(375);
      // Main should cover the full viewport height
      expect(mainDimensions.height).toBeGreaterThanOrEqual(667);
    }
  });

  test('No overflow at 390px width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-390.png'),
      fullPage: false,
    });

    expect(overflows).toBe(false);
  });

  test('No overflow at 428px width', async ({ page }) => {
    await page.setViewportSize({ width: 428, height: 926 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await dismissLanding(page);
    await waitForMap(page);

    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-428.png'),
      fullPage: false,
    });

    expect(overflows).toBe(false);
  });
});
