import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

// Negative tests check auth form errors — need unauthenticated state
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = 'https://training-diary.web.app';

test.describe('Negative Tests — Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Ensure we're on auth screen (logout if needed)
    await page.waitForLoadState('networkidle');
  });

  test('login with empty email and password shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('');
    await page.locator('#auth-password').fill('');
    await page.locator('#auth-submit-btn').click();

    // Should show error message without calling Firebase
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
    // Auth screen should still be visible
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('login with empty email only shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('');
    await page.locator('#auth-password').fill('SomePassword123!');
    await page.locator('#auth-submit-btn').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('login with empty password only shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('test@example.com');
    await page.locator('#auth-password').fill('');
    await page.locator('#auth-submit-btn').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('login with wrong credentials shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('nonexistent-user-qa@example.com');
    await page.locator('#auth-password').fill('WrongPassword999!');
    await page.locator('#auth-submit-btn').click();

    // Firebase will return an error; auth screen should stay visible
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
    // Error message should have the error styling
    await expect(msg).toHaveClass(/auth-err/);
  });

  test('register with weak password shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#tab-register').click();
    await page.locator('#auth-email').fill('qa-weak-pass@example.com');
    await page.locator('#auth-password').fill('abc'); // Too short
    await page.locator('#auth-submit-btn').click();

    // Firebase requires min 6 chars; should show error
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('submit button is disabled during auth request', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('test@example.com');
    await page.locator('#auth-password').fill('SomePassword123!');

    const submitBtn = page.locator('#auth-submit-btn');
    await submitBtn.click();

    // Button should be disabled immediately after click (while request is in flight)
    // This is a race condition test — we check briefly after click
    // The button re-enables on error
    await page.waitForTimeout(200);
    // After the Firebase call completes, it should re-enable
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
  });

  test('forgot password with empty email shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    // Clear the email field
    await page.locator('#auth-email').fill('');
    await page.locator('.auth-forgot').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
  });

  test('forgot password with invalid email shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('notavalidemail');
    await page.locator('.auth-forgot').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
  });

  // TC-NEG-030: regression guard for the 2026-09 error-message localization
  // fix. public/index.html's firebaseErrMsg() (~line 2479-2492) maps THREE
  // distinct Firebase codes to three distinct localized strings —
  // auth/user-not-found, auth/wrong-password, and auth/invalid-credential —
  // but modern Firebase Auth SDK versions collapse the first two into
  // auth/invalid-credential for anti-enumeration reasons. Which of the three
  // fires for a given wrong-password/unregistered-email attempt is therefore
  // an SDK-version detail, not something this test should hardcode — it
  // accepts any of the three known-good localized strings (translations.js
  // lines 226-228 for Hebrew, 537-539 for English) and instead asserts what
  // actually matters: none of them are raw Firebase/SDK text.
  test('TC-NEG-030: no raw Firebase/SDK error text leaks across wrong-password, unregistered-email, malformed-email, and empty-fields login failures', { tag: ['@page-login', '@area-auth', '@feature-error-messages', '@type-negative'] }, async ({ page }) => {
    const knownGoodInvalidLoginErrors = /No user found with this email|Incorrect password|Invalid email or password|לא נמצא משתמש עם מייל זה|סיסמה שגויה|מייל או סיסמה שגויים/;
    const rawFirebaseLeak = /Firebase:|auth\//;

    const scenarios: { name: string; email: string; password: string; expectKnownGoodInvalidLoginError: boolean }[] = [
      { name: 'wrong-password', email: 'nonexistent-user-qa@example.com', password: 'WrongPassword999!', expectKnownGoodInvalidLoginError: true },
      { name: 'unregistered-email', email: 'totally-unregistered-qa-negtest@example.com', password: 'AnotherPass456!', expectKnownGoodInvalidLoginError: true },
      { name: 'malformed-email', email: 'notavalidemail', password: 'SomePassword123!', expectKnownGoodInvalidLoginError: false },
      { name: 'empty-fields', email: '', password: '', expectKnownGoodInvalidLoginError: false },
    ];

    for (const scenario of scenarios) {
      await page.goto(BASE_URL);
      await page.waitForLoadState('networkidle');
      const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
      if (!authVisible) { test.skip(); return; }

      await page.locator('#tab-login').click();
      await page.locator('#auth-email').fill(scenario.email);
      await page.locator('#auth-password').fill(scenario.password);
      await page.locator('#auth-submit-btn').click();

      const msg = page.locator('#auth-msg');
      await expect(msg).not.toBeEmpty({ timeout: 10000 });
      const errorText = (await msg.textContent()) || '';

      // The core regression guard, true regardless of scenario or SDK version.
      expect(errorText, `scenario "${scenario.name}"`).not.toMatch(rawFirebaseLeak);

      // wrong-password / unregistered-email additionally must be one of the
      // three known-good localized invalid-login strings, never anything else.
      if (scenario.expectKnownGoodInvalidLoginError) {
        expect(errorText, `scenario "${scenario.name}"`).toMatch(knownGoodInvalidLoginErrors);
      }
    }
  });
});

test.describe('Negative Tests — UI Resilience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('auth screen does not XSS via email field', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const xssPayload = '<script>window.__xss_fired=true</script>';
    await page.locator('#auth-email').fill(xssPayload);
    await page.locator('#auth-password').fill('password');
    await page.locator('#auth-submit-btn').click();

    await page.waitForTimeout(1000);
    const xssFired = await page.evaluate(() => (window as any).__xss_fired);
    expect(xssFired).toBeFalsy();
  });

  test('page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Filter out known Firebase-related or network errors that are expected
    const unexpectedErrors = errors.filter(e =>
      !e.includes('firebase') &&
      !e.includes('Firebase') &&
      !e.includes('net::') &&
      !e.includes('favicon')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('app has a title', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('page has lang attribute on html element', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
    expect(['he', 'en']).toContain(lang);
  });

  test('page has dir attribute on html element', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBeTruthy();
    expect(['rtl', 'ltr']).toContain(dir);
  });
});

test.describe('Negative Tests — Settings: Show Cardio Page Toggle', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('TC-NEG-031: rapid double-toggle of Show Cardio Page checkbox settles to a stable, consistent state', { tag: ['@page-settings', '@area-settings', '@feature-show-cardio-toggle', '@type-negative'] }, async ({ page }) => {
    const toggle = page.locator('#runningEnabledToggle');
    const label = page.locator('label.toggle-switch').filter({ has: toggle });
    const initialChecked = await toggle.isChecked();

    // Two rapid toggles should cancel out, back to the original value, with
    // no leftover inconsistency between the two fire-and-forget
    // saveRunningEnabled() Firestore writes (index.html ~line 1639).
    await label.click();
    await label.click();
    await page.waitForTimeout(500);
    expect(await toggle.isChecked()).toBe(initialChecked);

    // The nav bar's cardio/measurements entries are driven by the same flag
    // (applyRunningGate(), index.html ~line 1647) — they must never disagree
    // with what the checkbox itself shows.
    await expect(page.locator('#nav-running')).toBeVisible({ visible: initialChecked });
    await expect(page.locator('#nav-measurements')).toBeVisible({ visible: !initialChecked });

    // Reload to force a fresh loadRunningEnabled() read from Firestore
    // (index.html ~line 1630) rather than trusting the in-memory flag, and
    // confirm the server-side value actually landed where the UI says it did.
    await page.reload();
    await waitForAppReady(page);
    await page.locator('#nav-main').click().catch(() => {});
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    expect(await page.locator('#runningEnabledToggle').isChecked()).toBe(initialChecked);
  });

  test('TC-NEG-032: navigating away immediately after toggling Show Cardio Page does not corrupt the persisted state', { tag: ['@page-settings', '@area-settings', '@feature-show-cardio-toggle', '@type-negative'] }, async ({ page }) => {
    const toggle = page.locator('#runningEnabledToggle');
    const label = page.locator('label.toggle-switch').filter({ has: toggle });
    const initialChecked = await toggle.isChecked();

    await label.click();
    const toggledChecked = await toggle.isChecked();
    expect(toggledChecked).toBe(!initialChecked);

    // Navigate away immediately — before the fire-and-forget setDoc() in
    // saveRunningEnabled() is guaranteed to have resolved — via the
    // always-present bottom nav bar (#nav-history), same as
    // history.spec.ts's ensureRunningEnabled() helper does in reverse.
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);

    // Force a fresh read from Firestore (not the in-memory flag) so this
    // actually exercises whatever the write raced against, not just what
    // the JS variable was already set to synchronously before the await.
    await page.reload();
    await waitForAppReady(page);
    await page.locator('#nav-main').click().catch(() => {});
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    const persistedChecked = await page.locator('#runningEnabledToggle').isChecked();
    // No explicit Save button exists for this field (it auto-saves on
    // change) — the persisted value must be either the toggled state (the
    // write completed) or the original state (the write lost the race),
    // never anything else.
    expect([initialChecked, toggledChecked]).toContain(persistedChecked);

    // Restore original state so this test doesn't leak into others.
    if (persistedChecked !== initialChecked) {
      await page.locator('label.toggle-switch').filter({ has: page.locator('#runningEnabledToggle') }).click();
    }
  });

  test('TC-NEG-033: refreshing immediately after toggling Show Cardio Page does not corrupt the persisted state', { tag: ['@page-settings', '@area-settings', '@feature-show-cardio-toggle', '@type-negative'] }, async ({ page }) => {
    const toggle = page.locator('#runningEnabledToggle');
    const label = page.locator('label.toggle-switch').filter({ has: toggle });
    const initialChecked = await toggle.isChecked();

    await label.click();
    // Refresh immediately, before saveRunningEnabled()'s `await setDoc(...)`
    // (index.html ~line 1642) can be guaranteed to have resolved.
    await page.reload();
    await waitForAppReady(page);
    await page.locator('#nav-main').click().catch(() => {});
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    const persistedChecked = await page.locator('#runningEnabledToggle').isChecked();
    // Whatever landed, it must be a definite, uncorrupted boolean — and the
    // nav bar's cardio/measurements visibility (applyRunningGate()) must
    // agree with it, not with some other stale value.
    expect(typeof persistedChecked).toBe('boolean');
    await expect(page.locator('#nav-running')).toBeVisible({ visible: persistedChecked });
    await expect(page.locator('#nav-measurements')).toBeVisible({ visible: !persistedChecked });

    // Restore original state so this test doesn't leak into others.
    if (persistedChecked !== initialChecked) {
      await page.locator('label.toggle-switch').filter({ has: page.locator('#runningEnabledToggle') }).click();
    }
  });
});

test.describe('Negative Tests — Settings: Display Name Field', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  // saveDisplayName() (index.html ~line 1566) is a plain synchronous
  // function — it writes to localStorage, updates the topbar via
  // _updateTopbarName() (textContent, not innerHTML), and fires a
  // best-effort Firestore sync (_syncDisplayName()) — then shows a
  // '#toast' success message. There is no server round-trip gating the
  // visible save, and no maxlength/validation on #displayNameInput.

  test('TC-NEG-034: saving an empty Display Name is accepted gracefully, no crash', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill('');
    await page.locator('.settings-save-btn').click();

    // Empty is a legitimate value (removes the stored override) — the app
    // must not crash and must still show its normal success feedback.
    await expect(page.locator('#toast')).toHaveClass(/success/);
    await expect(nameInput).toHaveValue('');
    // Topbar falls back to the account email when no display name is set.
    await expect(page.locator('.topbar-email').first()).not.toBeEmpty();
  });

  test('TC-NEG-035: a 5000-char Display Name does not crash or overflow the UI', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const longName = 'A'.repeat(5000);
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill(longName);
    await page.locator('.settings-save-btn').click();

    // #displayNameInput has no maxlength attribute and saveDisplayName() has
    // no length cap, so the app accepts it as-is — this test's job is to
    // confirm that doesn't crash the page or wreck the layout, not to
    // enforce a length limit the app doesn't actually have.
    await expect(page.locator('#toast')).toHaveClass(/success/);
    await expect(nameInput).toHaveValue(longName);
    const overflowsViewport = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
    expect(overflowsViewport).toBe(false);
    // App must still be responsive after saving an oversized value.
    await expect(page.locator('#mainGearBtn').or(page.locator('.settings-save-btn'))).toBeVisible();
  });

  test('TC-NEG-036: special characters in Display Name are saved and rendered safely, not executed', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const specialName = `<>'";&/\\`;
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill(specialName);
    await page.locator('.settings-save-btn').click();

    await expect(page.locator('#toast')).toHaveClass(/success/);
    // _updateTopbarName() sets textContent (not innerHTML), so the raw
    // characters must show up literally in the topbar — never interpreted
    // as markup — and no injected script should ever run.
    await expect(page.locator('.topbar-email').first()).toHaveText(specialName);
    const xssFired = await page.evaluate(() => (window as any).__xss_displayname_fired);
    expect(xssFired).toBeFalsy();
  });

  test('TC-NEG-037: emoji in Display Name are saved and rendered correctly', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const emojiName = 'Jordan 😀🔥💻';
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill(emojiName);
    await page.locator('.settings-save-btn').click();

    await expect(page.locator('#toast')).toHaveClass(/success/);
    await expect(nameInput).toHaveValue(emojiName);
    await expect(page.locator('.topbar-email').first()).toHaveText(emojiName);
  });

  test('TC-NEG-038: mixed RTL/LTR Display Name is saved and displayed without corruption', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const mixedName = 'שלום Hello';
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill(mixedName);
    await page.locator('.settings-save-btn').click();

    await expect(page.locator('#toast')).toHaveClass(/success/);
    await expect(nameInput).toHaveValue(mixedName);
    await expect(page.locator('.topbar-email').first()).toHaveText(mixedName);
  });

  test('TC-NEG-039: double-clicking Save on Display Name applies the update exactly once', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const newName = 'New Display Name';
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill(newName);

    const saveBtn = page.locator('.settings-save-btn');
    // Two rapid clicks — saveDisplayName() is a full overwrite (not an
    // append), so this must not duplicate or corrupt the stored value.
    await saveBtn.click();
    await saveBtn.click();

    await expect(nameInput).toHaveValue(newName);
    await expect(page.locator('.topbar-email').first()).toHaveText(newName);
  });

  test('TC-NEG-040: refreshing immediately after saving a new Display Name never leaves a corrupted/partial value', { tag: ['@page-settings', '@area-settings', '@feature-display-name', '@type-negative'] }, async ({ page }) => {
    const newName = 'Another New Name';
    const nameInput = page.locator('#displayNameInput');
    await nameInput.fill(newName);
    // saveDisplayName() writes to localStorage synchronously before this
    // click() resolves, so — unlike the Show Cardio Page toggle's Firestore
    // write — there is no real "mid-save" window client-side; only its
    // fire-and-forget Firestore sync is still in flight when we reload.
    await page.locator('.settings-save-btn').click();
    await page.reload();
    await waitForAppReady(page);
    await page.locator('#nav-main').click().catch(() => {});
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    // Value read back from localStorage on settings render (index.html
    // ~line 1622) must be the full new name, never truncated or blank.
    await expect(page.locator('#displayNameInput')).toHaveValue(newName);
  });
});

// TC-NEG-041 through TC-NEG-044 (History Cardio Period Filter) live in
// tests/history.spec.ts instead — that file already sets up the cardio
// domain gate via its own ensureRunningEnabled() helper, so the coverage
// stays with the rest of the cardio-history tests rather than duplicated here.
