import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

const BASE_URL = 'https://training-diary.web.app';

test.describe('Accessibility — Auth Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('email input has associated label or aria-label', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const emailInput = page.locator('#auth-email');
    const hasLabel = await emailInput.evaluate(el => {
      const id = el.id;
      const labelEl = document.querySelector(`label[for="${id}"]`);
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      return !!(labelEl || ariaLabel || ariaLabelledBy || (el as HTMLInputElement).placeholder);
    });
    expect(hasLabel).toBe(true);
  });

  test('password input has associated label or aria-label', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const pwInput = page.locator('#auth-password');
    const hasLabel = await pwInput.evaluate(el => {
      const id = el.id;
      const labelEl = document.querySelector(`label[for="${id}"]`);
      const ariaLabel = el.getAttribute('aria-label');
      return !!(labelEl || ariaLabel || (el as HTMLInputElement).placeholder);
    });
    expect(hasLabel).toBe(true);
  });

  test('submit button has accessible text', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const submitBtn = page.locator('#auth-submit-btn');
    const text = await submitBtn.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('html element has lang attribute', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });

  test('page has a meaningful title', async ({ page }) => {
    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);
    expect(title).not.toBe('Document');
  });
});

test.describe('Accessibility — Authenticated App', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('all navigation buttons have discernible text or aria-label', async ({ page }) => {
    const navItems = page.locator('.bottomnav .nav-item, .nav-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i);
      const isVisible = await item.isVisible();
      if (!isVisible) continue;

      const text = await item.textContent();
      const ariaLabel = await item.getAttribute('aria-label');
      const title = await item.getAttribute('title');
      expect(!!(text?.trim() || ariaLabel || title)).toBe(true);
    }
  });

  test('topbar gear buttons have title attributes', async ({ page }) => {
    await page.locator('#nav-main').click();
    const gearBtn = page.locator('#mainGearBtn');
    await expect(gearBtn).toBeVisible();
    const title = await gearBtn.getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('exercise card inputs have some form of labeling', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });

    // Clicking an already-active type button is a no-op (selectType()
    // early-returns when unchanged) — on a fresh boot with no local cache
    // yet, the initially-active type can render zero exercise cards with
    // nothing to trigger a render until a REAL type change happens (a
    // pre-existing, documented baseline flake in this suite's helpers).
    // Click whichever button isn't already active to guarantee one.
    const typeButtons = page.locator('#typeRow button, #typeRow .type-btn');
    const typeCount = await typeButtons.count();
    let firstType = typeButtons.first();
    for (let i = 0; i < typeCount; i++) {
      const isActive = await typeButtons.nth(i).evaluate(el => el.classList.contains('active'));
      if (!isActive) { firstType = typeButtons.nth(i); break; }
    }
    await firstType.click();
    const firstCard = page.locator('#exerciseList .card').first();
    await expect(firstCard).toBeVisible({ timeout: 8000 });

    const weightInput = firstCard.locator('.ex-weight');
    const accessible = await weightInput.evaluate(el => {
      const label = el.closest('.card')?.querySelector('label');
      const ariaLabel = el.getAttribute('aria-label');
      const title = el.getAttribute('title');
      const placeholder = (el as HTMLInputElement).placeholder;
      return !!(label || ariaLabel || title || placeholder);
    });
    expect(accessible).toBe(true);
  });

  test('draft modal has aria-modal and role attributes', async ({ page }) => {
    const modal = page.locator('#draftModal');
    const role = await modal.getAttribute('role');
    const ariaModal = await modal.getAttribute('aria-modal');
    expect(role).toBe('dialog');
    expect(ariaModal).toBe('true');
  });
});

// ─────────────────────────────────────────────────────────────────
// TC-A11Y-007 through TC-A11Y-013
//
// NOTE on axe-core: this project does not actually have @axe-core/playwright
// installed (no such package in package.json, package-lock.json, or
// node_modules), and no existing spec file in tests/ imports it — despite
// qa-state.json test_cases.accessibility labelling several of these cases
// "tool": "axe-core". Rather than add a new dependency, the "axe-core scan"
// cases below (008, 011, 012) are written as manual DOM/ARIA equivalents,
// matching this file's existing convention (hand-rolled label/role/name
// assertions rather than a real axe engine run).
//
// NOTE on TC-A11Y-009: qa-state.json's test case text assumes the Strength
// Plan / Cardio Workout Plan editors are modals with a focus trap. Reading
// the real handlers in public/index.html shows this is wrong:
//   function openWorkoutEdit()  { navigateTo('/settings/workout-plan'); }
//   function openCardioEdit()   { navigateTo('/settings/cardio-plan'); }
// navigateTo() does a pushState route change and swaps in-page panel
// visibility (_setWorkoutEditPanel / _setCardioEditPanel) — there is no
// role="dialog"/aria-modal anywhere near these panels (only #draftModal has
// that), no Escape-key handler for them, and no .focus() call when they
// open. So TC-A11Y-009 below tests the real mechanism (route navigation,
// visible back button, no modal semantics) instead of a nonexistent
// modal focus-trap.
//
// NOTE on TC-A11Y-007/010: neither the theme selector (.theme-btn) nor the
// history domain switcher (.history-domain-btn) carries aria-pressed,
// aria-selected, role="tab", or role="tablist" anywhere in the app (grepped
// the full public/index.html) — active state is exposed via a CSS "active"
// class only. The tests below assert the correctness requirement from
// qa-state.json (state exposed via ARIA, not color/class alone) as written;
// they are expected to currently FAIL against production, which is the
// correct behavior for an accessibility test flagging a real gap.
//
// NOTE on TC-A11Y-011: qa-state.json's map lists the cardio period filters
// as `button[data-period='month'|'year'|'all']`. The real markup uses
// `.run-range-btn[data-range="month"|"year"|"all"]` (see run-range-row in
// public/index.html) — updated accordingly below.
// ─────────────────────────────────────────────────────────────────

test.describe('Accessibility — Settings: Theme Selector & Plan-Edit Buttons', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.evaluate(() => (window as any).navigateTo('/settings'));
    await expect(page.locator('#themeBtns')).toBeVisible();
  });

  test(
    'TC-A11Y-007 theme selector (Light/Dark/Auto) keyboard navigation and aria-pressed/aria-selected state exposure',
    { tag: ['@page-settings', '@area-settings', '@feature-theme-selector', '@type-accessibility'] },
    async ({ page }) => {
      const lightBtn = page.locator('.theme-btn[data-theme="light"]');
      const darkBtn = page.locator('.theme-btn[data-theme="dark"]');
      const autoBtn = page.locator('.theme-btn[data-theme="auto"]');

      // All three buttons must be reachable via Tab, in visual order.
      await lightBtn.focus();
      await expect(lightBtn).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

      await page.keyboard.press('Tab');
      await expect(darkBtn).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      await page.keyboard.press('Tab');
      await expect(autoBtn).toBeFocused();
      await page.keyboard.press('Enter');

      // The active theme must be exposed via aria-pressed or aria-selected,
      // not the "active" CSS class / color alone.
      const activeBtn = page.locator('.theme-btn.active');
      await expect(activeBtn).toHaveCount(1);
      const ariaState = await activeBtn.evaluate(
        el => el.getAttribute('aria-pressed') ?? el.getAttribute('aria-selected')
      );
      expect(
        ariaState,
        'active theme button must expose state via aria-pressed or aria-selected, not the "active" CSS class alone'
      ).not.toBeNull();
    }
  );

  test(
    'TC-A11Y-008 theme selector button group — manual accessibility check (axe-core equivalent; package not installed in project)',
    { tag: ['@page-settings', '@area-settings', '@feature-theme-selector', '@type-accessibility'] },
    async ({ page }) => {
      const buttons = page.locator('#themeBtns .theme-btn');
      await expect(buttons).toHaveCount(3);

      // Each button has a distinct, non-empty accessible name.
      const texts = (await buttons.allTextContents()).map(t => t.trim());
      for (const text of texts) expect(text.length).toBeGreaterThan(0);
      expect(new Set(texts).size).toBe(texts.length);

      // Any ARIA state attributes present must carry valid boolean values.
      const count = await buttons.count();
      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        const pressed = await btn.getAttribute('aria-pressed');
        if (pressed !== null) expect(['true', 'false']).toContain(pressed);
        const selected = await btn.getAttribute('aria-selected');
        if (selected !== null) expect(['true', 'false']).toContain(selected);
      }
    }
  );

  test(
    'TC-A11Y-009 Edit Strength Plan / Edit Cardio Workout Plan buttons navigate to a route (not a modal) — focus/keyboard reachability on the destination panel',
    { tag: ['@page-settings', '@area-settings', '@feature-plan-edit', '@type-accessibility'] },
    async ({ page }) => {
      // Strength plan editor
      const strengthBtn = page.locator('button.settings-item[onclick="openWorkoutEdit()"]');
      await expect(strengthBtn).toBeVisible();
      await strengthBtn.click();

      await expect(page).toHaveURL(/\/settings\/workout-plan$/);
      // This is a route change, not a modal dialog.
      await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);

      const strengthEditPanel = page.locator('#mainEditPanel');
      await expect(strengthEditPanel).toBeVisible();
      const strengthBackBtn = page.locator('#mainBackBtn');
      await expect(strengthBackBtn).toBeVisible();
      await strengthBackBtn.focus();
      await expect(strengthBackBtn).toBeFocused();

      await strengthBackBtn.click();
      await expect(page).toHaveURL(/\/settings$/);

      // Cardio workout plan editor — same route-navigation mechanism.
      const cardioBtn = page.locator('button.settings-item[onclick="openCardioEdit()"]');
      await expect(cardioBtn).toBeVisible();
      await cardioBtn.click();

      await expect(page).toHaveURL(/\/settings\/cardio-plan$/);
      await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);

      const cardioEditPanel = page.locator('#cardioEditPanel');
      await expect(cardioEditPanel).toBeVisible();
      const cardioBackBtn = page.locator('#cardioBackBtn');
      await expect(cardioBackBtn).toBeVisible();
      await cardioBackBtn.focus();
      await expect(cardioBackBtn).toBeFocused();
    }
  );
});

test.describe('Accessibility — History Domain Switcher', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.evaluate(() => (window as any).navigateTo('/history'));
    await expect(page.locator('.history-domain-btn[data-domain="strength"]')).toBeVisible();
  });

  test(
    'TC-A11Y-010 Strength/Cardio domain tab switcher is plain buttons (no WAI-ARIA tabs pattern) — keyboard operability and state exposure',
    { tag: ['@page-history', '@area-cardio', '@feature-domain-switch', '@type-accessibility'] },
    async ({ page }) => {
      const strengthBtn = page.locator('.history-domain-btn[data-domain="strength"]');
      const cardioBtn = page.locator('.history-domain-btn[data-domain="cardio"]');

      // Confirm which pattern is actually implemented before asserting on it.
      await expect(page.locator('[role="tablist"]')).toHaveCount(0);
      await expect(page.locator('.history-domain-btn[role="tab"]')).toHaveCount(0);
      expect(await strengthBtn.evaluate(el => el.tagName)).toBe('BUTTON');
      expect(await cardioBtn.evaluate(el => el.tagName)).toBe('BUTTON');

      // Plain <button> elements are natively keyboard-operable: Tab reaches
      // them and Enter activates them, with no custom Arrow-key handling
      // required (that's only needed for the full ARIA tabs pattern, which
      // isn't what's implemented here).
      await cardioBtn.focus();
      await expect(cardioBtn).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(cardioBtn).toHaveClass(/active/);
      await expect(page.locator('#cardioHistoryStats')).toBeVisible();

      // The active domain must be exposed via ARIA state, not the "active"
      // CSS class / visual styling alone.
      const ariaState = await cardioBtn.evaluate(
        el => el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed')
      );
      expect(
        ariaState,
        'active domain button must expose state via aria-selected or aria-pressed, not visual styling alone'
      ).not.toBeNull();
    }
  );

  test(
    'TC-A11Y-011 Cardio domain view (stats + range filters) — manual accessibility check (axe-core equivalent; package not installed in project)',
    { tag: ['@page-history', '@area-cardio', '@feature-domain-switch', '@type-accessibility'] },
    async ({ page }) => {
      await page.locator('.history-domain-btn[data-domain="cardio"]').click();
      await expect(page.locator('#cardioHistoryStats')).toBeVisible();

      // Range filter controls (real markup: .run-range-btn[data-range=...],
      // not the data-period selector assumed in qa-state.json) have
      // accessible names.
      const rangeButtons = page.locator('.run-range-btn');
      const rangeCount = await rangeButtons.count();
      expect(rangeCount).toBeGreaterThan(0);
      const rangeTexts = await rangeButtons.allTextContents();
      for (const text of rangeTexts) expect(text.trim().length).toBeGreaterThan(0);

      // Stat cards render discernible text content, not empty/icon-only regions.
      const streakCard = page.locator('#run-streak-card');
      const prsCard = page.locator('#run-prs-card');
      await expect(streakCard).toBeVisible();
      await expect(prsCard).toBeVisible();
      expect((await streakCard.textContent())?.trim().length).toBeGreaterThan(0);
      expect((await prsCard.textContent())?.trim().length).toBeGreaterThan(0);
    }
  );
});

test.describe('Accessibility — Login Screen: Google Sign-In & Forgot Password', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test(
    'TC-A11Y-012 login screen — Google sign-in and forgot-password link accessibility check (axe-core equivalent; package not installed in project)',
    { tag: ['@page-login', '@area-auth', '@feature-google-signin', '@type-accessibility'] },
    async ({ page }) => {
      const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
      if (!authVisible) { test.skip(); return; }

      // Real markup: .auth-forgot is a <button onclick="handleForgotPassword()">,
      // not the `a[href*='password']` link assumed in qa-state.json's page map.
      const googleBtn = page.locator('.auth-google-btn');
      const forgotBtn = page.locator('.auth-forgot');
      await expect(googleBtn).toBeVisible();
      await expect(forgotBtn).toBeVisible();

      const googleText = (await googleBtn.textContent())?.trim();
      const forgotText = (await forgotBtn.textContent())?.trim();
      expect(googleText?.length).toBeGreaterThan(0);
      expect(forgotText?.length).toBeGreaterThan(0);

      // No unlabeled icon-only controls anywhere on the login screen.
      const allControls = page.locator('#auth-screen button, #auth-screen a');
      const total = await allControls.count();
      for (let i = 0; i < total; i++) {
        const el = allControls.nth(i);
        if (!(await el.isVisible())) continue;
        const text = await el.textContent();
        const ariaLabel = await el.getAttribute('aria-label');
        const title = await el.getAttribute('title');
        expect(!!(text?.trim() || ariaLabel || title)).toBe(true);
      }
    }
  );

  test(
    'TC-A11Y-013 login screen keyboard tab-order reaches Google sign-in and forgot-password without skip or trap',
    { tag: ['@page-login', '@area-auth', '@feature-google-signin', '@type-accessibility'] },
    async ({ page }) => {
      const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
      if (!authVisible) { test.skip(); return; }

      const emailInput = page.locator('#auth-email');
      const passwordInput = page.locator('#auth-password');
      const submitBtn = page.locator('#auth-submit-btn');
      const forgotBtn = page.locator('.auth-forgot');
      const googleBtn = page.locator('.auth-google-btn');

      // Real DOM order in public/index.html: email → password → submit →
      // forgot-password → (separator, not focusable) → Google sign-in.
      await emailInput.focus();
      await expect(emailInput).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(passwordInput).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(submitBtn).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(forgotBtn).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(googleBtn).toBeFocused();
    }
  );
});
