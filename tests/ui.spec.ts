import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

const BASE_URL = 'https://training-diary.web.app';

// Actively enables "Show Cardio Page" rather than hoping it's already on --
// same proven pattern as history.spec.ts's own ensureRunningEnabled(). The
// earlier version of the cardio UI tests below only checked isVisible()+skip,
// which raced against leftover toggle state from whichever test ran before it.
async function ensureRunningEnabled(page: import('@playwright/test').Page) {
  await page.locator('#sec-history .topbar-icon-btn').click();
  await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  const toggle = page.locator('#runningEnabledToggle');
  const isChecked = await toggle.isChecked().catch(() => false);
  if (!isChecked) {
    await page.locator('label.toggle-switch').filter({ has: toggle }).click();
  }
  await page.locator('#nav-history').click();
  await expect(page.locator('#sec-history')).toHaveClass(/active/);
  await expect(page.locator('.history-domain-btn[data-domain="cardio"]')).toBeVisible({ timeout: 10000 });
}

// Computes the WCAG contrast ratio between an element's text color and the
// nearest ancestor's opaque background color. Used by the theme/dark-mode
// regression checks below (TC-UI-016, TC-UI-020, TC-UI-023).
async function getContrastRatio(page: import('@playwright/test').Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    function parseColor(str: string): [number, number, number, number] {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts.length > 3 ? parts[3] : 1];
    }
    function luminance(rgb: number[]): number {
      const srgb = rgb.slice(0, 3).map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    }
    const textColor = parseColor(getComputedStyle(el).color);
    let bgEl: Element | null = el;
    let bg = parseColor(getComputedStyle(el).backgroundColor);
    while (bgEl && bg[3] === 0) {
      bgEl = bgEl.parentElement;
      if (!bgEl) { bg = [255, 255, 255, 1]; break; }
      bg = parseColor(getComputedStyle(bgEl).backgroundColor);
    }
    const l1 = luminance(textColor) + 0.05;
    const l2 = luminance(bg) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  });
}

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

  test('theme selector (light/dark/auto) changes the html data-theme attribute', async ({ page }) => {
    // #darkModeToggle no longer exists — same stale-selector issue already
    // fixed in settings.spec.ts's TC-FUNC-037. The app now uses a 3-way
    // light/dark/auto button group (#themeBtns / .theme-btn[data-theme]).
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    const themeBtns = page.locator('#themeBtns');
    await expect(themeBtns).toBeVisible();

    const originalTheme = await page.locator('html').getAttribute('data-theme');
    const darkBtn = page.locator('.theme-btn[data-theme="dark"]');
    const lightBtn = page.locator('.theme-btn[data-theme="light"]');

    await darkBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(darkBtn).toHaveClass(/active/);

    await lightBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(lightBtn).toHaveClass(/active/);

    // Restore whatever theme was active before this test ran
    if (originalTheme && originalTheme !== 'light') {
      await page.locator(`.theme-btn[data-theme="${originalTheme}"]`).click();
    }
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

test.describe('UI — Settings Theme Selector', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('TC-UI-015: theme selector buttons fit without overlap at 375px in light mode', { tag: ['@page-settings', '@area-settings', '@feature-theme-selector', '@type-ui'] }, async ({ page }) => {
    await page.locator('.theme-btn[data-theme="light"]').click();
    await expect(page.locator('.theme-btn[data-theme="light"]')).toHaveClass(/active/);

    const buttons = page.locator('#themeBtns .theme-btn');
    await expect(buttons).toHaveCount(3);

    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < 3; i++) {
      await expect(buttons.nth(i)).toBeVisible();
      const box = await buttons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      if (box) boxes.push(box);
    }

    const container = page.locator('#themeBtns');
    const containerBox = await container.boundingBox();
    if (containerBox) {
      expect(containerBox.x).toBeGreaterThanOrEqual(0);
      expect(containerBox.x + containerBox.width).toBeLessThanOrEqual(375 + 1);
    }

    // No horizontal overlap between adjacent buttons (cramped layout check)
    boxes.sort((a, b) => a.x - b.x);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width - 1);
    }

    // Active state must be visually distinguishable from inactive siblings.
    // .theme-btn.active's --card background resolves transparent in light
    // mode (matching the page background), so the real distinguishing
    // signal is box-shadow, not background-color -- check either.
    const activeStyle = await page.locator('.theme-btn.active').evaluate(el => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, shadow: cs.boxShadow };
    });
    const inactiveBg = await page.locator('.theme-btn:not(.active)').first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(activeStyle.bg !== inactiveBg || activeStyle.shadow !== 'none').toBe(true);
  });

  test('TC-UI-016: active Dark theme button keeps contrast/highlight against dark background', { tag: ['@page-settings', '@area-settings', '@feature-theme-selector', '@type-ui'] }, async ({ page }) => {
    await page.locator('.theme-btn[data-theme="dark"]').click();
    await expect(page.locator('.theme-btn[data-theme="dark"]')).toHaveClass(/active/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect(page.locator('.theme-btn.active')).toBeVisible();
    const activeContrast = await getContrastRatio(page, '.theme-btn.active');
    expect(activeContrast).toBeGreaterThanOrEqual(3);

    // The other two (Light/Auto) buttons must remain legible against the dark surface
    const otherButtons = page.locator('.theme-btn:not(.active)');
    const otherCount = await otherButtons.count();
    expect(otherCount).toBe(2);
    for (let i = 0; i < otherCount; i++) {
      await expect(otherButtons.nth(i)).toBeVisible();
    }

    // Restore to light theme so it doesn't leak into other tests
    await page.locator('.theme-btn[data-theme="light"]').click();
  });

  test('TC-UI-017: Edit Strength Plan / Edit Cardio Plan / Edit Measurement Types buttons do not overlap', { tag: ['@page-settings', '@area-settings', '@feature-theme-selector', '@type-ui'] }, async ({ page }) => {
    const editButtons = page.locator('button.settings-item');
    await expect(editButtons).toHaveCount(3);

    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const btn = editButtons.nth(i);
      await expect(btn).toBeVisible();
      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      if (box) boxes.push(box);

      // No text truncation on the title label
      const title = btn.locator('.settings-item-title');
      const isTruncated = await title.evaluate(el => el.scrollWidth > el.clientWidth + 1);
      expect(isTruncated).toBe(false);

      if (box) expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
    }

    // Vertically stacked with no overlap between consecutive buttons
    boxes.sort((a, b) => a.y - b.y);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height - 1);
    }
  });
});

test.describe('UI — History Domain & Cardio Stats', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
  });

  test('TC-UI-018: Strength/Cardio domain tab switcher fits at 375px without layout shift', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-ui'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    const strengthTab = page.locator('.history-domain-btn[data-domain="strength"]');
    const cardioTab = page.locator('.history-domain-btn[data-domain="cardio"]');
    await expect(strengthTab).toBeVisible();
    await expect(strengthTab).toHaveClass(/active/);

    const viewWidth = await page.evaluate(() => window.innerWidth);
    const bodyWidthBefore = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidthBefore).toBeLessThanOrEqual(viewWidth + 1);

    const strengthBox = await strengthTab.boundingBox();
    const cardioBox = await cardioTab.boundingBox();
    if (strengthBox && cardioBox) {
      // App is RTL (Hebrew) -- "cardio" (second tab) legitimately sits to
      // the LEFT of "strength" (first tab) with a SMALLER x, not larger.
      // Check direction-agnostic non-overlap instead of assuming LTR order.
      const noOverlap =
        cardioBox.x >= strengthBox.x + strengthBox.width - 1 ||
        strengthBox.x >= cardioBox.x + cardioBox.width - 1;
      expect(noOverlap).toBe(true);
      expect(Math.max(strengthBox.x + strengthBox.width, cardioBox.x + cardioBox.width)).toBeLessThanOrEqual(375 + 1);
    }

    await cardioTab.click();
    await expect(cardioTab).toHaveClass(/active/);
    await expect(strengthTab).not.toHaveClass(/active/);

    const bodyWidthAfter = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidthAfter).toBeLessThanOrEqual(viewWidth + 1);

    // Restore
    await strengthTab.click();
  });

  test('TC-UI-019: Cardio stats block (streak, best distance/pace, lowest HR) lays out without overflow at 375px', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-ui'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    const cardioTab = page.locator('.history-domain-btn[data-domain="cardio"]');
    await cardioTab.click();
    // #run-streak-card starts genuinely empty in the DOM until renderCardioHistoryStats()
    // awaits the data fetch and writes innerHTML -- waiting on it directly (the
    // proven pattern from history.spec.ts) is more robust than waiting on a
    // child element that doesn't exist at all until that same render completes.
    await expect(page.locator('#run-streak-card')).not.toBeEmpty({ timeout: 10000 });

    const stats = page.locator('#cardioHistoryStats');
    await expect(stats).toBeVisible();

    const statsBox = await stats.boundingBox();
    if (statsBox) {
      expect(statsBox.x).toBeGreaterThanOrEqual(0);
      expect(statsBox.x + statsBox.width).toBeLessThanOrEqual(375 + 1);
    }

    await expect(page.locator('#run-streak-card')).toBeVisible();
    await expect(page.locator('#run-prs-card')).toBeVisible();

    const runStats = page.locator('#run-prs-card .run-stat');
    await expect(runStats).toHaveCount(3);
    const statCount = await runStats.count();
    for (let i = 0; i < statCount; i++) {
      const box = await runStats.nth(i).boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);

      const val = runStats.nth(i).locator('.run-stat-val');
      const truncated = await val.evaluate(el => el.scrollWidth > el.clientWidth + 1);
      expect(truncated).toBe(false);
    }

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);
  });

  test('TC-UI-020: Cardio stats remain readable (contrast) in dark mode at 375px', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-ui'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    const cardioTab = page.locator('.history-domain-btn[data-domain="cardio"]');
    await cardioTab.click();
    await expect(page.locator('#run-streak-card')).not.toBeEmpty({ timeout: 10000 });

    // Switch to dark mode via Settings, then return to the Cardio history view.
    // We're on History right now, not Main -- #mainGearBtn only exists in
    // #sec-main's topbar (same fix as security.spec.ts's readCardioStats).
    await page.locator('#sec-history .topbar-icon-btn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    await page.locator('.theme-btn[data-theme="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
    await expect(cardioTab).toBeVisible({ timeout: 10000 });
    await cardioTab.click();
    await expect(page.locator('#run-streak-card')).not.toBeEmpty({ timeout: 10000 });

    const streakContrast = await getContrastRatio(page, '.run-streak-num');
    expect(streakContrast).toBeGreaterThanOrEqual(4.5);

    const streakLblContrast = await getContrastRatio(page, '.run-streak-lbl');
    expect(streakLblContrast).toBeGreaterThanOrEqual(4.5);

    const statValContrast = await getContrastRatio(page, '#run-prs-card .run-stat-val');
    expect(statValContrast).toBeGreaterThanOrEqual(4.5);

    const statLblContrast = await getContrastRatio(page, '#run-prs-card .run-stat-lbl');
    expect(statLblContrast).toBeGreaterThanOrEqual(4.5);

    // Restore to light theme so it doesn't leak into other tests -- still on
    // History (cardio view) here too, same gear-icon fix as above.
    await page.locator('#sec-history .topbar-icon-btn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    await page.locator('.theme-btn[data-theme="light"]').click();
  });

  test('TC-UI-021: Cardio period filter buttons (Month/Year/All) fit without horizontal scroll at 375px', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-ui'] }, async ({ page }) => {
    await ensureRunningEnabled(page);
    const cardioTab = page.locator('.history-domain-btn[data-domain="cardio"]');
    await cardioTab.click();
    await expect(page.locator('#run-streak-card')).not.toBeEmpty({ timeout: 10000 });

    const monthBtn = page.locator('.run-range-btn[data-range="month"]');
    const yearBtn = page.locator('.run-range-btn[data-range="year"]');
    const allBtn = page.locator('.run-range-btn[data-range="all"]');
    await expect(monthBtn).toBeVisible();
    await expect(yearBtn).toBeVisible();
    await expect(allBtn).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewWidth + 1);

    for (const btn of [monthBtn, yearBtn, allBtn]) {
      const box = await btn.boundingBox();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
      }
    }
  });
});

test.describe('UI — Login Screen', () => {
  test('TC-UI-022: Google Sign In button and Forgot password link are visible above the fold at 375px', { tag: ['@page-login', '@area-auth', '@feature-google-signin', '@type-ui'] }, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const googleBtn = page.locator('.auth-google-btn');
    const forgotLink = page.locator('.auth-forgot');
    const submitBtn = page.locator('#auth-submit-btn');
    await expect(googleBtn).toBeVisible();
    await expect(forgotLink).toBeVisible();

    const googleBox = await googleBtn.boundingBox();
    const forgotBox = await forgotLink.boundingBox();
    const submitBox = await submitBtn.boundingBox();

    // Both elements visible above the fold on a typical mobile viewport
    if (googleBox) expect(googleBox.y + googleBox.height).toBeLessThanOrEqual(812);
    if (forgotBox) expect(forgotBox.y + forgotBox.height).toBeLessThanOrEqual(812);

    // Google button must not visually overlap/compete with the primary Sign In button
    if (googleBox && submitBox) {
      const overlapsVertically = googleBox.y < submitBox.y + submitBox.height && googleBox.y + googleBox.height > submitBox.y;
      const overlapsHorizontally = googleBox.x < submitBox.x + submitBox.width && googleBox.x + googleBox.width > submitBox.x;
      expect(overlapsVertically && overlapsHorizontally).toBe(false);
    }
  });

  test('TC-UI-023: Google Sign In button retains contrast/legibility in dark mode at 375px', { tag: ['@page-login', '@area-auth', '@feature-google-signin', '@type-ui'] }, async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('theme', 'dark'); } catch (e) { /* ignore */ }
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const googleBtn = page.locator('.auth-google-btn');
    await expect(googleBtn).toBeVisible();

    const contrast = await getContrastRatio(page, '.auth-google-btn');
    expect(contrast).toBeGreaterThanOrEqual(3);

    // Regression guard: button background must follow the app theme, not stay hardcoded white
    const btnBg = await googleBtn.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(btnBg).not.toBe('rgb(255, 255, 255)');
  });
});
