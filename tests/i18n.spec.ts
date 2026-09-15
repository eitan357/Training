import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

const BASE_URL = 'https://training-diary.web.app';

test.describe('i18n — Language & Direction', () => {
  test('default page direction is RTL (Hebrew)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const dir = await page.locator('html').getAttribute('dir');
    // Default language is Hebrew → RTL
    expect(dir).toBe('rtl');
  });

  test('default lang attribute is "he"', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('he');
  });

  test.describe('Language switching', () => {
    test.beforeEach(async ({ page }) => {
      requiresCredentials();
      await loginWithEmailPassword(page);
      await waitForAppReady(page);
      await page.locator('#mainGearBtn').click();
      await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    });

    test('switching to English changes lang to "en" and dir to "ltr"', async ({ page }) => {
      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }

      // Click English button (second button, assuming Hebrew is first)
      await langBtns.nth(1).click();
      await page.waitForTimeout(600);

      const lang = await page.locator('html').getAttribute('lang');
      const dir = await page.locator('html').getAttribute('dir');

      expect(lang).toBe('en');
      expect(dir).toBe('ltr');
    });

    test('switching back to Hebrew restores lang "he" and dir "rtl"', async ({ page }) => {
      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }

      // Switch to English first
      await langBtns.nth(1).click();
      await page.waitForTimeout(400);

      // Switch back to Hebrew
      await langBtns.first().click();
      await page.waitForTimeout(600);

      const lang = await page.locator('html').getAttribute('lang');
      const dir = await page.locator('html').getAttribute('dir');

      expect(lang).toBe('he');
      expect(dir).toBe('rtl');
    });

    test('translated UI text appears after switching to English', async ({ page }) => {
      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }

      await langBtns.nth(1).click();
      await page.waitForTimeout(600);

      // Settings section title should change to English text
      const settingsTitle = page.locator('#sec-settings .topbar-title');
      const titleText = await settingsTitle.textContent();
      // In English the title should be "Settings" or similar non-Hebrew
      expect(titleText).not.toMatch(/[֐-׿]/); // No Hebrew chars
    });

    test('Hebrew text appears in workout section after switching to Hebrew', async ({ page }) => {
      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }

      // Switch to English then back to Hebrew
      await langBtns.nth(1).click();
      await page.waitForTimeout(400);
      await langBtns.first().click();
      await page.waitForTimeout(600);

      // Navigate to main section and check Hebrew text
      await page.locator('#nav-main').click();
      const saveBtn = page.locator('#saveBtn');
      const isVisible = await saveBtn.isVisible().catch(() => false);
      if (isVisible) {
        const btnText = await saveBtn.textContent();
        expect(btnText).toMatch(/[֐-׿]/); // Contains Hebrew chars
      }
    });

    test('language selection persists after navigating to another section', async ({ page }) => {
      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }

      await langBtns.nth(1).click();
      await page.waitForTimeout(400);

      await page.locator('#nav-main').click();

      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).toBe('en');

      // Restore
      await page.locator('#mainGearBtn').click();
      await langBtns.first().click();
      await page.waitForTimeout(400);
    });
  });
});

// ─── New i18n surfaces (TC-I18N-007 – TC-I18N-013) ──────────────────────
// Covers surfaces added/changed by the 2026-09-05 auth redesign + settings
// restructure + History domain split: the localized login error, the 3-way
// theme selector, the dedicated Edit Strength/Cardio Plan buttons, History's
// Strength/Cardio domain tabs, the cardio stats + period filters, and the
// renamed "Show Cardio Page" toggle (formerly "Show Running Page").
test.describe('i18n — New Surfaces (TC-I18N-007 – TC-I18N-013)', () => {
  test.describe('TC-I18N-007 — localized login error message', () => {
    // Trigger the error while logged out, in each language.
    test.use({ storageState: { cookies: [], origins: [] } });

    const GOOD_ERROR_TEXT: Record<'he' | 'en', string[]> = {
      // firebaseErrMsg() in public/index.html maps whichever Firebase error
      // code comes back (user-not-found / wrong-password / invalid-credential)
      // to one of these localized, friendly strings — never the raw code.
      en: ['Invalid email or password', 'Incorrect password', 'No user found with this email'],
      he: ['מייל או סיסמה שגויים', 'סיסמה שגויה', 'לא נמצא משתמש עם מייל זה'],
    };

    async function triggerLoginError(page: import('@playwright/test').Page, lang: 'he' | 'en'): Promise<string | null> {
      // The app reads its language from localStorage on boot (see
      // `currentLang` in public/index.html), before any auth state resolves,
      // so this affects the error text without ever logging in.
      await page.addInitScript((l) => {
        try { localStorage.setItem('lang', l); } catch (e) { /* ignore */ }
      }, lang);
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');

      const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
      if (!authVisible) { test.skip(); return null; }

      await page.locator('#auth-email').fill('nonexistent-user-qa@example.com');
      await page.locator('#auth-password').fill('WrongPassword999!');
      await page.locator('#auth-submit-btn').click();

      const msg = page.locator('#auth-msg');
      await expect(msg).not.toBeEmpty({ timeout: 10000 });
      return ((await msg.textContent()) ?? '').trim();
    }

    test('TC-I18N-007a: login error is a localized friendly message in English (not a raw Firebase error or key)', { tag: ['@page-login', '@area-i18n', '@feature-auth-errors', '@type-i18n'] }, async ({ page }) => {
      const text = await triggerLoginError(page, 'en');
      if (text === null) return;
      expect(GOOD_ERROR_TEXT.en).toContain(text);
      expect(text).not.toMatch(/^auth\//i);
      expect(text).not.toMatch(/^err\./);
      expect(text).not.toMatch(/firebase/i);
    });

    test('TC-I18N-007b: login error is a localized friendly message in Hebrew (not a raw Firebase error or key)', { tag: ['@page-login', '@area-i18n', '@feature-auth-errors', '@type-i18n'] }, async ({ page }) => {
      const text = await triggerLoginError(page, 'he');
      if (text === null) return;
      expect(GOOD_ERROR_TEXT.he).toContain(text);
      expect(text).not.toMatch(/^auth\//i);
      expect(text).not.toMatch(/^err\./);
      expect(text).not.toMatch(/firebase/i);
      expect(text).toMatch(/[֐-׿]/); // must actually be Hebrew, not an English fallback
    });
  });

  test.describe('Hebrew translations for new Settings/History surfaces (TC-I18N-008 – TC-I18N-012)', () => {
    test.beforeEach(async ({ page }) => {
      requiresCredentials();
      await loginWithEmailPassword(page);
      await waitForAppReady(page);
      await page.locator('#mainGearBtn').click();
      await expect(page.locator('#sec-settings')).toHaveClass(/active/);

      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }
      await langBtns.first().click(); // Hebrew is always the first button
      await page.waitForTimeout(600);
    });

    // The Cardio history domain (and its toggle button) stays hidden until
    // "Show Cardio Page" is enabled — same gate history.spec.ts's cardio
    // tests already respect via their own ensureRunningEnabled() helper.
    async function ensureRunningEnabledFromSettings(page: import('@playwright/test').Page) {
      const toggle = page.locator('#runningEnabledToggle');
      const isChecked = await toggle.isChecked().catch(() => false);
      if (!isChecked) {
        await page.locator('label.toggle-switch').filter({ has: toggle }).click();
      }
    }

    test('TC-I18N-008: theme selector labels (Light/Dark/Auto) are translated to Hebrew', { tag: ['@page-settings', '@area-i18n', '@feature-theme', '@type-i18n'] }, async ({ page }) => {
      const themeBtns = page.locator('#themeBtns');
      await expect(themeBtns.locator('.theme-btn[data-theme="light"] span')).toHaveText('בהיר');
      await expect(themeBtns.locator('.theme-btn[data-theme="dark"] span')).toHaveText('כהה');
      await expect(themeBtns.locator('.theme-btn[data-theme="auto"] span')).toHaveText('אוטומטי');
    });

    test('TC-I18N-009: Settings plan-edit button labels are translated to distinct Hebrew text', { tag: ['@page-settings', '@area-i18n', '@feature-plan-edit', '@type-i18n'] }, async ({ page }) => {
      const workoutTitle = page.locator('button.settings-item[onclick="openWorkoutEdit()"] .settings-item-title');
      const cardioTitle = page.locator('button.settings-item[onclick="openCardioEdit()"] .settings-item-title');
      await expect(workoutTitle).toHaveText('עריכת תוכנית אימוני כוח');
      await expect(cardioTitle).toHaveText('עריכת תוכנית אימוני אירובי');

      const workoutText = await workoutTitle.textContent();
      const cardioText = await cardioTitle.textContent();
      expect(workoutText).not.toBe(cardioText);
    });

    test('TC-I18N-010: History Strength/Cardio domain tab labels are translated to Hebrew', { tag: ['@page-history', '@area-i18n', '@feature-history-domains', '@type-i18n'] }, async ({ page }) => {
      await ensureRunningEnabledFromSettings(page);
      await page.locator('#nav-history').click();
      await expect(page.locator('#sec-history')).toHaveClass(/active/);

      await expect(page.locator('.history-domain-btn[data-domain="strength"]')).toHaveText('כוח');
      await expect(page.locator('.history-domain-btn[data-domain="cardio"]')).toHaveText('אירובי');
    });

    test('TC-I18N-011: cardio stat labels and period-filter labels are translated to Hebrew; numeric/unit values stay LTR', { tag: ['@page-history', '@area-i18n', '@feature-cardio-stats', '@type-i18n'] }, async ({ page }) => {
      await ensureRunningEnabledFromSettings(page);
      await page.locator('#nav-history').click();
      await expect(page.locator('#sec-history')).toHaveClass(/active/);
      await page.locator('.history-domain-btn[data-domain="cardio"]').click();
      await expect(page.locator('#cardioHistoryStats')).toBeVisible();

      // Stat labels
      await expect(page.locator('#run-streak-card .run-streak-lbl')).toHaveText('שבועות רצופים');
      await expect(page.locator('#run-prs-card .run-card-title')).toHaveText('שיאים אישיים');
      const statLbls = page.locator('#run-prs-card .run-stat-lbl');
      await expect(statLbls.nth(0)).toHaveText('מרחק מירבי (ק"מ)');
      await expect(statLbls.nth(1)).toHaveText('קצב מהיר');
      await expect(statLbls.nth(2)).toHaveText('דופק נמוך');

      // Period-filter labels
      await expect(page.locator('.run-range-btn[data-range="month"]')).toHaveText('חודש');
      await expect(page.locator('.run-range-btn[data-range="year"]')).toHaveText('שנה');
      await expect(page.locator('.run-range-btn[data-range="all"]')).toHaveText('הכל');

      // Numeric/unit values must stay LTR-shaped (plain digits/./:/-) even
      // though they sit inside the Hebrew RTL layout — never Hebrew glyphs.
      const streakNum = ((await page.locator('#run-streak-card .run-streak-num').textContent()) ?? '').trim();
      expect(streakNum).not.toMatch(/[֐-׿]/);
      expect(streakNum).toMatch(/^\d+$/);

      const statVals = page.locator('#run-prs-card .run-stat-val');
      const valCount = await statVals.count();
      for (let i = 0; i < valCount; i++) {
        const v = ((await statVals.nth(i).textContent()) ?? '').trim();
        expect(v).not.toMatch(/[֐-׿]/);
        expect(v).toMatch(/^(--|[\d.:]+)$/);
      }
    });

    test('TC-I18N-012: "Show Cardio Page" checkbox label is translated to Hebrew (not a stale "Show Running Page" label)', { tag: ['@page-settings', '@area-i18n', '@feature-cardio-toggle', '@type-i18n'] }, async ({ page }) => {
      const label = page.locator('#runningGateRow .settings-row-label[data-i18n="settings.running_show"]');
      await expect(label).toHaveText('הצג עמוד אירובי');
      const text = await label.textContent();
      // "ריצה" is the old "Running" wording this label used to carry — it
      // must not leak back in now that the feature/label refers to Cardio.
      expect(text).not.toContain('ריצה');
    });
  });

  test.describe('English regression for new Settings/History surfaces (TC-I18N-013)', () => {
    test.beforeEach(async ({ page }) => {
      requiresCredentials();
      await loginWithEmailPassword(page);
      await waitForAppReady(page);
      await page.locator('#mainGearBtn').click();
      await expect(page.locator('#sec-settings')).toHaveClass(/active/);

      const langBtns = page.locator('#langBtns button');
      const count = await langBtns.count();
      if (count < 2) { test.skip(); return; }
      await langBtns.nth(1).click(); // English is always the second button
      await page.waitForTimeout(600);
    });

    test('TC-I18N-013: theme selector, plan-edit buttons, Show Cardio Page checkbox, History tabs, cardio stats and period filters all render correct English text', { tag: ['@page-settings', '@page-history', '@area-i18n', '@feature-i18n-regression', '@type-i18n'] }, async ({ page }) => {
      const hebrewCharsRe = /[֐-׿]/;

      // Theme selector
      const themeBtns = page.locator('#themeBtns');
      await expect(themeBtns.locator('.theme-btn[data-theme="light"] span')).toHaveText('Light');
      await expect(themeBtns.locator('.theme-btn[data-theme="dark"] span')).toHaveText('Dark');
      await expect(themeBtns.locator('.theme-btn[data-theme="auto"] span')).toHaveText('Auto');

      // Plan-edit buttons
      await expect(page.locator('button.settings-item[onclick="openWorkoutEdit()"] .settings-item-title')).toHaveText('Edit Strength Plan');
      await expect(page.locator('button.settings-item[onclick="openCardioEdit()"] .settings-item-title')).toHaveText('Edit Cardio Workout Plan');

      // Show Cardio Page checkbox label
      const cardioLabel = page.locator('#runningGateRow .settings-row-label[data-i18n="settings.running_show"]');
      await expect(cardioLabel).toHaveText('Show Cardio Page');

      // Ensure the cardio domain is reachable, then check History tabs + stats + filters
      const toggle = page.locator('#runningEnabledToggle');
      const isChecked = await toggle.isChecked().catch(() => false);
      if (!isChecked) {
        await page.locator('label.toggle-switch').filter({ has: toggle }).click();
      }
      await page.locator('#nav-history').click();
      await expect(page.locator('#sec-history')).toHaveClass(/active/);

      await expect(page.locator('.history-domain-btn[data-domain="strength"]')).toHaveText('Strength');
      await expect(page.locator('.history-domain-btn[data-domain="cardio"]')).toHaveText('Cardio');

      await page.locator('.history-domain-btn[data-domain="cardio"]').click();
      await expect(page.locator('#cardioHistoryStats')).toBeVisible();

      await expect(page.locator('#run-streak-card .run-streak-lbl')).toHaveText('Weekly Streak');
      await expect(page.locator('#run-prs-card .run-card-title')).toHaveText('Personal Records');
      const statLbls = page.locator('#run-prs-card .run-stat-lbl');
      await expect(statLbls.nth(0)).toHaveText('Best Distance (km)');
      await expect(statLbls.nth(1)).toHaveText('Best Pace');
      await expect(statLbls.nth(2)).toHaveText('Lowest HR');

      await expect(page.locator('.run-range-btn[data-range="month"]')).toHaveText('Month');
      await expect(page.locator('.run-range-btn[data-range="year"]')).toHaveText('Year');
      await expect(page.locator('.run-range-btn[data-range="all"]')).toHaveText('All');

      // No leftover Hebrew or raw i18n keys anywhere checked above.
      for (const locator of [
        themeBtns.locator('.theme-btn[data-theme="light"] span'),
        themeBtns.locator('.theme-btn[data-theme="dark"] span'),
        themeBtns.locator('.theme-btn[data-theme="auto"] span'),
        page.locator('button.settings-item[onclick="openWorkoutEdit()"] .settings-item-title'),
        page.locator('button.settings-item[onclick="openCardioEdit()"] .settings-item-title'),
        cardioLabel,
        page.locator('.history-domain-btn[data-domain="strength"]'),
        page.locator('.history-domain-btn[data-domain="cardio"]'),
        page.locator('#run-streak-card .run-streak-lbl'),
        page.locator('#run-prs-card .run-card-title'),
        statLbls.nth(0), statLbls.nth(1), statLbls.nth(2),
        page.locator('.run-range-btn[data-range="month"]'),
        page.locator('.run-range-btn[data-range="year"]'),
        page.locator('.run-range-btn[data-range="all"]'),
      ]) {
        const text = (await locator.textContent()) ?? '';
        expect(text).not.toMatch(hebrewCharsRe);
        expect(text).not.toMatch(/^[a-z_]+\.[a-z_.]+$/i); // raw i18n key shape, e.g. "settings.theme.light"
      }
    });
  });
});
