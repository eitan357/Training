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
