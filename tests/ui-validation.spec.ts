import { test, expect } from '@playwright/test';
import path from 'path';

const screenshotDir = path.join(__dirname, 'screenshots');

// Increase timeout for all tests since the app has animations and map loading
test.setTimeout(60000);

// Helper: dismiss the landing page so we can interact with the map UI
async function dismissLanding(page: import('@playwright/test').Page) {
  // The landing page has a "Go to Demo" button that appears after a 2.4s framer-motion animation delay.
  // It may already be gone if a previous navigation already dismissed it.
  const demoButton = page.getByRole('button', { name: /demo/i });
  try {
    await expect(demoButton).toBeVisible({ timeout: 15000 });
    await demoButton.click();
    // Wait for landing page fade-out animation
    await page.waitForTimeout(1500);
  } catch {
    // Landing page not found -- likely already dismissed or page loaded past it
    console.log('Landing page already dismissed');
  }
}

// Helper: wait for the app UI to be ready
async function waitForAppReady(page: import('@playwright/test').Page) {
  // Wait for the main element to be visible
  await expect(page.locator('main')).toBeVisible({ timeout: 10000 });

  // Try to wait for the map canvas (may not appear in headless without WebGL)
  try {
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
  } catch {
    console.log('Note: Map canvas did not render (expected in headless environments without WebGL)');
  }

  // Let the UI stabilize
  await page.waitForTimeout(1000);
}

// ─── Desktop Viewport Tests (1280x720) ───────────────────────────────────────

test.describe('Desktop Chrome viewport', () => {

  test('Page loads and renders', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Take screenshot of landing page
    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-landing.png'),
      fullPage: false,
    });

    await dismissLanding(page);
    await waitForAppReady(page);

    // Take full page screenshot
    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-full.png'),
      fullPage: false,
    });

    await expect(page.locator('main')).toBeVisible();
  });

  test('No horizontal overflow on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

    const citySelector = page.locator('select, button:has-text("Madrid"), button:has-text("Prague"), button:has-text("Vienna"), button:has-text("Budapest")').first();
    const isVisible = await citySelector.isVisible().catch(() => false);

    await page.screenshot({
      path: path.join(screenshotDir, 'desktop-city-selector.png'),
      fullPage: false,
    });

    console.log('City selector visible:', isVisible);
    expect(isVisible).toBe(true);
  });
});

// ─── Mobile Viewport Tests (375x667) ─────────────────────────────────────────

test.describe('Mobile viewport tests', () => {

  test('Page loads and renders on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-landing.png'),
      fullPage: false,
    });

    await dismissLanding(page);
    await waitForAppReady(page);

    await page.screenshot({
      path: path.join(screenshotDir, 'mobile-full.png'),
      fullPage: false,
    });

    await expect(page.locator('main')).toBeVisible();
  });

  test('No horizontal scrollbar on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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

  test('Bottom nav is visible on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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

    // All 5 bottom nav buttons should be visible on mobile
    const allVisible = Object.values(results).every(v => v);
    expect(allVisible).toBe(true);
  });

  test('Page content is not cut off on mobile (375x667)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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
      expect(mainDimensions.width).toBeGreaterThanOrEqual(375);
      expect(mainDimensions.height).toBeGreaterThanOrEqual(667);
    }
  });

  test('No overflow at 390px width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await dismissLanding(page);
    await waitForAppReady(page);

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
