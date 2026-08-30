import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

test.describe('Measurements Section', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    // Use JS navigation in case #nav-measurements is hidden (running feature enabled)
    await page.evaluate(() => (window as any).showSection('measurements'));
    await expect(page.locator('#sec-measurements')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('measurements section is visible after navigation', async ({ page }) => {
    await expect(page.locator('#sec-measurements')).toBeVisible();
  });

  test('measurements content area is visible', async ({ page }) => {
    await expect(page.locator('#measurementsContent')).toBeVisible();
  });

  test('date input is present in measurements form', async ({ page }) => {
    await expect(page.locator('#m-date')).toBeVisible();
  });

  test('date input accepts DD/MM/YYYY format', async ({ page }) => {
    const dateInput = page.locator('#m-date');
    await dateInput.fill('15/08/2026');
    await expect(dateInput).toHaveValue('15/08/2026');
  });

  test('measure form fields load dynamic inputs', async ({ page }) => {
    await page.waitForFunction(() => {
      const fields = document.getElementById('measureFormFields');
      if (!fields) return false;
      const loadingEl = fields.querySelector('.loading');
      return !loadingEl || loadingEl.offsetParent === null;
    }, { timeout: 12000 });

    const formFields = page.locator('#measureFormFields');
    const content = await formFields.textContent();
    expect(content).toBeDefined();
  });

  test('save measurement button is visible', async ({ page }) => {
    const saveBtn = page.locator('button[onclick="saveMeasurement()"]');
    await expect(saveBtn).toBeVisible();
  });

  test('measurement history list container is present', async ({ page }) => {
    await expect(page.locator('#measureList')).toBeAttached();
  });

  test('measurement history loads (not stuck on spinner)', async ({ page }) => {
    await page.waitForFunction(() => {
      const list = document.getElementById('measureList');
      if (!list) return false;
      const loadingEl = list.querySelector('.loading');
      return !loadingEl || loadingEl.offsetParent === null;
    }, { timeout: 12000 });

    const content = await page.locator('#measureList').textContent();
    expect(content).toBeDefined();
  });

  test('gear icon navigates to settings', async ({ page }) => {
    await page.locator('#measGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });
});

test.describe('Measurements — Edit Measurement Types', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.evaluate(() => (window as any).showSection('measurements'));
    await expect(page.locator('#sec-measurements')).toHaveClass(/active/, { timeout: 5000 });
  });

  test('types editor panel is in the DOM', async ({ page }) => {
    await expect(page.locator('#typesEditorPanel')).toBeAttached();
  });

  test('types list container is in the DOM', async ({ page }) => {
    await expect(page.locator('#typesList')).toBeAttached();
  });

  test('types editor panel becomes visible when opened via JS', async ({ page }) => {
    await page.evaluate(() => (window as any).toggleTypesEditor && (window as any).toggleTypesEditor());
    const panel = page.locator('#typesEditorPanel');
    await expect(panel).toBeVisible({ timeout: 3000 });
    // Close it back
    await page.evaluate(() => (window as any).toggleTypesEditor && (window as any).toggleTypesEditor());
  });

  test('add measurement type button is in the types editor panel', async ({ page }) => {
    const addTypeBtn = page.locator('#typesEditorPanel button[onclick="addMeasureType()"]');
    await expect(addTypeBtn).toBeAttached();
  });

  test('save types button is in the types editor panel', async ({ page }) => {
    const saveTypesBtn = page.locator('#typesEditorPanel button[onclick="saveTypesEditor()"]');
    await expect(saveTypesBtn).toBeAttached();
  });
});
