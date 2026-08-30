import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

test.describe('Main Workout Section', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    // Make sure we're on the main section
    await page.locator('#nav-main').click();
  });

  test('workout type row is visible', async ({ page }) => {
    const typeRow = page.locator('#typeRow');
    await expect(typeRow).toBeVisible();
  });

  test('at least one workout type button exists', async ({ page }) => {
    const typeRow = page.locator('#typeRow');
    await expect(typeRow).toBeVisible();
    // Wait for types to render (they're dynamic)
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });
    const typeButtons = page.locator('#typeRow button, #typeRow .type-btn');
    const count = await typeButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('exercise list renders after selecting a workout type', async ({ page }) => {
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });

    const firstTypeBtn = page.locator('#typeRow button, #typeRow .type-btn').first();
    await firstTypeBtn.click();

    const exerciseList = page.locator('#exerciseList');
    await expect(exerciseList).toBeVisible();
  });

  test('session name input is visible', async ({ page }) => {
    const nameInput = page.locator('#sessionNameInput');
    await expect(nameInput).toBeVisible();
  });

  test('session name input accepts text', async ({ page }) => {
    const nameInput = page.locator('#sessionNameInput');
    await nameInput.fill('QA Test Session');
    await expect(nameInput).toHaveValue('QA Test Session');
  });

  test('exercise cards show weight, sets, reps fields', async ({ page }) => {
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });

    const firstTypeBtn = page.locator('#typeRow button, #typeRow .type-btn').first();
    await firstTypeBtn.click();

    // Wait for at least one exercise card
    const cards = page.locator('#exerciseList .card');
    await expect(cards.first()).toBeVisible({ timeout: 8000 });

    const firstCard = cards.first();
    await expect(firstCard.locator('.ex-weight')).toBeVisible();
    await expect(firstCard.locator('.ex-sets')).toBeVisible();
    await expect(firstCard.locator('.ex-reps')).toBeVisible();
  });

  test('entering weight in an exercise field is saved in input', async ({ page }) => {
    await page.waitForFunction(() => {
      const list = document.getElementById('exerciseList');
      return list && list.querySelectorAll('.card').length > 0;
    }, { timeout: 10000 });

    const firstCard = page.locator('#exerciseList .card').first();
    const weightField = firstCard.locator('.ex-weight');
    await weightField.fill('80');
    await expect(weightField).toHaveValue('80');
  });

  test('topbar is visible in main section', async ({ page }) => {
    const topbar = page.locator('#sec-main .topbar');
    await expect(topbar).toBeVisible();
  });

  test('toast notification system is present in DOM', async ({ page }) => {
    const toast = page.locator('#toast');
    await expect(toast).toBeAttached();
  });

  test('settings gear button navigates to settings', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });
});
