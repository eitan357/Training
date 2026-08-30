import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

test.describe('Timer Section', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-timer').click();
    await expect(page.locator('#sec-timer')).toHaveClass(/active/);
  });

  test('timer section renders the setting view by default', async ({ page }) => {
    const settingView = page.locator('#tv2SettingView');
    await expect(settingView).toBeVisible();
  });

  test('minutes scroller is present', async ({ page }) => {
    const minScroller = page.locator('#tv2MinInner');
    await expect(minScroller).toBeAttached();
  });

  test('seconds scroller is present', async ({ page }) => {
    const secScroller = page.locator('#tv2SecInner');
    await expect(secScroller).toBeAttached();
  });

  test('timer display element is present', async ({ page }) => {
    // Timer display appears in running view
    const timerDisplay = page.locator('#tv2Time');
    await expect(timerDisplay).toBeAttached();
  });

  test('pause button is present in running view', async ({ page }) => {
    const pauseBtn = page.locator('#tv2PauseBtn');
    await expect(pauseBtn).toBeAttached();
  });

  test('timer section has correct structure', async ({ page }) => {
    const timerSection = page.locator('#sec-timer');
    await expect(timerSection).toBeVisible();
    // The wrap contains the timer UI
    const wrap = timerSection.locator('.tv2-wrap');
    await expect(wrap).toBeVisible();
  });

  test('navigating away and back preserves timer section', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.locator('#nav-timer').click();
    await expect(page.locator('#sec-timer')).toHaveClass(/active/);
  });
});
