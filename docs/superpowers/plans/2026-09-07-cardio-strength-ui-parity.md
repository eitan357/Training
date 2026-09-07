# Cardio/Strength Daily-Form UI Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cardio daily-entry page (`#sec-running`) visually consistent with the strength daily-entry page (`#sec-main`) by reusing the strength page's established CSS classes for the 7 reported inconsistencies, instead of the parallel `run-*` class set left over from the pre-rebuild cardio wizard.

**Architecture:** Pure presentation fix in `public/index.html` — HTML class-attribute swaps for 6 of the 7 items, plus one new CSS rule (`.cardio-field-input`, currently undefined anywhere) and one rendering-content change (the last-workout preview needs to actually show field values, not just a date). No JS function signatures, no data model, no Firestore shape changes.

**Tech Stack:** Vanilla JS (no bundler), plain CSS in the file's `<style>` block.

**Spec:** `docs/superpowers/specs/2026-09-07-cardio-strength-ui-parity-design.md`

## Global Constraints

- All changes confined to `public/index.html`.
- Do not touch `#cardioEditPanel` (template editor), the History page's cardio rendering, or any JS function signature/data shape — presentation only (spec §2.4-2.5, §3).
- Reuse existing SVG icon symbols (`#icon-clipboard`, `#icon-trash`) — do not add new icon assets (spec §2.3).
- `.cardio-field-input`'s new styling must match `.field input`'s border/radius/background/padding/focus-color, but only `number`-type fields get centered/LTR text — `date`/`text` fields keep natural reading direction (spec §2.2).
- Commit after every task.

---

## Task 1: Session-name field — add the missing label, match strength's input styling

**Files:**
- Modify: `public/index.html:1126-1128`

**Interfaces:** none (pure HTML).

- [ ] **Step 1: Replace the session-name field markup**

Find and replace this exact block:

```html
    <div class="run-form-field">
      <input type="text" id="cardioSessionNameInput" class="run-form-input" data-i18n-ph="workout.name_default_ph" placeholder="שם האימון (ראשון, שני, דלואד...)">
    </div>
```

with:

```html
    <div style="margin-bottom:16px;">
      <label class="session-name-label-title" data-i18n="workout.name_label">שם האימון</label>
      <input type="text" id="cardioSessionNameInput" class="session-name-input" data-i18n-ph="workout.name_default_ph" placeholder="שם האימון (ראשון, שני, דלואד...)">
    </div>
```

(`workout.name_label` already exists as a translation key — it's the exact key strength's own `#sessionNameWrap` label uses at `index.html:908`. `session-name-input` and `session-name-label-title` are strength's existing, already-styled classes — no new CSS needed for this task.)

- [ ] **Step 2: Manual verification**

Open the app in a browser (a local static server serving this worktree's `public/` — see Task 8 for how it's set up), log in, enable cardio (Settings toggle), go to the cardio page. Confirm: a "שם האימון" label now appears above the session-name input, and the input itself has the slightly-raised/card look matching strength's session-name field (not the flatter `run-form-input` look).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): add missing session-name label, match strength's input style"
```

---

## Task 2: "העתקת אימון אחרון" button — match strength's `copy-last-btn` styling

**Files:**
- Modify: `public/index.html:1122`

**Interfaces:** none.

- [ ] **Step 1: Replace the copy-last-workout button**

Find and replace this exact line:

```html
      <button class="run-btn run-btn-secondary" style="flex:1;display:none;" id="cardioCopyLastBtn" onclick="copyLastCardioWorkout()" data-i18n="copy.last_btn">העתקת אימון אחרון</button>
```

with:

```html
      <button class="copy-last-btn" style="display:none;" id="cardioCopyLastBtn" onclick="copyLastCardioWorkout()" data-i18n="copy.last_btn"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-clipboard"/></svg> העתקת אימון אחרון</button>
```

(`copy-last-btn` is strength's existing class for this exact button role — icon + purple text/border, dark-mode variant included, at `index.html:245-251`. Dropped `style="flex:1"` since `copy-last-btn` is already an `inline-flex` button sized to content, matching how strength's `#copyLastBtn` is laid out — not a flex-stretched half-width button.)

- [ ] **Step 2: Adjust the wrapping row so the two top buttons still lay out side by side**

The wrapping `<div style="display:flex;gap:8px;margin:10px 0;">` (currently at `index.html:1121`, right before this button) already provides the flex row — no change needed there. Just confirm after Step 1 that both buttons (copy-last + clear-form, fixed in Task 3) still sit side by side without visually colliding, since `copy-last-btn` doesn't stretch to fill its flex cell the way `run-btn` did. If they look cramped or misaligned once both are converted (after Task 3), that's fine — strength's own `#topActionRow` (`index.html:902-905`) uses the exact same two-buttons-in-a-row pattern with the exact same classes and no extra flex sizing, so matching that structure exactly is correct, not a bug to fix further.

- [ ] **Step 3: Manual verification**

Reload the cardio page with an existing prior workout for the selected type (so the button is visible). Confirm the button now shows a clipboard icon and purple/primary-colored text and border, matching strength's "העתקת אימון אחרון" button exactly.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): match copy-last-workout button styling to strength's copy-last-btn"
```

---

## Task 3: "נקה טופס" button — match strength's `clear-form-btn` styling

**Files:**
- Modify: `public/index.html:1123`

**Interfaces:** none.

- [ ] **Step 1: Replace the clear-form button**

Find and replace this exact line:

```html
      <button class="run-btn run-btn-secondary" style="flex:1;" onclick="clearCardioForm()" data-i18n="clear.btn">נקה טופס</button>
```

with:

```html
      <button class="copy-last-btn clear-form-btn" onclick="clearCardioForm()" data-i18n="clear.btn"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-trash"/></svg> נקה טופס</button>
```

(`copy-last-btn clear-form-btn` is strength's exact class combination for `#clearFormBtn` at `index.html:904` — the base `copy-last-btn` layout/sizing plus the red color override from `clear-form-btn`.)

- [ ] **Step 2: Manual verification**

Confirm the button now shows a trash icon with red text/border, matching strength's "נקה טופס" button. Confirm it sits correctly alongside the copy-last button from Task 2.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): match clear-form button styling to strength's clear-form-btn"
```

---

## Task 4: "+ הוסף שדה" button — match strength's `btn-ghost` styling

**Files:**
- Modify: `public/index.html:1132`

**Interfaces:** none.

- [ ] **Step 1: Replace the add-field button**

Find and replace this exact line:

```html
    <button class="run-btn run-btn-secondary" style="width:100%;margin-top:10px;" onclick="addCustomCardioField()" data-i18n="cardio.add_field_btn">+ הוסף שדה</button>
```

with:

```html
    <button class="btn-ghost" onclick="addCustomCardioField()" data-i18n="cardio.add_field_btn">+ הוסף שדה</button>
```

(`btn-ghost` is strength's exact class for `#addBtn` — dashed border, low-emphasis "add another item" styling, at `index.html:629-634`. It's already full-width with its own top margin, so the inline `style` is no longer needed.)

- [ ] **Step 2: Manual verification**

Confirm the button now has a dashed border instead of a solid one, matching strength's "+ הוסף תרגיל" button exactly (same dashed-border, low-emphasis look).

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): match add-field button styling to strength's btn-ghost"
```

---

## Task 5: "שמור אימון" button — match strength's green `btn-primary` styling

**Files:**
- Modify: `public/index.html:1133`

**Interfaces:** none.

- [ ] **Step 1: Replace the save button**

Find and replace this exact line:

```html
    <button class="run-btn run-btn-primary" style="width:100%;margin-top:8px;" id="cardioSaveBtn" onclick="submitCardioData()" data-i18n="btn.save_workout">שמור אימון</button>
```

with:

```html
    <button class="btn-primary green" id="cardioSaveBtn" onclick="submitCardioData()" data-i18n="btn.save_workout">שמור אימון</button>
```

(`btn-primary green` is strength's exact class combination for `#saveBtn` at `index.html:914` — green background, the app's established "commit this save" color, full-width with its own top margin already baked into `.btn-primary`'s CSS.)

- [ ] **Step 2: Manual verification**

Confirm the save button is now green (matching strength's save button), not purple.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): match save-workout button styling to strength's btn-primary green"
```

---

## Task 6: Dynamic field inputs — add the missing `.cardio-field-input` CSS rule

**Files:**
- Modify: `public/index.html` (new CSS rule, near line 385 — right after `.field-notes input` — since these fields belong to the same "form field input" family as `.field input` and should sit next to it for discoverability)
- Modify: `public/index.html:1789-1797` (`renderCardioFieldRow` — add a numeric-alignment modifier class for `number`-type fields only)

**Interfaces:** none (pure CSS + one class-attribute change in existing JS template strings).

- [ ] **Step 1: Add the CSS rule**

Find this exact block (currently at `public/index.html:378-385`):

```css
    .field input {
      width: 100%; padding: 9px 10px;
      border: 1.5px solid var(--border); border-radius: 8px;
      font-size: 15px; color: var(--text);
      background: var(--bg); transition: border-color .15s; text-align: center; direction: ltr;
    }
    .field input:focus { outline: none; border-color: var(--primary); background: var(--surface); }
    .field-notes input { text-align: start; direction: inherit; }
```

and add immediately after it:

```css
    /* Cardio dynamic field inputs — same look as .field input above, but
       NOT force-centered/LTR by default: cardio fields are free-text/date
       as often as numeric, unlike strength's fixed weight/sets/reps grid.
       Only .cardio-field-input-numeric (number-type fields) gets the
       centered/LTR numeric treatment. */
    .cardio-field-input {
      width: 100%; padding: 9px 10px;
      border: 1.5px solid var(--border); border-radius: 8px;
      font-size: 15px; color: var(--text);
      background: var(--bg); transition: border-color .15s;
    }
    .cardio-field-input:focus { outline: none; border-color: var(--primary); background: var(--surface); }
    .cardio-field-input.cardio-field-input-numeric { text-align: center; direction: ltr; }
```

- [ ] **Step 2: Add the numeric modifier class in `renderCardioFieldRow`**

Find this exact block (currently at `public/index.html:1789-1797`):

```js
  if (field.fieldType === 'date') {
    inputHtml = `<input type="text" id="${escHtml(inputId)}" class="cardio-field-input" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" value="${escHtml(String(val))}">`;
  } else if (field.fieldType === 'number') {
    inputHtml = `<input type="number" id="${escHtml(inputId)}" class="cardio-field-input" step="any" min="0" value="${escHtml(String(val))}" placeholder="--">`;
  } else if (field.fieldType === 'checkbox') {
    inputHtml = `<label class="toggle-switch"><input type="checkbox" id="${escHtml(inputId)}" class="cardio-field-input" aria-label="${escHtml(cardioFieldDisplayLabel(field))}"${val ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  } else {
    inputHtml = `<input type="text" id="${escHtml(inputId)}" class="cardio-field-input" value="${escHtml(String(val))}" placeholder="--">`;
  }
```

with:

```js
  if (field.fieldType === 'date') {
    inputHtml = `<input type="text" id="${escHtml(inputId)}" class="cardio-field-input" placeholder="DD/MM/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" value="${escHtml(String(val))}">`;
  } else if (field.fieldType === 'number') {
    inputHtml = `<input type="number" id="${escHtml(inputId)}" class="cardio-field-input cardio-field-input-numeric" step="any" min="0" value="${escHtml(String(val))}" placeholder="--">`;
  } else if (field.fieldType === 'checkbox') {
    inputHtml = `<label class="toggle-switch"><input type="checkbox" id="${escHtml(inputId)}" class="cardio-field-input" aria-label="${escHtml(cardioFieldDisplayLabel(field))}"${val ? ' checked' : ''}><span class="toggle-slider"></span></label>`;
  } else {
    inputHtml = `<input type="text" id="${escHtml(inputId)}" class="cardio-field-input" value="${escHtml(String(val))}" placeholder="--">`;
  }
```

(Only the `number` branch's class attribute changes — `cardio-field-input` → `cardio-field-input cardio-field-input-numeric`. The checkbox branch's `class="cardio-field-input"` on the `<input type="checkbox">` is inert for layout purposes since `.toggle-switch` hides the raw checkbox visually — leave it as-is, not part of this task's visual surface.)

- [ ] **Step 3: Manual verification**

Reload the cardio page, select a type, look at every field row (date, distance/number fields, notes/text field). Confirm: every input now has a visible bordered, rounded box (not the bare browser-default look), number fields are centered, and date/text fields read in their natural direction (not forced centered/LTR).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "fix(cardio): style .cardio-field-input to match strength's .field input (was completely unstyled)"
```

---

## Task 7: "אימון אחרון" preview — show real field values, not just a date

**Files:**
- Modify: `public/index.html:1119` (add accessible header attributes to the static wrapper `<div>`)
- Modify: `public/index.html:1831-1840` (`selectCardioType`'s preview-rendering block)
- Modify: `public/index.html` (new `toggleCardioHistPreview()` function, placed next to `toggleHistPreview()`)

**Interfaces:**
- Consumes: `cardioFieldDisplayLabel(field)` (already exists, `index.html:1777`), `escHtml`, `sessionDisplayDate`, `t()` (all pre-existing).
- Produces: `toggleCardioHistPreview()` — mirrors `toggleHistPreview()`'s exact pattern (toggles an `open` class on a body element), kept as a separate parallel function rather than parameterizing the existing one, matching this file's established convention of parallel `cardio*`/plain-name function pairs (e.g. `clearCardioForm`/`clearWorkoutForm`).

- [ ] **Step 1: Add the `toggleCardioHistPreview` function**

Find this exact block (currently at `public/index.html:3257-3259`):

```js
function toggleHistPreview() {
  document.getElementById('histPreviewBody').classList.toggle('open');
}
```

and add immediately after it:

```js
function toggleCardioHistPreview() {
  document.getElementById('cardioHistPreviewBody')?.classList.toggle('open');
}
```

- [ ] **Step 2: Replace `selectCardioType`'s preview-rendering block**

Find this exact block (currently at `public/index.html:1831-1840`):

```js
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
```

with:

```js
  const last = lastCardioWorkouts[type];
  const box  = document.getElementById('cardioHistoryPreview');
  if (last) {
    box.style.display = '';
    const rows = (last.fields || [])
      .filter(f => f.fieldType === 'checkbox' ? f.value : String(f.value ?? '').trim())
      .map(f => `<tr>
        <td><div class="td-name">${escHtml(cardioFieldDisplayLabel(f))}</div></td>
        <td class="td-num">${f.fieldType === 'checkbox' ? '✓' : escHtml(String(f.value))}</td>
      </tr>`).join('');
    box.innerHTML = `
      <div class="history-preview-header" role="button" tabindex="0" onclick="toggleCardioHistPreview()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleCardioHistPreview();}">
        <div>
          <span class="history-preview-title"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-clipboard"/></svg> ${t('preview.last')}</span>
          ${last.sessionName ? `<span class="hist-preview-session-name">— ${escHtml(last.sessionName)}</span>` : ''}
        </div>
        <span class="history-preview-date">${sessionDisplayDate(last)}</span>
      </div>
      <div id="cardioHistPreviewBody" class="history-preview-body">
        <table class="hist-table" style="margin-top:8px;">
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    document.getElementById('cardioCopyLastBtn').style.display = '';
  } else {
    box.style.display = 'none';
    document.getElementById('cardioCopyLastBtn').style.display = 'none';
  }
```

(`cardioFieldDisplayLabel(f)` already handles translation of default field labels vs. user-renamed/ad-hoc labels — reused as-is, no changes to that function. The `.filter(...)` line skips empty/unset fields, mirroring strength's own `${e.notes ? ... : ''}` convention of not rendering empty optional content, applied here at the row level since every cardio field is conceptually optional except the locked date field.)

- [ ] **Step 3: Add accessible attributes to the static wrapper `<div>`**

This step is a no-op by design: `#cardioHistoryPreview` (`index.html:1119`) is a bare `<div class="history-preview" style="display:none;"></div>` with no static inner markup — Step 2's `box.innerHTML = ...` already builds the header/body structure fresh on every call, including the `role="button"`/`tabindex`/`onkeydown` accessibility attributes inline. No separate edit to line 1119 is needed; this step exists only to confirm that explicitly rather than leave it an open question.

- [ ] **Step 4: Manual verification**

Save a cardio workout with several fields filled in (e.g. distance, duration, a note) for a given type. Switch away from that type and back (or reload and re-select the type). Confirm: the "אימון אחרון" box now shows a clickable header with a clipboard icon, the last session's date/name, and — when clicked — expands to show a table listing each filled field's label and value (skipping any fields that were left empty).

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(cardio): show real field values in the last-workout preview, matching strength's history preview"
```

---

## Task 8: Final verification across both pages

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Set up a local server if not already running**

```bash
npx serve -s public
```

Note the port `serve` reports (it may not be the one you request if that port is busy).

- [ ] **Step 2: Manual side-by-side visual check**

With credentials from `.env.test` (`TEST_EMAIL`/`TEST_PASSWORD`), log in, open the strength page and the cardio page in two browser tabs (or sequentially), and confirm for each of the 7 items: last-workout preview shows a real field table (Task 7), copy-last button has icon+purple styling (Task 2), clear-form button has icon+red styling (Task 3), session-name field has its label (Task 1), add-field button has dashed-border styling (Task 4), save button is green (Task 5), every dynamic field input has a visible bordered/rounded box (Task 6).

- [ ] **Step 3: Run the existing test suite for both pages**

```bash
set -a; source .env.test; set +a; npx playwright test tests/main-workout.spec.ts tests/running.spec.ts --project=chromium
```

Expected: all tests pass unchanged — this plan only changed CSS classes and one rendering-content block, not any element `id`, `onclick` handler name, or data attribute that existing tests could depend on. If anything fails, check whether it's asserting a class name this plan changed (e.g. a test asserting `.run-btn-primary` on the save button) — if so, that test itself needs updating to assert the new class, since the old class no longer describes reality; this is a legitimate test update, not a sign the visual fix is wrong.

- [ ] **Step 4: Report any test that needed updating**

If Step 3 surfaces a test asserting one of the old `run-btn`/`run-form-*` classes this plan removed, update that specific assertion to match the new class name, re-run, and commit the test fix separately with a clear message (e.g. `test(cardio): update button class assertion after UI parity fix`).
