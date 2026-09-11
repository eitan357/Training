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
    const runningType = result.types.find((t: any) => t.name === 'Running');
    expect(runningType).toBeTruthy();
    expect(result[runningType.id].some((f: any) => f.fieldType === 'date')).toBe(true);
    expect(result[runningType.id].some((f: any) => f.label === 'מרחק')).toBe(true);
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
    expect(templatesAfterReload.types.some((t: any) => t.name === 'Running')).toBe(true);
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
    // Scoped to the daily-entry page's own onclick handler: the cardio
    // template editor's add-field button (renamed to this exact same text
    // by the 2026-09-05 A6 fix) is also DOM-present, making an unscoped
    // text locator hit Playwright's strict mode (2 matches).
    await page.locator('button[onclick="addCustomCardioField()"]').click();
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

  // ── QA fixes 2026-09-03 ──────────────────────────────────────────
  test('negative numeric value is rejected on save', async ({ page }) => {
    await page.locator('#nav-running').click();
    const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
    await distRow.locator('.cardio-field-input').fill('-5');
    await page.locator('#cardioSaveBtn').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    // Value is still there — the save was blocked, not silently accepted.
    await expect(distRow.locator('.cardio-field-input')).toHaveValue('-5');
  });

  test('ad-hoc field ("+ הוסף שדה") gets an editable label, required to save', async ({ page }) => {
    await page.locator('#nav-running').click();
    await expect(page.locator('#cardioFieldList .cardio-field-row').first()).toBeVisible();
    // Scoped to the daily-entry page's own onclick handler — see the note
    // on the "+ הוסף שדה adds a one-off text field" test above.
    await page.locator('button[onclick="addCustomCardioField()"]').click();
    const labelInput = page.locator('.run-form-label-input').last();
    await expect(labelInput).toBeVisible();
    await expect(labelInput).toHaveValue('');

    // Fill the ad-hoc field's value but leave its label blank — save must
    // be blocked. The date field no longer needs filling: it's a readonly,
    // picker-driven input (2026-09-08) that defaults to today on its own.
    await page.locator('.cardio-field-row').last().locator('.cardio-field-input').fill('123');
    await page.locator('#cardioSaveBtn').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cardio-field-row').last().locator('.cardio-field-input')).toHaveValue('123');
  });

  test('default field labels are associated with their inputs (for/id), checkbox has an accessible name', async ({ page }) => {
    await page.locator('#nav-running').click();
    const distInput = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' }).locator('.cardio-field-input');
    await expect(distInput).toBeVisible();
    const linked = await distInput.evaluate(el => !!el.id && !!document.querySelector(`label[for="${el.id}"]`));
    expect(linked).toBe(true);

    const checkboxRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'הרגשתי עייפות' });
    const checkboxAriaLabel = await checkboxRow.locator('input[type="checkbox"]').getAttribute('aria-label');
    expect(checkboxAriaLabel).toBeTruthy();
  });

  test('default field labels translate to English, a renamed field does not', async ({ page }) => {
    await page.locator('#nav-running').click();
    await expect(page.locator('#cardioFieldList .cardio-field-row').first()).toBeVisible();

    await page.locator('#cardioGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    const langBtns = page.locator('#langBtns button');
    await langBtns.nth(1).click(); // English
    await page.waitForTimeout(500);
    await page.locator('#nav-running').click();
    await expect(page.locator('#cardioFieldList .cardio-field-row', { hasText: 'Distance' })).toBeVisible({ timeout: 5000 });

    // restore Hebrew for any later test in this run
    await page.locator('#cardioGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    await langBtns.first().click();
    await page.waitForTimeout(500);
  });

  // Regression test for the 2026-09-07 bug where the draft-found modal's
  // item count was hardcoded to the strength draft shape (draft.exercises)
  // — cardio drafts are shaped { fields: [...] }, so draft.exercises was
  // always undefined and the count was always "0", regardless of real
  // content. See docs/superpowers/specs/2026-09-07-draft-modal-cardio-parity-design.md.
  test('draft-found modal shows the real field count, not always 0', async ({ page }) => {
    await page.locator('#nav-running').click();
    await expect(page.locator('#cardioFieldList .cardio-field-row').first()).toBeVisible();

    const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
    await distRow.locator('.cardio-field-input').fill('5.5');
    const timeRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'זמן' });
    await timeRow.locator('.cardio-field-input').fill('30');
    await page.waitForTimeout(500);

    // Force the "new session" (modal, not silent-restore) path.
    await page.evaluate(() => sessionStorage.removeItem('session_active'));
    await page.reload();
    await page.locator('#nav-running').click();
    await expect(page.locator('#draftModal')).toHaveCSS('display', 'flex', { timeout: 5000 });

    const details = await page.locator('.draft-modal-details').textContent();
    expect(details).not.toContain('0 ');
    expect(details).toMatch(/\d+ (שדות|fields)/);
  });
});

// H1's fix (docs/superpowers/specs/2026-09-03-strength-cardio-qa-fixes-design.md
// §2) is specifically about a fresh boot straight into the cardio template
// editor route — a normal in-app navigation to it (already covered by
// running.spec.ts's other tests reaching it via a click) never exercised the
// race, since by the time a click is possible the app has already finished
// loading. This describe block deliberately reloads the page ON that route
// after first caching `runningEnabled` locally (matching a real returning
// user, not a pristine never-configured device — see the spec's H1 section
// for why that distinction matters).
test.describe('Cardio Template Editor — Deep Link', () => {
  test('editor renders tabs and fields when the route is loaded fresh (not via in-app click)', async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);

    // saveRunningEnabled() (index.html) writes the flag to Firestore
    // immediately but does NOT cache it to localStorage until the next full
    // _backgroundSync() cycle — a separate, pre-existing gap unrelated to
    // H1. One reload here lets that cycle run once, so the deep-link
    // navigation below tests H1's actual fix (the runningTypes/
    // cardioEditTemplates race) on its own, matching a real returning
    // user's second session rather than the same-session edge case.
    // waitForAppReady() only confirms Phase 1 (the loading overlay hides as
    // soon as the synchronous localStorage cache is applied) — Phase 2
    // (_backgroundSync, which is what actually re-caches runningEnabled)
    // is explicitly non-blocking and can still be in flight at that point,
    // so wait for #nav-running to reflect the fully-synced state too.
    await page.reload();
    await waitForAppReady(page);
    await expect(page.locator('#nav-running')).toBeVisible({ timeout: 10000 });

    await page.goto('/settings/cardio-plan');
    await page.waitForFunction(() => {
      const overlay = document.getElementById('loading-overlay');
      return !overlay || (overlay as HTMLElement).style.display === 'none' || overlay.classList.contains('fade-out');
    }, { timeout: 20000 });
    await expect(page.locator('#cardioEditTabs .tab-item').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#cardioEditListContainer .edit-card').first()).toBeVisible({ timeout: 15000 });
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

  // Regression test for A3 (addendum QA report): the same initDragSort(el, type)
  // bug that broke strength's drag-and-drop also broke cardio's, since both
  // editors share renderEditList()/initDragSort(). The date field is first
  // and has no drag handle (locked position), so this drags the SECOND
  // field's handle down past the third and asserts order changed.
  test('drag handle reorders fields in the cardio edit panel', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    const handles = page.locator('#cardioEditListContainer .drag-handle');
    await expect(handles.first()).toBeVisible();
    const count = await handles.count();
    test.skip(count < 2, 'need at least 2 draggable (non-date) fields to test reordering');
    const labelsBefore = await page.locator('#cardioEditListContainer .edit-card .cardio-field-label-input').evaluateAll(els => (els as HTMLInputElement[]).map(e => e.value));
    const draggedCard = handles.first().locator('xpath=ancestor::*[contains(@class,"edit-card")]');
    // Target the vertical center of the row TWO positions below the dragged
    // one directly (matches this test's own "past the third field" intent)
    // instead of a height-multiplier heuristic — that heuristic went stale
    // once the date card's height changed (2026-09-08, label input +
    // visibility toggle combined onto one row) and started landing only
    // barely inside the very next row, which was too marginal to reliably
    // cross the drop-zone check in startGenericDrag's `move` handler.
    const cards = page.locator('#cardioEditListContainer .edit-card');
    const draggedIndex = await draggedCard.evaluate(el => [...el.parentElement.children].indexOf(el));
    const targetBox = await cards.nth(draggedIndex + 2).boundingBox();
    // hover() (not a manually-computed boundingBox() click point) because in
    // RTL layout this small inline `.drag-handle` span's Playwright-reported
    // box was measured ~9px off from its actual hit-testable position —
    // enough for a raw mouse.move(box.x+width/2, ...) to land on the parent
    // `.edit-card` instead of the handle and silently no-op the whole drag.
    // hover() uses Playwright's own actionability/hit-target verification,
    // which lands precisely on the handle regardless of that offset.
    await handles.first().hover();
    const startBox = await handles.first().boundingBox();
    await page.mouse.down();
    await page.mouse.move(startBox!.x + startBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
    await page.mouse.up();
    const labelsAfter = await page.locator('#cardioEditListContainer .edit-card .cardio-field-label-input').evaluateAll(els => (els as HTMLInputElement[]).map(e => e.value));
    expect(labelsAfter).not.toEqual(labelsBefore);
  });
});

// ─── Type Identity: Rename & Reorder — Migration (2026-09-10) ──────────
// Cardio equivalents of workout.spec.ts's "Type Identity — ..." describes,
// plus the shared (both-domain) migration idempotency check. See
// docs/superpowers/specs/2026-09-10-type-identity-rename-reorder-design.md
// §8 and workout.spec.ts's own header comment on this same date for the
// no-emulator/real-account rationale and the throwaway-type cleanup
// convention followed throughout.
// See workout.spec.ts's identical helper (same file, same date) for why
// this waits past the toast's own auto-hide rather than just its
// appearance — saveCardioTemplates()'s reloadAppData() call races any
// further in-memory type mutation otherwise.
async function clickSaveAndSettle(page: import('@playwright/test').Page, buttonSelector: string) {
  await page.locator(buttonSelector).click();
  await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
}

// #draftModal is deliberately global/section-independent (public/index.html,
// docs/superpowers/specs/2026-09-08-cardio-visual-and-modal-fixes-design.md
// §Issue4) — a fixed, full-viewport overlay that can appear regardless of
// which section is active. Navigating away from a type with a genuine
// in-flight qualifying draft (exactly what the draft-survives-rename test
// below does, by design) can surface it; unlike strength's equivalent flow
// (which restores silently within the same tab session), cardio's did show
// it during manual verification of this test. Since resuming the draft is
// what a real user would do and is orthogonal to what this test actually
// checks (the id-keyed draft key survives a rename), dismiss it via the
// same "המשך" resume action a user would take rather than assuming the
// modal never appears.
async function resumeDraftModalIfPresent(page: import('@playwright/test').Page) {
  const modal = page.locator('#draftModal');
  if (await modal.isVisible().catch(() => false)) {
    await page.locator('.draft-modal-btn-resume').click();
    await expect(modal).toBeHidden({ timeout: 5000 });
  }
}

async function openCardioEditPanel(page: import('@playwright/test').Page) {
  await page.locator('#nav-main').click();
  await page.locator('#mainGearBtn').click();
  await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
  await expect(page.locator('#cardioEditPanel')).toBeVisible({ timeout: 8000 });
}

test.describe('Cardio Type Identity — Rename', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);
  });

  test('renaming a cardio type persists across reload', async ({ page }) => {
    const originalName = 'CTID_' + Date.now();
    const renamedName  = 'CTID2_' + Date.now();
    let typeId = '';

    await openCardioEditPanel(page);
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill(originalName);
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#cardioEditTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();
    await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

    try {
      page.once('dialog', dialog => dialog.accept(renamedName));
      await page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`).dblclick();
      await expect(page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`)).toHaveText(renamedName);
      await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

      await page.reload();
      await waitForAppReady(page);
      await openCardioEditPanel(page);
      await expect(page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`))
        .toHaveText(renamedName, { timeout: 8000 });
    } finally {
      const removeBtn = page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      }
    }
  });
});

test.describe('Cardio Type Identity — Reorder & Colors', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);
  });

  // Mirrors workout.spec.ts's strength reorder+color test exactly — see
  // that test's comments for the full rationale (__debugGetDoc for the
  // otherwise-unobservable `color` field, real Running/Elliptical types,
  // scoped to exactly-2-types accounts, a throwaway 3rd type added before
  // dragging so this exercises 3+ tabs — the exact configuration the final
  // whole-branch review's C2 fix targets — while only ever repositioning
  // the throwaway itself so removing it at the end restores the original
  // 2-type baseline directly, no compensating reverse-drag needed).
  test('reordering cardio type tabs (3+ types) persists across reload without changing colors', async ({ page }) => {
    const before = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'runningTemplates']));
    test.skip(!before || !Array.isArray(before.types) || before.types.length !== 2,
      'scoped to accounts with exactly 2 cardio types (this account\'s documented Running/Elliptical state)');
    const idsBefore = before.types.map((t: any) => t.id);
    const colorById: Record<string, number> = {};
    before.types.forEach((t: any) => { colorById[t.id] = t.color; });

    await openCardioEditPanel(page);

    // Add a throwaway 3rd type — see file header's create-then-remove
    // convention (same as the Rename/History describe blocks above).
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    const throwawayName = 'CTID3_' + Date.now();
    await page.locator('#cardioNewTypeName').fill(throwawayName);
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    const thirdId = (await page.locator('#cardioEditTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(thirdId).toBeTruthy();
    await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
    // Reload before reading back via __debugGetDoc — same convention every
    // other read in this describe block follows (see the "after" reads
    // below): an immediate read right after save raced the client's own
    // Firestore cache/write-ack timing during verification and intermittently
    // saw the just-added 3rd type missing.
    await page.reload();
    await waitForAppReady(page);
    const afterAdd = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'runningTemplates']));
    colorById[thirdId] = afterAdd.types.find((t: any) => t.id === thirdId).color;
    await openCardioEditPanel(page);

    const readTabOrder = async () =>
      page.locator('#cardioEditTabs .tab-item.edit-card').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.id));

    // Drags the LAST tab (the throwaway) all the way to the FIRST position,
    // crossing both other tabs' bounding boxes along a real multi-step path
    // — a genuine sequence of intermediate pointer positions, not a single
    // teleport jump, since C2's bug was specifically about mishandling that
    // sequence.
    const dragLastTabToFirst = async () => {
      const handles = page.locator('#cardioEditTabs .tab-item.edit-card .drag-handle');
      const cards   = page.locator('#cardioEditTabs .tab-item.edit-card');
      await handles.last().hover();
      const startBox  = await handles.last().boundingBox();
      const targetBox = await cards.first().boundingBox();
      await page.mouse.down();
      await page.mouse.move(targetBox!.x + targetBox!.width / 2, startBox!.y + startBox!.height / 2, { steps: 15 });
      await page.mouse.up();
    };

    try {
      expect(await readTabOrder()).toEqual([...idsBefore, thirdId]);
      await dragLastTabToFirst();
      const idsAfterDrag = await readTabOrder();
      expect(idsAfterDrag).toEqual([thirdId, ...idsBefore]);

      // A pure vertical micro-jitter (zero horizontal movement) must NOT
      // reorder anything — the other live-reproduced half of C2.
      const jitterHandle = page.locator('#cardioEditTabs .tab-item.edit-card .drag-handle').first();
      const jitterBox = await jitterHandle.boundingBox();
      await page.mouse.move(jitterBox!.x + jitterBox!.width / 2, jitterBox!.y + jitterBox!.height / 2);
      await page.mouse.down();
      await page.mouse.move(jitterBox!.x + jitterBox!.width / 2, jitterBox!.y + jitterBox!.height / 2 + 3, { steps: 3 });
      await page.mouse.up();
      expect(await readTabOrder()).toEqual(idsAfterDrag);

      await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

      await page.reload();
      await waitForAppReady(page);
      const after = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'runningTemplates']));
      expect(after.types.map((t: any) => t.id)).toEqual(idsAfterDrag);
      after.types.forEach((t: any) => { expect(t.color).toBe(colorById[t.id]); });
    } finally {
      // Remove the throwaway 3rd type. The drag above only ever repositioned
      // IT — Running/Elliptical's own relative order was never touched — so
      // this alone restores the account to its original idsBefore order.
      await openCardioEditPanel(page);
      const removeBtn = page.locator(`#cardioEditTabs .tab-item[data-id="${thirdId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      }
      await expect.poll(readTabOrder).toEqual(idsBefore);
    }
  });
});

test.describe('Cardio Type Identity — History Reflects Renames', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);
  });

  // Cardio equivalent of workout.spec.ts's same-named test. A new cardio
  // type is seeded with the 8 default fields by confirmAddCardioType (spec
  // §4.2), so — unlike strength — no ad-hoc field is needed to log an entry.
  test('history badge shows a cardio type\'s new name for an entry logged before the rename', async ({ page }) => {
    const originalName  = 'CTIDH_' + Date.now();
    const renamedName   = 'CTIDH2_' + Date.now();
    const sessionMarker = 'CardioTypeIdentityHistTest ' + Date.now();
    let typeId = '';

    await openCardioEditPanel(page);
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill(originalName);
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#cardioEditTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();
    await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

    try {
      await page.locator('#nav-running').click();
      await expect(page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`)).toBeVisible({ timeout: 10000 });
      await page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`).click();
      const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
      await distRow.locator('.cardio-field-input').fill('5.5');
      await page.locator('#cardioSessionNameInput').fill(sessionMarker);
      await page.locator('#cardioSaveBtn').click();
      await expect(page.locator('#toast')).toContainText('נשמר');

      await openCardioEditPanel(page);
      page.once('dialog', dialog => dialog.accept(renamedName));
      await page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`).dblclick();
      await expect(page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`)).toHaveText(renamedName);
      await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

      await page.locator('#nav-history').click();
      await expect(page.locator('#sec-history')).toHaveClass(/active/);
      await page.locator('.history-domain-btn[data-domain="cardio"]').click();
      await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0, { timeout: 15000 });
      const sessionCard = page.locator('.session-card', { hasText: sessionMarker });
      await expect(sessionCard).toBeVisible({ timeout: 15000 });
      await expect(sessionCard.locator('.session-name-label')).toHaveText(sessionMarker);
      await expect(sessionCard.locator('.session-badge')).toContainText(renamedName);
      await expect(sessionCard.locator('.session-badge')).not.toContainText(originalName);
    } finally {
      await page.locator('#nav-history').click().catch(() => {});
      const sessionCard = page.locator('.session-card', { hasText: sessionMarker });
      if (await sessionCard.count() > 0) {
        const header = sessionCard.locator('.session-header');
        await header.scrollIntoViewIfNeeded();
        const box = await header.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(650);
          await page.mouse.up();
          await page.locator('#histBulkBar .bulk-bar-del').click();
          await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
        }
      }
      await openCardioEditPanel(page);
      const removeBtn = page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      }
    }
  });
});

test.describe('Cardio Type Identity — Draft Survives Rename', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await ensureRunningEnabled(page);
  });

  test('a mid-session cardio draft survives a rename of its own type', async ({ page }) => {
    const originalName = 'CTIDD_' + Date.now();
    const renamedName  = 'CTIDD2_' + Date.now();
    const draftMarker  = 'CardioDraftSurvivesRename ' + Date.now();
    let typeId = '';

    await openCardioEditPanel(page);
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill(originalName);
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#cardioEditTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();
    await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

    try {
      await page.locator('#nav-running').click();
      await expect(page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`)).toBeVisible({ timeout: 10000 });
      await page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`).click();
      await page.locator('#cardioSessionNameInput').fill(draftMarker);
      await page.waitForFunction((expected) => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('draft_') && k.includes('_cardio_'));
        return keys.some(k => {
          try { return JSON.parse(localStorage.getItem(k) || 'null')?.workoutName === expected; }
          catch(e) { return false; }
        });
      }, draftMarker, { timeout: 5000 });

      // Reload BEFORE navigating to the edit panel: this account's own
      // _isNewSession flag (public/index.html) only shows the draft-found
      // MODAL on a genuinely fresh session (empty sessionStorage, true on
      // this test's very first load). Opening the cardio template editor
      // while still on that first, never-reloaded load re-triggers cardio's
      // own draft-restore check (loadRunData()'s promise chain inside
      // _setCardioEditPanel) and DID surface the modal here during manual
      // verification of this test, blocking the rename dblclick underneath
      // it (strength's editor has no equivalent reload-on-open step, so its
      // own version of this test never hits this). A reload here flips
      // _isNewSession false (sessionStorage survives same-tab reloads), so
      // any further draft-restore check takes the silent-restore branch
      // instead — matching this file's/workout.spec.ts's own "same-session
      // reload restores silently" behavior — and doubles as an extra,
      // earlier proof point that the draft already survives a reload before
      // the rename even happens.
      await page.reload();
      await waitForAppReady(page);
      await page.locator('#nav-running').click();
      await expect(page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`)).toBeVisible({ timeout: 10000 });
      await page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`).click();
      await resumeDraftModalIfPresent(page); // safety net — should be a no-op after the reload above
      await expect(page.locator('#cardioSessionNameInput')).toHaveValue(draftMarker, { timeout: 8000 });

      await openCardioEditPanel(page);
      page.once('dialog', dialog => dialog.accept(renamedName));
      await page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`).dblclick();
      await expect(page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-name`)).toHaveText(renamedName);
      await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

      await page.reload();
      await waitForAppReady(page);
      await page.locator('#nav-running').click();
      await expect(page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`)).toBeVisible({ timeout: 10000 });
      await page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`).click();
      await resumeDraftModalIfPresent(page);
      await expect(page.locator('#cardioSessionNameInput')).toHaveValue(draftMarker, { timeout: 8000 });
    } finally {
      await page.locator('#nav-running').click().catch(() => {});
      const typeBtn = page.locator(`#cardioTypeRow .type-btn[data-type="${typeId}"]`);
      if (await typeBtn.count() > 0) {
        await typeBtn.click();
        await resumeDraftModalIfPresent(page).catch(() => {});
        await page.locator('#sec-running button', { hasText: 'נקה טופס' }).click().catch(() => {});
      }
      await openCardioEditPanel(page);
      const removeBtn = page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      }
    }
  });
});

// ─── Type Identity Migration (Rename/Reorder V1) ────────────────────────
// Verifies the two idempotency guards inside _migrateTypeIdentityForDomain
// (public/index.html, spec 2026-09-10-type-identity-rename-reorder-design.md
// §4): Phase A skips re-deriving the registry once `types` entries are
// already objects (not strings); Phase B's per-entry backfill skips any
// entry that already has `typeId`. This account is ALREADY migrated
// (typeIdentityMigratedV1 === true, set the first time this code ran
// against it during this task's own implementation) — so, exactly matching
// how the "Cardio Data Migration" describe block above verifies
// migrateCardioDataV2's idempotency (reload + guard-flag/doc-shape
// comparison, NOT reverting the account to a pre-migration shape and
// re-running, which this task's brief explicitly rules out as a live
// double-migration against real data), this exercises the guarded-retry
// path via a real reload: the guard flag and both domains' registries must
// be byte-for-byte identical before and after, proving a retry from
// already-migrated state is a true no-op (Phase A's guard). Per-entry
// idempotency (Phase B's guard) has no equivalent direct read hook (no
// collection-query debug hook exists, only __debugGetDoc for single
// documents) — this test's scope is registry-level, matching exactly what
// the cardio migration test above verifies for migrateCardioDataV2.
test.describe('Type Identity Migration (Rename/Reorder V1)', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('registry is {id,name,color}[] for both domains and the guard flag is set', async ({ page }) => {
    await page.waitForFunction(async () => {
      const s = await (window as any).__debugGetDoc(['config', 'settings']);
      return !!s && s.typeIdentityMigratedV1 === true;
    }, { timeout: 15000 });
    const [settings, templates, runningTemplates] = await page.evaluate(async () => [
      await (window as any).__debugGetDoc(['config', 'settings']),
      await (window as any).__debugGetDoc(['config', 'templates']),
      await (window as any).__debugGetDoc(['config', 'runningTemplates']),
    ]);
    expect(settings.typeIdentityMigratedV1).toBe(true);
    for (const d of [templates, runningTemplates]) {
      expect(Array.isArray(d.types)).toBe(true);
      expect(d.types.length).toBeGreaterThan(0);
      d.types.forEach((t: any) => {
        expect(typeof t.id).toBe('string');
        expect(t.id.length).toBeGreaterThan(0);
        expect(typeof t.name).toBe('string');
        expect(typeof t.color).toBe('number');
      });
    }
  });

  test('a guarded retry (reload) never re-derives either domain\'s registry', async ({ page }) => {
    await page.waitForFunction(async () => {
      const s = await (window as any).__debugGetDoc(['config', 'settings']);
      return !!s && s.typeIdentityMigratedV1 === true;
    }, { timeout: 15000 });
    const before = await page.evaluate(async () => [
      await (window as any).__debugGetDoc(['config', 'templates']),
      await (window as any).__debugGetDoc(['config', 'runningTemplates']),
    ]);

    await page.reload();
    await waitForAppReady(page);
    await page.waitForFunction(async () => {
      const s = await (window as any).__debugGetDoc(['config', 'settings']);
      return !!s && s.typeIdentityMigratedV1 === true;
    }, { timeout: 15000 });
    const after = await page.evaluate(async () => [
      await (window as any).__debugGetDoc(['config', 'templates']),
      await (window as any).__debugGetDoc(['config', 'runningTemplates']),
    ]);

    // A re-derive would mint brand-new ids via genId() — exact equality of
    // both domains' `types` arrays proves the Phase A guard held.
    expect(after[0].types).toEqual(before[0].types);
    expect(after[1].types).toEqual(before[1].types);
  });

  // I1 (final whole-branch review, 2026-09-10 fix round): the test above
  // never actually reaches _migrateTypeIdentityForDomain — migrateTypeIdentity()
  // returns at its own top-level `typeIdentityMigratedV1` check before that
  // function is ever called, since this account is already migrated on
  // every normal load. To genuinely exercise _migrateTypeIdentityForDomain's
  // own two guards (Phase A: registry entries already objects -> reuse
  // as-is; Phase B: entries already carrying `typeId` -> skip), the
  // top-level flag needs to be cleared first so migrateTypeIdentity() falls
  // through into calling it. There's no read-only way to do that from the
  // page, so window.__debugClearTypeIdentityMigrationFlag (public/index.html)
  // was added as a narrowly-scoped, deliberate write — same test-only-hook
  // convention as __debugGetDoc, but a `setDoc(..., {merge:true})` touching
  // ONLY the one boolean field, never the rest of config/settings.
  //
  // This is a genuine no-op by construction, not a real double-migration:
  // the registry is already {id,name,color}[] (Phase A's guard) and every
  // entry already has typeId (Phase B's guard), so re-running the function
  // must leave both config/templates and config/runningTemplates
  // byte-identical — any actual re-derive would mint brand-new ids via
  // genId(), which would show up immediately as a diff — and must set the
  // guard flag back to true on its own (proving the early-return-because-
  // already-object-shaped path ran cleanly, not that the flag was simply
  // never cleared).
  //
  // Waits on window.__typeIdentityMigrationDone (public/index.html), NOT
  // just on the settings doc's flag reading true, both before clearing and
  // after the reload. waitForAppReady() only guarantees Phase 1 (the
  // synchronous local-cache render) has finished — Phase 2's
  // _backgroundSync (which calls migrateTypeIdentity()) is fired
  // unawaited from initApp() and can still be mid-flight afterward. This
  // was reproduced directly while writing this test: clearing the flag
  // while THIS page's own boot-time migrateTypeIdentity() call was still
  // in flight raced its own closing `setDoc(..., {typeIdentityMigratedV1:
  // true})`, which landed microseconds later and silently clobbered the
  // clear. __typeIdentityMigrationDone is a genuine completion signal (set
  // once migrateTypeIdentity() has either taken its early-return path or
  // finished writing the flag itself), the same established convention as
  // migrateCardioDataV2's own window.__cardioMigrationDone above.
  test('clearing the top-level guard flag and reloading exercises _migrateTypeIdentityForDomain\'s own guards as a true no-op', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__typeIdentityMigrationDone === true, { timeout: 15000 });
    const before = await page.evaluate(async () => [
      await (window as any).__debugGetDoc(['config', 'templates']),
      await (window as any).__debugGetDoc(['config', 'runningTemplates']),
    ]);

    await page.evaluate(async () => { await (window as any).__debugClearTypeIdentityMigrationFlag(); });
    const clearedSettings = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'settings']));
    expect(clearedSettings.typeIdentityMigratedV1).toBe(false);

    await page.reload();
    await waitForAppReady(page);
    await page.waitForFunction(() => (window as any).__typeIdentityMigrationDone === true, { timeout: 15000 });

    const after = await page.evaluate(async () => [
      await (window as any).__debugGetDoc(['config', 'templates']),
      await (window as any).__debugGetDoc(['config', 'runningTemplates']),
    ]);
    // Byte-identical, including exercise/field content and ids — not just
    // the `types` array — proving _migrateTypeIdentityForDomain's Phase A
    // AND Phase B guards both correctly no-op rather than re-deriving
    // anything.
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toEqual(before[1]);

    const settingsAfter = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'settings']));
    expect(settingsAfter.typeIdentityMigratedV1).toBe(true);
  });
});
