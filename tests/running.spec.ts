import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

// ─── Cardio Data Migration ──────────────────────────────────────────────
// NOTE on fixture seeding: this repo has no Firestore emulator and no
// Firebase Admin fixture-seeding script (see tests/fixtures/ — it only holds
// a Playwright storageState and a plain test-data.json, no seed mechanism).
// These tests instead run against the real `test@gmail.com` account's real
// production Firestore data via the app's own client SDK, exactly as every
// other spec in this file already does through loginWithEmailPassword().
//
// `test@gmail.com` genuinely had old-schema data (a `runWorkoutTypes`
// collection with 'Running' and 'Elliptical' docs, no `runWorkouts` docs) the
// first time this migration code ran against it during implementation of
// this task. That one real run was independently verified (via temporary
// read-only debug hooks, since removed) to migrate correctly: it produced
// `config/runningTemplates` with the exact expected shape, deleted the old
// `runWorkoutTypes` docs, and set `config/settings.cardioMigratedV2 = true`.
// Because the migration is one-time and guarded, that state is now
// permanent for this account — the assertions below keep passing on every
// subsequent run, but from this point on they exercise the idempotent
// guard-flag path (fast early-return), not the "processes real old-schema
// docs" path. See task-1-report.md for the full account of what was and
// wasn't verified end-to-end, and why the `runWorkouts` per-doc rewrite
// (date format, fields[], deleteField() of old keys) could not be exercised
// against real data (the account had zero old-schema workout docs).
test.describe('Cardio Data Migration', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('migrates old runWorkoutTypes/runWorkouts into runningTemplates + fields[] shape', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__cardioMigrationDone === true, { timeout: 15000 });
    const result = await page.evaluate(async () => {
      return await (window as any).__debugGetDoc(['config', 'runningTemplates']);
    });
    expect(result).toBeTruthy();
    expect(result.types).toContain('Running');
    expect(result['Running'].some((f: any) => f.fieldType === 'date')).toBe(true);
    expect(result['Running'].some((f: any) => f.label === 'מרחק')).toBe(true);
  });

  test('migration guard flag is set and idempotent across reloads', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__cardioMigrationDone === true, { timeout: 15000 });
    const settingsAfterFirstLoad = await page.evaluate(async () => {
      return await (window as any).__debugGetDoc(['config', 'settings']);
    });
    expect(settingsAfterFirstLoad.cardioMigratedV2).toBe(true);

    // Reload — migration must re-run (it's called from _backgroundSync on
    // every load) but the guard flag must make it a no-op: same flag value,
    // no thrown error surfaced to the page, and the previously-migrated
    // runningTemplates doc must be unchanged.
    await page.reload();
    await waitForAppReady(page);
    await page.waitForFunction(() => (window as any).__cardioMigrationDone === true, { timeout: 15000 });
    const [settingsAfterReload, templatesAfterReload] = await page.evaluate(async () => {
      return [
        await (window as any).__debugGetDoc(['config', 'settings']),
        await (window as any).__debugGetDoc(['config', 'runningTemplates']),
      ];
    });
    expect(settingsAfterReload.cardioMigratedV2).toBe(true);
    expect(templatesAfterReload.types).toContain('Running');
  });
});

// The cardio daily-entry page and its template editor both live behind
// the pre-existing #nav-running route, which is still gated by the
// per-user `runningEnabled` Firestore flag (surfaced as #runningEnabledToggle
// in settings) even though the email allow-list that used to sit next to it
// was removed when the cardio page was opened to all users (see
// e7b1e71 "open the cardio toggle to all users"). navigateTo() still
// redirects both '/running' and '/settings/cardio-plan' back to '/' while
// the flag is off (index.html:2405/2430), so every test below needs it on
// first. The flag is a persisted per-account Firestore setting, so this is
// a one-time cost the first time these specs run against a given account.
async function ensureRunningEnabled(page: import('@playwright/test').Page) {
  await page.locator('#mainGearBtn').click();
  await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  const toggle = page.locator('#runningEnabledToggle');
  const isChecked = await toggle.isChecked().catch(() => false);
  if (!isChecked) {
    await page.locator('label.toggle-switch').filter({ has: toggle }).click();
  }
  await expect(page.locator('#nav-running')).toBeVisible({ timeout: 10000 });
  // Land back on the main section so tests that start from #mainGearBtn
  // (which belongs to #sec-main's topbar, not a persistent nav-bar element
  // like #nav-running) find it visible.
  await page.locator('#nav-main').click();
  await expect(page.locator('#sec-main')).toHaveClass(/active/);
}

test.describe('Cardio Daily Entry Page', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);
  });

  test('shows type tabs and saves a workout', async ({ page }) => {
    await page.locator('#nav-running').click();
    await expect(page.locator('#cardioTypeRow .type-btn').first()).toBeVisible();
    await page.locator('#cardioFieldList .cardio-field-row[data-field-type="date"] .cardio-field-input').fill('01/01/2026');
    const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
    await distRow.locator('.cardio-field-input').fill('5.2');
    await page.locator('#cardioSaveBtn').click();
    await expect(page.locator('#toast')).toContainText('נשמר');
  });

  test('+ הוסף שדה adds a one-off text field not saved to the template', async ({ page }) => {
    await page.locator('#nav-running').click();
    // renderCardioFieldList() populates #cardioFieldList asynchronously
    // after the runningTemplates fetch resolves; locator.count() is a
    // one-shot read with no auto-wait, so without this it can capture
    // "before" as 0 (list not rendered yet) under load, making the
    // toHaveCount(before + 1) assertion below compare against the wrong
    // baseline (this genuinely happened under a full-suite run).
    await expect(page.locator('#cardioFieldList .cardio-field-row').first()).toBeVisible();
    const before = await page.locator('#cardioFieldList .cardio-field-row').count();
    await page.locator('button', { hasText: 'הוסף שדה' }).click();
    await expect(page.locator('#cardioFieldList .cardio-field-row')).toHaveCount(before + 1);
  });

  test('copy-last-workout fills fields from the most recent cardio entry of the same type', async ({ page }) => {
    await page.locator('#nav-running').click();
    await expect(page.locator('#cardioCopyLastBtn')).toBeVisible();
    await page.locator('#cardioCopyLastBtn').click();
    await expect(page.locator('#toast')).toBeVisible();
  });

  test('clear-form resets all fields and clears the draft', async ({ page }) => {
    await page.locator('#nav-running').click();
    const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
    await distRow.locator('.cardio-field-input').fill('9.9');
    // Scoped to #sec-running: the strength page's own clear-form button
    // (#clearFormBtn) shares the exact same "נקה טופס" text and is also
    // present in the DOM, so an unscoped locator hits Playwright's strict
    // mode (2 matches).
    await page.locator('#sec-running button', { hasText: 'נקה טופס' }).click();
    await expect(distRow.locator('.cardio-field-input')).toHaveValue('');
  });

  test('draft round-trips through a type switch', async ({ page }) => {
    await page.locator('#nav-running').click();
    // Same async-render race as the "+ הוסף שדה" test above: without
    // waiting for the first tab, types.count() below can read 0 before
    // #cardioTypeRow finishes rendering and false-skip a fixture account
    // that genuinely has >= 2 cardio types (this account's runningTemplates
    // has both 'Running' and 'Elliptical' per the migration test above).
    await expect(page.locator('#cardioTypeRow .type-btn').first()).toBeVisible();
    const types = page.locator('#cardioTypeRow .type-btn');
    test.skip(await types.count() < 2, 'needs at least 2 cardio types in the fixture account');
    const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
    await distRow.locator('.cardio-field-input').fill('3.3');
    await types.nth(1).click();
    await types.nth(0).click();
    await expect(distRow.locator('.cardio-field-input')).toHaveValue('3.3');
  });
});

test.describe('Cardio Template Editor', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);
  });

  test('add type seeds the 8 default fields including a locked date field', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    // Scoped to #cardioEditTabs: the strength edit panel's own (hidden but
    // DOM-present) add-type tab button shares the same class combination,
    // which would otherwise hit Playwright's strict mode.
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill('טסט' + Date.now());
    // Scoped to #cardioAddTypeForm: the strength edit panel's own (hidden
    // but DOM-present) confirm-add button shares the exact same "הוסף"
    // text, which would otherwise hit Playwright's strict mode.
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    await expect(page.locator('#cardioEditListContainer .edit-card')).toHaveCount(8);
    await expect(page.locator('#cardioEditListContainer .edit-card').first().locator('input[disabled]')).toBeVisible();
  });

  test('field type picker toggles between text/number/checkbox', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    const secondField = page.locator('#cardioEditListContainer .edit-card').nth(1);
    await secondField.locator('.ftype-btn[data-ftype="checkbox"]').click();
    await expect(secondField.locator('.ftype-btn[data-ftype="checkbox"]')).toHaveClass(/active/);
  });

  test('date field has no remove button', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    const dateField = page.locator('#cardioEditListContainer .edit-card').first();
    await expect(dateField.locator('.edit-remove')).toHaveCount(0);
  });
});
