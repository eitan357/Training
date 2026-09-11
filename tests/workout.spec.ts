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

// Regression tests for the 2026-09-07 draft-modal cross-domain bug: the
// shared #draftModal element is nested inside #sec-main, so it only ever
// becomes visible when the Strength section is active — but its caller
// chain (initRunSection/_backgroundSync) can resolve asynchronously AFTER
// the user has navigated to a different section or type. Racing real
// network timing is unreliable, so this tests the guard function itself
// (_isDomainTypeCurrentlyVisible, exposed test-only as
// window.__debugIsDomainTypeVisible) directly and deterministically —
// see docs/superpowers/specs/2026-09-07-draft-modal-cardio-parity-design.md.
test.describe('Draft Modal — Cross-Domain Visibility Guard', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('guard reports false for a domain whose section is not currently active', async ({ page }) => {
    await page.locator('#nav-main').click();
    await expect(page.locator('#sec-main')).toHaveClass(/active/);
    const result = await page.evaluate(() => window.__debugIsDomainTypeVisible('cardio', 'anything'));
    expect(result).toBe(false);
  });

  test('guard reports true for the domain+type currently being viewed', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    const toggle = page.locator('#runningEnabledToggle');
    if (!(await toggle.isChecked().catch(() => false))) {
      await page.locator('label.toggle-switch').filter({ has: toggle }).click();
      await expect(page.locator('#nav-running')).toBeVisible({ timeout: 10000 });
    }
    await page.locator('#nav-running').click();
    await expect(page.locator('#sec-running')).toHaveClass(/active/);
    await page.waitForTimeout(1000); // let initRunSection's async chain settle
    const result = await page.evaluate(() => {
      const type = window.__debugGetSelectedType('cardio');
      return window.__debugIsDomainTypeVisible('cardio', type);
    });
    expect(result).toBe(true);
  });

  test('a late-resolving draft check does not show the modal on the wrong page', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    const toggle = page.locator('#runningEnabledToggle');
    if (!(await toggle.isChecked().catch(() => false))) {
      await page.locator('label.toggle-switch').filter({ has: toggle }).click();
      await expect(page.locator('#nav-running')).toBeVisible({ timeout: 10000 });
    }
    await page.locator('#nav-running').click();
    await expect(page.locator('#sec-running')).toHaveClass(/active/);
    await page.waitForTimeout(1000);

    // Create a real, qualifying cardio draft via genuine user input.
    const distRow = page.locator('#cardioFieldList .cardio-field-row', { hasText: 'מרחק' });
    await distRow.locator('.cardio-field-input').fill('5.5');
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__debugSaveLocalDraft('cardio', window.__debugGetSelectedType('cardio')));

    // Navigate away (real navigation), then simulate the late-resolving
    // continuation trying to show the modal for the type left behind.
    const type = await page.evaluate(() => window.__debugGetSelectedType('cardio'));
    await page.locator('#nav-main').click();
    await expect(page.locator('#sec-main')).toHaveClass(/active/);
    await page.evaluate(t => window.__debugTabRestoreOrDraft('cardio', t), type);
    await expect(page.locator('#draftModal')).toHaveCSS('display', 'none');

    // A genuine, fresh visit to that same type must still show it — proving
    // the draft itself was never lost, only deferred.
    await page.locator('#nav-running').click();
    await expect(page.locator('#sec-running')).toHaveClass(/active/);
    await expect(page.locator('#draftModal')).toHaveCSS('display', 'flex', { timeout: 5000 });
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

// ─── Type Identity: Rename & Reorder (2026-09-10) ──────────────────────
// Coverage for docs/superpowers/specs/2026-09-10-type-identity-rename-reorder-design.md
// §8. This project has no Firestore emulator and no fixture-seeding
// mechanism (see running.spec.ts's own "Cardio Data Migration" comment
// block for the established rationale) — these tests run against the real
// `test@gmail.com` account's real production Firestore data, same as every
// other spec in this suite.
//
// Where a scenario needs a saved workout entry or an in-flight draft (the
// history-grouping and draft-survival tests below), a genuinely new
// throwaway type is created and removed within the test rather than
// touching the real A/B types' history — per this task's own brief. Every
// test cleans up after itself (removes any throwaway type/entry it made,
// or restores original state) even on failure, via try/finally.
// saveTemplates() (public/index.html) fires the toast BEFORE `await
// reloadAppData()`, which asynchronously re-fetches config/templates and
// REPLACES the in-memory `workoutTypes` array (applyAppData). A test that
// only waits for the toast and then immediately mutates type state again
// (e.g. a rename right after creating a type) can race that in-flight
// reloadAppData() — it resolves moments later and silently clobbers the
// mutation, which was reproduced directly while writing these tests (the
// save-after-rename appeared to succeed but the pre-rename name came back
// after a real reload). Waiting for the toast's own auto-hide (toast(),
// 3000ms) reliably outlasts that async window.
async function clickSaveAndSettle(page: import('@playwright/test').Page, buttonSelector: string) {
  await page.locator(buttonSelector).click();
  await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 6000 });
}

async function openWorkoutEditPanel(page: import('@playwright/test').Page) {
  await page.locator('#nav-main').click();
  await page.locator('#mainGearBtn').click();
  await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  await page.locator('button.settings-item[onclick="openWorkoutEdit()"]').click();
  await expect(page.locator('#mainEditPanel')).toBeVisible({ timeout: 8000 });
}

test.describe('Type Identity — Rename', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  // Spec §5.1/§8: renaming a type only updates its `name` (id/color/
  // template untouched) and must persist across reload. Uses a throwaway
  // type — see file header comment.
  test('renaming a strength type persists across reload', async ({ page }) => {
    const originalName = 'TID_' + Date.now();
    const renamedName  = 'TID2_' + Date.now();
    let typeId = '';

    await openWorkoutEditPanel(page);
    await page.locator('#editTabs .add-tab-btn').click();
    await page.locator('#newTypeName').fill(originalName);
    await page.locator('#addTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#editTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();
    await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

    try {
      // promptRenameType() uses window.prompt() (public/index.html) —
      // register the dialog handler before the dblclick that triggers it.
      page.once('dialog', dialog => dialog.accept(renamedName));
      await page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`).dblclick();
      await expect(page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`)).toHaveText(renamedName);
      await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

      await page.reload();
      await waitForAppReady(page);
      await openWorkoutEditPanel(page);
      await expect(page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`))
        .toHaveText(renamedName, { timeout: 8000 });
    } finally {
      const removeBtn = page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');
      }
    }
  });
});

test.describe('Type Identity — Reorder & Colors', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  // Spec §5.2/§3.1/§8: reordering the type tabs must persist across reload
  // AND must never change any type's stored `color` (colors are frozen at
  // creation, not recomputed from array position). Color isn't rendered on
  // the tab elements themselves anywhere in the DOM (only on saved-session
  // dots/badges in History), so — matching this file's/running.spec.ts's
  // own established use of window.__debugGetDoc for exactly this kind of
  // otherwise-unobservable Firestore-shape assertion — the color check
  // reads the raw config/templates doc directly.
  //
  // Uses the REAL account's A/B types (this scenario is inherently about
  // reordering *existing* types, and every earlier task in this plan has
  // already renamed/reordered A/B for live verification and always
  // restored them — same precedent here). Scoped to accounts with exactly
  // 2 strength types (this account's documented state) so the "drag once
  // to swap, drag again to restore" logic is unambiguous; on any other
  // shape the test skips itself rather than guessing.
  test('reordering strength type tabs persists across reload without changing colors', async ({ page }) => {
    const before = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'templates']));
    test.skip(!before || !Array.isArray(before.types) || before.types.length !== 2,
      'scoped to accounts with exactly 2 strength types (this account\'s documented A/B state)');
    const idsBefore = before.types.map((t: any) => t.id);
    const colorById: Record<string, number> = {};
    before.types.forEach((t: any) => { colorById[t.id] = t.color; });

    await openWorkoutEditPanel(page);

    const dragFirstTabPastSecond = async () => {
      const handles = page.locator('#editTabs .tab-item.edit-card .drag-handle');
      const cards   = page.locator('#editTabs .tab-item.edit-card');
      await handles.first().hover();
      const startBox  = await handles.first().boundingBox();
      const targetBox = await cards.nth(1).boundingBox();
      await page.mouse.down();
      await page.mouse.move(targetBox!.x + targetBox!.width / 2, startBox!.y + startBox!.height / 2, { steps: 10 });
      await page.mouse.up();
    };
    const readTabOrder = async () =>
      page.locator('#editTabs .tab-item.edit-card').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.id));

    try {
      await dragFirstTabPastSecond();
      const idsAfterDrag = await readTabOrder();
      expect(idsAfterDrag).toEqual([...idsBefore].reverse());

      await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

      await page.reload();
      await waitForAppReady(page);
      const after = await page.evaluate(async () => (window as any).__debugGetDoc(['config', 'templates']));
      expect(after.types.map((t: any) => t.id)).toEqual(idsAfterDrag);
      // Colors must be exactly what they were before reordering.
      after.types.forEach((t: any) => { expect(t.color).toBe(colorById[t.id]); });
    } finally {
      // Restore original order regardless of pass/fail above: dragging the
      // first tab past the second is a pure transposition of a 2-element
      // list, so repeating it once more always returns to idsBefore.
      await openWorkoutEditPanel(page);
      const currentIds = await readTabOrder();
      if (currentIds[0] !== idsBefore[0]) {
        await dragFirstTabPastSecond();
        await expect.poll(readTabOrder).toEqual(idsBefore);
        await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');
      }
    }
  });
});

test.describe('Type Identity — History Reflects Renames', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  // Spec §3.2/§8: display/grouping resolves through typeId → the CURRENT
  // registry entry, so a session logged under a type's OLD name must show
  // the NEW name in History after a rename — the whole reason typeId
  // linkage exists (without it, a rename would silently split history into
  // two disconnected buckets). Identifies the entry by a unique session-
  // name marker throughout (never by position/count), per this project's
  // standing data-safety rule for live verification against real data.
  test('history badge shows a type\'s new name for an entry logged before the rename', async ({ page }) => {
    const originalName  = 'TIDH_' + Date.now();
    const renamedName   = 'TIDH2_' + Date.now();
    const sessionMarker = 'TypeIdentityHistTest ' + Date.now();
    let typeId = '';

    await openWorkoutEditPanel(page);
    await page.locator('#editTabs .add-tab-btn').click();
    await page.locator('#newTypeName').fill(originalName);
    await page.locator('#addTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#editTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();
    await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

    try {
      // Log a real entry under the type's ORIGINAL name via an ad-hoc
      // exercise — the throwaway type has zero template exercises, same
      // "+ הוסף תרגיל" pattern as this file's "Workout — Log Session" tests.
      await page.locator('#nav-main').click();
      await page.waitForFunction(() => (document.getElementById('typeRow')?.children.length || 0) > 0, { timeout: 10000 });
      await page.locator(`#typeRow .type-btn[data-type="${typeId}"]`).click();
      await page.locator('#addBtn').click();
      const card = page.locator('#exerciseList .card').last();
      await card.locator('.ex-name-input').fill('Squat');
      await card.locator('.ex-weight').fill('40');
      await page.locator('#sessionNameInput').fill(sessionMarker);
      await page.locator('#saveBtn').click();
      await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });

      // Rename AFTER the entry was logged under the original name.
      await openWorkoutEditPanel(page);
      page.once('dialog', dialog => dialog.accept(renamedName));
      await page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`).dblclick();
      await expect(page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`)).toHaveText(renamedName);
      await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

      await page.locator('#nav-history').click();
      await expect(page.locator('#sec-history')).toHaveClass(/active/);
      const sessionCard = page.locator('.session-card', { hasText: sessionMarker });
      await expect(sessionCard).toBeVisible({ timeout: 15000 });
      // Read the actual matched card's content before asserting on it —
      // confirms this is genuinely the entry just created, not a
      // coincidental match.
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
          await page.waitForTimeout(650); // > HIST_LONG_PRESS_MS
          await page.mouse.up();
          await page.locator('#histBulkBar .bulk-bar-del').click();
          await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
        }
      }
      await openWorkoutEditPanel(page);
      const removeBtn = page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');
      }
    }
  });
});

test.describe('Type Identity — Draft Survives Rename', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  // Spec §3.3/§8: draft keys embed the type's id (not its name), so an
  // in-flight, unsaved draft must survive a rename performed mid-session
  // rather than becoming unreachable under a since-changed key.
  test('a mid-session draft survives a rename of its own type', async ({ page }) => {
    const originalName = 'TIDD_' + Date.now();
    const renamedName  = 'TIDD2_' + Date.now();
    const draftMarker  = 'DraftSurvivesRename ' + Date.now();
    let typeId = '';

    await openWorkoutEditPanel(page);
    await page.locator('#editTabs .add-tab-btn').click();
    await page.locator('#newTypeName').fill(originalName);
    await page.locator('#addTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#editTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();
    await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

    try {
      await page.locator('#nav-main').click();
      await page.waitForFunction(() => (document.getElementById('typeRow')?.children.length || 0) > 0, { timeout: 10000 });
      await page.locator(`#typeRow .type-btn[data-type="${typeId}"]`).click();
      await page.locator('#sessionNameInput').fill(draftMarker);
      // Wait for the actual debounced (>300ms) localStorage draft write to
      // land, keyed by the type's id — same wait pattern as this file's
      // "draft round-trips workout name through localStorage" test.
      await page.waitForFunction((expected) => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('draft_') && k.includes('_strength_'));
        return keys.some(k => {
          try { return JSON.parse(localStorage.getItem(k) || 'null')?.workoutName === expected; }
          catch(e) { return false; }
        });
      }, draftMarker, { timeout: 5000 });

      // Rename MID-SESSION — the draft above is still unsaved at this point.
      await openWorkoutEditPanel(page);
      page.once('dialog', dialog => dialog.accept(renamedName));
      await page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`).dblclick();
      await expect(page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-name`)).toHaveText(renamedName);
      await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');

      await page.reload();
      await waitForAppReady(page);
      await page.locator('#nav-main').click();
      await page.waitForFunction(() => (document.getElementById('typeRow')?.children.length || 0) > 0, { timeout: 10000 });
      await page.locator(`#typeRow .type-btn[data-type="${typeId}"]`).click();
      // Draft keys are id-based, so the draft must still be reachable under
      // the type's NEW name — silent restore, no modal, matching this
      // file's existing "same-session reload restores silently" behavior.
      await expect(page.locator('#sessionNameInput')).toHaveValue(draftMarker, { timeout: 8000 });
    } finally {
      await page.locator('#nav-main').click().catch(() => {});
      const typeBtn = page.locator(`#typeRow .type-btn[data-type="${typeId}"]`);
      if (await typeBtn.count() > 0) {
        await typeBtn.click();
        await page.locator('#clearFormBtn').click().catch(() => {}); // clears + deletes the draft doc
      }
      await openWorkoutEditPanel(page);
      const removeBtn = page.locator(`#editTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#mainEditPanel button[onclick="saveTemplates()"]');
      }
    }
  });
});
