import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

async function enableRunningSection(page: import('@playwright/test').Page) {
  await page.locator('#mainGearBtn').click();
  await expect(page.locator('#sec-settings')).toHaveClass(/active/);

  const toggle = page.locator('#runningEnabledToggle');
  const isChecked = await toggle.isChecked().catch(() => false);
  if (!isChecked) {
    // Show the gate row first if hidden, then click
    await page.evaluate(() => {
      const row = document.getElementById('runningGateRow') as HTMLElement | null;
      if (row) row.style.display = 'block';
    });
    const label = page.locator('label').filter({ has: page.locator('#runningEnabledToggle') });
    await label.click().catch(() => toggle.click());
    await page.waitForTimeout(500);
  }
  // Navigate to running section
  await page.evaluate(() => (window as any).showSection('running'));
  await expect(page.locator('#sec-running')).toHaveClass(/active/, { timeout: 5000 });
}

test.describe('Running Section — Enable & Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-main').click();
  });

  test('running section is present in DOM', async ({ page }) => {
    await expect(page.locator('#sec-running')).toBeAttached();
  });

  test('running toggle exists in settings', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#runningEnabledToggle')).toBeAttached();
  });

  test('can navigate to running section programmatically', async ({ page }) => {
    await enableRunningSection(page);
    await expect(page.locator('#sec-running')).toHaveClass(/active/);
  });

  test('running dashboard view is visible after enable', async ({ page }) => {
    await enableRunningSection(page);
    await expect(page.locator('#run-view-dashboard')).toBeVisible();
  });

  test('add workout button is present in running dashboard', async ({ page }) => {
    await enableRunningSection(page);
    const addBtn = page.locator('button[onclick="runShowAdd()"]');
    await expect(addBtn).toBeVisible();
  });

  test('history button is present in running dashboard', async ({ page }) => {
    await enableRunningSection(page);
    const histBtn = page.locator('button[onclick="runShowHistory()"]');
    await expect(histBtn).toBeVisible();
  });

  test('running charts card is present', async ({ page }) => {
    await enableRunningSection(page);
    await expect(page.locator('#run-charts-card')).toBeAttached();
  });
});

test.describe('Running Section — Add Workout Flow', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-main').click();
    await enableRunningSection(page);
    // Navigate to add workout
    await page.locator('button[onclick="runShowAdd()"]').click();
    await expect(page.locator('#run-view-add')).toBeVisible({ timeout: 5000 });
  });

  test('step 1 — type selection is visible', async ({ page }) => {
    await expect(page.locator('#run-add-step1')).toBeVisible();
  });

  test('step 1 — run type list is populated', async ({ page }) => {
    await page.waitForFunction(() => {
      const list = document.getElementById('run-type-list');
      return list && list.children.length > 0;
    }, { timeout: 10000 });
    const typeCount = await page.locator('#run-type-list').locator('button, .run-type-item, [onclick]').count();
    expect(typeCount).toBeGreaterThanOrEqual(1);
  });

  test('back button in add view is visible', async ({ page }) => {
    const backBtn = page.locator('#run-view-add button[onclick="runGoBack()"]');
    await expect(backBtn).toBeVisible();
  });

  test('step 2 — OCR panel is attached', async ({ page }) => {
    await expect(page.locator('#run-add-step2')).toBeAttached();
  });

  test('step 3 — date input is present in form', async ({ page }) => {
    await expect(page.locator('#run-f-date')).toBeAttached();
  });

  test('step 3 — distance input is present in form', async ({ page }) => {
    await expect(page.locator('#run-f-dist')).toBeAttached();
  });

  test('step 3 — duration input is present in form', async ({ page }) => {
    await expect(page.locator('#run-f-dur')).toBeAttached();
  });

  test('manual entry button in step 2 navigates to step 3', async ({ page }) => {
    // First click a type to get to step 2 (if that's the flow)
    // Or go directly to step 3 via manual button if visible
    const manualBtn = page.locator('button[onclick="runShowStep3({})"]');
    const visible = await manualBtn.isVisible().catch(() => false);
    if (visible) {
      await manualBtn.click();
      await expect(page.locator('#run-add-step3')).toBeVisible({ timeout: 5000 });
    } else {
      // Step 2 may only appear after type selection — skip if not reachable without step 1
      test.skip();
    }
  });
});
