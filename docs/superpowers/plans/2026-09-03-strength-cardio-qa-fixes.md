# Strength & Cardio QA Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 7 functional bugs and 3 accessibility gaps found in `qa-report-strength-cardio-2026-09-03.md` on the Strength and Cardio pages.

**Architecture:** All app code in `public/index.html` + `public/translations.js`, no new files except test updates. Each task is an independently-verifiable fix per `docs/superpowers/specs/2026-09-03-strength-cardio-qa-fixes-design.md`'s impact map — implement and verify one at a time, not all at once.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Auth/Firestore v12 (CDN), Playwright (real production account, no emulator for this project).

**Spec:** `docs/superpowers/specs/2026-09-03-strength-cardio-qa-fixes-design.md`

## Global Constraints

- All JS/HTML changes in `public/index.html` only, except `public/translations.js` (new keys), `tests/*.spec.ts`, `docs/product/*.md`.
- `escHtml()` must wrap every user-controlled string reaching `innerHTML` — all touched render sites already do this; preserve it in every edit.
- All new user-facing strings need both `he` and `en` entries in `translations.js` (standing project convention).
- No emulator exists for this project — live verification hits real production Firestore under `test@gmail.com`/`111111`. Any test data created during verification must be identified precisely and deleted, with deletion confirmed via a fresh reload, not just DOM state (per project convention — DOM-only "confirmed" claims have produced false positives before).
- Commit after every task.

---

## Task 1: H1 — Cardio Editor Deep-Link Race

**Files:** Modify `public/index.html` (`_setCardioEditPanel`, `:3811`)

- [ ] **Step 1: Make the function async and await the data promise**

Find:

```js
function _setCardioEditPanel(open) {
  if (open === cardioEditPanelOpen) return;
  cardioEditPanelOpen = open;
  document.getElementById('cardioMainContent').style.display = cardioEditPanelOpen ? 'none' : 'block';
  document.getElementById('cardioEditPanel').style.display   = cardioEditPanelOpen ? 'block' : 'none';
  document.getElementById('cardioBackBtn').style.display     = cardioEditPanelOpen ? '' : 'none';
  document.getElementById('cardioGearBtn').style.display     = cardioEditPanelOpen ? 'none' : '';
  if (cardioEditPanelOpen) document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  else document.getElementById('nav-running')?.classList.add('active');
  if (cardioEditPanelOpen) renderCardioEditAll();
}
```

replace with:

```js
async function _setCardioEditPanel(open) {
  if (open === cardioEditPanelOpen) return;
  cardioEditPanelOpen = open;
  document.getElementById('cardioMainContent').style.display = cardioEditPanelOpen ? 'none' : 'block';
  document.getElementById('cardioEditPanel').style.display   = cardioEditPanelOpen ? 'block' : 'none';
  document.getElementById('cardioBackBtn').style.display     = cardioEditPanelOpen ? '' : 'none';
  document.getElementById('cardioGearBtn').style.display     = cardioEditPanelOpen ? 'none' : '';
  if (cardioEditPanelOpen) document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  else document.getElementById('nav-running')?.classList.add('active');
  if (cardioEditPanelOpen) {
    // On a fresh boot straight into this route (deep link / refresh / new
    // tab), runningTypes/cardioEditTemplates are still empty until
    // loadRunData()'s async fetch resolves — without this await the panel
    // renders with zero tabs/fields and never self-corrects once the data
    // does arrive. Mirrors switchHistoryDomain's identical guard.
    if (!_runDataPromise) _runDataPromise = loadRunData();
    await _runDataPromise;
    if (!cardioEditPanelOpen) return; // closed again while we were waiting
    renderCardioEditAll();
  }
}
```

- [ ] **Step 2: Verify callers tolerate the function becoming async**

Run: `grep -n "_setCardioEditPanel(" public/index.html`
Expected: two call sites — `_renderRoute` (`:2446`) and `saveCardioTemplates`-adjacent close logic if any. Neither needs to change: a fire-and-forget call to an async function is valid JS: the caller doesn't await, and the function's body still runs to completion and updates the DOM once `_runDataPromise` resolves.

- [ ] **Step 3: Manual verification**

Log in, enable cardio (Settings → "Show Cardio Page" if not already on), then in a **fresh tab** navigate directly to `https://training-diary.web.app/settings/cardio-plan` (paste the URL, don't click there from within the app). Confirm: the panel shows a loading gap of at most ~1s and then renders both type tabs and their fields — not permanently empty. Then do the same test via a hard refresh (F5) while already on that route.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): await run data before rendering the template editor on boot"
```

---

## Task 2: H2 — Cardio Field Label Translation

**Files:** Modify `public/index.html` (`renderCardioFieldRow`, `:1728`), `public/translations.js`

- [ ] **Step 1: Add the 8 translation key pairs**

In `public/translations.js`, Hebrew block, add near the existing cardio keys:

```js
    'cardio.field.date':        'תאריך',
    'cardio.field.distance':    'מרחק',
    'cardio.field.duration':    'זמן',
    'cardio.field.calories':    'קלוריות',
    'cardio.field.spm':         'צעדים',
    'cardio.field.heart_rate':  'דופק ממוצע',
    'cardio.field.felt_tired':  'הרגשתי עייפות',
    'cardio.field.notes':       'הערות',
```

English block:

```js
    'cardio.field.date':        'Date',
    'cardio.field.distance':    'Distance',
    'cardio.field.duration':    'Duration',
    'cardio.field.calories':    'Calories',
    'cardio.field.spm':         'Steps',
    'cardio.field.heart_rate':  'Avg. Heart Rate',
    'cardio.field.felt_tired':  'Felt Tired',
    'cardio.field.notes':       'Notes',
```

- [ ] **Step 2: Add the lookup map and helper, before `renderCardioFieldRow`**

Find (`public/index.html`, immediately before `function renderCardioFieldRow(field, value) {`):

```js
function renderCardioFieldRow(field, value) {
```

replace with:

```js
// Default cardio field ids → translation key, for the 8 fields every
// account is seeded with (migration or fresh-type creation both use
// CARDIO_MIGRATION_FIELD_MAP). Only applied when the stored label still
// matches the untouched default — a user rename must never be silently
// overwritten by a translation.
const CARDIO_FIELD_LABEL_KEYS = {
  date:              'cardio.field.date',
  distanceKm:        'cardio.field.distance',
  durationMinutes:   'cardio.field.duration',
  calories:          'cardio.field.calories',
  avgStridesPerMin:  'cardio.field.spm',
  avgHeartRate:      'cardio.field.heart_rate',
  feltTired:         'cardio.field.felt_tired',
  notes:             'cardio.field.notes',
};

function cardioFieldDisplayLabel(field) {
  const key = CARDIO_FIELD_LABEL_KEYS[field.id];
  if (!key) return field.label; // custom/ad-hoc field — never translated
  const original = CARDIO_MIGRATION_FIELD_MAP.find(f => f.id === field.id)?.label;
  if (field.label !== original) return field.label; // user renamed it — respect their text
  return t(key);
}

function renderCardioFieldRow(field, value) {
```

- [ ] **Step 3: Use the helper in the label**

Find:

```js
  return `<div class="run-form-field cardio-field-row" data-id="${escHtml(field.id)}" data-label="${escHtml(field.label)}" data-field-type="${escHtml(field.fieldType)}">
    <label class="run-form-label">${escHtml(field.label)}</label>
    ${inputHtml}
  </div>`;
```

replace with:

```js
  return `<div class="run-form-field cardio-field-row" data-id="${escHtml(field.id)}" data-label="${escHtml(field.label)}" data-field-type="${escHtml(field.fieldType)}">
    <label class="run-form-label">${escHtml(cardioFieldDisplayLabel(field))}</label>
    ${inputHtml}
  </div>`;
```

Note: `CARDIO_MIGRATION_FIELD_MAP` is defined later in the file (`:2861`) than `renderCardioFieldRow` (`:1728`) — this is fine, both are top-level function/const declarations in the same module scope and `cardioFieldDisplayLabel` only reads `CARDIO_MIGRATION_FIELD_MAP` at call time (long after the whole script has parsed), not at definition time.

- [ ] **Step 4: Manual verification**

Switch language to English in Settings, go to Cardio. Confirm all 8 default field labels now show in English (Distance, Duration, Calories, Steps, Avg. Heart Rate, Felt Tired, Notes, Date). Switch back to Hebrew, confirm they show in Hebrew again. Then open Settings → cardio template editor, rename "מרחק" to "Km today" and save; back on the Cardio page confirm the field now shows "Km today" **in both languages** (a rename must not be translated).

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "fix(cardio): translate default field labels without overriding user renames"
```

---

## Task 3: H3 — Ad-Hoc Strength Exercise Gets a Name Input

**Files:** Modify `public/index.html` (`makeExCard` `:3203`, `addCustomExercise` `:3244`, 4 `.ex-name-text` reader sites: `:2475`, `:2498`, `:3258`, `:4357`), `public/translations.js`

- [ ] **Step 1: Add a shared reader helper**

Find (immediately before `function makeExCard(name, targetWeight, targetSets, targetReps, legacyTarget) {`):

```js
function makeExCard(name, targetWeight, targetSets, targetReps, legacyTarget) {
```

replace with:

```js
// Reads an exercise card's name whether it's the static, non-editable
// <div> (a real template exercise) or the editable <input> (an ad-hoc
// exercise added via "+ Add Exercise" — see makeExCard's isAdhoc branch).
// A <div> has no .value (undefined, falls through to .innerText); an
// <input> has no meaningful .innerText but always has .value, even ''.
function _readExName(card) {
  const el = card.querySelector('.ex-name-text');
  return (el?.value ?? el?.innerText ?? '').trim();
}

function makeExCard(name, targetWeight, targetSets, targetReps, legacyTarget) {
```

- [ ] **Step 2: Render an editable input for the ad-hoc case**

Find:

```js
  return `
  <div class="card" id="card_${id}">
    <div class="card-body">
      <div class="ex-name-row">
        <div class="ex-name-text">${escHtml(name)}</div>
        <button class="remove-btn" onclick="document.getElementById('card_${id}').remove()">✕</button>
      </div>
```

replace with:

```js
  const isAdhoc = !name;
  return `
  <div class="card" id="card_${id}">
    <div class="card-body">
      <div class="ex-name-row">
        ${isAdhoc
          ? `<input type="text" class="ex-name-text ex-name-input" placeholder="${t('edit.ex_name_ph')}" autocomplete="off">`
          : `<div class="ex-name-text">${escHtml(name)}</div>`}
        <button class="remove-btn" onclick="document.getElementById('card_${id}').remove()">✕</button>
      </div>
```

- [ ] **Step 3: Add matching input styling**

Find (CSS, near `.ex-name-text`):

```css
    .ex-name-text   { font-size: 15px; font-weight: 700; color: var(--text); }
```

replace with:

```css
    .ex-name-text   { font-size: 15px; font-weight: 700; color: var(--text); }
    input.ex-name-input {
      border: 1.5px solid var(--border); border-radius: 8px; padding: 6px 8px;
      background: var(--bg); font-family: inherit; flex: 1; min-width: 0;
    }
    input.ex-name-input:focus { outline: none; border-color: var(--primary); background: var(--surface); }
```

- [ ] **Step 4: Update the 4 reader sites to use the helper**

Run: `grep -n "ex-name-text" public/index.html` and confirm the 4 non-CSS/non-render occurrences at (approximately) `:2475`, `:2498`, `:3258`, `:4357`. At each, replace the pattern `card.querySelector('.ex-name-text')?.innerText?.trim()` (or the `:3258` variant without `?.trim()`) with `_readExName(card)`. Concretely:

At `:2475` find:
```js
      name:   card.querySelector('.ex-name-text')?.innerText?.trim()   || '',
```
replace:
```js
      name:   _readExName(card),
```

At `:2498` find:
```js
    const name = card.querySelector('.ex-name-text')?.innerText?.trim();
```
replace:
```js
    const name = _readExName(card);
```

At `:3258` (inside `submitData()`) find:
```js
      name:   card.querySelector('.ex-name-text')?.innerText  || '',
```
replace:
```js
      name:   _readExName(card),
```

At `:4357` (inside `copyLastWorkout()`) find:
```js
    const name   = card.querySelector('.ex-name-text')?.innerText?.trim();
```
replace:
```js
    const name   = _readExName(card);
```

- [ ] **Step 5: Block saving an ad-hoc exercise with data but no name**

Find, inside `submitData()` (the loop that builds the `exercises` array, `:3252-3263` per the spec's line reference):

```js
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    const w = card.querySelector('.ex-weight').value;
    const s = card.querySelector('.ex-sets').value;
    const r = card.querySelector('.ex-reps').value;
    if (w || s || r) exercises.push({
      id:     genId(),
      name:   _readExName(card),
      target: card.querySelector('.ex-target-text')?.innerText || '',
      weight: w, sets: s, reps: r,
      notes:  card.querySelector('.ex-notes').value
    });
  });
  if (!exercises.length) { toast(t('workout.fill_first'), 'error'); return; }
```

replace with:

```js
  let hasUnnamedData = false;
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    const w = card.querySelector('.ex-weight').value;
    const s = card.querySelector('.ex-sets').value;
    const r = card.querySelector('.ex-reps').value;
    if (!(w || s || r)) return;
    const name = _readExName(card);
    if (!name) { hasUnnamedData = true; return; }
    exercises.push({
      id:     genId(),
      name,
      target: card.querySelector('.ex-target-text')?.innerText || '',
      weight: w, sets: s, reps: r,
      notes:  card.querySelector('.ex-notes').value
    });
  });
  if (hasUnnamedData) { toast(t('workout.name_required'), 'error'); return; }
  if (!exercises.length) { toast(t('workout.fill_first'), 'error'); return; }
```

- [ ] **Step 6: Add the new translation key**

`public/translations.js`, Hebrew: `'workout.name_required': 'יש להזין שם לתרגיל שהוזנו לו נתונים',` — English: `'workout.name_required': 'Enter a name for the exercise you filled in',`.

- [ ] **Step 7: Manual verification**

Go to Strength, click "+ הוסף תרגיל". Confirm an editable, empty, focusable text input appears where the name used to be static. Type nothing, fill in weight only, save → confirm a clear error toast, no save happens. Now type a name, fill weight, save → confirm it saves correctly and shows the typed name in History (not blank, not showing Notes text in its place).

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "fix(strength): ad-hoc exercise gets an editable name field, required to save"
```

---

## Task 4: M3 — Ad-Hoc Cardio Field Gets a Renamable Label

**Files:** Modify `public/index.html` (`renderCardioFieldRow` `:1728`, `addCustomCardioField` `:1821`, `submitCardioData` `:1828`)

- [ ] **Step 1: Add an `isAdhoc` parameter and render an input for it**

Find:

```js
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
    <label class="run-form-label">${escHtml(cardioFieldDisplayLabel(field))}</label>
    ${inputHtml}
  </div>`;
}
```

replace with:

```js
function renderCardioFieldRow(field, value, isAdhoc) {
  const val = value ?? '';
  let inputHtml;
  if (field.fieldType === 'date') {
    inputHtml = `<input type="text" class="cardio-field-input" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" value="${escHtml(String(val))}">`;
  } else if (field.fieldType === 'number') {
    inputHtml = `<input type="number" class="cardio-field-input" step="any" min="0" value="${escHtml(String(val))}" placeholder="--">`;
  } else if (field.fieldType === 'checkbox') {
    inputHtml = `<label class="toggle-switch"><input type="checkbox" class="cardio-field-input" aria-label="${escHtml(cardioFieldDisplayLabel(field))}"${val ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  } else {
    inputHtml = `<input type="text" class="cardio-field-input" value="${escHtml(String(val))}" placeholder="--">`;
  }
  const labelHtml = isAdhoc
    ? `<input type="text" class="run-form-label run-form-label-input" placeholder="${t('edit.field_label_ph')}" oninput="this.closest('.cardio-field-row').dataset.label=this.value">`
    : `<label class="run-form-label">${escHtml(cardioFieldDisplayLabel(field))}</label>`;
  return `<div class="run-form-field cardio-field-row" data-id="${escHtml(field.id)}" data-label="${escHtml(field.label)}" data-field-type="${escHtml(field.fieldType)}">
    ${labelHtml}
    ${inputHtml}
  </div>`;
}
```

Note: `min="0"` and the checkbox `aria-label` are added here too — folded into this same edit since they touch the identical lines M4 and A11y-2 also need (see Tasks 6 and 8's manual-verification steps, which re-check these specific attributes rather than re-editing already-correct lines).

- [ ] **Step 2: Pass `isAdhoc: true` and an empty label from `addCustomCardioField`**

Find:

```js
function addCustomCardioField() {
  const id = 'adhoc_' + genId();
  document.getElementById('cardioFieldList').insertAdjacentHTML('beforeend',
    renderCardioFieldRow({ id, label: t('cardio.new_field_default_label'), fieldType: 'text' }, ''));
  window.scrollTo(0, document.body.scrollHeight);
}
```

replace with:

```js
function addCustomCardioField() {
  const id = 'adhoc_' + genId();
  document.getElementById('cardioFieldList').insertAdjacentHTML('beforeend',
    renderCardioFieldRow({ id, label: '', fieldType: 'text' }, '', true));
  window.scrollTo(0, document.body.scrollHeight);
}
```

- [ ] **Step 3: Block saving an ad-hoc field with data but no label**

Find, inside `submitCardioData()`:

```js
  const fields = [];
  document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
    const ft = row.dataset.fieldType;
    const input = row.querySelector('.cardio-field-input');
    let value = ft === 'checkbox' ? input.checked : input.value.trim();
    if (ft !== 'checkbox' && value === '') return; // skip empty non-checkbox fields, same convention as saveMeasurement
    fields.push({ id: row.dataset.id, label: row.dataset.label, fieldType: ft, value });
  });
```

replace with:

```js
  const fields = [];
  let hasUnnamedField = false;
  document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
    const ft = row.dataset.fieldType;
    const input = row.querySelector('.cardio-field-input');
    let value = ft === 'checkbox' ? input.checked : input.value.trim();
    if (ft !== 'checkbox' && value === '') return; // skip empty non-checkbox fields, same convention as saveMeasurement
    if (!row.dataset.label.trim()) { hasUnnamedField = true; return; }
    fields.push({ id: row.dataset.id, label: row.dataset.label, fieldType: ft, value });
  });
  if (hasUnnamedField) { toast(t('workout.name_required'), 'error'); return; }
```

(Reuses the `workout.name_required` key added in Task 3 — same message fits both domains.)

- [ ] **Step 4: Manual verification**

Go to Cardio, click "+ Add Field". Confirm an empty, editable label input appears (not "New Field" static text). Type a custom name, e.g. "Elevation", fill in a value, save → confirm it saves and the field shows "Elevation" in History. Add another ad-hoc field, fill a value, leave the label blank, try to save → confirm a clear error toast, no save happens.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): ad-hoc field label is editable and required to save"
```

---

## Task 5: M1 — Legacy Target Parsing Fills Sets

**Files:** Modify `public/index.html` (`parseTargetString` `:2139`, `copyTargetToCard` `:4304`)

- [ ] **Step 1: Return a sets count from `parseTargetString`**

Find:

```js
  if (!weight && !repsArr) return null;
  return { weight, reps: repsArr ? repsArr.join(',') : null };
}
```

replace with:

```js
  if (!weight && !repsArr) return null;
  // repsArr already has exactly one entry per set in every branch above
  // (that's what "expanding" a rep range across N sets means) — its own
  // length is the sets count, nothing new to parse.
  return { weight, sets: repsArr ? String(repsArr.length) : null, reps: repsArr ? repsArr.join(',') : null };
}
```

- [ ] **Step 2: Fill `.ex-sets` in the legacy branch of `copyTargetToCard`**

Find:

```js
  } else {
    const lt = tEl?.dataset.legacy?.trim();
    if (!lt) { toast(t('target.not_set'), 'error'); return; }
    const parsed = parseTargetString(lt);
    if (!parsed) { toast(t('target.parse_error'), 'error'); return; }
    const weightInput = cardEl.querySelector('.ex-weight');
    const repsInput   = cardEl.querySelector('.ex-reps');
    const hasData     = weightInput.value.trim() || repsInput.value.trim();
    if (hasData && !confirm(t('target.overwrite_confirm'))) return;
    if (parsed.weight !== null) weightInput.value = parsed.weight;
    if (parsed.reps   !== null) repsInput.value   = parsed.reps;
    if (parsed.weight === null && parsed.reps === null) {
      toast(t('target.parse_error'), 'error');
    } else {
      _draftOnInput('strength');
    }
  }
```

replace with:

```js
  } else {
    const lt = tEl?.dataset.legacy?.trim();
    if (!lt) { toast(t('target.not_set'), 'error'); return; }
    const parsed = parseTargetString(lt);
    if (!parsed) { toast(t('target.parse_error'), 'error'); return; }
    const weightInput = cardEl.querySelector('.ex-weight');
    const setsInput   = cardEl.querySelector('.ex-sets');
    const repsInput   = cardEl.querySelector('.ex-reps');
    const hasData     = weightInput.value.trim() || setsInput.value.trim() || repsInput.value.trim();
    if (hasData && !confirm(t('target.overwrite_confirm'))) return;
    if (parsed.weight !== null) weightInput.value = parsed.weight;
    if (parsed.sets   !== null) setsInput.value   = parsed.sets;
    if (parsed.reps   !== null) repsInput.value   = parsed.reps;
    if (parsed.weight === null && parsed.reps === null) {
      toast(t('target.parse_error'), 'error');
    } else {
      _draftOnInput('strength');
    }
  }
```

- [ ] **Step 3: Run the existing pure-logic parser test**

Run: `node scripts/test-parse-target.js`
Expected: still passes — this task adds a new return field (`sets`) but doesn't change `weight`/`reps` computation, so no existing assertion in that script should break. If the script doesn't already assert on `sets`, that's fine — Task 9 adds Playwright coverage for the live-UI behavior instead.

- [ ] **Step 4: Manual verification**

Go to Strength, find or create an exercise with a legacy free-text target (an old exercise, or manually check one via the template editor's legacy-target display). Tap its target pill. Confirm Weight, Sets, **and Reps** all fill in — not just Weight and Reps.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "fix(strength): legacy target-pill tap now fills the Sets field too"
```

---

## Task 6: M2 — Strength Weight/Sets/Reps Validation

**Files:** Modify `public/index.html` (`submitData()` `:3249`), `public/translations.js`

- [ ] **Step 1: Add the two validation helpers**

Find (immediately before `async function submitData() {`):

```js
async function submitData() {
```

replace with:

```js
// Weight/sets/reps are intentionally free text (bilateral "14+14",
// per-set "6,6,6,6"), so validation only rejects the clearly-wrong
// patterns QA actually reproduced — not a blanket numeric-only rule that
// would break those documented formats.
function _hasNoDigits(str) { return !/\d/.test(str); }
function _hasNegativeToken(str) {
  return str.split(/[,+]/).some(tok => {
    const n = parseFloat(tok.trim());
    return !isNaN(n) && n < 0;
  });
}

async function submitData() {
```

- [ ] **Step 2: Validate each card's weight/sets/reps before pushing**

Find, inside `submitData()` (the same block Task 3 Step 5 already modified — apply this on top of that result):

```js
  let hasUnnamedData = false;
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    const w = card.querySelector('.ex-weight').value;
    const s = card.querySelector('.ex-sets').value;
    const r = card.querySelector('.ex-reps').value;
    if (!(w || s || r)) return;
    const name = _readExName(card);
    if (!name) { hasUnnamedData = true; return; }
    exercises.push({
      id:     genId(),
      name,
      target: card.querySelector('.ex-target-text')?.innerText || '',
      weight: w, sets: s, reps: r,
      notes:  card.querySelector('.ex-notes').value
    });
  });
  if (hasUnnamedData) { toast(t('workout.name_required'), 'error'); return; }
  if (!exercises.length) { toast(t('workout.fill_first'), 'error'); return; }
```

replace with:

```js
  let hasUnnamedData = false;
  let hasInvalidData = false;
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    const w = card.querySelector('.ex-weight').value;
    const s = card.querySelector('.ex-sets').value;
    const r = card.querySelector('.ex-reps').value;
    if (!(w || s || r)) return;
    const name = _readExName(card);
    if (!name) { hasUnnamedData = true; return; }
    if ((w && (_hasNoDigits(w) || _hasNegativeToken(w))) ||
        (s && _hasNegativeToken(s)) ||
        (r && _hasNegativeToken(r))) { hasInvalidData = true; return; }
    exercises.push({
      id:     genId(),
      name,
      target: card.querySelector('.ex-target-text')?.innerText || '',
      weight: w, sets: s, reps: r,
      notes:  card.querySelector('.ex-notes').value
    });
  });
  if (hasUnnamedData) { toast(t('workout.name_required'), 'error'); return; }
  if (hasInvalidData) { toast(t('workout.invalid_values'), 'error'); return; }
  if (!exercises.length) { toast(t('workout.fill_first'), 'error'); return; }
```

- [ ] **Step 3: Add the new translation key**

`public/translations.js`, Hebrew: `'workout.invalid_values': 'משקל/סטים/חזרות מכילים ערך לא תקין (מספר שלילי או משקל ללא ספרות)',` — English: `'workout.invalid_values': 'Weight/sets/reps contain an invalid value (negative number or non-numeric weight)',`.

- [ ] **Step 4: Manual verification**

Go to Strength, fill an exercise: weight `abc`, sets `-3`, reps `99999999`, save. Confirm a clear error toast, no save happens. Now fix weight to `60`, sets to `3`, save → confirm it saves normally. Separately test that legitimate formats still work: weight `14+14` (bilateral), reps `6,6,6,6` (per-set) — confirm both save without error.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "fix(strength): reject non-numeric weight and negative sets/reps on save"
```

---

## Task 7: M4 — Cardio Numeric Field Validation

**Files:** Modify `public/index.html` (`submitCardioData()` `:1828`), `public/translations.js`

(The `min="0"` HTML attribute was already added in Task 4 Step 1 — this task adds the actual enforcement, since `min` alone doesn't block a JS-driven save with no constraint-validation call.)

- [ ] **Step 1: Reject negative numeric values on save**

Find, inside `submitCardioData()` (building on Task 4 Step 3's result):

```js
  const fields = [];
  let hasUnnamedField = false;
  document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
    const ft = row.dataset.fieldType;
    const input = row.querySelector('.cardio-field-input');
    let value = ft === 'checkbox' ? input.checked : input.value.trim();
    if (ft !== 'checkbox' && value === '') return; // skip empty non-checkbox fields, same convention as saveMeasurement
    if (!row.dataset.label.trim()) { hasUnnamedField = true; return; }
    fields.push({ id: row.dataset.id, label: row.dataset.label, fieldType: ft, value });
  });
  if (hasUnnamedField) { toast(t('workout.name_required'), 'error'); return; }
```

replace with:

```js
  const fields = [];
  let hasUnnamedField  = false;
  let hasNegativeValue = false;
  document.querySelectorAll('#cardioFieldList .cardio-field-row').forEach(row => {
    const ft = row.dataset.fieldType;
    const input = row.querySelector('.cardio-field-input');
    let value = ft === 'checkbox' ? input.checked : input.value.trim();
    if (ft !== 'checkbox' && value === '') return; // skip empty non-checkbox fields, same convention as saveMeasurement
    if (!row.dataset.label.trim()) { hasUnnamedField = true; return; }
    if (ft === 'number' && Number(value) < 0) { hasNegativeValue = true; return; }
    fields.push({ id: row.dataset.id, label: row.dataset.label, fieldType: ft, value });
  });
  if (hasUnnamedField)  { toast(t('workout.name_required'), 'error'); return; }
  if (hasNegativeValue) { toast(t('cardio.negative_value'), 'error'); return; }
```

- [ ] **Step 2: Add the new translation key**

`public/translations.js`, Hebrew: `'cardio.negative_value': 'ערכים מספריים לא יכולים להיות שליליים',` — English: `'cardio.negative_value': 'Numeric values cannot be negative',`.

- [ ] **Step 3: Manual verification**

Go to Cardio, set Distance to `-5`, fill Date, save. Confirm a clear error toast, no save happens. Fix to a positive value, save → confirm it saves normally.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "fix(cardio): reject negative numeric field values on save"
```

---

## Task 8: A11y-1 — Keyboard-Reachable Target Pill

**Files:** Modify `public/index.html` (`makeExCard` `:3203`)

- [ ] **Step 1: Add role/tabindex/keydown to both pill variants**

Find:

```js
      ${hasTarget ? `
      <div class="ex-target-row">
        <div class="ex-target-text ex-target-clickable"
             data-label="${escHtml(t('col.target'))}"
             data-tw="${escHtml(tw)}" data-ts="${escHtml(ts)}" data-tr="${escHtml(tr)}"
             onclick="copyTargetToCard(this.closest('.card'))"
             title="${t('target.copy_hint')}">${escHtml(pillText)}</div>
      </div>` : lt ? `
      <div class="ex-target-row">
        <div class="ex-target-text ex-target-legacy ex-target-clickable"
             data-legacy="${escHtml(lt)}"
             onclick="copyTargetToCard(this.closest('.card'))"
             title="${t('target.copy_hint')}">${escHtml(lt)}</div>
      </div>` : ''}
```

replace with:

```js
      ${hasTarget ? `
      <div class="ex-target-row">
        <div class="ex-target-text ex-target-clickable"
             role="button" tabindex="0"
             data-label="${escHtml(t('col.target'))}"
             data-tw="${escHtml(tw)}" data-ts="${escHtml(ts)}" data-tr="${escHtml(tr)}"
             onclick="copyTargetToCard(this.closest('.card'))"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();copyTargetToCard(this.closest('.card'));}"
             title="${t('target.copy_hint')}">${escHtml(pillText)}</div>
      </div>` : lt ? `
      <div class="ex-target-row">
        <div class="ex-target-text ex-target-legacy ex-target-clickable"
             role="button" tabindex="0"
             data-legacy="${escHtml(lt)}"
             onclick="copyTargetToCard(this.closest('.card'))"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();copyTargetToCard(this.closest('.card'));}"
             title="${t('target.copy_hint')}">${escHtml(lt)}</div>
      </div>` : ''}
```

- [ ] **Step 2: Manual verification**

Go to Strength, Tab through the page with the keyboard until focus reaches a target pill (visible focus outline should appear). Press Enter → confirm it copies the target values, same as a click. Press Space on another pill → confirm the same, and confirm the page doesn't scroll when Space is pressed (the `preventDefault()` guard).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(a11y): make the strength target pill keyboard-operable"
```

---

## Task 9: A11y-2 — Cardio Field Label/Checkbox Association

**Files:** Modify `public/index.html` (`renderCardioFieldRow` `:1728`, already touched by Task 4 — apply on top of that result)

- [ ] **Step 1: Add id/for pairing and confirm the checkbox aria-label from Task 4 is in place**

Find (the version after Task 4's edit):

```js
function renderCardioFieldRow(field, value, isAdhoc) {
  const val = value ?? '';
  let inputHtml;
  if (field.fieldType === 'date') {
    inputHtml = `<input type="text" class="cardio-field-input" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" value="${escHtml(String(val))}">`;
  } else if (field.fieldType === 'number') {
    inputHtml = `<input type="number" class="cardio-field-input" step="any" min="0" value="${escHtml(String(val))}" placeholder="--">`;
  } else if (field.fieldType === 'checkbox') {
    inputHtml = `<label class="toggle-switch"><input type="checkbox" class="cardio-field-input" aria-label="${escHtml(cardioFieldDisplayLabel(field))}"${val ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  } else {
    inputHtml = `<input type="text" class="cardio-field-input" value="${escHtml(String(val))}" placeholder="--">`;
  }
  const labelHtml = isAdhoc
    ? `<input type="text" class="run-form-label run-form-label-input" placeholder="${t('edit.field_label_ph')}" oninput="this.closest('.cardio-field-row').dataset.label=this.value">`
    : `<label class="run-form-label">${escHtml(cardioFieldDisplayLabel(field))}</label>`;
  return `<div class="run-form-field cardio-field-row" data-id="${escHtml(field.id)}" data-label="${escHtml(field.label)}" data-field-type="${escHtml(field.fieldType)}">
    ${labelHtml}
    ${inputHtml}
  </div>`;
}
```

replace with:

```js
function renderCardioFieldRow(field, value, isAdhoc) {
  const val = value ?? '';
  const inputId = `cardio-field-${field.id}`;
  let inputHtml;
  if (field.fieldType === 'date') {
    inputHtml = `<input type="text" id="${escHtml(inputId)}" class="cardio-field-input" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" value="${escHtml(String(val))}">`;
  } else if (field.fieldType === 'number') {
    inputHtml = `<input type="number" id="${escHtml(inputId)}" class="cardio-field-input" step="any" min="0" value="${escHtml(String(val))}" placeholder="--">`;
  } else if (field.fieldType === 'checkbox') {
    inputHtml = `<label class="toggle-switch"><input type="checkbox" id="${escHtml(inputId)}" class="cardio-field-input" aria-label="${escHtml(cardioFieldDisplayLabel(field))}"${val ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  } else {
    inputHtml = `<input type="text" id="${escHtml(inputId)}" class="cardio-field-input" value="${escHtml(String(val))}" placeholder="--">`;
  }
  const labelHtml = isAdhoc
    ? `<input type="text" class="run-form-label run-form-label-input" placeholder="${t('edit.field_label_ph')}" oninput="this.closest('.cardio-field-row').dataset.label=this.value">`
    : `<label class="run-form-label" for="${escHtml(inputId)}">${escHtml(cardioFieldDisplayLabel(field))}</label>`;
  return `<div class="run-form-field cardio-field-row" data-id="${escHtml(field.id)}" data-label="${escHtml(field.label)}" data-field-type="${escHtml(field.fieldType)}">
    ${labelHtml}
    ${inputHtml}
  </div>`;
}
```

Note: the ad-hoc case's `labelHtml` stays an `<input>` (not a `<label>`) since it's the editable name field itself, not a label pointing at something else — no `for`/`id` pairing is meaningful there, matching the same reasoning as Task 3/4's editable-name inputs.

- [ ] **Step 2: Manual verification**

Go to Cardio with a screen reader (or Chrome DevTools' Accessibility pane), inspect the "מרחק"/"Distance" label and its input — confirm the Accessibility tree shows the input's accessible name as "Distance" (from the `for`/`id` pairing), not blank. Inspect the "הרגשתי עייפות"/"Felt Tired" checkbox specifically — confirm its accessible name is "Felt Tired", not just "checkbox".

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(a11y): associate cardio field labels with their inputs, name the checkbox"
```

---

## Task 10: A11y-3 — Strength Weight/Sets/Reps Label Association

**Files:** Modify `public/index.html` (`makeExCard` `:3203`)

- [ ] **Step 1: Add per-card ids and matching `for` attributes**

Find:

```js
      <div class="field-group">
        <div class="field"><label data-i18n="col.weight">${t('col.weight')}</label><input type="text" class="ex-weight" placeholder="—" autocomplete="off"></div>
        <div class="field"><label data-i18n="col.sets">${t('col.sets')}</label><input type="text" class="ex-sets"   placeholder="—" autocomplete="off"></div>
        <div class="field"><label data-i18n="col.reps">${t('col.reps')}</label><input type="text" class="ex-reps"  placeholder="—" autocomplete="off"></div>
      </div>
      <div class="field-group field-notes" style="margin-top:8px;">
        <div class="field" style="flex:1;"><label data-i18n="col.notes">${t('col.notes')}</label><input type="text" class="ex-notes" data-i18n-ph="ex.notes_ph" placeholder="${t('ex.notes_ph')}"></div>
      </div>
```

replace with:

```js
      <div class="field-group">
        <div class="field"><label data-i18n="col.weight" for="ex-weight-${id}">${t('col.weight')}</label><input type="text" id="ex-weight-${id}" class="ex-weight" placeholder="—" autocomplete="off"></div>
        <div class="field"><label data-i18n="col.sets" for="ex-sets-${id}">${t('col.sets')}</label><input type="text" id="ex-sets-${id}" class="ex-sets"   placeholder="—" autocomplete="off"></div>
        <div class="field"><label data-i18n="col.reps" for="ex-reps-${id}">${t('col.reps')}</label><input type="text" id="ex-reps-${id}" class="ex-reps"  placeholder="—" autocomplete="off"></div>
      </div>
      <div class="field-group field-notes" style="margin-top:8px;">
        <div class="field" style="flex:1;"><label data-i18n="col.notes" for="ex-notes-${id}">${t('col.notes')}</label><input type="text" id="ex-notes-${id}" class="ex-notes" data-i18n-ph="ex.notes_ph" placeholder="${t('ex.notes_ph')}"></div>
      </div>
```

(`id` is the card's own unique counter variable, already in scope at the top of `makeExCard` — reusing it keeps these ids unique across every card on the page, since `exerciseCount++` never repeats within a session.)

- [ ] **Step 2: Run the existing accessibility test to confirm no regression**

Run: `npx playwright test tests/accessibility.spec.ts -g "exercise card inputs"`
Expected: still passes — the test accepts any of label/aria-label/title/placeholder being present, and this change adds a real `for`/`id` pairing on top of the pre-existing visible `<label>`, a strict superset.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(a11y): associate strength weight/sets/reps/notes labels with their inputs"
```

---

## Task 11: Playwright Coverage

**Files:** Modify `tests/negative.spec.ts`, `tests/accessibility.spec.ts`

- [ ] **Step 1: Add negative-value coverage**

Add to `tests/negative.spec.ts` (create the describe block if none exists for this page, following the file's existing style — read the file first to match its imports/helpers exactly):

```ts
  test('strength: non-numeric weight is rejected on save', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => document.getElementById('typeRow')?.children.length > 0, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    const card = page.locator('#exerciseList .card').first();
    await expect(card).toBeVisible({ timeout: 8000 });
    await card.locator('.ex-weight').fill('abc');
    await card.locator('.ex-sets').fill('3');
    await page.locator('#saveBtn').click();
    await expect(page.locator('.toast, #toast')).toBeVisible({ timeout: 5000 });
    // No navigation/reload happened — the card's invalid value is still there, proving the save was blocked.
    await expect(card.locator('.ex-weight')).toHaveValue('abc');
  });

  test('strength: negative sets is rejected on save', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => document.getElementById('typeRow')?.children.length > 0, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    const card = page.locator('#exerciseList .card').first();
    await expect(card).toBeVisible({ timeout: 8000 });
    await card.locator('.ex-weight').fill('60');
    await card.locator('.ex-sets').fill('-3');
    await page.locator('#saveBtn').click();
    await expect(page.locator('.toast, #toast')).toBeVisible({ timeout: 5000 });
    await expect(card.locator('.ex-sets')).toHaveValue('-3');
  });
```

Read the actual toast selector and save-button id used elsewhere in this test file before finalizing this step — do not guess `.toast`/`#toast`/`#saveBtn` if the file's existing tests use different selectors; match them exactly.

- [ ] **Step 2: Add ad-hoc name/label coverage**

Add to `tests/negative.spec.ts`:

```ts
  test('strength: ad-hoc exercise requires a name to save', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => document.getElementById('typeRow')?.children.length > 0, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    await page.locator('#addBtn').click();
    const newCard = page.locator('#exerciseList .card').last();
    await expect(newCard.locator('.ex-name-input')).toBeVisible();
    await newCard.locator('.ex-weight').fill('20');
    await page.locator('#saveBtn').click();
    await expect(page.locator('.toast, #toast')).toBeVisible({ timeout: 5000 });
    // still on the form, card still present with the unsaved value
    await expect(newCard.locator('.ex-weight')).toHaveValue('20');
  });
```

- [ ] **Step 3: Add accessibility coverage**

Add to `tests/accessibility.spec.ts`, after the existing "exercise card inputs have some form of labeling" test:

```ts
  test('strength weight/sets/reps have real for/id label association', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => document.getElementById('typeRow')?.children.length > 0, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    const card = page.locator('#exerciseList .card').first();
    await expect(card).toBeVisible({ timeout: 8000 });
    const linked = await card.locator('.ex-weight').evaluate(el => {
      const id = el.id;
      return !!id && !!document.querySelector(`label[for="${id}"]`);
    });
    expect(linked).toBe(true);
  });

  test('strength target pill is keyboard-reachable', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => document.getElementById('typeRow')?.children.length > 0, { timeout: 10000 });
    await page.locator('#typeRow button, #typeRow .type-btn').first().click();
    const pill = page.locator('.ex-target-clickable').first();
    if (await pill.count() === 0) test.skip(true, 'no target pill on this template to test with');
    await expect(pill).toHaveAttribute('tabindex', '0');
    await expect(pill).toHaveAttribute('role', 'button');
  });
```

- [ ] **Step 4: Run the full negative + accessibility suites**

Run: `TEST_EMAIL=test@gmail.com TEST_PASSWORD=111111 npx playwright test tests/negative.spec.ts tests/accessibility.spec.ts`
Expected: all pass on both `chromium` and `mobile-android` projects. **Since there is no emulator for this project, this hits real production Firestore** — any test-created data must be identified and deleted afterward, with deletion confirmed via a fresh reload (not just DOM state), per the project's established QA convention. The new tests above are designed to never actually complete a save (each blocks on a validation error before any `addDoc`/`updateDoc` call), so they should create zero test data — verify this assumption by checking History for new entries after the run, not just trusting the test design.

- [ ] **Step 5: Commit**

```bash
git add tests/negative.spec.ts tests/accessibility.spec.ts
git commit -m "test: add coverage for the strength/cardio QA fixes"
```

---

## Task 12: Update Product Documentation

**Files:** Modify `docs/product/02-workout-strength.md`, `docs/product/07-running-cardio.md`

- [ ] **Step 1: Update the strength doc's ad-hoc exercise + target pill sections**

In `docs/product/02-workout-strength.md`, find the description of "הוספת תרגיל מותאם אישית" (ad-hoc exercise) and add a note that it now has an editable, required name field. Find the target-pill description and correct it to confirm Sets now fills correctly from both the modern and legacy target formats (removing any language that described the old gap, if the doc already flagged it — otherwise just confirm current behavior).

- [ ] **Step 2: Update the cardio doc's field label + ad-hoc field sections**

In `docs/product/07-running-cardio.md`, note that the 8 default field labels now translate with the UI language (unless renamed by the user), and that "+ Add Field" on the daily entry form now has an editable, required label.

- [ ] **Step 3: Commit**

```bash
git add docs/product/02-workout-strength.md docs/product/07-running-cardio.md
git commit -m "docs: update product docs for the strength/cardio QA fixes"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** every row of the spec's §1 impact-map table maps to exactly one task above (H1→1, H2→2, H3→3, M3→4, M1→5, M2→6, M4→7, A11y-1→8, A11y-2→9, A11y-3→10). §2's fix designs are reproduced verbatim as each task's code. §7's out-of-scope list has no corresponding task, as intended.
- **Type/name consistency check:** `_readExName` (Task 3) is defined once and used by all 4 reader-site edits in the same task, plus reused unchanged by Task 6. `cardioFieldDisplayLabel` (Task 2) is defined once, used in Task 2's own edit and reused unchanged in Tasks 4 and 9's versions of the same function (each task's "Find" block includes the prior tasks' accumulated changes, since they touch the same function body sequentially — noted explicitly in Tasks 4 and 9's step text). `workout.name_required` (Task 3) is reused by Task 4 rather than adding a near-duplicate cardio-specific key, since the message is domain-neutral.
- **No placeholders:** every step contains complete, copy-pasteable code — no "add appropriate handling" or "similar to Task N" instructions, except Task 11 Step 1's explicit instruction to read the real toast/button selectors first rather than guess them (a deliberate exception: guessing a selector here would risk a flaky/wrong test, so the step directs verification instead of asserting an unconfirmed value).
