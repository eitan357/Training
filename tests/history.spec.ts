import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

// Fix Round 1 / Finding 3 gated the History cardio toggle behind the same
// runningEnabled flag every other cardio entry point already respects
// (#nav-running, boot route resolution, navigateTo()). The toggle button is
// now hidden — and switchHistoryDomain('cardio') defensively no-ops back to
// strength — whenever runningEnabled is off, so any test touching the
// cardio domain must enable it first, exactly like running.spec.ts's own
// cardio tests already do via this same pattern.
async function ensureRunningEnabled(page: import('@playwright/test').Page) {
  // Scoped to #sec-history: unlike #mainGearBtn (only visible from #sec-main),
  // this test suite's beforeEach always lands on #sec-history first, and its
  // own gear button is the one actually visible there (see the existing
  // "gear icon in history navigates to settings" test above for the pattern).
  await page.locator('#sec-history .topbar-icon-btn').click();
  await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  const toggle = page.locator('#runningEnabledToggle');
  const isChecked = await toggle.isChecked().catch(() => false);
  if (!isChecked) {
    await page.locator('label.toggle-switch').filter({ has: toggle }).click();
  }
  // The cardio toggle button lives in #sec-history, which isn't rendered
  // while #sec-settings is active — navigate back before asserting on it.
  await page.locator('#nav-history').click();
  await expect(page.locator('#sec-history')).toHaveClass(/active/);
  await expect(page.locator('.history-domain-btn[data-domain="cardio"]')).toBeVisible({ timeout: 10000 });
}

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

  test('switching to אירובי shows cardio entries and the stats block', async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await expect(page.locator('#cardioHistoryStats')).toBeVisible();
  });

  test('cardio history entries can be edited and deleted', async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    // switchHistoryDomain() awaits the cardio data promise before calling
    // renderHistory() (see index.html's comment on switchHistoryDomain), so
    // #historyList briefly shows its "Loading..." state right after the
    // domain-button click. Without this wait, .session-header count reads 0
    // and the test skips itself every run regardless of real data.
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    test.skip(await header.count() === 0, 'no cardio history in this test account');
    // Cardio's history view has the streak/PR/charts block (relocated here
    // in an earlier task) above the list, which reliably pushes the first
    // row below the fold. page.mouse.move/down/up (unlike locator .click())
    // does not auto-scroll, so without this the synthetic mousedown lands
    // outside the viewport and #historyList's long-press listener never
    // fires at all — the row silently never gets selected.
    await header.scrollIntoViewIfNeeded();
    const box = await header.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.locator('#histBulkEditBtn').click();
    await expect(page.locator('.edit-session-wrap')).toBeVisible();
  });

  // qa-state.json's TC-FUNC-040..048 describe these cardio stats as living on
  // a standalone "/" dashboard page. That page does not exist (verified
  // against public/index.html) — the streak/PR/period-filter block lives
  // inside History's Cardio domain (#cardioHistoryStats), toggled by
  // switchHistoryDomain('cardio'). These tests target that real structure.

  test('TC-FUNC-040: switching to the cardio domain tab shows cardio stats and swaps the domain toggle state', { tag: ['@page-history', '@area-cardio', '@feature-domain-switch', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await expect(page.locator('.history-domain-btn[data-domain="strength"]')).toHaveClass(/active/);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await expect(page.locator('.history-domain-btn[data-domain="cardio"]')).toHaveClass(/active/);
    await expect(page.locator('.history-domain-btn[data-domain="strength"]')).not.toHaveClass(/active/);
    await expect(page.locator('#cardioHistoryStats')).toBeVisible();
  });

  test('TC-FUNC-041: cardio domain displays all four summary stats (streak, best distance, best pace, lowest HR)', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await expect(page.locator('#run-streak-card .run-streak-num')).toBeVisible();
    await expect(page.locator('#run-streak-card .run-streak-lbl')).not.toBeEmpty();

    const stats = page.locator('#run-prs-card .run-stat');
    await expect(stats).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(stats.nth(i).locator('.run-stat-val')).not.toBeEmpty();
      await expect(stats.nth(i).locator('.run-stat-lbl')).not.toBeEmpty();
    }
  });

  test('TC-FUNC-042: cardio period filter - Month becomes the active range', { tag: ['@page-history', '@area-cardio', '@feature-period-filter', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await page.locator('.run-range-btn[data-range="month"]').click();
    await expect(page.locator('.run-range-btn[data-range="month"]')).toHaveClass(/active/);
    await expect(page.locator('.run-range-btn[data-range="year"]')).not.toHaveClass(/active/);
    await expect(page.locator('.run-range-btn[data-range="all"]')).not.toHaveClass(/active/);
  });

  test('TC-FUNC-043: cardio period filter - Year becomes the active range', { tag: ['@page-history', '@area-cardio', '@feature-period-filter', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    // Force a change away from Year first (it's the default-active range on
    // load) so this assertion actually exercises runSetRange('year') rather
    // than observing a class that was never touched.
    await page.locator('.run-range-btn[data-range="month"]').click();
    await page.locator('.run-range-btn[data-range="year"]').click();
    await expect(page.locator('.run-range-btn[data-range="year"]')).toHaveClass(/active/);
    await expect(page.locator('.run-range-btn[data-range="month"]')).not.toHaveClass(/active/);
    await expect(page.locator('.run-range-btn[data-range="all"]')).not.toHaveClass(/active/);
  });

  test('TC-FUNC-044: cardio period filter - All becomes the active range', { tag: ['@page-history', '@area-cardio', '@feature-period-filter', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await page.locator('.run-range-btn[data-range="all"]').click();
    await expect(page.locator('.run-range-btn[data-range="all"]')).toHaveClass(/active/);
    await expect(page.locator('.run-range-btn[data-range="month"]')).not.toHaveClass(/active/);
    await expect(page.locator('.run-range-btn[data-range="year"]')).not.toHaveClass(/active/);
  });

  // TC-FUNC-045..048: qa-state.json frames these as "dashboard stat is
  // display-only with no navigation" (click it, assert URL unchanged). There
  // is no dashboard and no navigation to not-happen — renderCardioHistoryStats()
  // (index.html ~line 1744) builds these as plain <div>s with no onclick/href/role.
  // The real-world equivalent is asserting they are inert markup, not links or
  // buttons, rather than clicking and checking the URL.

  test('TC-FUNC-045: the streak stat is a plain non-interactive element', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    const streakNum = page.locator('#run-streak-card .run-streak-num');
    await expect(streakNum).toBeVisible();
    const info = await streakNum.evaluate(el => ({
      tag: el.tagName,
      hasOnclick: el.hasAttribute('onclick'),
      role: el.getAttribute('role'),
      href: el.getAttribute('href'),
    }));
    expect(['DIV', 'SPAN']).toContain(info.tag);
    expect(info.hasOnclick).toBe(false);
    expect(info.role).not.toBe('button');
    expect(info.role).not.toBe('link');
    expect(info.href).toBeNull();
  });

  test('TC-FUNC-046: the best-distance PR stat is a plain non-interactive element', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    const bestDistance = page.locator('#run-prs-card .run-stat').nth(0);
    await expect(bestDistance.locator('.run-stat-val')).toBeVisible();
    const info = await bestDistance.evaluate(el => ({
      tag: el.tagName,
      hasOnclick: el.hasAttribute('onclick'),
      role: el.getAttribute('role'),
      href: el.getAttribute('href'),
    }));
    expect(['DIV', 'SPAN']).toContain(info.tag);
    expect(info.hasOnclick).toBe(false);
    expect(info.role).not.toBe('button');
    expect(info.role).not.toBe('link');
    expect(info.href).toBeNull();
  });

  test('TC-FUNC-047: the best-pace PR stat is a plain non-interactive element', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    const bestPace = page.locator('#run-prs-card .run-stat').nth(1);
    await expect(bestPace.locator('.run-stat-val')).toBeVisible();
    const info = await bestPace.evaluate(el => ({
      tag: el.tagName,
      hasOnclick: el.hasAttribute('onclick'),
      role: el.getAttribute('role'),
      href: el.getAttribute('href'),
    }));
    expect(['DIV', 'SPAN']).toContain(info.tag);
    expect(info.hasOnclick).toBe(false);
    expect(info.role).not.toBe('button');
    expect(info.role).not.toBe('link');
    expect(info.href).toBeNull();
  });

  test('TC-FUNC-048: the lowest-HR PR stat is a plain non-interactive element', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-functional'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    const lowestHr = page.locator('#run-prs-card .run-stat').nth(2);
    await expect(lowestHr.locator('.run-stat-val')).toBeVisible();
    const info = await lowestHr.evaluate(el => ({
      tag: el.tagName,
      hasOnclick: el.hasAttribute('onclick'),
      role: el.getAttribute('role'),
      href: el.getAttribute('href'),
    }));
    expect(['DIV', 'SPAN']).toContain(info.tag);
    expect(info.hasOnclick).toBe(false);
    expect(info.role).not.toBe('button');
    expect(info.role).not.toBe('link');
    expect(info.href).toBeNull();
  });

  // TC-NEG-041..043: period filter equivalence classes (month/year/all) —
  // each valid value must both activate its own button and deactivate the
  // other two, so no two range buttons are ever simultaneously active.

  test('TC-NEG-041: period filter valid value "month" activates only the Month button', { tag: ['@page-history', '@area-cardio', '@feature-period-filter', '@type-negative'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await page.locator('.run-range-btn[data-range="month"]').click();
    const activeButtons = page.locator('.run-range-btn.active');
    await expect(activeButtons).toHaveCount(1);
    await expect(activeButtons.first()).toHaveAttribute('data-range', 'month');
  });

  test('TC-NEG-042: period filter valid value "year" activates only the Year button', { tag: ['@page-history', '@area-cardio', '@feature-period-filter', '@type-negative'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await page.locator('.run-range-btn[data-range="month"]').click();
    await page.locator('.run-range-btn[data-range="year"]').click();
    const activeButtons = page.locator('.run-range-btn.active');
    await expect(activeButtons).toHaveCount(1);
    await expect(activeButtons.first()).toHaveAttribute('data-range', 'year');
  });

  test('TC-NEG-043: period filter valid value "all" activates only the All button', { tag: ['@page-history', '@area-cardio', '@feature-period-filter', '@type-negative'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await page.locator('.run-range-btn[data-range="all"]').click();
    const activeButtons = page.locator('.run-range-btn.active');
    await expect(activeButtons).toHaveCount(1);
    await expect(activeButtons.first()).toHaveAttribute('data-range', 'all');
  });

  // TC-NEG-044: qa-state.json's case injects an invalid `period` value via
  // the URL query string (/history?type=cardio&period=bogus). Verified there
  // is no URLSearchParams/location.search reader anywhere in index.html —
  // runSetRange() is only ever invoked from the range buttons' onclick
  // handlers, never from URL state. There is no query-param injection point
  // for this app to gracefully fall back from, so the case doesn't apply.
  test.fixme('TC-NEG-044: invalid period value via URL query param manipulation', async () => {
    // App does not expose period/range via a URL query param — no injection
    // point exists (confirmed: no URLSearchParams/location.search usage in
    // public/index.html). runSetRange() is driven only by in-app button clicks.
  });
});
