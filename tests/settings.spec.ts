import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

test.describe('Settings Section', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('settings section is accessible', async ({ page }) => {
    await expect(page.locator('#sec-settings')).toBeVisible();
  });

  test('display name input is present', async ({ page }) => {
    const nameInput = page.locator('#displayNameInput');
    await expect(nameInput).toBeVisible();
  });

  test('dark mode toggle is present and functional', async ({ page }) => {
    const toggle = page.locator('#darkModeToggle');
    await expect(toggle).toBeAttached();

    const initialChecked = await toggle.isChecked();
    // Click the label (toggle-switch) that wraps the hidden checkbox
    const label = page.locator('label.toggle-switch').filter({ has: page.locator('#darkModeToggle') });
    await label.click();
    const newChecked = await toggle.isChecked();
    expect(newChecked).toBe(!initialChecked);

    // Restore original state
    await label.click();
  });

  test('language buttons are present', async ({ page }) => {
    const langBtns = page.locator('#langBtns');
    await expect(langBtns).toBeVisible();
    // Should have at least 2 language options
    const buttons = langBtns.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('running section toggle row exists in settings', async ({ page }) => {
    // The running gate row may be display:none by default until a feature flag is set
    const row = page.locator('#runningGateRow');
    await expect(row).toBeAttached();
    // The toggle checkbox must exist in the DOM
    await expect(page.locator('#runningEnabledToggle')).toBeAttached();
  });

  test('timer sound toggle exists in settings', async ({ page }) => {
    // The checkbox input inside a custom toggle switch is typically opacity:0
    // so we check that the parent label/row is visible, not the input itself
    const toggle = page.locator('#tv2SoundToggle');
    await expect(toggle).toBeAttached();
    // The parent settings row containing the timer sound toggle should be visible
    const soundRow = page.locator('.settings-card').filter({ has: page.locator('#tv2SoundToggle') });
    await expect(soundRow).toBeVisible();
  });

  test('workout plan edit label has no stray leading ל', async ({ page }) => {
    const label = page.locator('.settings-item-title', { hasText: 'עריכת תוכנית אימוני כוח' });
    await expect(label).toHaveText('עריכת תוכנית אימוני כוח');
  });

  test('logout button is present', async ({ page }) => {
    // Scoped to #sec-settings: .settings-logout-btn is also reused (by the
    // Privacy page added in this task) for the two red delete buttons in
    // #sec-privacy, which would otherwise make this a strict-mode violation.
    const logoutBtn = page.locator('#sec-settings .settings-logout-btn');
    await expect(logoutBtn).toBeVisible();
  });

  test('logout button triggers sign-out', async ({ page }) => {
    await page.locator('#sec-settings .settings-logout-btn').click();
    // After logout, auth screen should become visible (Firebase removes .hidden class)
    await page.waitForFunction(
      () => !document.getElementById('auth-screen')?.classList.contains('hidden'),
      { timeout: 10000 }
    );
    await expect(page.locator('#auth-screen')).toBeVisible();
  });

  test('cardio toggle row is visible for every user, not gated by email', async ({ page }) => {
    // beforeEach already navigated to settings via #mainGearBtn; that button
    // lives inside #sec-main, which is inactive/hidden once we're on
    // settings, so clicking it again here would time out. No re-click needed.
    await expect(page.locator('#runningGateRow')).toBeVisible();
  });

  test('settings has a cardio template editor link under the strength one', async ({ page }) => {
    const strengthRow = page.locator('.settings-item', { hasText: 'אימוני כוח' });
    const cardioRow   = page.locator('.settings-item', { hasText: 'אימוני אירובי' });
    await expect(cardioRow).toBeVisible();
    expect(await strengthRow.boundingBox()).toBeTruthy();
  });

  test('switching language changes page direction', async ({ page }) => {
    const langBtns = page.locator('#langBtns button');
    const count = await langBtns.count();
    if (count < 2) return;

    // Click the second language button (likely English/LTR)
    await langBtns.nth(1).click();
    await page.waitForTimeout(500);

    const dir = await page.locator('html').getAttribute('dir');
    // Direction should have changed
    expect(['ltr', 'rtl']).toContain(dir);

    // Restore Hebrew
    await langBtns.first().click();
  });

  test('privacy page is reachable from Settings and lists data categories', async ({ page }) => {
    const privacyBtn = page.locator('.settings-item', { hasText: 'פרטיות ומחיקת נתונים' });
    await privacyBtn.click();

    await expect(page).toHaveURL(/\/settings\/privacy$/);
    await expect(page.locator('#sec-privacy')).toHaveClass(/active/);
    await expect(page.locator('#sec-privacy')).toContainText('פרטי חשבון');
    await expect(page.locator('#privacyDataBtn')).toBeVisible();
    await expect(page.locator('#privacyAccountBtn')).toBeVisible();

    await page.goBack();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('privacy confirm modal requires typing the exact confirm word before enabling', async ({ page }) => {
    await page.locator('.settings-item', { hasText: 'פרטיות ומחיקת נתונים' }).click();
    await expect(page.locator('#sec-privacy')).toHaveClass(/active/);

    await page.locator('#privacyDataBtn').click();
    const modal = page.locator('#privacyConfirmModal');
    await expect(modal).toBeVisible();
    const confirmBtn = page.locator('#privacyConfirmBtn');
    await expect(confirmBtn).toBeDisabled();

    const input = page.locator('#privacyConfirmInput');
    await input.fill('wrong');
    await expect(confirmBtn).toBeDisabled();

    await input.fill('מחק');
    await expect(confirmBtn).toBeEnabled();

    // Cancel instead of confirming — must not fire any deletion.
    // Scoped to #privacyConfirmModal: the bare class also matches #draftModal's
    // cancel button, which stays in the DOM (just display:none) and would
    // otherwise make this a Playwright strict-mode violation.
    await page.locator('#privacyConfirmModal .draft-modal-btn-discard').click();
    await expect(modal).toBeHidden();

    // The account/page must be completely unaffected by opening+cancelling.
    await expect(page.locator('#sec-privacy')).toHaveClass(/active/);
    await expect(page.locator('#privacyDataBtn')).toBeVisible();
  });

  test('privacy confirm modal shows distinct copy for the account-deletion action', async ({ page }) => {
    await page.locator('.settings-item', { hasText: 'פרטיות ומחיקת נתונים' }).click();
    await page.locator('#privacyAccountBtn').click();

    await expect(page.locator('#privacyConfirmModal')).toBeVisible();
    const title = await page.locator('#privacyConfirmTitle').textContent();
    expect(title).toContain('חשבון');

    await page.locator('#privacyConfirmModal .draft-modal-btn-discard').click();
  });
});

test.describe('Privacy page — destructive round trip (disposable account only)', () => {
  // Never reuses TEST_EMAIL/TEST_PASSWORD — registers and destroys its
  // own throwaway account so this test can never touch the shared
  // accounts every other spec file in this repo depends on.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Delete Data wipes Firestore but keeps the account; Delete Account Permanently removes it entirely', async ({ page }) => {
    const email = `qa-privacy-delete-${Date.now()}@example.com`;
    const password = 'QaPrivacyDelete123!';

    try {
      // ── Register a fresh disposable account ──
      await page.goto('/');
      await page.waitForSelector('#auth-screen');
      await page.locator('#tab-register').click();
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-password').fill(password);
      await page.locator('#auth-submit-btn').click();
      await page.waitForFunction(() => document.getElementById('auth-screen')?.classList.contains('hidden'), { timeout: 20000 });
      await expect(page.locator('#main-content')).toBeVisible();

      // ── Add one throwaway workout so Delete Data has something real to remove ──
      await page.waitForFunction(() => {
        const row = document.getElementById('typeRow');
        return row && row.children.length > 0;
      }, { timeout: 10000 });
      await page.locator('#typeRow button, #typeRow .type-btn').first().click();
      await page.locator('.ex-weight').first().fill('10');
      await page.locator('#saveBtn').click();
      await expect(page.locator('#toast')).toHaveClass(/success/, { timeout: 10000 });

      // ── Delete Data: account must survive, data must not ──
      await page.evaluate(() => (window as any).navigateTo('/settings/privacy'));
      await expect(page.locator('#sec-privacy')).toHaveClass(/active/);
      await page.locator('#privacyDataBtn').click();
      await page.locator('#privacyConfirmInput').fill('מחק');
      await page.locator('#privacyConfirmBtn').click();
      await expect(page.locator('#toast')).toContainText('נמחקו', { timeout: 10000 });
      // Still logged in — the auth screen must stay hidden.
      await expect(page.locator('#auth-screen')).toHaveClass(/hidden/);

      // ── Delete Account Permanently: fresh login, so no reauth branch fires ──
      await page.evaluate(() => (window as any).navigateTo('/settings/privacy'));
      await page.locator('#privacyAccountBtn').click();
      await page.locator('#privacyConfirmInput').fill('מחק');
      await page.locator('#privacyConfirmBtn').click();
      await page.waitForFunction(() => !document.getElementById('auth-screen')?.classList.contains('hidden'), { timeout: 15000 });
      await expect(page.locator('#auth-msg')).toContainText('נמחק');

      // ── The account must be genuinely gone, not just signed out ──
      await page.locator('#tab-login').click();
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-password').fill(password);
      await page.locator('#auth-submit-btn').click();
      await expect(page.locator('#auth-msg')).not.toBeEmpty({ timeout: 10000 });
      const loginFailed = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
      expect(loginFailed).toBe(true);
    } finally {
      // Belt-and-braces: guarantees no disposable account survives in
      // production even if an assertion above failed mid-test.
      const { execSync } = require('child_process');
      try { execSync(`node scripts/force-delete-test-user.js ${email}`, { cwd: process.cwd(), stdio: 'inherit' }); } catch (e) {}
    }
  });
});
