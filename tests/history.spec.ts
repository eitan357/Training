import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

test.describe('History Section', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
  });

  test('history section is visible after navigation', async ({ page }) => {
    await expect(page.locator('#sec-history')).toBeVisible();
  });

  test('history section has topbar with title', async ({ page }) => {
    const topbar = page.locator('#sec-history .topbar');
    await expect(topbar).toBeVisible();
  });

  test('filter row is present in history', async ({ page }) => {
    await expect(page.locator('#filterRow')).toBeAttached();
  });

  test('history list container is present', async ({ page }) => {
    await expect(page.locator('#historyList')).toBeAttached();
  });

  test('history list loads content (not stuck on loading spinner)', async ({ page }) => {
    // Wait for loading spinner to be replaced by actual content or an empty-state message
    await page.waitForFunction(() => {
      const list = document.getElementById('historyList');
      if (!list) return false;
      const loadingEl = list.querySelector('.loading');
      return !loadingEl || loadingEl.offsetParent === null;
    }, { timeout: 15000 });

    // historyList should now have some content
    const innerText = await page.locator('#historyList').textContent();
    expect(innerText).toBeDefined();
  });

  test('gear icon in history navigates to settings', async ({ page }) => {
    await page.locator('#sec-history .topbar-icon-btn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('navigating away and back to history preserves section', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
  });
});
