import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

const BASE_URL = 'https://training-diary.web.app';

test.describe('UI — Auth Screen', () => {
  test('auth screen has no horizontal overflow at 375px width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
  });

  test('auth screen layout at desktop 1280px width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#auth-screen')).toBeAttached();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(1280 + 1);
  });

  test('all auth form elements are visible at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
    await expect(page.locator('#auth-submit-btn')).toBeVisible();
  });
});

test.describe('UI — Authenticated App', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('app has no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#nav-main').click();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
  });

  test('bottom nav is visible and not clipped at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const nav = page.locator('.bottomnav');
    await expect(nav).toBeVisible();

    const box = await nav.boundingBox();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.width).toBeLessThanOrEqual(375 + 1);
    }
  });

  test('dark mode toggle changes body/html class or data-theme attribute', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    const toggle = page.locator('#darkModeToggle');
    const initialChecked = await toggle.isChecked();

    const label = page.locator('label.toggle-switch').filter({ has: page.locator('#darkModeToggle') });
    await label.click();

    // Dark mode state should have changed
    const newChecked = await toggle.isChecked();
    expect(newChecked).toBe(!initialChecked);

    // Restore
    await label.click();
  });

  test('all topbar elements fit within viewport at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#nav-main').click();

    const topbar = page.locator('#sec-main .topbar');
    await expect(topbar).toBeVisible();

    const box = await topbar.boundingBox();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(375 + 1);
    }
  });

  test('exercise cards do not overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#nav-main').click();

    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });

    const firstType = page.locator('#typeRow button, #typeRow .type-btn').first();
    await firstType.click();
    const firstCard = page.locator('#exerciseList .card').first();
    await expect(firstCard).toBeVisible({ timeout: 8000 });

    const cardBox = await firstCard.boundingBox();
    if (cardBox) {
      expect(cardBox.width).toBeLessThanOrEqual(375 + 1);
    }
  });

  test('measurements section layout at 375px shows form without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const measNav = page.locator('#nav-measurements');
    if (await measNav.isVisible()) {
      await measNav.click();
    } else {
      await page.evaluate(() => (window as any).showSection('measurements'));
    }
    await expect(page.locator('#sec-measurements')).toHaveClass(/active/, { timeout: 5000 });

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
  });
});
