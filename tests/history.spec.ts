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

  test('long-press on a history row selects it and shows the bulk action bar', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    if (await header.count() === 0) test.skip(true, 'no history rows available in this test account');

    const box = await header.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650); // > HIST_LONG_PRESS_MS
    await page.mouse.up();

    await expect(page.locator('.session-card').first()).toHaveClass(/sel-active/);
    await expect(page.locator('#histBulkBar')).toBeVisible();
    await expect(page.locator('#histBulkCount')).not.toBeEmpty();
  });

  test('short click on a history row still expands it (not selection)', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').nth(1);
    if (await header.count() === 0) test.skip(true, 'no second history row available in this test account');

    const wasOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));
    await header.click();
    const isOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));
    expect(isOpen).toBe(!wasOpen);
    await expect(page.locator('#histBulkBar')).toBeHidden();
  });

  test('long-press then dragging past the movement tolerance cancels the long-press', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    if (await header.count() === 0) test.skip(true, 'no history rows available in this test account');

    const box = await header.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#histBulkBar')).toBeHidden();
  });
});
