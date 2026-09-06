import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

async function selectFirstWorkoutType(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const row = document.getElementById('typeRow');
    return row && row.children.length > 0;
  }, { timeout: 10000 });
  const buttons = page.locator('#typeRow button, #typeRow .type-btn');
  const count = await buttons.count();
  // Clicking an already-active type button is a no-op (selectType()
  // early-returns when unchanged) — on a fresh boot where Phase 1 had no
  // local cache yet, the initially-active type can render zero exercise
  // cards, and nothing re-renders until a REAL type change happens. This
  // was the root cause of this helper's known flakiness (documented in
  // project memory as a pre-existing baseline failure predating any of
  // this repo's recent initiatives) — click whichever button ISN'T
  // already active to guarantee a real selectType() call.
  let target = buttons.first();
  for (let i = 0; i < count; i++) {
    const isActive = await buttons.nth(i).evaluate(el => el.classList.contains('active'));
    if (!isActive) { target = buttons.nth(i); break; }
  }
  await target.click();
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

  // ── QA fixes 2026-09-03 ──────────────────────────────────────────
  test('ad-hoc exercise ("+ הוסף תרגיל") gets an editable name input, required to save', async ({ page }) => {
    await selectFirstWorkoutType(page);
    await page.locator('#addBtn').click();
    const newCard = page.locator('#exerciseList .card').last();
    const nameInput = newCard.locator('.ex-name-input');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).toHaveValue('');

    await newCard.locator('.ex-weight').fill('20');
    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(newCard.locator('.ex-weight')).toHaveValue('20'); // save was blocked, value untouched
  });

  test('non-numeric weight is rejected on save', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const card = page.locator('#exerciseList .card').first();
    await card.locator('.ex-weight').fill('abc');
    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.ex-weight')).toHaveValue('abc');
  });

  test('negative sets value is rejected on save', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const card = page.locator('#exerciseList .card').first();
    await card.locator('.ex-weight').fill('60');
    await card.locator('.ex-sets').fill('-3');
    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.ex-sets')).toHaveValue('-3');
  });

  test('target pill is keyboard-reachable (role=button, tabindex=0)', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const pill = page.locator('.ex-target-clickable').first();
    test.skip(await pill.count() === 0, 'no target pill on this template to test with');
    await expect(pill).toHaveAttribute('role', 'button');
    await expect(pill).toHaveAttribute('tabindex', '0');
  });

  test('weight/sets/reps/notes inputs are associated with their labels (for/id)', async ({ page }) => {
    await selectFirstWorkoutType(page);
    const weightInput = page.locator('#exerciseList .card').first().locator('.ex-weight');
    const linked = await weightInput.evaluate(el => !!el.id && !!document.querySelector(`label[for="${el.id}"]`));
    expect(linked).toBe(true);
  });

  test('legacy target pill fills Sets (not just Weight/Reps)', async ({ page }) => {
    await selectFirstWorkoutType(page);
    // Legacy targets aren't present in the Phase 1 localStorage cache — give
    // the Phase 2 background Firestore sync time to populate them (see
    // docs/superpowers/specs/2026-09-03-strength-cardio-qa-fixes-design.md).
    await page.waitForTimeout(2000);
    const pill = page.locator('.ex-target-legacy').first();
    test.skip(await pill.count() === 0, 'no legacy-target exercise on this template to test with');
    const card = page.locator('#exerciseList .card').filter({ has: page.locator('.ex-target-legacy') }).first();
    await pill.click();
    const sets = await card.locator('.ex-sets').inputValue();
    expect(sets.trim()).not.toBe('');
  });

  test('history preview panel is attached in DOM', async ({ page }) => {
    await expect(page.locator('#historyPreview')).toBeAttached();
  });

  test('draft modal overlay is attached in DOM', async ({ page }) => {
    await expect(page.locator('#draftModal')).toBeAttached();
  });

  test('draft is stored under a domain-namespaced localStorage key', async ({ page }) => {
    // Deliberately avoids selectFirstWorkoutType() — that helper also waits for
    // #exerciseList .card, which this QA account's async-load timing makes flaky;
    // this test only needs #typeRow, not the exercise cards.
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

  test('draft round-trips workout name through localStorage', async ({ page }) => {
    // Deliberately avoids selectFirstWorkoutType() — that helper also waits for
    // #exerciseList .card, which this QA account's async-load timing makes flaky;
    // this test only needs #typeRow, not the exercise cards.
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    const sessionName = 'SDD round-trip session ' + Date.now();
    await page.locator('#sessionNameInput').fill(sessionName);
    // Wait for the actual debounced localStorage write to land (not just a
    // fixed sleep) — under heavier system load a fixed 400ms timeout can
    // elapse before the 300ms-debounced autosave has actually persisted,
    // making the reload below race the write.
    await page.waitForFunction((expected) => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('draft_') && k.includes('_strength_'));
      return keys.some(k => {
        try { return JSON.parse(localStorage.getItem(k) || 'null')?.workoutName === expected; }
        catch(e) { return false; }
      });
    }, sessionName, { timeout: 5000 });
    await page.reload();
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    // same-session reload restores silently (no modal) per docs/product/02
    await expect(page.locator('#sessionNameInput')).toHaveValue(sessionName);
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
    // Scoped to the strength-plan row's onclick handler, not just its text:
    // the cardio template editor's settings row (added alongside this one)
    // shares the substring 'עריכת תוכנית' in its Hebrew label, which made a
    // plain hasText filter ambiguous (matched both rows).
    await page.locator('button.settings-item[onclick="openWorkoutEdit()"]').click();
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

  // Regression test for A3 (addendum QA report): renderEditList() called
  // initDragSort(el, type) — a string, not a function — so the drag handler
  // threw a TypeError on first pointerdown and reordering silently did
  // nothing. Fixed by threading the drag handler through initDragSort/
  // startEditDrag properly; this test drags the first handle down past the
  // second card and asserts the DOM order actually changed.
  test('drag handle reorders exercises in the edit panel', async ({ page }) => {
    const handles = page.locator('#editListContainer .drag-handle');
    await expect(handles.first()).toBeVisible();
    const count = await handles.count();
    test.skip(count < 2, 'need at least 2 exercises in this type to test reordering');
    const nameBefore = await page.locator('#editListContainer .edit-card').first().locator('.ex-name-input').inputValue();
    const box = await handles.first().boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height + 80, { steps: 8 });
    await page.mouse.up();
    const nameAfter = await page.locator('#editListContainer .edit-card').first().locator('.ex-name-input').inputValue();
    expect(nameAfter).not.toBe(nameBefore);
  });
});

// Regression test for A4 (addendum QA report): on a genuinely cold boot
// (no localStorage cache), _backgroundSync's `if (!hadCache) selectType(...)`
// was a no-op because selectedType already equaled workoutTypes[0] — the
// exercise list stayed permanently empty until the user manually clicked a
// type button. Fixed by forcing selectedType = null before the call so
// selectType() can't early-return. Uses a fresh, isolated browser context
// (no storageState) to guarantee zero localStorage cache, unlike every
// other test in this file which reuses the logged-in storageState.
test.describe('Cold-Cache Boot', () => {
  test('exercise cards render on a fresh browser context with no local cache', async ({ browser }) => {
    requiresCredentials();
    // playwright.config.ts sets a project-wide storageState (a logged-in
    // session with an already-populated localStorage cache) — passing
    // `storageState: undefined` here would NOT override that default, since
    // an explicit `undefined` value is indistinguishable from omitting the
    // key. An empty-but-defined state is required to force a genuinely cold,
    // logged-out context.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-main').click();
    await expect(page.locator('#exerciseList .card').first()).toBeVisible({ timeout: 15000 });
    await context.close();
  });
});
