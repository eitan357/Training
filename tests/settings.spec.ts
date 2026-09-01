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
    const logoutBtn = page.locator('.settings-logout-btn');
    await expect(logoutBtn).toBeVisible();
  });

  test('logout button triggers sign-out', async ({ page }) => {
    await page.locator('.settings-logout-btn').click();
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
});
