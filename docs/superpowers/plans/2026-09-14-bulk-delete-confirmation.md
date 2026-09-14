# Bulk-Delete Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user bulk-selects more than one record (History — strength or cardio — or Measurements) and taps "מחק נבחרים" (Delete selected), show a confirmation modal before anything is deleted. Selecting exactly one record and using the same bulk-delete button stays immediate, unchanged.

**Architecture:** History and Measurements already funnel all bulk deletion through one shared function, `_bulkDelete(set, barId, collection)` (`public/index.html`). That function becomes a router: size 1 goes straight to a new `_performBulkDelete()` (the old body, unchanged); size 2+ populates and shows a new global modal, `#bulkConfirmModal`, styled like the existing `#draftModal`, and waits for the user to tap its Delete or Cancel button. Because the router lives in the one shared function, both domains get the new behavior from a single implementation.

**Tech Stack:** Vanilla JS (no framework/bundler), Firebase Firestore SDK (`deleteDoc`), Playwright for tests (real Firebase test account, per this repo's existing convention — no mocking).

**Spec:** `docs/superpowers/specs/2026-09-14-bulk-delete-confirmation-design.md`

## Global Constraints

- Confirmation triggers only when `set.size > 1`. `set.size === 1` must behave byte-for-byte like today: immediate delete, no dialog. (Spec, "Threshold".)
- Reuse `#draftModal`'s visual language (`.draft-modal-overlay` / `.draft-modal-card` / `.draft-modal-title` / `.draft-modal-details` / `.draft-modal-btn-discard`) — only one new CSS class is added (`.bulk-confirm-btn-delete`). (Spec, "UI".)
- `#bulkConfirmModal` must be a DOM sibling of `#draftModal`, a direct child of `<main id="main-content">`, never nested inside a `.section`. (Spec, "Placement".)
- Backdrop click and the Android hardware back button both act as Cancel for this modal — the opposite of `#draftModal`'s policy. (Spec, "Dismissal".)
- New i18n keys go in **both** the `he` and `en` blocks of `public/translations.js`, following the existing `${count} ${t('some.suffix.key')}` concatenation convention (e.g. `draft.autosaved_toast`) — no placeholder-substitution style. Reuse the existing `btn.cancel` key for Cancel; do not add a new key for it. (Spec, "i18n".)
- Every test creates its own throwaway data via the real UI and either deletes it as part of the test's own assertions or cleans it up in a `finally` block — matching `workout.spec.ts` / `running.spec.ts`'s existing convention. Never assume a record's identity by position/count — locate it by content the test itself just entered (`hasText`).
- After each task, update the specific product doc(s) that describe the changed behavior before moving to the next task (not deferred to the end).

---

## Task 1: Add i18n keys for the confirmation modal

**Files:**
- Modify: `public/translations.js:181-184` (he block), `public/translations.js:492-495` (en block)

**Interfaces:**
- Produces: translation keys `bulk.confirm_title`, `bulk.confirm_msg_suffix`, `bulk.confirm_btn`, consumed by Task 2's `_bulkDelete()`.

- [ ] **Step 1: Add the three new keys to the `he` block**

In `public/translations.js`, find:

```js
    'bulk.selected':   'נבחרו',
    'bulk.delete_btn': 'מחק נבחרים',
    'bulk.edit_btn':   'ערוך',
    'bulk.deleted':    'נמחקו',
```

Replace with:

```js
    'bulk.selected':   'נבחרו',
    'bulk.delete_btn': 'מחק נבחרים',
    'bulk.edit_btn':   'ערוך',
    'bulk.deleted':    'נמחקו',
    'bulk.confirm_title':      'מחיקת פריטים',
    'bulk.confirm_msg_suffix': 'פריטים יימחקו לצמיתות. להמשיך?',
    'bulk.confirm_btn':        'מחק',
```

- [ ] **Step 2: Add the matching three keys to the `en` block**

In `public/translations.js`, find:

```js
    'bulk.selected':   'selected',
    'bulk.delete_btn': 'Delete selected',
    'bulk.edit_btn':   'Edit',
    'bulk.deleted':    'deleted',
```

Replace with:

```js
    'bulk.selected':   'selected',
    'bulk.delete_btn': 'Delete selected',
    'bulk.edit_btn':   'Edit',
    'bulk.deleted':    'deleted',
    'bulk.confirm_title':      'Delete Items',
    'bulk.confirm_msg_suffix': 'items will be permanently deleted. Continue?',
    'bulk.confirm_btn':        'Delete',
```

- [ ] **Step 3: Verify the file still loads correctly**

Run: `npx playwright test tests/i18n.spec.ts --project=chromium`
Expected: all existing i18n tests still PASS (proves `translations.js` still parses as a valid ES module and nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add public/translations.js
git commit -m "feat: add i18n keys for bulk-delete confirmation modal"
```

---

## Task 2: Confirmation modal core logic + History wiring

**Files:**
- Modify: `public/index.html` (CSS ~line 291-294, HTML ~line 1058, JS ~line 1769, JS ~line 5927-5941, JS ~line 5957, JS ~line 5984-5988)
- Test: `tests/history.spec.ts`
- Docs: `docs/product/04-history.md`, `docs/product/00-overview.md`

**Interfaces:**
- Consumes: `t(key)`, `toast(msg, type)`, `deleteDoc`, `doc`, `db`, `currentUser`, `reloadAppData()`, `firestoreErrMsg(err)` — all pre-existing globals in `public/index.html`. Translation keys from Task 1.
- Produces: `_performBulkDelete(set, barId, collection)`, `_bulkConfirmYes()`, `_bulkConfirmNo()` — the latter two exported to `window` (called from inline `onclick` in the new modal markup). `_bulkDelete(set, barId, collection)` keeps its existing signature and callers (`bulkDeleteSessions()`, `bulkDeleteMeasures()` are untouched call sites) but changes internal behavior per the Global Constraints threshold rule. Task 3 (Measurements) depends on this task's `_bulkDelete`/`_performBulkDelete`/modal being in place — it does not modify them further.

- [ ] **Step 1: Write the failing test (2+ selected shows modal; cancel keeps; confirm deletes)**

Add to `tests/history.spec.ts`, inside the existing `test.describe('History Section', ...)` block (after the `'cardio history entries can be edited and deleted'` test):

```ts
  test('bulk delete: selecting 2+ records shows a confirmation modal; cancel keeps them, confirm deletes them', async ({ page }) => {
    const markerA = 'BulkDelA_' + Date.now();
    const markerB = 'BulkDelB_' + Date.now();

    async function logThrowawaySession(marker: string) {
      await page.locator('#nav-main').click();
      await page.waitForFunction(() => (document.getElementById('typeRow')?.children.length || 0) > 0, { timeout: 10000 });
      await page.locator('#typeRow .type-btn').first().click();
      await page.locator('#addBtn').click();
      const card = page.locator('#exerciseList .card').last();
      await card.locator('.ex-name-input').fill('BulkDeleteTestExercise');
      await card.locator('.ex-weight').fill('1');
      await page.locator('#sessionNameInput').fill(marker);
      await page.locator('#saveBtn').click();
      await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    }

    await logThrowawaySession(markerA);
    await logThrowawaySession(markerB);

    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
    const cardA = page.locator('.session-card', { hasText: markerA });
    const cardB = page.locator('.session-card', { hasText: markerB });
    await expect(cardA).toBeVisible({ timeout: 15000 });
    await expect(cardB).toBeVisible({ timeout: 15000 });

    // Long-press card A to enter multi-select, then a short click on card B
    // adds it too — same pattern as this file's existing touch/mouse
    // multi-select tests above.
    const headerA = cardA.locator('.session-header');
    await headerA.scrollIntoViewIfNeeded();
    const boxA = await headerA.boundingBox();
    await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650); // > HIST_LONG_PRESS_MS
    await page.mouse.up();
    await expect(cardA).toHaveClass(/sel-active/);

    const headerB = cardB.locator('.session-header');
    await headerB.scrollIntoViewIfNeeded();
    await headerB.click();
    await expect(cardB).toHaveClass(/sel-active/);
    await expect(page.locator('#histBulkCount')).toContainText('2');

    await page.locator('#histBulkBar .bulk-bar-del').click();

    // Modal shown, nothing deleted yet.
    await expect(page.locator('#bulkConfirmModal')).toBeVisible();
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    // Cancel: modal closes, both records and the selection survive.
    await page.locator('#bulkConfirmModal .draft-modal-btn-discard').click();
    await expect(page.locator('#bulkConfirmModal')).toBeHidden();
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();
    await expect(page.locator('#histBulkBar')).toBeVisible();
    await expect(page.locator('#histBulkCount')).toContainText('2');

    // Confirm: both records are actually deleted.
    await page.locator('#histBulkBar .bulk-bar-del').click();
    await expect(page.locator('#bulkConfirmModal')).toBeVisible();
    await page.locator('#bulkConfirmModal .bulk-confirm-btn-delete').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(cardA).toHaveCount(0);
    await expect(cardB).toHaveCount(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/history.spec.ts -g "shows a confirmation modal" --project=chromium`
Expected: FAIL — `#bulkConfirmModal` does not exist yet, so the `toBeVisible()` assertion after the first delete click times out.

- [ ] **Step 3: Add the CSS for the confirm/delete button**

In `public/index.html`, find (the end of the existing draft-modal CSS block):

```css
    .draft-modal-btn-discard {
      width: 100%; padding: 8px; border: none; background: none;
      font-size: 13px; color: var(--sub); cursor: pointer; text-decoration: underline;
    }
```

Add immediately after it:

```css
    .bulk-confirm-btn-delete {
      width: 100%; padding: 13px; border: none; border-radius: var(--radius);
      background: var(--red); color: white; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .bulk-confirm-btn-delete:active { opacity: .85; }
```

- [ ] **Step 4: Add the modal markup**

In `public/index.html`, find the closing of `#draftModal`:

```html
<div id="draftModal" class="draft-modal-overlay" style="display:none;" aria-modal="true" role="dialog" aria-labelledby="draftModalTitle">
  <div class="draft-modal-card">
    <div id="draftModalTitle" class="draft-modal-title"></div>
    <div class="draft-modal-details"></div>
    <button class="draft-modal-btn-resume"  onclick="_draftModalResume()"></button>
    <button class="draft-modal-btn-discard" onclick="_draftModalDiscard()"></button>
  </div>
</div>
```

Add immediately after it (before the date-picker popover comment):

```html
<!-- Bulk-delete confirmation modal — shown only when 2+ records are selected
     for bulk delete (History or Measurements share this one instance via
     _bulkDelete()). Same global placement as #draftModal above and for the
     same reason (see 2026-09-08-cardio-visual-and-modal-fixes-design.md
     §Issue4): must not be a descendant of any .section, since a section
     that isn't active is display:none and would hide this too. Unlike
     #draftModal, backdrop click AND the Android hardware back button both
     cancel here — canceling a delete is always the safe outcome, so there
     is no need to force an explicit button choice. -->
<div id="bulkConfirmModal" class="draft-modal-overlay" style="display:none;" aria-modal="true" role="dialog" aria-labelledby="bulkConfirmTitle" aria-describedby="bulkConfirmMsg" onclick="if(event.target===this)_bulkConfirmNo()">
  <div class="draft-modal-card">
    <div id="bulkConfirmTitle" class="draft-modal-title"></div>
    <div id="bulkConfirmMsg" class="draft-modal-details"></div>
    <button class="bulk-confirm-btn-delete" onclick="_bulkConfirmYes()"></button>
    <button class="draft-modal-btn-discard" onclick="_bulkConfirmNo()"></button>
  </div>
</div>
```

- [ ] **Step 5: Add pending-state variables**

In `public/index.html`, find:

```js
let selectedSessions = new Set();
let selectedMeasures = new Set();
```

Add immediately after it:

```js
let _bulkConfirmSet = null, _bulkConfirmBarId = null, _bulkConfirmCollection = null;
```

- [ ] **Step 6: Refactor `_bulkDelete` into a router + implement the modal handlers**

In `public/index.html`, find:

```js
async function _bulkDelete(set, barId, collection) {
  if (!set.size) return;
  const ids = [...set];
  document.getElementById(barId).style.display = 'none';
  try {
    await Promise.all(ids.map(id => deleteDoc(doc(db, 'users', currentUser.uid, collection, id))));
    set.clear();
    toast(ids.length + ' ' + t('bulk.deleted'), 'error');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + firestoreErrMsg(err), 'error');
  }
}
async function bulkDeleteSessions() { await _bulkDelete(selectedSessions, 'histBulkBar', WORKOUT_DOMAINS[historyActiveDomain].entriesCollection); }
async function bulkDeleteMeasures() { await _bulkDelete(selectedMeasures,  'measBulkBar', 'measurements'); }
```

Replace with:

```js
async function _bulkDelete(set, barId, collection) {
  if (!set.size) return;
  if (set.size === 1) { await _performBulkDelete(set, barId, collection); return; }
  _bulkConfirmSet = set; _bulkConfirmBarId = barId; _bulkConfirmCollection = collection;
  document.getElementById('bulkConfirmTitle').textContent = t('bulk.confirm_title');
  document.getElementById('bulkConfirmMsg').textContent = set.size + ' ' + t('bulk.confirm_msg_suffix');
  document.querySelector('#bulkConfirmModal .bulk-confirm-btn-delete').textContent = t('bulk.confirm_btn');
  document.querySelector('#bulkConfirmModal .draft-modal-btn-discard').textContent = t('btn.cancel');
  document.getElementById('bulkConfirmModal').style.display = 'flex';
}
async function _performBulkDelete(set, barId, collection) {
  const ids = [...set];
  document.getElementById(barId).style.display = 'none';
  try {
    await Promise.all(ids.map(id => deleteDoc(doc(db, 'users', currentUser.uid, collection, id))));
    set.clear();
    toast(ids.length + ' ' + t('bulk.deleted'), 'error');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + firestoreErrMsg(err), 'error');
  }
}
async function _bulkConfirmYes() {
  document.getElementById('bulkConfirmModal').style.display = 'none';
  const set = _bulkConfirmSet, barId = _bulkConfirmBarId, collection = _bulkConfirmCollection;
  _bulkConfirmSet = _bulkConfirmBarId = _bulkConfirmCollection = null;
  if (set) await _performBulkDelete(set, barId, collection);
}
function _bulkConfirmNo() {
  document.getElementById('bulkConfirmModal').style.display = 'none';
  _bulkConfirmSet = _bulkConfirmBarId = _bulkConfirmCollection = null;
}
async function bulkDeleteSessions() { await _bulkDelete(selectedSessions, 'histBulkBar', WORKOUT_DOMAINS[historyActiveDomain].entriesCollection); }
async function bulkDeleteMeasures() { await _bulkDelete(selectedMeasures,  'measBulkBar', 'measurements'); }
```

- [ ] **Step 7: Export the two new handlers to `window`**

In `public/index.html`, find:

```js
  toggleSessionSelect, bulkDeleteSessions, toggleMeasureSelect, bulkDeleteMeasures,
```

Replace with:

```js
  toggleSessionSelect, bulkDeleteSessions, toggleMeasureSelect, bulkDeleteMeasures,
  _bulkConfirmYes, _bulkConfirmNo,
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx playwright test tests/history.spec.ts -g "shows a confirmation modal" --project=chromium`
Expected: PASS

- [ ] **Step 9: Write and run the single-item regression test**

Add to `tests/history.spec.ts`, right after the test from Step 1:

```ts
  test('bulk delete: selecting exactly 1 record deletes immediately without showing the confirmation modal', async ({ page }) => {
    const marker = 'BulkDelSingle_' + Date.now();

    await page.locator('#nav-main').click();
    await page.waitForFunction(() => (document.getElementById('typeRow')?.children.length || 0) > 0, { timeout: 10000 });
    await page.locator('#typeRow .type-btn').first().click();
    await page.locator('#addBtn').click();
    const card = page.locator('#exerciseList .card').last();
    await card.locator('.ex-name-input').fill('BulkDeleteTestExercise');
    await card.locator('.ex-weight').fill('1');
    await page.locator('#sessionNameInput').fill(marker);
    await page.locator('#saveBtn').click();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });

    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
    const sessionCard = page.locator('.session-card', { hasText: marker });
    await expect(sessionCard).toBeVisible({ timeout: 15000 });

    const header = sessionCard.locator('.session-header');
    await header.scrollIntoViewIfNeeded();
    const box = await header.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await expect(sessionCard).toHaveClass(/sel-active/);
    await expect(page.locator('#histBulkCount')).toContainText('1');

    await page.locator('#histBulkBar .bulk-bar-del').click();

    // No confirmation dialog for a single record — deletes right away.
    await expect(page.locator('#bulkConfirmModal')).toBeHidden();
    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 });
    await expect(sessionCard).toHaveCount(0);
  });
```

Run: `npx playwright test tests/history.spec.ts -g "deletes immediately without showing" --project=chromium`
Expected: PASS. (This test is expected to pass against the pre-Task-2 code too, since the single-item path is unchanged — it's a regression guard, not a red/green probe. No separate "verify it fails first" step for this one.)

- [ ] **Step 10: Update `docs/product/04-history.md`**

Find the paragraph:

```
מחיקה קבוצתית (`bulkDeleteSessions`) **אינה משתמשת בדפוס Arm & Confirm** — מבצעת מחיקה מיידית של כל הנבחרים במקביל (`Promise.all`) ללא אישור נוסף. **הערה מוצרית:** זהו חוסר עקביות עם מחיקה בודדת (שם יש הגנת "לחיצה כפולה"); מחיקה קבוצתית עלולה למחוק כמות גדולה של נתונים בטעות בלחיצה אחת.
```

Replace with:

```
מחיקה קבוצתית (`bulkDeleteSessions`) — **עודכן 2026-09-14:** כשנבחרו **יותר מפריט אחד**, לחיצה על "מחק נבחרים" מציגה חלון אישור ייעודי (`#bulkConfirmModal`) לפני שמתבצעת כל מחיקה בפועל; ביטול סוגר את החלון ומשאיר את כל הפריטים ואת הבחירה כפי שהיו. כשנבחר **פריט בודד** דרך אותו סרגל פעולות (`set.size === 1`), אין שינוי — המחיקה עדיין מיידית וללא אישור, בדיוק כפי שהייתה קודם. `#bulkConfirmModal` הוא מודל גלובלי משותף, זהה במבנהו ל-`#draftModal`, המשמש גם למחיקה קבוצתית בעמוד המדידות (ראו `06-measurements.md`) — בשונה מ-`#draftModal`, לחיצה על הרקע וכפתור החזרה הפיזי של אנדרואיד שניהם פועלים כמו "ביטול" כאן, כי ביטול מחיקה הוא תמיד הפעולה הבטוחה (ראו `11-android-app.md`). **הפער שתועד כאן בעבר נסגר:** מחיקה בודדת ומחיקה קבוצתית-של-יותר-מפריט-אחד דורשות כעת שתיהן אישור מפורש לפני מחיקה בפועל; מחיקה קבוצתית של פריט יחיד ממשיכה להיות "מיידית" (כמו קודם), פשוט בלי שלב האישור הכפול (Arm & Confirm) הדו-שלבי של מחיקה בודדת רגילה.
```

- [ ] **Step 11: Update `docs/product/00-overview.md`**

Find:

```
5. **בחירה מרובה ומחיקה קבוצתית:** בעמודי היסטוריה ומדידות, לחיצה על עיגול הבחירה בכרטיס מפעילה מצב בחירה מרובה עם סרגל פעולות צף בתחתית המסך.
```

Replace with:

```
5. **בחירה מרובה ומחיקה קבוצתית:** בעמודי היסטוריה ומדידות, לחיצה על עיגול הבחירה בכרטיס (או לחיצה ארוכה על שורת כרטיס בהיסטוריה) מפעילה מצב בחירה מרובה עם סרגל פעולות צף בתחתית המסך. **עודכן 2026-09-14:** לחיצה על "מחק נבחרים" כשנבחרו יותר מפריט אחד מציגה חלון אישור לפני המחיקה בפועל; מחיקת פריט בודד דרך אותו סרגל נשארת מיידית, ללא אישור. ראו `04-history.md`/`06-measurements.md`.
```

- [ ] **Step 12: Commit**

```bash
git add public/index.html tests/history.spec.ts docs/product/04-history.md docs/product/00-overview.md
git commit -m "feat: confirm bulk-delete of 2+ history records before deleting"
```

---

## Task 3: Measurements — verify shared logic, add tests, update docs

**Files:**
- Test: `tests/measurements.spec.ts`
- Docs: `docs/product/06-measurements.md`

**Interfaces:**
- Consumes: `_bulkDelete`, `#bulkConfirmModal` from Task 2 — no further modification to `public/index.html` is expected in this task, since `bulkDeleteMeasures()` already calls the same shared `_bulkDelete`. If a test in this task fails in a way that reveals measurements-specific divergence, fix it in `public/index.html` before continuing (see Step 3's contingency note).

- [ ] **Step 1: Write the flow test (2+ selected shows modal; cancel keeps; confirm deletes)**

Add to `tests/measurements.spec.ts`, as a new `test.describe` block after the existing `'Measurements — Edit Measurement Types'` block:

```ts
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
```

- [ ] **Step 2: Run both tests**

Run: `npx playwright test tests/measurements.spec.ts -g "Bulk Delete Confirmation" --project=chromium`
Expected: both PASS, with no changes to `public/index.html` — this proves the shared `_bulkDelete`/`#bulkConfirmModal` from Task 2 already covers Measurements correctly.

- [ ] **Step 2b (contingency, only if Step 2 fails):** If either test fails in a way that points to a measurements-specific gap (for example, `#measBulkBar`/`#measBulkCount` not updating, or the modal not appearing for the measurements path specifically), diagnose and fix it in `public/index.html`, re-run Step 2, and note the fix explicitly when updating the doc in Step 3 below. Do not silently patch around a failing assertion by weakening the test.

- [ ] **Step 3: Update `docs/product/06-measurements.md`**

Find the paragraph:

```
- **בחירה מרובה + מחיקה קבוצתית** — זהה לחלוטין לדפוס בעמוד היסטוריה: עיגול בחירה על כרטיס, סרגל פעולות צף (עריכה מוצגת רק לבחירה בודדת; מחיקה קבוצתית מיידית ללא אישור נוסף — אותה הערת חוסר-עקביות כמו ב-`04-history.md`).
```

Replace with:

```
- **בחירה מרובה + מחיקה קבוצתית** — זהה לחלוטין לדפוס בעמוד היסטוריה: עיגול בחירה על כרטיס, סרגל פעולות צף (עריכה מוצגת רק לבחירה בודדת). **עודכן 2026-09-14:** מחיקה קבוצתית של **יותר מפריט אחד** מציגה כעת חלון אישור (`#bulkConfirmModal`, אותו מודל גלובלי משותף עם עמוד ההיסטוריה — ראו `04-history.md`) לפני מחיקה בפועל; מחיקה של פריט בודד דרך אותו סרגל נשארת מיידית ללא אישור, כפי שהייתה. הפער שתועד כאן בעבר מול `04-history.md` נסגר — שני העמודים חולקים כעת בדיוק אותה התנהגות.
```

- [ ] **Step 4: Commit**

```bash
git add tests/measurements.spec.ts docs/product/06-measurements.md
git commit -m "test: verify bulk-delete confirmation covers measurements; update docs"
```

---

## Task 4: Android hardware back button + docs

**Files:**
- Modify: `public/index.html:5984-5988` (`handleHardwareBack`)
- Docs: `docs/product/11-android-app.md`

**Interfaces:**
- Consumes: `_bulkConfirmNo()` from Task 2.

- [ ] **Step 1: Add the guard**

In `public/index.html`, find:

```js
function handleHardwareBack() {
  // Never dismiss the draft modal via hardware back — same rule as its
  // existing no-backdrop-dismiss behavior (data-loss protection).
  const draftModal = document.getElementById('draftModal');
  if (draftModal && draftModal.style.display !== 'none') return;
```

Replace with:

```js
function handleHardwareBack() {
  // Bulk-delete confirmation is always safe to cancel via back — unlike
  // #draftModal below, there is no data-loss risk in dismissing it.
  const bulkConfirmModal = document.getElementById('bulkConfirmModal');
  if (bulkConfirmModal && bulkConfirmModal.style.display !== 'none') { _bulkConfirmNo(); return; }

  // Never dismiss the draft modal via hardware back — same rule as its
  // existing no-backdrop-dismiss behavior (data-loss protection).
  const draftModal = document.getElementById('draftModal');
  if (draftModal && draftModal.style.display !== 'none') return;
```

- [ ] **Step 2: Verify by code review (cannot be Playwright-tested)**

`handleHardwareBack` only runs when `window.Capacitor?.isNativePlatform()` is true, wired to `window.Capacitor.Plugins.App.addListener('backButton', ...)` — this only exists inside the native Android WebView, not in the Playwright/Chromium test environment. Verify by re-reading the edited function: confirm the new guard is checked *before* the `draftModal` guard, and that it returns after calling `_bulkConfirmNo()` (so execution never reaches the `history.back()`/`exitApp()` logic below it while the confirm modal is open). If an Android emulator or device is available, a manual check is: open the confirm modal (select 2+ records, tap delete), press the hardware/gesture back button, and confirm the modal closes with no records deleted — but this manual check is optional and not required to consider this task done.

- [ ] **Step 3: Run the full existing test suite for regressions in unrelated back-button paths**

Run: `npx playwright test tests/navigation.spec.ts --project=chromium`
Expected: all PASS (this file exercises `history.back()`/in-app back-button navigation on the web path, which this change does not touch — confirms the new guard's early `return` didn't disturb anything reachable outside Capacitor).

- [ ] **Step 4: Update `docs/product/11-android-app.md`**

Find:

```
## כפתור החזרה הפיזי (Hardware Back Button)

תלות נוספת שנדרשה לצורך תמיכה בכפתור/מחוות הניווט הפיזי של אנדרואיד: `@capacitor/app`. ההתנהגות: מהיכן שהמשתמש נמצא, לחיצה על כפתור החזרה מבצעת בדיוק את אותה פעולה שכפתור "← חזרה" באפליקציה היה מבצע (`history.back()`) — לא פעולה נפרדת. **עודכן 2026-09-08:** במסך הבית (Main, ללא פאנל פתוח) ובמסך ההתחברות, לחיצה **אחת** יוצאת מהאפליקציה מיידית — הוסרה מנגנון "לחץ שוב ליציאה" הכפול (שהיה קיים בעבר, עם הודעת toast וחלון 2 שניות), לבקשת המשתמש, שמצא אותו מסורבל. מודל הטיוטה (`#draftModal`) עדיין חוסם את כפתור החזרה הפיזי לגמרי, עקבי עם מדיניות "אין סגירה בלחיצה על הרקע" הקיימת שלו.
```

Replace with:

```
## כפתור החזרה הפיזי (Hardware Back Button)

תלות נוספת שנדרשה לצורך תמיכה בכפתור/מחוות הניווט הפיזי של אנדרואיד: `@capacitor/app`. ההתנהגות: מהיכן שהמשתמש נמצא, לחיצה על כפתור החזרה מבצעת בדיוק את אותה פעולה שכפתור "← חזרה" באפליקציה היה מבצע (`history.back()`) — לא פעולה נפרדת. **עודכן 2026-09-08:** במסך הבית (Main, ללא פאנל פתוח) ובמסך ההתחברות, לחיצה **אחת** יוצאת מהאפליקציה מיידית — הוסרה מנגנון "לחץ שוב ליציאה" הכפול (שהיה קיים בעבר, עם הודעת toast וחלון 2 שניות), לבקשת המשתמש, שמצא אותו מסורבל. מודל הטיוטה (`#draftModal`) עדיין חוסם את כפתור החזרה הפיזי לגמרי, עקבי עם מדיניות "אין סגירה בלחיצה על הרקע" הקיימת שלו. **עודכן 2026-09-14:** חלון אישור מחיקה קבוצתית (`#bulkConfirmModal`, ראו `04-history.md`) מתנהג הפוך מ-`#draftModal` — כפתור החזרה הפיזי שם פועל כמו לחיצה על "ביטול" (סוגר את החלון בלי למחוק דבר, ולא ממשיך ל-`history.back()`/יציאה מהאפליקציה), כי ביטול מחיקה הוא תמיד הפעולה הבטוחה, בניגוד לטיוטה שבה שני הכיוונים (המשך/מחיקה) הם החלטה משמעותית שדורשת בחירה מפורשת.
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html docs/product/11-android-app.md
git commit -m "fix: android hardware back cancels the bulk-delete confirmation modal"
```

---

## Task 5: Full regression pass + feature summary

**Files:**
- None modified — verification only, plus one new summary doc.
- Create: `docs/superpowers/plans/2026-09-14-bulk-delete-confirmation-summary.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.

- [ ] **Step 1: Run the two existing tests whose teardown depends on single-item bulk delete staying immediate**

Run: `npx playwright test tests/workout.spec.ts tests/running.spec.ts --project=chromium`
Expected: all PASS, including the type-identity tests whose `finally` blocks long-press-select exactly one card and click `#histBulkBar .bulk-bar-del` expecting an immediate toast with no dialog (`workout.spec.ts:662`, `running.spec.ts:630`) — these are the two places in the existing suite most likely to break if the size===1 threshold in Task 2 Step 6 were implemented incorrectly.

- [ ] **Step 2: Run the full modified spec files together**

Run: `npx playwright test tests/history.spec.ts tests/measurements.spec.ts tests/i18n.spec.ts --project=chromium`
Expected: all PASS.

- [ ] **Step 3: Run the full suite once, both projects**

Run: `npx playwright test`
Expected: all PASS (or only pre-existing, unrelated flakes/skips — compare against a baseline run on `main` before this branch if any failure looks unrelated to this feature, and investigate before concluding it's pre-existing).

- [ ] **Step 4: Write the feature summary doc**

Create `docs/superpowers/plans/2026-09-14-bulk-delete-confirmation-summary.md`:

```markdown
# Feature Summary: Bulk-Delete Confirmation

**Spec:** `docs/superpowers/specs/2026-09-14-bulk-delete-confirmation-design.md`
**Plan:** `docs/superpowers/plans/2026-09-14-bulk-delete-confirmation.md`

## What changed

Bulk-deleting **2 or more** selected records — in History (strength or cardio)
or Measurements — now shows a confirmation modal (`#bulkConfirmModal`) before
anything is deleted. Canceling leaves every selected record and the
selection itself untouched. Bulk-deleting exactly **1** selected record
(via the same "מחק נבחרים" button) is unchanged: still immediate, no dialog.

## Where

- `public/index.html`: `_bulkDelete()` is now a router (size 1 → straight to
  new `_performBulkDelete()`; size 2+ → shows `#bulkConfirmModal`, which
  resolves via `_bulkConfirmYes()`/`_bulkConfirmNo()`). One new global modal,
  styled like `#draftModal`. `handleHardwareBack()` treats the new modal as
  Cancel (opposite of `#draftModal`'s block-everything policy).
- `public/translations.js`: 3 new keys (`bulk.confirm_title`,
  `bulk.confirm_msg_suffix`, `bulk.confirm_btn`) in `he`/`en`.
- `tests/history.spec.ts`, `tests/measurements.spec.ts`: new tests covering
  show/cancel/confirm for 2+ and the immediate path for exactly 1.
- Docs updated: `docs/product/04-history.md`, `docs/product/06-measurements.md`,
  `docs/product/00-overview.md`, `docs/product/11-android-app.md`.

## Known limitation

The Android hardware-back-button guard (Task 4) is verified by code review
only — Capacitor's native back-button listener cannot be exercised by this
repo's Playwright/Chromium test suite. If you have a device/emulator handy,
a manual spot-check is described in the plan's Task 4, Step 2.

## Test evidence

[Paste the final `npx playwright test` summary line here after Task 5 Step 3
completes, e.g. "42 passed (1 skipped)".]
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-09-14-bulk-delete-confirmation-summary.md
git commit -m "docs: bulk-delete confirmation feature summary"
```
