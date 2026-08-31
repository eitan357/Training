import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

async function selectFirstWorkoutType(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const row = document.getElementById('typeRow');
    return row && row.children.length > 0;
  }, { timeout: 10000 });
  const firstType = page.locator('#typeRow button, #typeRow .type-btn').first();
  await firstType.click();
  await expect(page.locator('#exerciseList .card').first()).toBeVisible({ timeout: 8000 });
}

test.describe('Workout — Log Session', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-main').click();
  });

  test('save button becomes visible after selecting workout type', async ({ page }) => {
    await selectFirstWorkoutType(page);
    await expect(page.locator('#saveBtn')).toBeVisible({ timeout: 5000 });
  });

  test('add custom exercise button is visible after type selection', async ({ page }) => {
    await selectFirstWorkoutType(page);
    await expect(page.locator('#addBtn')).toBeVisible({ timeout: 5000 });
  });

  test('clear form button is visible after type selection', async ({ page }) => {
    await selectFirstWorkoutType(page);
    await expect(page.locator('#clearFormBtn')).toBeVisible({ timeout: 5000 });
  });

  test('session name input becomes visible after type selection', async ({ page }) => {
    await selectFirstWorkoutType(page);
    await expect(page.locator('#sessionNameWrap')).toBeVisible({ timeout: 5000 });
  });

  test('copy last workout button appears when history exists', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const copyBtn = page.locator('#copyLastBtn');
    await expect(copyBtn).toBeAttached();
  });

  test('clear form button resets all exercise inputs', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const firstCard = page.locator('#exerciseList .card').first();
    const weightField = firstCard.locator('.ex-weight');
    await weightField.fill('100');
    await expect(weightField).toHaveValue('100');

    await page.locator('#clearFormBtn').click();

    const weightAfter = await weightField.inputValue();
    expect(weightAfter).toBe('');
  });

  test('session name is editable and retained', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const nameInput = page.locator('#sessionNameInput');
    await nameInput.fill('Morning QA Session');
    await expect(nameInput).toHaveValue('Morning QA Session');
  });

  test('history preview panel is attached in DOM', async ({ page }) => {
    await expect(page.locator('#historyPreview')).toBeAttached();
  });

  test('draft modal overlay is attached in DOM', async ({ page }) => {
    await expect(page.locator('#draftModal')).toBeAttached();
  });

  test('draft is stored under a domain-namespaced localStorage key', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    await page.locator('#sessionNameInput').fill('SDD test session ' + Date.now());
    await page.waitForTimeout(400); // > 300ms debounce
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('draft_')));
    expect(keys.some(k => k.includes('_strength_'))).toBe(true);
  });
});

test.describe('Workout — Edit Plan', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-main').click();
    // Open workout edit via settings → Edit Workout Plan button
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    await page.locator('button.settings-item', { hasText: 'עריכת תוכנית' }).click();
    // Edit panel becomes visible in main section
    await expect(page.locator('#mainEditPanel')).toBeVisible({ timeout: 8000 });
  });

  test('edit panel renders tabs for each workout type', async ({ page }) => {
    const tabs = page.locator('#editTabs');
    await expect(tabs).toBeVisible();
    const tabBtns = tabs.locator('button, .edit-tab');
    const count = await tabBtns.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('edit list container is visible', async ({ page }) => {
    await expect(page.locator('#editListContainer')).toBeVisible();
  });

  test('add exercise button is visible in edit panel', async ({ page }) => {
    const addExBtn = page.locator('#mainEditPanel button[onclick="addEditExercise()"]');
    await expect(addExBtn).toBeVisible();
  });

  test('save changes button is visible in edit panel', async ({ page }) => {
    const saveBtn = page.locator('#mainEditPanel button[onclick="saveTemplates()"]');
    await expect(saveBtn).toBeVisible();
  });

  test('add type form input is present', async ({ page }) => {
    await expect(page.locator('#newTypeName')).toBeAttached();
  });

  test('back button is visible in edit mode', async ({ page }) => {
    await expect(page.locator('#mainBackBtn')).toBeVisible();
  });

  test('closing edit panel navigates back to settings', async ({ page }) => {
    await page.locator('#mainBackBtn').click();
    // closeWorkoutEdit() closes the panel AND navigates to settings (showSection('settings'))
    await expect(page.locator('#sec-settings')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#mainEditPanel')).not.toBeVisible();
  });
});
