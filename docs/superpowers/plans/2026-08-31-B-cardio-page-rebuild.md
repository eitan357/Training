# Cardio Page Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the running/cardio page's 3-sub-view dashboard+wizard+OCR with a strength-like single-form page (type tabs, dynamic typed fields, draft auto-save, copy-last-workout, clear-form) plus a new template editor for user-defined field templates, open the feature to every user, and migrate existing `runWorkouts` data to the new schema.

**Architecture:** Builds directly on `2026-08-31-A-shared-workout-engine.md` — that plan MUST be merged first. This plan adds a `cardio` entry to the `WORKOUT_DOMAINS` registry, new Firestore collections (`config/runningTemplates`, rewritten `runWorkouts`), a one-time migration, new HTML for `#sec-running`, and a new in-page template editor mirroring `#mainEditPanel`'s pattern. History-page integration (the כוח/אירובי toggle, streak/PR/charts relocation) is **out of scope here** — see `2026-08-31-C-history-unification-and-cleanup.md`, which depends on this plan.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Auth/Firestore v12 (CDN), Playwright for E2E tests.

**Spec:** `docs/superpowers/specs/2026-08-31-cardio-page-redesign-design.md` §3 (data model), §5 (daily page), §6 (template editor).

## Global Constraints

- Depends on Phase A's `WORKOUT_DOMAINS`, `_draftKey(domain,type)`, `_draftSerialize(domain)`, `_draftApplyToForm(domain,draft)`, `_draftHasFormData(domain)`, `_draftQualifies/_draftHasBannerData(domain,draft)`, `_draftAttachListeners(domain,listId,nameInputId)`, `_draftStartFirestoreTimer(domain,getType)`, `_tabSnapshotCurrent(domain,type)`, `_tabRestoreOrDraft(domain,type)` — call these by their Phase-A signatures, do not reinvent.
- `תאריך` is field #1 of every cardio type, fixed `fieldType:'date'`, always present, never removable via the editor (spec §3.1).
- Field `id` is a stable slug independent of `label` — entries store a denormalized snapshot (spec §3.2), matching strength's exercise-denormalization philosophy (`docs/product/14-data-model-backend.md`).
- OCR is deleted entirely, not adapted (confirmed with user). The 3-step wizard is deleted entirely.
- `escHtml()` wraps any user-controlled string (field labels, session names) put into `innerHTML` — standing project rule.
- All new user-facing **app copy** (button labels, section titles, error messages) needs `he`/`en` entries in `public/translations.js`. User-created content (field labels, type names, session names) does **not** — same convention as exercise names.
- Commit after every task.
- **Router awareness (added post-write, before execution):** since this plan was authored, the separate unified-navigation-history plan **landed and merged into `main`** — the running section now goes through a real `history.pushState` router (`ROUTES`, `navigateTo`, `_renderRoute`, `pushSubState`) instead of raw DOM/`history.pushState({}, '')` calls. This plan's tasks were written against the pre-router code and need the amendments below wherever they touch running-section navigation. Every other task (1, 2, 5, 6) is unaffected — only Task 4 Step 7 and Task 7-8 need the patches called out inline below.
  - The bottom-nav button already calls `onclick="navigateTo('/running')"` (not `showSection('running')`) — no change needed, this already matches what this plan wants (simple navigation, no sub-routes).
  - The running-feature email allowlist was factored into one top-level constant, `const RUNNING_ALLOWED_EMAILS = ['eitan357@gmail.com', 'test@gmail.com'];`, consumed in **two** places: `initSettingsUI` (via a local `const RUN_ALLOWED = RUNNING_ALLOWED_EMAILS;` alias, gates the settings row's visibility) and a separate function `_isRunningAllowed()` (gates direct/bookmarked `/running` URL navigation in both boot-time route resolution and `navigateTo` itself). Task 7 below now needs to neutralize **both** — removing only the settings-row gate (as originally written) would leave `_isRunningAllowed()` still redirecting an ungated user away from `/running` even after the toggle is visible to them.
  - The old dedicated running `popstate` listener Task 8 was written to delete **no longer exists** — the router work already removed it (routing now goes through the one unified `popstate` listener). No action needed for that specific step; it's called out below so an implementer doesn't search for something that's already gone and wonder if they missed it.
  - The router added its own running-specific rendering layer (`_renderRunState`, `_renderRunStep`, `_renderRunStep3Form`) and two `ROUTES` sub-entries (`/running/add`, `/running/history`) plus a sub-state helper (`pushSubState`) that this plan's new single-page cardio design has no use for. Task 8 below is amended to remove the former (all running-specific) and explicitly leave `pushSubState` alone (a generic, harmless, reusable router primitive — not this plan's to manage, even though this plan is its only current caller).

---

## Task 1: `runningTemplates` Data Model + One-Time Migration

**Files:**
- Modify: `public/index.html` — add near `_backgroundSync` (`:2633-2647`)
- Test: `tests/running.spec.ts` (new file section — old wizard/dashboard tests are removed in Task 8, this task only adds migration coverage)

**Interfaces:**
- Produces: `migrateCardioDataV2()` (async, idempotent), `_cacheKeyRunningTemplates()`.
- Consumes: `genId()` (`:2156`), `db`, `currentUser`.

- [ ] **Step 1: Write a migration unit test using the Firestore emulator (or a seeded test account) — seed old-schema fixtures, assert new shape**

Add to `tests/running.spec.ts` (new top section, replacing whatever wizard-era content existed there before this plan — Task 8 handles the full file cleanup; this step only adds this one test in isolation so it can run standalone first):

```ts
import { test, expect } from '@playwright/test';

test.describe('Cardio Data Migration', () => {
  test('migrates old runWorkoutTypes/runWorkouts into runningTemplates + fields[] shape', async ({ page }) => {
    // This test assumes a seeded fixture account with old-schema data already
    // present (one runWorkoutTypes doc 'Running', one runWorkouts doc with
    // distanceKm/durationMinutes/calories) — see tests/fixtures/ for the
    // seeding script referenced by playwright.config.ts's globalSetup.
    await page.goto('/');
    await page.waitForFunction(() => window.__cardioMigrationDone === true, { timeout: 15000 });
    const result = await page.evaluate(async () => {
      const snap = await window.__debugGetDoc(['config', 'runningTemplates']);
      return snap;
    });
    expect(result.types).toContain('Running');
    expect(result['Running'].some(f => f.fieldType === 'date')).toBe(true);
    expect(result['Running'].some(f => f.label === 'מרחק')).toBe(true);
  });
});
```

Note: `window.__cardioMigrationDone` and `window.__debugGetDoc` are new test-only hooks added in Step 3 below — this is the same pattern the app would need for any Firestore-shape assertion from Playwright, since the app has no REST debug endpoint (`docs/product/14-data-model-backend.md` — no custom backend).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/running.spec.ts -g "migrates old"`
Expected: FAIL — `migrateCardioDataV2` doesn't exist yet, `window.__cardioMigrationDone` is never set.

- [ ] **Step 3: Implement the migration**

In `public/index.html`, immediately before `_backgroundSync` (`:2633`), add:

```js
// ─── CARDIO DATA MIGRATION (V2 — runWorkoutTypes/runWorkouts → runningTemplates) ───
// One-time, guarded by config/settings.cardioMigratedV2. Wrapped in the same
// silent try/catch pattern as _backgroundSync (docs/product/10) — a failure
// here must never block app load, and simply retries next load since the
// guard flag isn't set until the whole migration succeeds.
const CARDIO_MIGRATION_FIELD_MAP = [
  { id: 'date',              label: 'תאריך',      fieldType: 'date' },
  { id: 'distanceKm',        label: 'מרחק',        fieldType: 'number' },
  { id: 'durationMinutes',   label: 'זמן',          fieldType: 'number' },
  { id: 'calories',          label: 'קלוריות',      fieldType: 'number' },
  { id: 'avgStridesPerMin',  label: 'צעדים',        fieldType: 'number' },
  { id: 'avgHeartRate',      label: 'דופק ממוצע',  fieldType: 'number' },
  { id: 'feltTired',         label: 'הרגשתי עייפות', fieldType: 'checkbox' },
  { id: 'notes',             label: 'הערות',        fieldType: 'text' },
];

async function migrateCardioDataV2() {
  if (!currentUser) return;
  try {
    const settingsRef = doc(db, 'users', currentUser.uid, 'config', 'settings');
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists() && settingsSnap.data().cardioMigratedV2 === true) {
      window.__cardioMigrationDone = true;
      return;
    }

    const typesSnap = await getDocs(collection(db, 'users', currentUser.uid, 'runWorkoutTypes'));
    if (typesSnap.empty) {
      // Nothing to migrate (new user, or already-clean state) — just set the flag.
      await setDoc(settingsRef, { cardioMigratedV2: true }, { merge: true });
      window.__cardioMigrationDone = true;
      return;
    }
    const oldTypes = typesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.order - b.order);

    const templateData = { types: oldTypes.map(t => t.name) };
    oldTypes.forEach(t => { templateData[t.name] = CARDIO_MIGRATION_FIELD_MAP.map(f => ({ ...f })); });
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'runningTemplates'), templateData);

    const oldWorkoutsSnap = await getDocs(collection(db, 'users', currentUser.uid, 'runWorkouts'));
    for (const wDoc of oldWorkoutsSnap.docs) {
      const w = wDoc.data();
      const typeName = oldTypes.find(t => t.id === w.workoutTypeId)?.name || oldTypes[0].name;
      const fields = CARDIO_MIGRATION_FIELD_MAP
        .filter(f => f.id !== 'date' && w[f.id] != null && w[f.id] !== '')
        .map(f => ({ id: f.id, label: f.label, fieldType: f.fieldType, value: w[f.id] }));
      const dateISO = w.date; // old schema's `date` field is already YYYY-MM-DD
      const [yyyy, mm, dd] = dateISO.split('-');
      await updateDoc(doc(db, 'users', currentUser.uid, 'runWorkouts', wDoc.id), {
        date: `${dd}/${mm}/${yyyy}`,
        dateISO,
        workoutType: typeName,
        fields,
        // Explicitly remove the old fixed-schema keys so the doc matches the
        // new shape exactly (Firestore deleteField(), imported alongside the
        // other v12 SDK named imports already at the top of index.html).
        distanceKm: deleteField(), durationMinutes: deleteField(), paceMinPerKm: deleteField(),
        calories: deleteField(), avgStridesPerMin: deleteField(), avgHeartRate: deleteField(),
        feltTired: deleteField(), notes: deleteField(), workoutTypeId: deleteField(),
      });
    }

    for (const tDoc of typesSnap.docs) {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'runWorkoutTypes', tDoc.id));
    }

    await setDoc(settingsRef, { cardioMigratedV2: true }, { merge: true });
    window.__cardioMigrationDone = true;
  } catch (e) { /* silent — retried next load, guard flag only set on full success */ }
}
```

Add `deleteField` to the existing Firestore SDK import statement at the top of `public/index.html` (find the `import { ... } from 'https://www.gstatic.com/firebasejs/.../firebase-firestore.js'` line and add `deleteField` to its named-import list, alongside the existing `doc, setDoc, getDoc, ...`).

- [ ] **Step 4: Call the migration from `_backgroundSync`**

Find (`public/index.html:2633-2647`, post-Phase-A state — line numbers may have shifted slightly from Phase A's edits, locate by content, not line number, if they don't match exactly):

```js
async function _backgroundSync(hadCache) {
  try {
    await Promise.all([
      checkAndAutoSavePreviousDrafts(),
      loadRunningEnabled().then(() => {
        try { localStorage.setItem(_cacheKeyRunning(), String(runningEnabled)); } catch(e) {}
        if (runningEnabled) prefetchRunData();
      }),
    ]);
```

replace with:

```js
async function _backgroundSync(hadCache) {
  try {
    await migrateCardioDataV2();
    await Promise.all([
      checkAndAutoSavePreviousDrafts(),
      loadRunningEnabled().then(() => {
        try { localStorage.setItem(_cacheKeyRunning(), String(runningEnabled)); } catch(e) {}
        if (runningEnabled) prefetchRunData();
      }),
    ]);
```

(Migration runs before `loadRunningEnabled`/`prefetchRunData` so the prefetch that follows always reads the already-migrated `runningTemplates`/`runWorkouts` shape, never the old one.)

- [ ] **Step 5: Add the two Playwright-only debug hooks the test in Step 1 relies on**

Near the top of the script (after `const auth = getAuth(fbApp);`), add:

```js
// Test-only Firestore read hook — Playwright has no other way to assert
// document shape without a custom backend (docs/product/14). No-ops in
// production since nothing calls window.__debugGetDoc outside tests.
window.__debugGetDoc = async (pathParts) => {
  if (!currentUser) return null;
  const snap = await getDoc(doc(db, 'users', currentUser.uid, ...pathParts));
  return snap.exists() ? snap.data() : null;
};
```

- [ ] **Step 6: Run the migration test**

Run: `npx playwright test tests/running.spec.ts -g "migrates old"`
Expected: PASS (requires the fixture-seeding setup referenced in Step 1's test comment — if `tests/fixtures/` has no cardio-seed script yet, add one following the existing pattern in that directory before this step; if no such directory pattern exists, seed directly in a `test.beforeAll` using the Firebase Admin SDK against the emulator, consistent with however `tests/auth-state.json`-style fixtures are currently produced in this repo).

- [ ] **Step 7: Commit**

```bash
git add public/index.html tests/running.spec.ts
git commit -m "feat(cardio): add runningTemplates data model + one-time migration from old schema"
```

---

## Task 2: Register the `cardio` Domain in `WORKOUT_DOMAINS`

**Files:**
- Modify: `public/index.html` (near the `WORKOUT_DOMAINS` declaration from Phase A)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS` (Phase A Task 2/6/7).
- Produces: `WORKOUT_DOMAINS.cardio`, new state: `let runningTypes = []; let cardioSelectedType = null; let cardioEditTab = null; let cardioEditTemplates = {}; let allRunWorkouts = [];` (kept as **separate globals from strength's** `workoutTypes`/`selectedType`/`editTab`/`editTemplates`/`allSessions` — sharing them would risk a race the moment both pages are open in the same tab session; separate globals cost nothing and match how `allMeasurements`/`measureTypes` already sit alongside `allSessions`/`workoutTypes` today).

- [ ] **Step 1: Declare cardio state alongside the existing `RUNNING STATE` block**

Find (`public/index.html`, `─── RUNNING STATE ─` block):

```js
let runningEnabled     = false;
let runWorkouts        = [];
let runWorkoutTypes    = [];
let _runCharts         = {};
let _runCurrentRange   = 'year';
let _runAddStep        = 1;
let _runSelectedTypeId = null;
let _runPrefill        = {};
let _runDataPromise    = null;  // holds the in-flight or resolved prefetch promise
```

replace with (drops `_runAddStep`/`_runSelectedTypeId`/`_runPrefill` — wizard-only state deleted in Task 8; `runWorkouts`/`runWorkoutTypes` renamed to match the new schema; `_runCharts`/`_runCurrentRange` stay, relocated to History in Plan C but the variables themselves are unaffected by this task):

```js
let runningEnabled     = false;
let allRunWorkouts     = [];   // was runWorkouts — renamed for symmetry with allSessions/allMeasurements
let runningTypes       = [];   // was runWorkoutTypes' .name list — now plain strings, like workoutTypes
let cardioSelectedType = null;
let cardioEditTab      = null;
let cardioEditTemplates = {};
let _runCharts         = {};
let _runCurrentRange   = 'year';
let _runDataPromise    = null;  // holds the in-flight or resolved prefetch promise
```

Run: `grep -rn "runWorkouts\b\|runWorkoutTypes\b" public/index.html` and update every remaining reference outside this task's own diff to the new names — Task 3/4/5/6 rewrite the functions that own most of these references anyway; use this grep now only to confirm no stray reference is left dangling after Task 8 deletes the wizard/dashboard functions that owned the rest.

- [ ] **Step 2: Add `WORKOUT_DOMAINS.cardio`**

Find the `WORKOUT_DOMAINS` object (Phase A Task 6/7's final state) and add a sibling `cardio` key:

```js
  cardio: {
    serialize: () => {
      const fields = [];
      document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
        const ft = row.dataset.fieldType;
        let value;
        if (ft === 'checkbox') value = row.querySelector('.cardio-field-input').checked;
        else value = row.querySelector('.cardio-field-input').value;
        fields.push({ id: row.dataset.id, label: row.dataset.label, fieldType: ft, value });
      });
      return { workoutName: document.getElementById('cardioSessionNameInput')?.value || '', fields };
    },
    applyToForm: draft => {
      const nameInput = document.getElementById('cardioSessionNameInput');
      if (nameInput) nameInput.value = draft.workoutName || '';
      document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
        const f = (draft.fields || []).find(x => x.id === row.dataset.id);
        if (!f || f.value === '' || f.value == null) return;
        const input = row.querySelector('.cardio-field-input');
        if (row.dataset.fieldType === 'checkbox') input.checked = !!f.value;
        else input.value = f.value;
      });
    },
    hasFormData: () => {
      if (document.getElementById('cardioSessionNameInput')?.value.trim()) return true;
      return [...document.querySelectorAll('#cardioFieldList .cardio-field-input')].some(inp =>
        inp.type === 'checkbox' ? inp.checked : inp.value.trim()
      );
    },
    qualifies: draft => !!(draft.workoutName?.trim()) || (draft.fields || []).some(f => f.value !== '' && f.value != null && f.value !== false),
    templatesDoc: ['config', 'runningTemplates'],
    editListContainerId: 'cardioEditListContainer',
    editTabsId:           'cardioEditTabs',
    typeRowId:             'cardioTypeRow',
    entriesCollection: 'runWorkouts',
  },
```

- [ ] **Step 3: Run the full suite (sanity check — nothing wires to this yet)**

Run: `npx playwright test`
Expected: all pass, unchanged (strength untouched; cardio's new registry entry is inert until Tasks 3-6 build the UI that calls it).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(cardio): register the cardio domain in WORKOUT_DOMAINS, add cardio state vars"
```

---

## Task 3: Rewrite `#sec-running` Markup — Daily Entry Page

**Files:**
- Modify: `public/index.html:1051-1161` (entire `#sec-running` block — dashboard, wizard, OCR, history sub-views all deleted and replaced)

**Interfaces:**
- Produces: new DOM ids `cardioTypeRow`, `cardioHistoryPreview`, `cardioSessionNameInput`, `cardioFieldList`, `cardioSaveBtn`.
- Consumes: nothing yet (Task 4 wires the JS behind this markup).

- [ ] **Step 1: Replace the entire `#sec-running` block**

Find (`public/index.html:1051-1161`, the full block from `<!-- ══ RUNNING ══ -->` through its closing `</div>` — copy the exact current content from the file, since Phase A's edits don't touch this region, so the line numbers cited in this plan's research remain accurate) and replace with:

```html
<!-- ══ CARDIO ══ -->
<div id="sec-running" class="section">
  <div class="topbar">
    <div><div class="topbar-title" data-i18n="title.running">אירובי <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-pulse"/></svg></div><div class="topbar-sub topbar-email"></div></div>
    <button class="topbar-icon-btn" onclick="showSection('settings')" title="הגדרות"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-gear"/></svg></button>
  </div>
  <div style="padding:16px;">
    <div id="cardioTypeRow" class="type-row"></div>

    <div id="cardioHistoryPreview" class="history-preview" style="display:none;"></div>

    <div style="display:flex;gap:8px;margin:10px 0;">
      <button class="run-btn run-btn-secondary" style="flex:1;" id="cardioCopyLastBtn" onclick="copyLastCardioWorkout()" data-i18n="copy.last_btn" style="display:none;">העתקת אימון אחרון</button>
      <button class="run-btn run-btn-secondary" style="flex:1;" onclick="clearCardioForm()" data-i18n="clear.btn">נקה טופס</button>
    </div>

    <div class="run-form-field">
      <input type="text" id="cardioSessionNameInput" class="run-form-input" data-i18n-ph="workout.name_default_ph" placeholder="שם האימון (ראשון, שני, דלואד...)">
    </div>

    <div id="cardioFieldList"></div>

    <button class="run-btn run-btn-secondary" style="width:100%;margin-top:10px;" onclick="addCustomCardioField()" data-i18n="cardio.add_field_btn">+ הוסף שדה</button>
    <button class="run-btn run-btn-primary" style="width:100%;margin-top:8px;" id="cardioSaveBtn" onclick="submitCardioData()" data-i18n="btn.save_workout">שמור אימון</button>
  </div>
</div>
```

- [ ] **Step 2: Confirm the file still parses**

Run: `node -e "require('fs').readFileSync('public/index.html','utf8')" && echo "file readable"` (sanity read, `index.html` isn't pure JS — visually confirm every tag balances).

Expected: `file readable`. The page will not render correctly yet — every `onclick` handler above (`copyLastCardioWorkout`, `clearCardioForm`, `addCustomCardioField`, `submitCardioData`) is implemented in Task 4. Do not open this page in a browser until Task 4 lands.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(cardio): replace dashboard/wizard/OCR markup with the daily-entry page layout"
```

---

## Task 4: Dynamic Field Rendering, Type-Tab Switching, Copy-Last, Clear-Form, Submit

**Files:**
- Modify: `public/index.html` (new functions, placed in the former `RUNNING UI`/`RUNNING ADD WORKOUT` region that Task 8 will otherwise delete)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS.cardio` (Task 2), `_draftKey`/`_draftSerialize`/`_draftApplyToForm`/`_draftHasFormData`/`_draftQualifies`/`_draftHasBannerData`/`_draftAttachListeners`/`_draftStartFirestoreTimer`/`_tabSnapshotCurrent`/`_tabRestoreOrDraft` (Phase A), `runningTypes`/`cardioSelectedType` (Task 2), `#cardioTypeRow`/`#cardioFieldList`/etc. (Task 3).
- Produces: `renderCardioFieldRow(field, value)`, `renderCardioTypeButtons()`, `selectCardioType(type)`, `clearCardioForm(silent)`, `copyLastCardioWorkout()`, `addCustomCardioField()`, `submitCardioData()`, `lastCardioWorkouts` (object, mirrors `lastWorkouts`).

- [ ] **Step 1: Field-row renderer**

Add:

```js
// ─── CARDIO FIELD RENDERING ─────────────────────────────────────
let lastCardioWorkouts = {};   // mirrors lastWorkouts, keyed by cardio type name

function renderCardioFieldRow(field, value) {
  const val = value ?? '';
  let inputHtml;
  if (field.fieldType === 'date') {
    inputHtml = `<input type="text" class="cardio-field-input" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" value="${escHtml(String(val))}">`;
  } else if (field.fieldType === 'number') {
    inputHtml = `<input type="number" class="cardio-field-input" step="any" value="${escHtml(String(val))}" placeholder="--">`;
  } else if (field.fieldType === 'checkbox') {
    inputHtml = `<label class="toggle-switch"><input type="checkbox" class="cardio-field-input"${val ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  } else {
    inputHtml = `<input type="text" class="cardio-field-input" value="${escHtml(String(val))}" placeholder="--">`;
  }
  return `<div class="run-form-field cardio-field-row" data-id="${escHtml(field.id)}" data-label="${escHtml(field.label)}" data-field-type="${escHtml(field.fieldType)}">
    <label class="run-form-label">${escHtml(field.label)}</label>
    ${inputHtml}
  </div>`;
}

function renderCardioFieldList(type, prefillFields) {
  const template = cardioEditTemplates[type] || [];
  const byId = {};
  (prefillFields || []).forEach(f => { byId[f.id] = f.value; });
  document.getElementById('cardioFieldList').innerHTML =
    template.map(f => renderCardioFieldRow(f, byId[f.id])).join('');
}
```

Note: the `date` field renders as free-text with the same digit-only auto-slash formatting Measurements already uses — Step 2 wires that behavior (rather than a native `<input type=date>`, matching spec §5.3's explicit call for UI consistency with Measurements).

- [ ] **Step 2: Auto-format the date field the same way Measurements does**

Add (near the existing `#m-date` auto-format listener at `public/index.html:4241-4246`, since `#cardioFieldList`'s date input is created dynamically, this must be event-delegated rather than a one-time `addEventListener`):

```js
document.getElementById('cardioFieldList').addEventListener('input', e => {
  const row = e.target.closest('.cardio-field-row');
  if (!row || row.dataset.fieldType !== 'date') return;
  let v = e.target.value.replace(/\D/g,'');
  if (v.length > 2) v = v.slice(0,2) + '/' + v.slice(2);
  if (v.length > 5) v = v.slice(0,5) + '/' + v.slice(5,9);
  e.target.value = v;
});
```

- [ ] **Step 3: Type-tab switching (mirrors `selectType`)**

Add:

```js
function renderCardioTypeButtons() {
  document.getElementById('cardioTypeRow').innerHTML = runningTypes.map(type =>
    `<button class="type-btn${type === cardioSelectedType ? ' active' : ''}" data-type="${escHtml(type)}" onclick="selectCardioType('${escHtml(type)}')">${escHtml(type)}</button>`
  ).join('');
}

function selectCardioType(type) {
  if (cardioSelectedType === type) return;
  _tabSnapshotCurrent('cardio', cardioSelectedType);
  if (cardioSelectedType && _draftHasFormData('cardio')) {
    _draftSaveLocal('cardio', cardioSelectedType);
    _draftDirty['cardio:' + cardioSelectedType] = true;
  }
  cardioSelectedType = type;
  document.querySelectorAll('#cardioTypeRow .type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));

  const last = lastCardioWorkouts[type];
  const box  = document.getElementById('cardioHistoryPreview');
  if (last) {
    box.style.display = '';
    box.innerHTML = `<div class="history-preview-title">${sessionDisplayDate(last)}${last.sessionName ? ' · ' + escHtml(last.sessionName) : ''}</div>`;
    document.getElementById('cardioCopyLastBtn').style.display = '';
  } else {
    box.style.display = 'none';
    document.getElementById('cardioCopyLastBtn').style.display = 'none';
  }

  const nameInput = document.getElementById('cardioSessionNameInput');
  nameInput.value = '';
  nameInput.placeholder = last?.sessionName ? (t('workout.name_last_ph') + last.sessionName) : t('workout.name_default_ph');

  renderCardioFieldList(type);
  _draftAttachListeners('cardio', 'cardioFieldList', 'cardioSessionNameInput');
  _tabRestoreOrDraft('cardio', type);
}
```

- [ ] **Step 4: Clear-form, copy-last-workout**

Add:

```js
function clearCardioForm(silent = false) {
  if (!cardioSelectedType) return;
  const nameInput = document.getElementById('cardioSessionNameInput');
  const last = lastCardioWorkouts[cardioSelectedType];
  nameInput.value = '';
  nameInput.placeholder = last?.sessionName ? (t('workout.name_last_ph') + last.sessionName) : t('workout.name_default_ph');
  renderCardioFieldList(cardioSelectedType);
  _draftAttachListeners('cardio', 'cardioFieldList', 'cardioSessionNameInput');
  delete _tabState['cardio:' + cardioSelectedType];
  delete _draftDirty['cardio:' + cardioSelectedType];
  localStorage.removeItem(_draftKey('cardio', cardioSelectedType));
  if (currentUser) deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'cardio_' + cardioSelectedType)).catch(() => {});
  if (!silent) toast(t('clear.success'), 'error');
}

function copyLastCardioWorkout() {
  const last = lastCardioWorkouts[cardioSelectedType];
  if (!last) return;
  const existingDraft = _draftLoadLocal('cardio', cardioSelectedType);
  if (existingDraft && _draftHasBannerData('cardio', existingDraft)) {
    if (!confirm(t('draft.overwrite_confirm'))) return;
  }
  const hasData = [...document.querySelectorAll('#cardioFieldList .cardio-field-input')].some(inp =>
    inp.type === 'checkbox' ? inp.checked : inp.value.trim()
  );
  if (hasData && !confirm(t('target.overwrite_confirm'))) return;
  renderCardioFieldList(cardioSelectedType, last.fields);
  toast(`✓ ${t('copy.success')} ${t('copy.from')}${sessionDisplayDate(last)}`, 'success');
  _draftOnInput('cardio');
}
```

- [ ] **Step 5: Ad-hoc "+ הוסף שדה" (this-entry-only, free-text — matching `addCustomExercise`'s simplicity)**

Add:

```js
function addCustomCardioField() {
  const id = 'adhoc_' + genId();
  document.getElementById('cardioFieldList').insertAdjacentHTML('beforeend',
    renderCardioFieldRow({ id, label: t('cardio.new_field_default_label'), fieldType: 'text' }, ''));
  window.scrollTo(0, document.body.scrollHeight);
}
```

- [ ] **Step 6: Submit**

Add:

```js
async function submitCardioData() {
  const btn = document.getElementById('cardioSaveBtn');
  const fields = [];
  document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
    const ft = row.dataset.fieldType;
    const input = row.querySelector('.cardio-field-input');
    let value = ft === 'checkbox' ? input.checked : input.value.trim();
    if (ft !== 'checkbox' && value === '') return; // skip empty non-checkbox fields, same convention as saveMeasurement
    fields.push({ id: row.dataset.id, label: row.dataset.label, fieldType: ft, value });
  });
  const dateField = fields.find(f => f.fieldType === 'date');
  if (!dateField || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateField.value)) {
    toast(t('cardio.date_required'), 'error'); return;
  }
  const [dd, mm, yyyy] = dateField.value.split('/');
  const dateISO = `${yyyy}-${mm}-${dd}`;

  const sessionName = document.getElementById('cardioSessionNameInput')?.value.trim() || '';
  btn.disabled = true; btn.innerText = t('saving');
  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'runWorkouts'), {
      date: dateField.value, dateISO,
      workoutType: cardioSelectedType,
      sessionName, fields,
      createdAt: serverTimestamp(),
    });
    const cachedLW = { date: dateField.value, dateISO, workoutType: cardioSelectedType, sessionName, fields };
    lastCardioWorkouts[cardioSelectedType] = cachedLW;
    await _draftDelete('cardio', cardioSelectedType);
    toast(t('workout.saved_ok'), 'success');
    await reloadAppData();
    clearCardioForm(true);
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
  }
  btn.disabled = false; btn.innerText = t('btn.save_workout');
}
```

- [ ] **Step 7: Wire `initRunSection` to the new page instead of the old dashboard**

**Router amendment:** this function's body now includes the router integration added after this plan was written — the "Find" block below reflects the *current* live-file content (not the pre-router version). Match by content as always, but this one specific mismatch is expected and pre-diagnosed, not drift to investigate.

Find (`public/index.html`, `initRunSection`):

```js
async function initRunSection() {
  if (!_runDataPromise) _runDataPromise = loadRunData();  // fallback if prefetch didn't run
  await _runDataPromise;
  // Pure re-render, no history write — matches showSection()'s own
  // "history-free" contract. Uses whatever route is ALREADY current in
  // history.state by the time this continuation runs (navigateTo/
  // pushSubState always set it before initRunSection() is invoked), so
  // this can never clobber /running/add (or any sub-state) with a
  // duplicate/incorrect jump back to the dashboard.
  _renderRunState(history.state?.runSubView, history.state?.runStep);
}
```

replace with:

```js
async function initRunSection() {
  if (!_runDataPromise) _runDataPromise = loadRunData();  // fallback if prefetch didn't run
  await _runDataPromise;
  renderCardioTypeButtons();
  selectCardioType(cardioSelectedType || runningTypes[0]);
}
```

`loadRunData` itself is rewritten in Task 6 to populate `runningTypes`/`cardioEditTemplates`/`allRunWorkouts`/`lastCardioWorkouts` from the new schema — this task's code assumes that shape exists; it will not run correctly end-to-end until Task 6 lands (expected, same "reviewable task sequencing" note as Phase A).

- [ ] **Step 8: Add the new i18n keys used above**

In `public/translations.js`, Hebrew block, add near the existing `copy.*`/`clear.*`/`workout.*` keys:

```js
    'cardio.add_field_btn':          '+ הוסף שדה',
    'cardio.new_field_default_label': 'שדה חדש',
    'cardio.date_required':          'יש למלא תאריך',
```

English block, matching keys:

```js
    'cardio.add_field_btn':          '+ Add Field',
    'cardio.new_field_default_label': 'New Field',
    'cardio.date_required':          'Date is required',
```

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "feat(cardio): dynamic field rendering, type-tab switching, copy-last/clear-form/submit"
```

---

## Task 5: Rewrite `loadRunData`/`addRunWorkout`/`prefetchRunData` for the New Schema

**Files:**
- Modify: `public/index.html` (`loadRunData`, `addRunWorkout`, `prefetchRunData`)

**Interfaces:**
- Produces: `loadRunData()` now populates `runningTypes`/`cardioEditTemplates`/`allRunWorkouts`/`lastCardioWorkouts` from `config/runningTemplates` + `runWorkouts`, instead of `runWorkoutTypes`/`runWorkouts`.
- Consumes: `migrateCardioDataV2` (Task 1) — must have already run before this reads, guaranteed by `_backgroundSync`'s ordering (Task 1 Step 4).

- [ ] **Step 1: Replace `loadRunData`**

Find:

```js
async function loadRunData() {
  if (!currentUser) return;
  try {
    const typesRef = collection(db, 'users', currentUser.uid, 'runWorkoutTypes');
    const typesSnap = await getDocs(query(typesRef, orderBy('order')));
    if (typesSnap.empty) {
      await Promise.all([
        addDoc(typesRef, { name: 'Running',    order: 0 }),
        addDoc(typesRef, { name: 'Elliptical', order: 1 }),
      ]);
      const fresh = await getDocs(query(typesRef, orderBy('order')));
      runWorkoutTypes = fresh.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      runWorkoutTypes = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    const wRef  = collection(db, 'users', currentUser.uid, 'runWorkouts');
    const wSnap = await getDocs(query(wRef, orderBy('date', 'desc')));
    runWorkouts = wSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    toast('שגיאה בטעינת נתוני ריצה: ' + err.message, 'error');
  }
}
```

replace with:

```js
async function loadRunData() {
  if (!currentUser) return;
  try {
    const tmplSnap = await getDoc(doc(db, 'users', currentUser.uid, 'config', 'runningTemplates'));
    const tmpl = tmplSnap.exists() ? tmplSnap.data() : { types: [] };
    runningTypes = tmpl.types && tmpl.types.length ? tmpl.types : [];
    cardioEditTemplates = {};
    runningTypes.forEach(type => { cardioEditTemplates[type] = tmpl[type] || []; });
    if (!cardioSelectedType || !runningTypes.includes(cardioSelectedType)) cardioSelectedType = runningTypes[0] || null;
    if (!cardioEditTab || !runningTypes.includes(cardioEditTab)) cardioEditTab = runningTypes[0] || null;

    const wRef  = collection(db, 'users', currentUser.uid, 'runWorkouts');
    const wSnap = await getDocs(query(wRef, orderBy('dateISO', 'desc')));
    allRunWorkouts = wSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    lastCardioWorkouts = {};
    allRunWorkouts.forEach(w => { if (!lastCardioWorkouts[w.workoutType]) lastCardioWorkouts[w.workoutType] = w; });
  } catch (err) {
    toast(t('error.update') + err.message, 'error');
  }
}
```

Note: a brand-new user with no `runningTemplates` doc at all gets `runningTypes = []` — Task 6's template editor must handle the zero-types case gracefully (its "add type" flow is the only way in); this task does not auto-seed default cardio types, since the spec (§ non-goals) treats OCR/wizard-era auto-seeding as removed functionality, not replicated. Flagged for the user in the final summary if a default seed is wanted instead.

- [ ] **Step 2: Replace `addRunWorkout`/`prefetchRunData`**

`addRunWorkout` is no longer called anywhere (Task 4's `submitCardioData` writes directly, matching `submitData`'s own pattern) — find it and delete it entirely:

```js
async function addRunWorkout(workout) {
  const ref = collection(db, 'users', currentUser.uid, 'runWorkouts');
  await addDoc(ref, { ...workout, createdAt: serverTimestamp() });
  const snap = await getDocs(query(ref, orderBy('date', 'desc')));
  runWorkouts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```

`prefetchRunData` is unchanged (still just `if (!currentUser || _runDataPromise) return; _runDataPromise = loadRunData();`) — no edit needed, listed here only to confirm it still compiles against the new `loadRunData`.

- [ ] **Step 3: Run the full suite**

Run: `npx playwright test`
Expected: strength suite passes unchanged; cardio-specific specs are still mid-migration (Task 6's editor and Task 8's test rewrite land next) — do not expect `tests/running.spec.ts` to be fully green until Task 10.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(cardio): rewrite loadRunData for the runningTemplates schema, remove addRunWorkout"
```

---

## Task 6: Cardio Template Editor

**Files:**
- Modify: `public/index.html` — new markup (placed as a new top-level section-like panel, following the exact `#mainEditPanel` in-page-panel pattern documented in `docs/product/03-workout-template-editor.md`, not a new route), new JS.

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS.cardio` (Task 2), `cardioEditTemplates`/`cardioEditTab`/`runningTypes` (Task 2/5), shared editor-shell functions from Phase A Task 6 (`renderEditList(domain,type)`, `collectEdits(domain)` — this task adds cardio-specific `renderItemRow`/`collectItemFromRow`/`newItem`/`buildSaveDoc` to `WORKOUT_DOMAINS.cardio`, then reuses the generic shell).
- Produces: `openCardioEdit()`/`closeCardioEdit()` (mirrors `openWorkoutEdit`/`closeWorkoutEdit`), `_setCardioEditPanel(open)`, `switchCardioEditTab`, `addCardioEditField`, `removeCardioEditField`, `confirmAddCardioType`, `removeCardioType`, `saveCardioTemplates`, `setCardioFieldType`.

- [ ] **Step 1: Add the remaining `WORKOUT_DOMAINS.cardio` keys (editor-shell config)**

Extend the `cardio` entry added in Task 2 with:

```js
    newItem: () => ({ id: genId(), label: '', fieldType: 'text' }),
    renderItemRow: (f, idx) => `
      ${f.fieldType === 'date' ? '' : '<span class="drag-handle">⠿</span>'}
      <div class="edit-fields">
        <input class="cardio-field-label-input" value="${escHtml(f.label)}" placeholder="${t('edit.field_label_ph')}" ${f.fieldType === 'date' ? 'disabled' : ''}>
        <div class="field-type-picker" data-idx="${idx}">
          <button type="button" class="ftype-btn${f.fieldType==='text'?' active':''}" data-ftype="text" onclick="setCardioFieldType(${idx},'text')" ${f.fieldType==='date'?'disabled':''}>${t('edit.ftype_text')}</button>
          <button type="button" class="ftype-btn${f.fieldType==='number'?' active':''}" data-ftype="number" onclick="setCardioFieldType(${idx},'number')" ${f.fieldType==='date'?'disabled':''}>${t('edit.ftype_number')}</button>
          <button type="button" class="ftype-btn${f.fieldType==='checkbox'?' active':''}" data-ftype="checkbox" onclick="setCardioFieldType(${idx},'checkbox')" ${f.fieldType==='date'?'disabled':''}>${t('edit.ftype_checkbox')}</button>
        </div>
      </div>
      ${f.fieldType === 'date' ? '' : `<button class="edit-remove" onclick="removeCardioEditField(${idx})">✕</button>`}`,
    collectItemFromRow: c => ({
      id:        c.dataset.id || '',
      label:     c.querySelector('.cardio-field-label-input').value,
      fieldType: c.querySelector('.field-type-picker .ftype-btn.active')?.dataset.ftype || 'text',
    }),
    buildSaveDoc: (types, templates) => {
      const templateData = { types };
      types.forEach(type => {
        templateData[type] = (templates[type] || []).filter(f => f.label.trim());
      });
      return templateData;
    },
```

`renderItemRow` reads `f.fieldType`/active-state directly from the field data at render time (not from a live DOM query, since the picker buttons themselves ARE the DOM at render time) — `collectItemFromRow` reads back whichever picker button currently has `.active`, which Step 3's `setCardioFieldType` toggles.

- [ ] **Step 2: Add the editor panel markup**

Add, immediately after `#sec-running`'s closing `</div>` (Task 3's new markup):

```html
<!-- ══ CARDIO TEMPLATE EDITOR (in-page panel, mirrors #mainEditPanel) ══ -->
<div id="cardioEditPanel" style="display:none;">
  <div id="cardioEditTabs" class="tab-row"></div>
  <div id="cardioAddTypeForm" class="add-type-form" style="display:none;">
    <input type="text" id="cardioNewTypeName" placeholder="${'שם סוג אימון'}">
    <button class="btn-primary" onclick="confirmAddCardioType()" data-i18n="edit.add_type_confirm">הוסף</button>
    <button class="btn-ghost" onclick="document.getElementById('cardioAddTypeForm').style.display='none'" data-i18n="btn.cancel">ביטול</button>
  </div>
  <div id="cardioEditListContainer"></div>
  <button class="btn-secondary" onclick="addCardioEditField()" data-i18n="edit.add_exercise">+ הוסף שדה</button>
  <button class="btn-primary" onclick="saveCardioTemplates()" data-i18n="edit.save">שמור שינויים</button>
</div>
```

- [ ] **Step 3: Implement the editor's open/close + tab-switch + add/remove-field + add/remove-type + save**

Add:

```js
// ─── CARDIO TEMPLATE EDITOR ─────────────────────────────────────
let cardioEditPanelOpen = false;

function _setCardioEditPanel(open) {
  if (open === cardioEditPanelOpen) return;
  cardioEditPanelOpen = open;
  document.getElementById('sec-running').style.display    = open ? 'none'  : '';
  document.getElementById('cardioEditPanel').style.display = open ? 'block' : 'none';
  if (open) renderCardioEditAll();
}

function openCardioEdit()  { showSection('running'); _setCardioEditPanel(true); }
function closeCardioEdit() { _setCardioEditPanel(false); showSection('settings'); }

function renderCardioEditTabs() {
  const canRemove = runningTypes.length > 1;
  document.getElementById('cardioEditTabs').innerHTML =
    runningTypes.map(type =>
      `<div class="tab-item${type===cardioEditTab?' active':''}">
        <button class="tab-btn" onclick="switchCardioEditTab('${escHtml(type)}')">
          <span class="count-pill">${(cardioEditTemplates[type]||[]).length}</span>
          ${escHtml(type)}
        </button>
        ${canRemove ? `<button class="tab-remove" onclick="removeCardioType('${escHtml(type)}')" title="✕">✕</button>` : ''}
      </div>`
    ).join('') +
    `<div class="tab-item add-tab-item"><button class="tab-btn add-tab-btn" onclick="document.getElementById('cardioAddTypeForm').style.display='flex';document.getElementById('cardioNewTypeName').focus();">+</button></div>`;
}

function renderCardioEditAll() {
  if (!runningTypes.includes(cardioEditTab)) cardioEditTab = runningTypes[0];
  renderCardioEditTabs();
  if (cardioEditTab) renderEditList('cardio', cardioEditTab);
  renderCardioTypeButtons();
}

function switchCardioEditTab(type) { collectEdits('cardio'); cardioEditTab = type; renderCardioEditTabs(); renderEditList('cardio', type); }

function addCardioEditField() {
  collectEdits('cardio');
  if (!cardioEditTemplates[cardioEditTab]) cardioEditTemplates[cardioEditTab] = [];
  cardioEditTemplates[cardioEditTab].push(WORKOUT_DOMAINS.cardio.newItem());
  renderCardioEditTabs();
  renderEditList('cardio', cardioEditTab);
  window.scrollTo(0, document.body.scrollHeight);
}

function removeCardioEditField(idx) {
  collectEdits('cardio');
  if (cardioEditTemplates[cardioEditTab][idx]?.fieldType === 'date') return; // date field is protected
  cardioEditTemplates[cardioEditTab].splice(idx, 1);
  renderCardioEditTabs();
  renderEditList('cardio', cardioEditTab);
}

function setCardioFieldType(idx, ftype) {
  const container = document.getElementById('cardioEditListContainer');
  const card = container.querySelectorAll('.edit-card')[idx];
  card.querySelectorAll('.ftype-btn').forEach(b => b.classList.toggle('active', b.dataset.ftype === ftype));
}

function confirmAddCardioType() {
  const val = document.getElementById('cardioNewTypeName').value.trim();
  if (!val) return;
  if (runningTypes.map(t => t.toLowerCase()).includes(val.toLowerCase())) { toast(t('edit.type_exists'), 'error'); return; }
  collectEdits('cardio');
  runningTypes.push(val);
  cardioEditTemplates[val] = CARDIO_MIGRATION_FIELD_MAP.map(f => ({ ...f })); // seed with the 8 default fields (spec §4.2)
  cardioEditTab = val;
  document.getElementById('cardioAddTypeForm').style.display = 'none';
  renderCardioEditAll();
  toast(t('edit.type_added'), 'success');
}

function removeCardioType(type) {
  if (runningTypes.length <= 1) { toast(t('edit.min_one_type'), 'error'); return; }
  collectEdits('cardio');
  runningTypes = runningTypes.filter(t => t !== type);
  delete cardioEditTemplates[type];
  if (cardioEditTab === type) cardioEditTab = runningTypes[0];
  renderCardioEditAll();
  toast(t('edit.type_removed'), 'success');
}

async function saveCardioTemplates() {
  collectEdits('cardio');
  const templateData = WORKOUT_DOMAINS.cardio.buildSaveDoc(runningTypes, cardioEditTemplates);
  const total = runningTypes.reduce((n, type) => n + (templateData[type]||[]).length, 0);
  if (!total) { toast(t('edit.no_items'), 'error'); return; }
  const btn = document.querySelector('#cardioEditPanel .btn-primary');
  if (btn) { btn.disabled = true; btn.innerText = t('saving'); }
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'runningTemplates'), templateData);
    toast(t('edit.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.innerText = t('edit.save'); }
}
```

`confirmAddCardioType` reuses `CARDIO_MIGRATION_FIELD_MAP` from Task 1 as the seed set — this is exactly the request's §4.2 default-8-fields requirement, and keeps the "what a fresh type looks like" definition in one place rather than duplicating the 8-field list a second time.

- [ ] **Step 4: Add the new i18n keys**

Hebrew:
```js
    'edit.field_label_ph': 'שם השדה',
    'edit.ftype_text':     'טקסט',
    'edit.ftype_number':   'מספר',
    'edit.ftype_checkbox': 'סימון',
```
English:
```js
    'edit.field_label_ph': 'Field name',
    'edit.ftype_text':     'Text',
    'edit.ftype_number':   'Number',
    'edit.ftype_checkbox': 'Checkbox',
```

- [ ] **Step 5: Run the full suite, manual smoke test**

Run: `npx playwright test`
Expected: strength suite unchanged. Manual: open the cardio editor (once Task 7 wires its settings entry point — until then, call `openCardioEdit()` from the devtools console for this task's manual check), add a type (confirm it seeds 8 fields including a locked date field), change a field's type via the picker, remove a non-date field, drag-reorder, save, confirm `saveCardioTemplates` writes correctly.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "feat(cardio): add the cardio template editor (type carousel, typed fields, drag-reorder)"
```

---

## Task 7: Settings — Remove the Gate, Add the Editor Nav Row

**Files:**
- Modify: `public/index.html:1226-1235` (gate row), `:1178-1180` (nav row insertion point), `:1395-1409` (`initSettingsUI`, `RUN_ALLOWED`)

**Interfaces:** none new — this task only changes visibility/gating and adds one settings nav row.

- [ ] **Step 1: Remove the email-allowlist gate**

**Router amendment:** since this plan was written, the unified-navigation-history plan landed and factored the inline `['eitan357@gmail.com', 'test@gmail.com']` array into a shared top-level constant, `RUNNING_ALLOWED_EMAILS` (declared once, elsewhere in the file), consumed here via a local alias. The "Find" block below reflects the current live-file content.

Find (`public/index.html`, `initSettingsUI`):

```js
function initSettingsUI() {
  _updateThemeBtns();
  document.getElementById('tv2SoundToggle').checked = _timerSoundOn;
  renderLangSelector();
  document.getElementById('displayNameInput').value = localStorage.getItem('displayName_' + (currentUser?.uid || '')) || '';

  // Running gate
  const RUN_ALLOWED = RUNNING_ALLOWED_EMAILS;
  const gateRow = document.getElementById('runningGateRow');
  if (gateRow) {
    gateRow.style.display = RUN_ALLOWED.includes(currentUser?.email) ? 'flex' : 'none';
    const tog = document.getElementById('runningEnabledToggle');
    if (tog) tog.checked = runningEnabled;
  }
}
```

replace with:

```js
function initSettingsUI() {
  _updateThemeBtns();
  document.getElementById('tv2SoundToggle').checked = _timerSoundOn;
  renderLangSelector();
  document.getElementById('displayNameInput').value = localStorage.getItem('displayName_' + (currentUser?.uid || '')) || '';

  const tog = document.getElementById('runningEnabledToggle');
  if (tog) tog.checked = runningEnabled;
}
```

The `runningGateRow` id-based `display:none` toggling is gone entirely — Step 2 removes the CSS `display:none` that hid it by default in markup, so the row is unconditionally visible.

- [ ] **Step 1b (router amendment — not in the original brief): neutralize the URL-level gate too**

The settings-row visibility gate above is only half the picture. The router work also added `_isRunningAllowed()`, a separate function that gates *direct/bookmarked navigation* to `/running` (called from boot-time route resolution and from `navigateTo` itself) — if left untouched, an ungated user could still get silently redirected away from `/running` even after Step 1-2 make the toggle visible to them. Find (`public/index.html`, near `loadRunData`):

```js
const RUNNING_ALLOWED_EMAILS = ['eitan357@gmail.com', 'test@gmail.com'];
```

Delete this line entirely (its only remaining reference after this step is inside `_isRunningAllowed`, fixed next — confirm via `grep -n "RUNNING_ALLOWED_EMAILS" public/index.html` that no other reference remains before deleting, and if one does, it means the live file drifted further than expected — stop and match what you actually find).

Then find `_isRunningAllowed`:

```js
// Re-checks the exact same gate initSettingsUI already applies (hard-coded
// email allow-list + the runningEnabled flag) so a direct/bookmarked
// /running URL can't show the section to a user it isn't meant for. This
// is UI convenience, not a security boundary — see docs/product/12-security-and-privacy.md.
function _isRunningAllowed() {
  return RUNNING_ALLOWED_EMAILS.includes(currentUser?.email) && runningEnabled === true;
}
```

replace with:

```js
// Now only checks the on/off toggle — the email allowlist this used to
// also check is gone (the cardio page is open to every user, spec §1).
// Kept as its own named function (not inlined at call sites) because
// boot-time route resolution and navigateTo() both call it.
function _isRunningAllowed() {
  return runningEnabled === true;
}
```

(Leave `navigateTo`'s and `initApp`'s own calls to `_isRunningAllowed()` untouched — they don't need to change, they just now get a different answer.)

- [ ] **Step 2: Make the toggle row unconditionally visible in markup**

Find (`public/index.html:1226`):

```html
      <div class="settings-row" id="runningGateRow" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:none;">
```

replace with:

```html
      <div class="settings-row" id="runningGateRow" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">
```

(`id="runningGateRow"` is kept even though nothing toggles it anymore — harmless, and Playwright specs may already select by this id.)

- [ ] **Step 3: Add the cardio-editor nav row, between the strength-editor row and the measurement-types row**

Find (`public/index.html:1178-1180`):

```html
      <span class="settings-item-arrow">›</span>
    </button>
    <button class="settings-item" onclick="openMeasurementsEdit()">
```

replace with:

```html
      <span class="settings-item-arrow">›</span>
    </button>
    <button class="settings-item" onclick="openCardioEdit()">
      <span class="settings-item-icon"><svg class="icon" style="width:28px;height:28px" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-pulse"/></svg></span>
      <div class="settings-item-text">
        <div class="settings-item-title" data-i18n="settings.cardio_edit">לעריכת תוכנית אימוני אירובי</div>
        <div class="settings-item-sub" data-i18n="settings.cardio_edit_sub">הוסף, הסר וערוך סוגי אימון ושדות</div>
      </div>
      <span class="settings-item-arrow">›</span>
    </button>
    <button class="settings-item" onclick="openMeasurementsEdit()">
```

- [ ] **Step 4: Add the two new i18n keys**

Hebrew:
```js
    'settings.cardio_edit':     'לעריכת תוכנית אימוני אירובי',
    'settings.cardio_edit_sub': 'הוסף, הסר וערוך סוגי אימון ושדות',
```
English:
```js
    'settings.cardio_edit':     'Edit Cardio Workout Plan',
    'settings.cardio_edit_sub': 'Add, remove, and edit workout types and fields',
```

- [ ] **Step 5: Run the full suite, update `tests/settings.spec.ts`**

Add to `tests/settings.spec.ts`:

```ts
  test('cardio toggle row is visible for every user, not gated by email', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#runningGateRow')).toBeVisible();
  });

  test('settings has a cardio template editor link under the strength one', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    const strengthRow = page.locator('.settings-item', { hasText: 'אימוני כוח' });
    const cardioRow   = page.locator('.settings-item', { hasText: 'אימוני אירובי' });
    await expect(cardioRow).toBeVisible();
    expect(await strengthRow.boundingBox()).toBeTruthy();
  });
```

Run: `npx playwright test tests/settings.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/translations.js tests/settings.spec.ts
git commit -m "feat(settings): open the cardio toggle to all users, add the cardio template editor link"
```

---

## Task 8: Delete Obsolete Wizard/OCR/Dashboard Code

**Files:**
- Modify: `public/index.html` — delete `runShowStep1/2/3`, `runSelectType`, `runHandleOcr`, `parseOcrText`, `translateTypeName`, `runShowDashboard`, `runShowAdd`, `runShowHistory`, `runGoBack`, `renderRunDashboard`, `runToggleHistoryRow`, `renderRunHistory` (superseded by Plan C's unified history view), and — router amendment, see Step 3b — `_renderRunState`/`_renderRunStep`/`_renderRunStep3Form` plus the `/running/add`/`/running/history` `ROUTES` entries and `_renderRoute`'s running-specific line. `runBackFromForm` and the old dedicated running `popstate` listener were already removed by the now-merged unified-navigation-history plan — nothing to do for those two, see Steps 2-3. `calcRunStreak`/`calcRunPRs`/`filterRunByRange`/`renderRunCharts`/`RUN_CHARTS_CONFIG`/`runSetRange` relocated, not deleted — moved verbatim into `2026-08-31-C-history-unification-and-cleanup.md`, do not delete their *logic*, only their current call sites/location — see Step 4.

**Interfaces:** none — deletion only.

- [ ] **Step 1: Delete the wizard + OCR functions**

Run: `grep -n "^function runShowStep\|^function runSelectType\|^async function runHandleOcr\|^function parseOcrText\|^function translateTypeName" public/index.html` to get current line numbers (Tasks 1-7 shifted them), then delete each function body in full, from its `function`/`async function` line through its matching closing `}`.

Also delete the Tesseract.js lazy-load `<script>`/dynamic-import code that `runHandleOcr` triggers — search `grep -n "tesseract" public/index.html -i` and remove every match's containing statement.

- [ ] **Step 2: Delete the dashboard + old sub-view navigation functions**

**Router amendment:** `runBackFromForm` no longer exists (the unified-navigation-history plan already deleted it when it landed) — skip it, it's not an error that it's missing. Delete `runShowDashboard`, `runShowAdd`, `runShowHistory`, `runGoBack`, `renderRunDashboard`, `runToggleHistoryRow`, `renderRunHistory` in full (all superseded by Task 3/4's new page or relocated to Plan C).

- [ ] **Step 3: The dedicated running `popstate` listener no longer exists — confirm, don't search for it**

**Router amendment:** this step originally targeted a dedicated `window.addEventListener('popstate', () => { if (currentSection === 'running') runShowDashboard(); });` block — the unified-navigation-history plan already removed it (running navigation now goes through the single unified `popstate` listener that plan installed). Run `grep -n "currentSection === 'running'" public/index.html` to confirm zero matches, then move on — nothing to delete here.

- [ ] **Step 3b (router amendment — not in the original brief): delete the router's now-dead running-specific rendering layer**

The unified-navigation-history plan added running-specific code to the router that this plan's new single-page cardio design has no use for (no sub-routes needed — the daily page behaves like strength's plain tab-switching). Delete, in full: `_renderRunState`, `_renderRunStep`, `_renderRunStep3Form` (search `grep -n "^function _renderRunState\|^function _renderRunStep\b\|^function _renderRunStep3Form" public/index.html`).

Then find the `ROUTES` table (`public/index.html`, near the `NAVIGATION`/`ROUTER` block) and simplify the running-related entries:

```js
  '/running':                    { section: 'running', runSubView: null },
```

replace with:

```js
  '/running':                    { section: 'running' },
```

and delete these two lines entirely:

```js
  '/running/add':                { section: 'running', runSubView: 'add', runStep: 1 },
  '/running/history':            { section: 'running', runSubView: 'history' },
```

Then find `_renderRoute` and delete its running-specific line:

```js
  if (state.section === 'running') _renderRunState(state.runSubView, state.runStep);
```

(Just delete this one line — the rest of `_renderRoute`'s body, handling `editPanel`/`measurementTypesPanel`, is untouched.)

**Leave `pushSubState` alone** — it's a generic router primitive (not running-specific), and even though this plan removes its only current caller, it's not this plan's job to delete shared router infrastructure it didn't create. Harmless unused code, not a regression risk.

- [ ] **Step 4: Cut (do not delete) the streak/PR/chart functions, hand off to Plan C**

`calcRunStreak`, `calcRunPRs`, `filterRunByRange`, `formatPace`, `calcPace`, `renderRunCharts`, `RUN_CHARTS_CONFIG`, `runSetRange` are **left in place, untouched, in this task** — Plan C's Task 1 relocates their call sites into the new History stats block and updates their data source (`runWorkouts` key lookups → `fields[]` label lookups, per spec §7). Deleting or half-editing them here would leave Plan C unable to cite accurate "before" code. Confirm with `grep -n "^function calcRunStreak\|^function calcRunPRs\|^function filterRunByRange\|^function renderRunCharts\|^const RUN_CHARTS_CONFIG\|^function runSetRange" public/index.html` that all six are still present and untouched after Steps 1-3.

- [ ] **Step 5: Remove now-dead entries from the `window` export block**

Find the `Object.assign(window, { ... })` block containing running exports (search `grep -n "runShowDashboard\|runShowAdd\|runShowHistory\|runShowStep1\|runSelectType\|runHandleOcr\|runSaveWorkout\|runGoBack\|runToggleHistoryRow" public/index.html` for its exact current location) and remove every deleted function's name from the list. Keep `runSetRange` (still live, per Step 4) and add the new Task 4/6 functions that need `window` exposure for their `onclick` attributes: `selectCardioType`, `copyLastCardioWorkout`, `clearCardioForm`, `addCustomCardioField`, `submitCardioData`, `openCardioEdit`, `closeCardioEdit`, `switchCardioEditTab`, `addCardioEditField`, `removeCardioEditField`, `setCardioFieldType`, `confirmAddCardioType`, `removeCardioType`, `saveCardioTemplates`.

- [ ] **Step 6: Confirm the file still parses and run the full suite**

Run: `node -e "require('fs').readFileSync('public/index.html','utf8')" && echo "file readable"`, then `npx playwright test`.
Expected: `file readable`; strength suite passes unchanged; cardio-related specs are addressed in Task 10 (this task's own deletions may cause currently-passing wizard/OCR/dashboard specs to fail — that's expected and resolved by Task 10's full `tests/running.spec.ts` rewrite, not by this task).

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "refactor(cardio): delete the wizard/OCR/old-dashboard code superseded by the new daily page"
```

---

## Task 9: Manual End-to-End Smoke Test

**Files:** none modified — verification-only task.

- [ ] **Step 1: Fresh-user flow**

In a browser, as a brand-new test account: open Settings, confirm the cardio toggle is visible (no allowlist gate), enable it, confirm the bottom nav swaps Measurements→Cardio, open Cardio, confirm it shows an empty state (no types yet — Task 5 Step 1's note), open the cardio editor via Settings, add a type, confirm it seeds the 8 default fields with a locked date field, save, return to Cardio, confirm the new type appears as a tab and its fields render with the right input types (number spinners, checkbox toggle, free-text date with auto-slash).

- [ ] **Step 2: Migrated-user flow**

As `eitan357@gmail.com` (or `test@gmail.com`) with pre-existing old-schema running data: log in, confirm `config/runningTemplates` now exists with `Running`/`Elliptical` types seeded from the old fixed fields, confirm old `runWorkouts` entries still show a sensible date/type (verified via the (temporary, pre-Plan-C) raw Firestore console — the History page itself doesn't render cardio yet, that's Plan C), confirm no console errors on load.

- [ ] **Step 3: Draft/copy-last/clear-form parity check**

Fill some cardio fields, switch types and back (confirm draft round-trip like strength), refresh mid-typing (confirm silent same-session restore), save a workout, copy-last-workout on the next entry, clear-form.

- [ ] **Step 4: Commit (only if Steps 1-3 required fixes)**

```bash
git add -A
git commit -m "fix: address issues found in cardio page manual smoke test"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** §3.1/§3.2 (data model) → Task 1. §3.4 (migration) → Task 1. §4 (`cardio` domain registration) → Task 2. §5 (daily page: type tabs, last-workout preview, copy/clear, session-name, dynamic fields, ad-hoc add-field, save) → Tasks 3-4. §6 (template editor: type carousel, drag-reorder, field-type picker, add-field, save-all) → Task 6. §6/§8 (settings nav row + gate removal) → Task 7. §9 (deletion inventory) → Task 8, with the streak/PR/charts hand-off to Plan C explicit in Task 8 Step 4 rather than silently dropped.
- **Type/name consistency check:** `WORKOUT_DOMAINS.cardio`'s keys (`serialize/applyToForm/hasFormData/qualifies` from Task 2; `templatesDoc/editListContainerId/editTabsId/typeRowId/entriesCollection` from Task 2; `newItem/renderItemRow/collectItemFromRow/buildSaveDoc` from Task 6) match exactly what Phase A's generic `renderEditList(domain,type)`/`collectEdits(domain)`/`WORKOUT_DOMAINS[domain].buildSaveDoc` expect — verified against Phase A's own Task 6/7 registry shape. `runningTypes`/`cardioSelectedType`/`cardioEditTab`/`cardioEditTemplates`/`allRunWorkouts`/`lastCardioWorkouts` are declared once (Task 2, Task 4 Step 1) and consumed consistently by name in every later task.
- **No placeholders:** every step contains complete, runnable code. The one deliberately-deferred item (default cardio type auto-seeding for brand-new users, Task 5 Step 1) is flagged as an explicit open question for the user, not left as a silent gap.
