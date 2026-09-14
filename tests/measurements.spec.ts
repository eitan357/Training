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

test.describe('Measurements — Bulk Delete Confirmation', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.evaluate(() => (window as any).showSection('measurements'));
    await expect(page.locator('#sec-measurements')).toHaveClass(/active/, { timeout: 5000 });
  });

  async function logThrowawayMeasurement(page: import('@playwright/test').Page, weight: string) {
    await page.waitForFunction(() => {
      const fields = document.getElementById('measureFormFields');
      if (!fields) return false;
      const loadingEl = fields.querySelector('.loading');
      return !loadingEl || loadingEl.offsetParent === null;
    }, { timeout: 12000 });
    await page.locator('#measureFormFields .weight-field input').fill(weight);
    await page.locator('button[onclick="saveMeasurement()"]').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    // saveMeasurement() shows the toast, then clears the form fields and
    // calls `await reloadAppData()` (a real Firestore round-trip) BEFORE
    // re-enabling the save button — the same race documented in
    // history.spec.ts's logThrowawaySession helper. Without this wait,
    // logging a second throwaway measurement immediately can fill the
    // still-attached-but-about-to-be-rebuilt weight input, and the first
    // save's in-flight reloadAppData() then rebuilds #measureFormFields
    // (wiping the freshly-filled value) before the second click reads the
    // DOM — so saveMeasurement() sees no filled fields and silently no-ops
    // with an error toast instead of creating a second record. Waiting for
    // the button to re-enable (set only after reloadAppData() settles)
    // closes that window.
    await expect(page.locator('button[onclick="saveMeasurement()"]')).toBeEnabled({ timeout: 10000 });
  }

  test('bulk delete: selecting 2+ measurements shows a confirmation modal; cancel keeps them, confirm deletes them', async ({ page }) => {
    const ts = Date.now();
    const weightA = (700 + (ts % 200)) + '.' + (ts % 10);
    const weightB = (700 + (ts % 200) + 1) + '.' + (ts % 10);

    await logThrowawayMeasurement(page, weightA);
    await logThrowawayMeasurement(page, weightB);

    // Locate each throwaway entry by the distinctive value the test itself
    // just entered — measurements have no name field, so position/count
    // can't be trusted to identify "our" record.
    const cardA = page.locator('.measure-card', { hasText: weightA });
    const cardB = page.locator('.measure-card', { hasText: weightB });
    await expect(cardA).toBeVisible({ timeout: 15000 });
    await expect(cardB).toBeVisible({ timeout: 15000 });

    await cardA.locator('.sel-check').click();
    await expect(cardA).toHaveClass(/sel-active/);
    await cardB.locator('.sel-check').click();
    await expect(cardB).toHaveClass(/sel-active/);
    await expect(page.locator('#measBulkCount')).toContainText('2');

    await page.locator('#measBulkBar .bulk-bar-del').click();
    await expect(page.locator('#bulkConfirmModal')).toBeVisible();
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    await page.locator('#bulkConfirmModal .draft-modal-btn-discard').click();
    await expect(page.locator('#bulkConfirmModal')).toBeHidden();
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();
    await expect(page.locator('#measBulkBar')).toBeVisible();

    await page.locator('#measBulkBar .bulk-bar-del').click();
    await expect(page.locator('#bulkConfirmModal')).toBeVisible();
    await page.locator('#bulkConfirmModal .bulk-confirm-btn-delete').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(cardA).toHaveCount(0);
    await expect(cardB).toHaveCount(0);
  });

  test('bulk delete: selecting exactly 1 measurement deletes immediately without showing the confirmation modal', async ({ page }) => {
    const ts = Date.now();
    const weight = (900 + (ts % 90)) + '.' + (ts % 10);
    await logThrowawayMeasurement(page, weight);

    const card = page.locator('.measure-card', { hasText: weight });
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.locator('.sel-check').click();
    await expect(card).toHaveClass(/sel-active/);
    await expect(page.locator('#measBulkCount')).toContainText('1');

    await page.locator('#measBulkBar .bulk-bar-del').click();
    await expect(page.locator('#bulkConfirmModal')).toBeHidden();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(card).toHaveCount(0);
  });
});
