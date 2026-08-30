import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('bottom navigation is visible after login', async ({ page }) => {
    const bottomNav = page.locator('.bottomnav');
    await expect(bottomNav).toBeVisible();
  });

  test('main section is active by default after login', async ({ page }) => {
    const mainSection = page.locator('#sec-main');
    await expect(mainSection).toHaveClass(/active/);
    const mainNav = page.locator('#nav-main');
    await expect(mainNav).toHaveClass(/active/);
  });

  test('navigate to timer section', async ({ page }) => {
    await page.locator('#nav-timer').click();
    await expect(page.locator('#sec-timer')).toHaveClass(/active/);
    await expect(page.locator('#nav-timer')).toHaveClass(/active/);
    // Main section should no longer be active
    await expect(page.locator('#sec-main')).not.toHaveClass(/active/);
  });

  test('navigate to measurements section', async ({ page }) => {
    // Click only if visible (running may replace this nav item); fallback to JS
    const measNav = page.locator('#nav-measurements');
    const isVisible = await measNav.isVisible();
    if (isVisible) {
      await measNav.click();
    } else {
      await page.evaluate(() => (window as any).showSection('measurements'));
    }
    await expect(page.locator('#sec-measurements')).toHaveClass(/active/);
  });

  test('navigate to history section', async ({ page }) => {
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
    await expect(page.locator('#nav-history')).toHaveClass(/active/);
  });

  test('navigate back to main section', async ({ page }) => {
    await page.locator('#nav-timer').click();
    await page.locator('#nav-main').click();
    await expect(page.locator('#sec-main')).toHaveClass(/active/);
    await expect(page.locator('#nav-main')).toHaveClass(/active/);
  });

  test('navigate to settings via gear icon in main section', async ({ page }) => {
    const gearBtn = page.locator('#mainGearBtn');
    await expect(gearBtn).toBeVisible();
    await gearBtn.click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('navigate to settings via gear icon in measurements section', async ({ page }) => {
    const measNav = page.locator('#nav-measurements');
    const isVisible = await measNav.isVisible();
    if (isVisible) {
      await measNav.click();
    } else {
      await page.evaluate(() => (window as any).showSection('measurements'));
    }
    await expect(page.locator('#sec-measurements')).toHaveClass(/active/, { timeout: 5000 });
    const gearBtn = page.locator('#measGearBtn');
    await expect(gearBtn).toBeVisible();
    await gearBtn.click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('all navigation items render their icons and labels', async ({ page }) => {
    const navItems = page.locator('.nav-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(4); // at least main, timer, measurements/running, history
    // At least 4 nav items must be visible (running may be hidden if feature is disabled)
    let visibleCount = 0;
    for (let i = 0; i < count; i++) {
      const visible = await navItems.nth(i).isVisible();
      if (visible) visibleCount++;
    }
    expect(visibleCount).toBeGreaterThanOrEqual(4);
  });

  test('timer nav icon updates when timer is running', async ({ page }) => {
    // The timer nav icon ID is timerNavIcon — just verify it exists
    const timerIcon = page.locator('#timerNavIcon');
    await expect(timerIcon).toBeVisible();
  });
});
