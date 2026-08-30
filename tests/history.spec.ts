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

  test('expand strip is present and toggles the row independently of the header', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const strip = page.locator('.expand-strip').first();
    if (await strip.count() === 0) test.skip(true, 'no history rows available in this test account');

    await expect(page.locator('.session-header .chevron')).toHaveCount(0);

    const card = page.locator('.session-card').first();
    const wasOpen = await card.evaluate(c => c.querySelector('.session-body').classList.contains('open'));
    await strip.click();
    const isOpen = await card.evaluate(c => c.querySelector('.session-body').classList.contains('open'));
    expect(isOpen).toBe(!wasOpen);
    await expect(strip).toHaveClass(new RegExp(isOpen ? 'open' : '^(?!.*open).*$'));
  });

  test('clicking a different row\'s expand strip while a selection is active still opens it (not select)', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 1 || document.querySelector('.empty'), { timeout: 15000 });
    const headers = page.locator('.session-header');
    if (await headers.count() < 2) test.skip(true, 'need at least 2 history rows for this test');

    const box = await headers.nth(0).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(page.locator('.session-card').first()).toHaveClass(/sel-active/);

    const secondCard = page.locator('.session-card').nth(1);
    const secondStrip = page.locator('.expand-strip').nth(1);
    const bodyBefore = await secondCard.evaluate(c => c.querySelector('.session-body').classList.contains('open'));
    await secondStrip.click();
    const bodyAfter = await secondCard.evaluate(c => c.querySelector('.session-body').classList.contains('open'));
    const secondSelected = await secondCard.evaluate(c => c.classList.contains('sel-active'));

    expect(bodyAfter).toBe(!bodyBefore);
    expect(secondSelected).toBe(false);
  });

  test('touch: short tap opens a row without the browser\'s synthetic click undoing it', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use?.hasTouch, 'requires a project with hasTouch enabled (e.g. mobile-android)');
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    if (await header.count() === 0) test.skip(true, 'no history rows available in this test account');

    const box = await header.boundingBox();
    const wasOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // Give the browser's ~300ms synthetic compatibility click a chance to
    // fire and (pre-fix) undo the real tap's effect before asserting.
    await page.waitForTimeout(500);

    const isOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));
    expect(isOpen).toBe(!wasOpen);
  });

  test('touch: long-press selects a row, then a short tap on another row selects it too, on the real touch path', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.use?.hasTouch, 'requires a project with hasTouch enabled (e.g. mobile-android)');
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 1 || document.querySelector('.empty'), { timeout: 15000 });
    const headers = page.locator('.session-header');
    if (await headers.count() < 2) test.skip(true, 'need at least 2 history rows for this test');

    const box1 = await headers.nth(0).boundingBox();
    const touch = await page.context().newCDPSession(page);
    // Playwright's touchscreen has no press-and-hold primitive, so drive a
    // real long-press via raw touch dispatch through CDP: touch down, wait
    // past HIST_LONG_PRESS_MS, touch up — this exercises the exact
    // touchstart/touchend path the fix targets, not mouse emulation.
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 }] });
    await page.waitForTimeout(650);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);

    await expect(page.locator('.session-card').first()).toHaveClass(/sel-active/);
    await expect(page.locator('#histBulkBar')).toBeVisible();

    const box2 = await headers.nth(1).boundingBox();
    await page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(500);

    await expect(page.locator('.session-card').nth(1)).toHaveClass(/sel-active/);
  });
});
