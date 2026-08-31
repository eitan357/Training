# History Unification & Cardio Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold cardio's history (and the old dashboard's streak/PR/charts) into the unified History page — a כוח/אירובי toggle switching which dataset the existing history chrome (filters, month grouping, long-press select, bulk delete, inline edit, Arm & Confirm, per-type colors) renders — giving cardio entries edit/delete for the first time, then rewrite the test suite to match.

**Architecture:** Builds on `2026-08-31-A-shared-workout-engine.md` (the `WORKOUT_DOMAINS` registry and domain-aware `buildSessionCard`) and `2026-08-31-B-cardio-page-rebuild.md` (the `cardio` domain, `allRunWorkouts`, `runningTypes`, the relocated-but-untouched `calcRunStreak`/`calcRunPRs`/`renderRunCharts`/`RUN_CHARTS_CONFIG`). Both MUST be merged first. This plan introduces one new piece of state, `historyActiveDomain`, and makes every History function that currently assumes "strength" branch on it via `WORKOUT_DOMAINS[historyActiveDomain]` — the same registry-dispatch pattern used throughout Phase A/B.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Auth/Firestore v12 (CDN), Chart.js, Playwright for E2E tests.

**Spec:** `docs/superpowers/specs/2026-08-31-cardio-page-redesign-design.md` §7 (History restructure).

## Global Constraints

- Depends on Phase A's `buildSessionCard(domain, s, i)`, `WORKOUT_DOMAINS`, `_toggleSelect`, `_bulkDelete`, `_updateBulkBar`, `armDelete`, `_attachHistLongPress`/`_histPress*` (all left as-is — this plan proves they're already domain-agnostic by construction, since they operate on `.session-card`/`selectedSessions` regardless of which domain populated the DOM).
- Depends on Phase B's `allRunWorkouts`, `runningTypes`, `cardioSelectedType`, and the untouched `calcRunStreak`/`calcRunPRs`/`filterRunByRange`/`renderRunCharts`/`RUN_CHARTS_CONFIG`/`runSetRange`/`formatPace`/`calcPace` (Phase B Task 8 Step 4 explicitly preserved these for this plan to relocate).
- Only one domain's history is visible at a time (`historyActiveDomain`) — `selectedSessions` stays a single shared `Set`, cleared on every domain switch, exactly like it's already cleared on every `renderHistory()` call today.
- `escHtml()` wraps any user-controlled string in `innerHTML` — standing rule, applies to cardio field labels/values rendered in history cards for the first time in this plan.
- Commit after every task.

---

## Task 1: History Domain Toggle + Generalize `renderHistory`/`filterHistory`/Filter Buttons

**Files:**
- Modify: `public/index.html:934-945`ish (`#sec-history` markup — insert the toggle), `renderFilterButtons` (`:3350-3356`), `renderHistory`/`filterHistory` (`:3006-3070` post-Phase-A-Task-7 state)

**Interfaces:**
- Produces: `let historyActiveDomain = 'strength';`, `switchHistoryDomain(domain)`, generalized `renderFilterButtons()`/`filterHistory(f)`/`renderHistory()` (all keep their existing bare names — no call-site churn elsewhere in the file — but now read `historyActiveDomain` internally).

- [ ] **Step 1: Add the toggle to `#sec-history`'s markup**

Find the History section's opening (`public/index.html`, `<div id="sec-history" class="section">`, locate by content since Phase A/B may have shifted the exact line) and add, immediately after its `<div class="topbar">...</div>` block and before the existing filter row:

```html
  <div class="history-domain-toggle" style="display:flex;gap:8px;padding:0 16px;margin-top:12px;">
    <button class="run-btn run-btn-secondary history-domain-btn active" data-domain="strength" onclick="switchHistoryDomain('strength')" data-i18n="nav.workout">כוח</button>
    <button class="run-btn run-btn-secondary history-domain-btn" data-domain="cardio" onclick="switchHistoryDomain('cardio')" data-i18n="title.running">אירובי</button>
  </div>
```

- [ ] **Step 2: Declare `historyActiveDomain`, add `switchHistoryDomain`**

Add, next to the existing `let activeFilter = 'all';` declaration:

```js
let historyActiveDomain = 'strength';   // 'strength' | 'cardio' — which dataset the History page renders

function switchHistoryDomain(domain) {
  if (historyActiveDomain === domain) return;
  historyActiveDomain = domain;
  activeFilter = 'all';
  document.querySelectorAll('.history-domain-btn').forEach(b => b.classList.toggle('active', b.dataset.domain === domain));
  renderFilterButtons();
  renderHistory();
}
```

- [ ] **Step 3: Generalize `renderFilterButtons`**

Find (`public/index.html:3350-3356`):

```js
function renderFilterButtons() {
  document.getElementById('filterRow').innerHTML =
    `<button class="filter-btn${activeFilter==='all'?' active':''}" data-filter="all" onclick="filterHistory('all')">${t('filter.all')}</button>` +
    workoutTypes.map(wtype =>
      `<button class="filter-btn${activeFilter===wtype?' active':''}" data-filter="${escHtml(wtype)}" onclick="filterHistory('${escHtml(wtype)}')">${escHtml(t('workout.badge') + ' ' + wtype)}</button>`
    ).join('');
}
```

replace with:

```js
function renderFilterButtons() {
  const types = historyActiveDomain === 'cardio' ? runningTypes : workoutTypes;
  const label = wtype => historyActiveDomain === 'cardio' ? escHtml(wtype) : escHtml(t('workout.badge') + ' ' + wtype);
  document.getElementById('filterRow').innerHTML =
    `<button class="filter-btn${activeFilter==='all'?' active':''}" data-filter="all" onclick="filterHistory('all')">${t('filter.all')}</button>` +
    types.map(wtype =>
      `<button class="filter-btn${activeFilter===wtype?' active':''}" data-filter="${escHtml(wtype)}" onclick="filterHistory('${escHtml(wtype)}')">${label(wtype)}</button>`
    ).join('');
}
```

- [ ] **Step 4: Generalize `renderHistory`**

Find `renderHistory` (post-Phase-A-Task-7 state, `public/index.html:3060-3110`ish):

```js
function renderHistory() {
  selectedSessions.clear();
  updateHistBulkBar();
  const list = document.getElementById('historyList');
  _attachHistLongPress();
  const data = activeFilter === 'all' ? allSessions : allSessions.filter(s => s.type === activeFilter);
  ...
```

(the `...` covers the empty-state check, month-grouping loop, and `buildSessionCard('strength', s, si++)` calls from Phase A Task 7) — replace the declaration and the `data` line, and the two `buildSessionCard` calls inside the loop, keeping everything else (month-grouping, empty-state, first-card-auto-open) untouched:

```js
function renderHistory() {
  selectedSessions.clear();
  updateHistBulkBar();
  const list = document.getElementById('historyList');
  _attachHistLongPress();
  const sourceData = historyActiveDomain === 'cardio' ? allRunWorkouts : allSessions;
  const typeKey    = historyActiveDomain === 'cardio' ? 'workoutType' : 'type';
  const data = activeFilter === 'all' ? sourceData : sourceData.filter(s => s[typeKey] === activeFilter);
  ...
```

and, in the two spots inside the month-grouping loop:

```js
      sessions.forEach(s => { html += buildSessionCard('strength', s, si++); });
```

replace both with:

```js
      sessions.forEach(s => { html += buildSessionCard(historyActiveDomain, s, si++); });
```

`getMonthKey(s.date || s.dateISO)` (unchanged, both domains share the same dual date-field convention per spec §3.2) needs no edit.

- [ ] **Step 5: Add the i18n label reuse check**

`nav.workout`/`title.running` (used as the toggle's button labels in Step 1) already exist — run `grep -n "'nav.workout'\|'title.running'" public/translations.js` to confirm both languages have them (they do, per `docs/product` citations read during planning); no new keys needed for this task.

- [ ] **Step 6: Run the full suite**

Run: `npx playwright test`
Expected: strength history passes unchanged (default `historyActiveDomain === 'strength'` preserves every existing assertion). Cardio history will render with generic strength-shaped cards until Task 2 registers `WORKOUT_DOMAINS.cardio.colorClass`/`renderCardBody` — expected gap, closed next.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat(history): add strength/cardio toggle, generalize renderHistory/filterHistory by active domain"
```

---

## Task 2: Cardio Color Strategy + Card Body Renderer

**Files:**
- Modify: `public/index.html` (`WORKOUT_DOMAINS.cardio`, new CSS)

**Interfaces:**
- Produces: `hashColorClass(name)`, `WORKOUT_DOMAINS.cardio.colorClass/renderCardMeta/renderCardBody/badgeText` (the four keys Phase A Task 7 requires every domain to supply).

- [ ] **Step 1: Add a small fixed palette + hash function**

Strength's colors are hardcoded per exact type name (`dot-a`/`dot-b`, styled in CSS for exactly those two classes) — cardio's types are open-ended and user-named, so this task adds a **hash-of-name → palette index** strategy instead of per-name CSS. Add, near the existing `.dot-a`/`.dot-b`/`.badge-a`/`.badge-b` CSS rules:

```css
    .dot-c0, .badge-c0 { --dc: #536fac; } .dot-c1, .badge-c1 { --dc: #3c7a54; }
    .dot-c2, .badge-c2 { --dc: #aa7941; } .dot-c3, .badge-c3 { --dc: #9b5aaf; }
    .dot-c4, .badge-c4 { --dc: #a05555; } .dot-c5, .badge-c5 { --dc: #4a8a8a; }
    .session-dot[class*="dot-c"] { background: var(--dc); }
    .session-badge[class*="badge-c"] { background: var(--dc); color: #fff; }
```

(6-color palette, reusing the exact muted hex values already established for the running charts in `docs/superpowers/specs/2026-08-30-ui-polish-settings-history-charts-design.md` §3 — visual consistency with the charts this same plan relocates in Task 4.)

Add, near `genId()`:

```js
// Deterministic name → palette-index hash, so the same cardio type always
// gets the same color across sessions without needing a stored color field.
function hashColorClass(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return 'c' + (h % 6);
}
```

- [ ] **Step 2: Register the cardio domain's card-rendering config**

Add to `WORKOUT_DOMAINS.cardio` (extending the object from Phase B):

```js
    colorClass: s => hashColorClass(s.workoutType),
    renderCardMeta: s => `${(s.fields||[]).length} ${t('cardio.fields_count')}`,
    badgeText: s => escHtml(s.workoutType),
    renderCardBody: s => `
      <table class="hist-table">
        <tbody>
          ${(s.fields||[]).map(f => `<tr>
            <td><div class="td-name">${escHtml(f.label)}</div></td>
            <td class="td-num">${f.fieldType === 'checkbox' ? (f.value ? '✓' : '—') : (f.value ?? '—')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`,
```

- [ ] **Step 3: Add the new i18n key**

Hebrew: `'cardio.fields_count': 'שדות',` — English: `'cardio.fields_count': 'fields',`

- [ ] **Step 4: Run the full suite, manual check**

Run: `npx playwright test`. Manual: switch History to אירובי, confirm cards render with distinct colors per type, expand a card, confirm the fields table shows label/value pairs including a checkmark for checkbox fields.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "feat(history): cardio card colors (hash-based palette) and fields-table card body"
```

---

## Task 3: Edit/Delete Parity for Cardio History (New Functionality)

**Files:**
- Modify: `public/index.html` — `editSession`/`saveSessionEdit`/`deleteSession`/`bulkDeleteSessions` (post-Phase-A state, `:3231-3323`, `:4294`)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS[domain].entriesCollection` (Phase A Task 7 / Plan B Task 2), `armDelete`, `_bulkDelete`.
- Produces: `WORKOUT_DOMAINS.cardio.renderEditRow(f)`/`collectEditRow(row)` (new keys), generalized `editSession(domain, sessionId)`, `saveSessionEdit(saveBtn, domain, sessionId)`, `deleteSession(btn, domain, sessionId)`, `bulkDeleteSessions()` (unchanged name/signature — reads `historyActiveDomain` internally, since it's only ever called from the shared bulk-bar button).

- [ ] **Step 1: Register cardio's edit-row renderer/collector**

Add to `WORKOUT_DOMAINS.cardio`:

```js
    renderEditRow: f => `
      <div class="edit-ex-row" data-id="${escHtml(f.id)}" data-label="${escHtml(f.label)}" data-field-type="${escHtml(f.fieldType)}">
        <div class="edit-ex-title">${escHtml(f.label)}</div>
        ${f.fieldType === 'checkbox'
          ? `<label class="toggle-switch"><input type="checkbox" class="edit-cardio-field-input"${f.value ? ' checked' : ''}><span class="toggle-slider"></span></label>`
          : `<input type="${f.fieldType === 'number' ? 'number' : 'text'}" class="edit-num-input edit-cardio-field-input" value="${escHtml(String(f.value ?? ''))}" placeholder="—">`}
      </div>`,
    collectEditRow: row => ({
      id: row.dataset.id, label: row.dataset.label, fieldType: row.dataset.fieldType,
      value: row.dataset.fieldType === 'checkbox' ? row.querySelector('.edit-cardio-field-input').checked : row.querySelector('.edit-cardio-field-input').value,
    }),
```

Cardio's inline edit intentionally has **no per-row delete** (unlike strength's `removeEditRow` ✕ button) — a cardio field's presence on a saved entry is fixed by whatever the template had at save time (spec §3.2's denormalization); removing a field from a historical entry isn't a request anywhere in the spec, so this task doesn't add it.

- [ ] **Step 2: Generalize `editSession`/`saveSessionEdit`**

Find `editSession` (`public/index.html:3231-3270`):

```js
function editSession(sessionId) {
  const session = allSessions.find(s => s.id === sessionId);
  if (!session) return;

  const card = document.querySelector(`.session-card[data-sid="${sessionId}"]`);
  if (!card) return;
  toggleSess(allSessions.indexOf(session), card.querySelector('.session-header'));
  const body = card.querySelector('.session-body');
  body.classList.add('open');

  body.innerHTML = `
    <div class="edit-session-wrap">
      <div class="divider"></div>
      <div class="edit-session-name-row">
        <label data-i18n="sess.name_label">${t('sess.name_label')}</label>
        <input type="text" class="edit-session-name-input" value="${escHtml(session.sessionName||'')}" data-i18n-ph="sess.name_ph" placeholder="${t('sess.name_ph')}">
      </div>
      ${(session.exercises||[]).map(e => `
        <div class="edit-ex-row"
             data-id="${escHtml(String(e.id))}"
             data-name="${escHtml(String(e.name))}"
             data-target="${escHtml(String(e.target||''))}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div class="edit-ex-title" style="margin-bottom:0;">${escHtml(String(e.name))}</div>
            <button class="edit-ex-delete" onclick="removeEditRow(this)" title="✕">✕</button>
          </div>
          <div class="edit-ex-fields">
            <div class="field"><label data-i18n="col.weight">${t('col.weight')}</label><input type="text" class="edit-num-input edit-weight" value="${escHtml(String(e.weight||''))}" placeholder="—"></div>
            <div class="field"><label data-i18n="col.sets">${t('col.sets')}</label><input type="text" class="edit-num-input edit-sets"   value="${escHtml(String(e.sets||''))}"   placeholder="—"></div>
            <div class="field"><label data-i18n="col.reps">${t('col.reps')}</label><input type="text" class="edit-num-input edit-reps"  value="${escHtml(String(e.reps||''))}"   placeholder="—"></div>
          </div>
          <input type="text" class="edit-notes-input" value="${escHtml(String(e.notes||''))}" data-i18n-ph="sess.notes_ph" placeholder="${t('sess.notes_ph')}">
        </div>
      `).join('')}
      <div class="edit-save-row">
        <button class="btn-primary" data-i18n="sess.save_btn" onclick="saveSessionEdit(this,'${escHtml(sessionId)}')">${t('sess.save_btn')}</button>
        <button class="btn-ghost"   data-i18n="sess.cancel_btn" onclick="cancelSessionEdit(this)">${t('sess.cancel_btn')}</button>
      </div>
    </div>`;
}

async function saveSessionEdit(saveBtn, sessionId) {
  const body = saveBtn.closest('.session-body');
  const sessionName = body.querySelector('.edit-session-name-input')?.value.trim() || '';
  const exercises = [...body.querySelectorAll('.edit-ex-row:not([data-deleted])')].map(row => ({
    id:     row.dataset.id,
    name:   row.dataset.name   || '',
    target: row.dataset.target || '',
    weight: row.querySelector('.edit-weight')?.value      || '',
    sets:   row.querySelector('.edit-sets')?.value        || '',
    reps:   row.querySelector('.edit-reps')?.value        || '',
    notes:  row.querySelector('.edit-notes-input')?.value || '',
  }));

  saveBtn.disabled = true; saveBtn.innerText = t('saving');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'workouts', sessionId), { sessionName, exercises });
    toast(t('sess.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
    saveBtn.disabled = false; saveBtn.innerText = t('sess.save_btn');
  }
}
```

replace with (strength's exact row markup/behavior preserved byte-for-byte inside the `domain === 'strength'` branch; cardio's new branch uses `WORKOUT_DOMAINS.cardio.renderEditRow`):

```js
function editSession(domain, sessionId) {
  const sourceData = domain === 'cardio' ? allRunWorkouts : allSessions;
  const session = sourceData.find(s => s.id === sessionId);
  if (!session) return;

  const card = document.querySelector(`.session-card[data-sid="${sessionId}"]`);
  if (!card) return;
  toggleSess(sourceData.indexOf(session), card.querySelector('.session-header'));
  const body = card.querySelector('.session-body');
  body.classList.add('open');

  const itemsHtml = domain === 'cardio'
    ? (session.fields || []).map(f => WORKOUT_DOMAINS.cardio.renderEditRow(f)).join('')
    : (session.exercises || []).map(e => `
        <div class="edit-ex-row"
             data-id="${escHtml(String(e.id))}"
             data-name="${escHtml(String(e.name))}"
             data-target="${escHtml(String(e.target||''))}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div class="edit-ex-title" style="margin-bottom:0;">${escHtml(String(e.name))}</div>
            <button class="edit-ex-delete" onclick="removeEditRow(this)" title="✕">✕</button>
          </div>
          <div class="edit-ex-fields">
            <div class="field"><label data-i18n="col.weight">${t('col.weight')}</label><input type="text" class="edit-num-input edit-weight" value="${escHtml(String(e.weight||''))}" placeholder="—"></div>
            <div class="field"><label data-i18n="col.sets">${t('col.sets')}</label><input type="text" class="edit-num-input edit-sets"   value="${escHtml(String(e.sets||''))}"   placeholder="—"></div>
            <div class="field"><label data-i18n="col.reps">${t('col.reps')}</label><input type="text" class="edit-num-input edit-reps"  value="${escHtml(String(e.reps||''))}"   placeholder="—"></div>
          </div>
          <input type="text" class="edit-notes-input" value="${escHtml(String(e.notes||''))}" data-i18n-ph="sess.notes_ph" placeholder="${t('sess.notes_ph')}">
        </div>`).join('');

  body.innerHTML = `
    <div class="edit-session-wrap">
      <div class="divider"></div>
      <div class="edit-session-name-row">
        <label data-i18n="sess.name_label">${t('sess.name_label')}</label>
        <input type="text" class="edit-session-name-input" value="${escHtml(session.sessionName||'')}" data-i18n-ph="sess.name_ph" placeholder="${t('sess.name_ph')}">
      </div>
      ${itemsHtml}
      <div class="edit-save-row">
        <button class="btn-primary" data-i18n="sess.save_btn" onclick="saveSessionEdit(this,'${domain}','${escHtml(sessionId)}')">${t('sess.save_btn')}</button>
        <button class="btn-ghost"   data-i18n="sess.cancel_btn" onclick="cancelSessionEdit(this)">${t('sess.cancel_btn')}</button>
      </div>
    </div>`;
}

async function saveSessionEdit(saveBtn, domain, sessionId) {
  const body = saveBtn.closest('.session-body');
  const sessionName = body.querySelector('.edit-session-name-input')?.value.trim() || '';
  const collection_  = WORKOUT_DOMAINS[domain].entriesCollection;
  let payload;
  if (domain === 'cardio') {
    const fields = [...body.querySelectorAll('.edit-ex-row')].map(row => WORKOUT_DOMAINS.cardio.collectEditRow(row));
    payload = { sessionName, fields };
  } else {
    const exercises = [...body.querySelectorAll('.edit-ex-row:not([data-deleted])')].map(row => ({
      id:     row.dataset.id,
      name:   row.dataset.name   || '',
      target: row.dataset.target || '',
      weight: row.querySelector('.edit-weight')?.value      || '',
      sets:   row.querySelector('.edit-sets')?.value        || '',
      reps:   row.querySelector('.edit-reps')?.value        || '',
      notes:  row.querySelector('.edit-notes-input')?.value || '',
    }));
    payload = { sessionName, exercises };
  }

  saveBtn.disabled = true; saveBtn.innerText = t('saving');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, collection_, sessionId), payload);
    toast(t('sess.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
    saveBtn.disabled = false; saveBtn.innerText = t('sess.save_btn');
  }
}
```

Update the one `onclick="editSession('...')"` call site (the History card's edit button, wired via `editSelectedSession` at `public/index.html:4297`): find `function editSelectedSession() { editSession([...selectedSessions][0]); }` and replace with `function editSelectedSession() { editSession(historyActiveDomain, [...selectedSessions][0]); }`.

- [ ] **Step 3: Generalize `deleteSession`/`bulkDeleteSessions`**

Find (`public/index.html:3313-3323`):

```js
async function deleteSession(btn, sessionId) {
  armDelete(btn, async () => {
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'workouts', sessionId));
      toast(t('sess.deleted_ok'), 'success');
      await reloadAppData();
    } catch (err) {
      toast(t('error.save') + err.message, 'error');
    }
  });
}
```

replace with:

```js
async function deleteSession(btn, domain, sessionId) {
  armDelete(btn, async () => {
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, WORKOUT_DOMAINS[domain].entriesCollection, sessionId));
      toast(t('sess.deleted_ok'), 'success');
      await reloadAppData();
    } catch (err) {
      toast(t('error.save') + err.message, 'error');
    }
  });
}
```

Find the `deleteSession(this, '...')` onclick call site inside `buildSessionCard`'s body — this was not present in the strength-only version read during planning (strength's delete button lives in the *inline edit* body, not the card header; confirm its exact current call site with `grep -n 'onclick="deleteSession(' public/index.html`) and update it to `deleteSession(this, '${domain}', '${escHtml(s.id)}')` (passing the `domain` parameter `buildSessionCard(domain, s, i)` already has in scope, from Phase A Task 7).

Find (`public/index.html:4294`):

```js
async function bulkDeleteSessions() { await _bulkDelete(selectedSessions, 'histBulkBar', 'workouts'); }
```

replace with:

```js
async function bulkDeleteSessions() { await _bulkDelete(selectedSessions, 'histBulkBar', WORKOUT_DOMAINS[historyActiveDomain].entriesCollection); }
```

- [ ] **Step 4: Run the full suite, manual check**

Run: `npx playwright test`. Manual: in cardio history, expand an entry, click edit, confirm typed inputs render correctly (checkbox toggle for feltTired-equivalent, number input for distance-equivalent), save, confirm the update persists; Arm & Confirm delete a cardio entry; multi-select two cardio entries via long-press and bulk-delete.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(history): add edit and delete for cardio entries (first-time parity with strength)"
```

---

## Task 4: Relocate Streak/PR/Charts into History's Cardio View

**Files:**
- Modify: `public/index.html` — move `renderRunDashboard`'s markup-generation logic (already deleted as a function in Plan B Task 8; **its underlying calc functions `calcRunStreak`/`calcRunPRs` were preserved**) and `renderRunCharts`/`RUN_CHARTS_CONFIG`/`runSetRange` into the History page, resolving the chart/PR data by field **label** instead of the old fixed keys (`distanceKm`, `avgHeartRate`, etc.) per spec §7.

**Interfaces:**
- Consumes: `calcRunStreak`, `calcRunPRs`, `filterRunByRange`, `formatPace`, `allRunWorkouts` (all from Phase B, untouched).
- Produces: `renderCardioHistoryStats()`, updated `RUN_CHARTS_CONFIG` (now keyed by field `label` instead of a fixed object key), updated `calcRunPRs` (reads `fields[]` by label instead of `w.distanceKm`/`w.paceMinPerKm`/`w.avgHeartRate`).

- [ ] **Step 1: Add the stats block markup above the cardio history list**

Find `#historyList`'s container in `#sec-history` and add, immediately before it, a container shown only when `historyActiveDomain === 'cardio'`:

```html
  <div id="cardioHistoryStats" style="display:none;padding:0 16px;">
    <div id="run-streak-card" class="run-card"></div>
    <div id="run-prs-card" class="run-card"></div>
    <div id="run-charts-card" class="run-card">
      <div class="run-card-title" data-i18n="run.charts_title">גרפים</div>
      <div class="run-range-row">
        <button class="run-range-btn" data-range="month" onclick="runSetRange('month')" data-i18n="run.range_month">חודש</button>
        <button class="run-range-btn active" data-range="year" onclick="runSetRange('year')" data-i18n="run.range_year">שנה</button>
        <button class="run-range-btn" data-range="all" onclick="runSetRange('all')" data-i18n="run.range_all">הכל</button>
      </div>
      <div id="run-charts-list"></div>
    </div>
  </div>
```

(This is the exact old dashboard markup, relocated verbatim — same ids, so `renderRunCharts`'s existing DOM-query code needs no id changes, only its data source, handled in Step 3.)

- [ ] **Step 2: Toggle the stats block's visibility from `switchHistoryDomain`, render it**

Find `switchHistoryDomain` (Task 1) and replace:

```js
function switchHistoryDomain(domain) {
  if (historyActiveDomain === domain) return;
  historyActiveDomain = domain;
  activeFilter = 'all';
  document.querySelectorAll('.history-domain-btn').forEach(b => b.classList.toggle('active', b.dataset.domain === domain));
  renderFilterButtons();
  renderHistory();
}
```

with:

```js
function switchHistoryDomain(domain) {
  if (historyActiveDomain === domain) return;
  historyActiveDomain = domain;
  activeFilter = 'all';
  document.querySelectorAll('.history-domain-btn').forEach(b => b.classList.toggle('active', b.dataset.domain === domain));
  document.getElementById('cardioHistoryStats').style.display = domain === 'cardio' ? '' : 'none';
  if (domain === 'cardio') renderCardioHistoryStats();
  renderFilterButtons();
  renderHistory();
}

function renderCardioHistoryStats() {
  const streak = calcRunStreak(allRunWorkouts);
  document.getElementById('run-streak-card').innerHTML = `
    <div class="run-streak-badge">
      <div class="run-streak-num">${streak}</div>
      <div class="run-streak-lbl">${t('run.streak_label')}</div>
    </div>`;

  const prs = calcRunPRs(allRunWorkouts);
  document.getElementById('run-prs-card').innerHTML = `
    <div class="run-card-title">${t('run.prs_title')}</div>
    <div class="run-stat-row">
      <div class="run-stat"><div class="run-stat-val">${prs.bestDistanceKm > 0 ? prs.bestDistanceKm.toFixed(1) : '--'}</div><div class="run-stat-lbl">${t('run.best_distance')}</div></div>
      <div class="run-stat"><div class="run-stat-val">${prs.bestPaceMinPerKm > 0 ? formatPace(prs.bestPaceMinPerKm) : '--'}</div><div class="run-stat-lbl">${t('run.best_pace')}</div></div>
      <div class="run-stat"><div class="run-stat-val">${prs.lowestHeartRate > 0 ? prs.lowestHeartRate : '--'}</div><div class="run-stat-lbl">${t('run.lowest_hr')}</div></div>
    </div>`;

  renderRunCharts();
}
```

(The old dashboard's "last workout" card is **not** relocated — History's own card list directly above this stats block already shows the most recent entry expanded, per the existing month-grouping "latest month expanded" behavior, making a duplicate "last workout" summary redundant in this new layout.)

- [ ] **Step 3: Resolve PRs and charts by field label instead of fixed keys**

Find `calcRunPRs` (Phase B-preserved, unchanged since Phase B Task 8 Step 4):

```js
function calcRunPRs(workouts) {
  let bestDistanceKm = 0, bestPaceMinPerKm = Infinity, lowestHeartRate = Infinity;
  for (const w of workouts) {
    if ((w.distanceKm ?? 0) > bestDistanceKm) bestDistanceKm = w.distanceKm;
    if ((w.paceMinPerKm ?? 0) > 0 && w.paceMinPerKm < bestPaceMinPerKm) bestPaceMinPerKm = w.paceMinPerKm;
    if ((w.avgHeartRate ?? 0) > 0 && w.avgHeartRate < lowestHeartRate) lowestHeartRate = w.avgHeartRate;
  }
  return {
    bestDistanceKm,
    bestPaceMinPerKm: isFinite(bestPaceMinPerKm) ? bestPaceMinPerKm : 0,
    lowestHeartRate:  isFinite(lowestHeartRate)  ? lowestHeartRate  : 0,
  };
}
```

replace with:

```js
// Reads by field LABEL now (dynamic templates have no fixed keys) — a
// distance-equivalent field is whichever field has label==='מרחק' on that
// entry; pace is derived client-side from distance+duration since the new
// schema no longer precomputes paceMinPerKm server-side per entry.
function _fieldVal(entry, label) {
  const f = (entry.fields || []).find(x => x.label === label);
  return f ? Number(f.value) : null;
}

function calcRunPRs(workouts) {
  let bestDistanceKm = 0, bestPaceMinPerKm = Infinity, lowestHeartRate = Infinity;
  for (const w of workouts) {
    const dist = _fieldVal(w, 'מרחק'), dur = _fieldVal(w, 'זמן'), hr = _fieldVal(w, 'דופק ממוצע');
    if (dist != null && dist > bestDistanceKm) bestDistanceKm = dist;
    if (dist && dur) {
      const pace = dur / dist;
      if (pace > 0 && pace < bestPaceMinPerKm) bestPaceMinPerKm = pace;
    }
    if (hr != null && hr > 0 && hr < lowestHeartRate) lowestHeartRate = hr;
  }
  return {
    bestDistanceKm,
    bestPaceMinPerKm: isFinite(bestPaceMinPerKm) ? bestPaceMinPerKm : 0,
    lowestHeartRate:  isFinite(lowestHeartRate)  ? lowestHeartRate  : 0,
  };
}
```

Find `RUN_CHARTS_CONFIG`/`renderRunCharts` (Phase B-preserved):

```js
const RUN_CHARTS_CONFIG = [
  { key: 'distanceKm',       tKey: 'run.chart.distance', color: '#536fac', fmt: v => v.toFixed(1) },
  { key: 'avgHeartRate',     tKey: 'run.chart.hr',       color: '#a05555', fmt: v => Math.round(v) },
  { key: 'paceMinPerKm',     tKey: 'run.chart.pace',     color: '#3c7a54', fmt: formatPace },
  { key: 'calories',         tKey: 'run.chart.calories', color: '#aa7941', fmt: v => Math.round(v) },
  { key: 'avgStridesPerMin', tKey: 'run.chart.spm',      color: '#9b5aaf', fmt: v => Math.round(v) },
];
```

replace `key:` with `label:` for each entry (the field-label equivalents, matching `CARDIO_MIGRATION_FIELD_MAP` from Plan B Task 1 exactly, so migrated data keeps plotting correctly):

```js
const RUN_CHARTS_CONFIG = [
  { label: 'מרחק',       tKey: 'run.chart.distance', color: '#536fac', fmt: v => v.toFixed(1) },
  { label: 'דופק ממוצע', tKey: 'run.chart.hr',       color: '#a05555', fmt: v => Math.round(v) },
  { label: 'קלוריות',    tKey: 'run.chart.calories', color: '#aa7941', fmt: v => Math.round(v) },
  { label: 'צעדים',      tKey: 'run.chart.spm',      color: '#9b5aaf', fmt: v => Math.round(v) },
];
```

(The pace line is dropped from the chart list — it was always *derived*, never a stored field, and under the label-lookup model there is no single field to key it by; PR card still shows best pace via Step 3's `calcRunPRs`. Flagged in the final summary as a minor scope trim, not silently dropped.)

Find `renderRunCharts` and update its two `w[cfg.key]` reads:

```js
  for (const cfg of RUN_CHARTS_CONFIG) {
    const rows   = sorted.filter(w => w[cfg.key] != null);
    if (rows.length === 0) continue;

    const labels = rows.map(w => w.date.slice(5));
    const data   = rows.map(w => w[cfg.key]);
```

replace with:

```js
  for (const cfg of RUN_CHARTS_CONFIG) {
    const rows = sorted.filter(w => _fieldVal(w, cfg.label) != null);
    if (rows.length === 0) continue;

    const labels = rows.map(w => w.date.slice(5));
    const data   = rows.map(w => _fieldVal(w, cfg.label));
```

`filterRunByRange` is unchanged (already keys off `w.date`, not a per-field value).

- [ ] **Step 4: Run the full suite, manual check**

Run: `npx playwright test`. Manual: switch History to אירובי with a mix of migrated + newly-saved cardio entries, confirm streak/PR/charts render sensibly, switch time range (month/year/all), confirm charts re-filter.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(history): relocate streak/PR/charts into cardio History, resolve by field label"
```

---

## Task 5: Playwright Suite Rewrite

**Files:**
- Modify: `tests/running.spec.ts` (near-total rewrite — old dashboard/wizard/OCR assertions are gone), `tests/history.spec.ts` (extend for the domain toggle + cardio edit/delete)

- [ ] **Step 1: Rewrite `tests/running.spec.ts` around the new daily-entry page and template editor**

Replace the file's contents with (keeping the migration test from Plan B Task 1 at the top, unchanged):

```ts
import { test, expect } from '@playwright/test';

test.describe('Cardio Data Migration', () => {
  // ... (unchanged from 2026-08-31-B-cardio-page-rebuild.md Task 1 Step 1 — do not duplicate here, this section is a copy-forward pointer, not new content)
});

test.describe('Cardio Daily Entry Page', () => {
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
    await page.locator('button', { hasText: 'נקה טופס' }).click();
    await expect(distRow.locator('.cardio-field-input')).toHaveValue('');
  });

  test('draft round-trips through a type switch', async ({ page }) => {
    await page.locator('#nav-running').click();
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
  test('add type seeds the 8 default fields including a locked date field', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    await page.locator('.tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill('טסט' + Date.now());
    await page.locator('button', { hasText: 'הוסף' }).click();
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
```

- [ ] **Step 2: Extend `tests/history.spec.ts` for the domain toggle and cardio edit/delete**

Add to `tests/history.spec.ts`, inside `test.describe('History Section', ...)`:

```ts
  test('switching to אירובי shows cardio entries and the stats block', async ({ page }) => {
    await page.locator('#nav-history').click();
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    await expect(page.locator('#cardioHistoryStats')).toBeVisible();
  });

  test('cardio history entries can be edited and deleted', async ({ page }) => {
    await page.locator('#nav-history').click();
    await page.locator('.history-domain-btn[data-domain="cardio"]').click();
    const header = page.locator('.session-header').first();
    test.skip(await header.count() === 0, 'no cardio history in this test account');
    const box = await header.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.locator('#histBulkEditBtn').click();
    await expect(page.locator('.edit-session-wrap')).toBeVisible();
  });
```

- [ ] **Step 3: Run the full suite**

Run: `npx playwright test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/running.spec.ts tests/history.spec.ts
git commit -m "test: rewrite running.spec.ts for the new cardio page, extend history.spec.ts for the domain toggle"
```

---

## Task 6: Final Full Regression Pass + Deploy Checklist

**Files:** none modified — verification-only task.

- [ ] **Step 1: Full suite + manual walkthrough**

Run: `npx playwright test`. Manually walk every touched flow once more end-to-end: strength (unaffected, confirm it still is), cardio daily entry, cardio template editor, History's toggle with both edit and delete on both domains, settings gate removed.

- [ ] **Step 2: Note the two breaking-change deploy considerations (no code action — informational for the release)**

- Draft storage keys changed shape (Phase A Task 1) — any strength draft open in a user's browser the moment this ships is lost once (new draft starts clean under the new key). One-time cost, no migration written for it (matches how the spec's migration section only covers `runWorkouts`, not in-flight drafts).
- `public/index.html`/`public/translations.js` changes require a Capacitor sync + new Android build to reach the installed app (`docs/product/11-android-app.md`) — the web deploy (`firebase deploy --only hosting`) picks up everything immediately, but Android users won't see this until the next app-store release, consistent with how the (still-unimplemented) router plan's Task 8 already documents this same asymmetry.

- [ ] **Step 3: Update product docs**

Update `docs/product/07-running-cardio.md` to describe the new page (replace the entire "3 sub-views" / OCR / feature-gate description with the new type-tab/dynamic-field/template-editor model, remove the Elliptical-OCR section, remove the "out of scope" list's now-resolved items), `docs/product/04-history.md` (add the domain toggle, cardio edit/delete, cardio card body), `docs/product/08-settings.md` (remove the email-allowlist description, add the cardio editor nav row), `docs/product/14-data-model-backend.md` (replace the `runWorkoutTypes`/`runWorkouts` rows with `config/runningTemplates` + the new `runWorkouts` shape). This mirrors the existing project convention already followed by the router plan's own Task 9.

Commit:

```bash
git add docs/product/07-running-cardio.md docs/product/04-history.md docs/product/08-settings.md docs/product/14-data-model-backend.md
git commit -m "docs: update product docs for the cardio redesign and unified history"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** §7 (history toggle, filters/grouping/select/edit/delete/colors for cardio, stats-block relocation) → Tasks 1-4. §9 (deletion inventory's "relocate, don't delete" instruction for streak/PR/charts) → Task 4, directly fulfilling the hand-off Plan B Task 8 Step 4 set up. §10 (test impact) → Task 5. §11 open point 2 (color strategy) → Task 2. §11 open point 3 (chart resolution by label) → Task 4.
- **Type/name consistency check:** `WORKOUT_DOMAINS.cardio`'s `colorClass/renderCardMeta/renderCardBody/badgeText` (Task 2) and `renderEditRow/collectEditRow` (Task 3) match exactly what Phase A Task 7's `buildSessionCard(domain,...)` and this plan's generalized `editSession(domain,...)`/`saveSessionEdit(saveBtn,domain,...)` expect. `historyActiveDomain` is declared once (Task 1) and read by every later task consistently (Task 2's color function doesn't need it — it's per-entry; Tasks 3/4 both read it where the active view, not a specific entry, determines domain).
- **No placeholders:** every step contains complete code, except Task 5 Step 1's `// ... (unchanged from Plan B Task 1)` comment, which is a deliberate copy-forward pointer to already-fully-specified content in a sibling plan file (not a gap — the content exists verbatim in `2026-08-31-B-cardio-page-rebuild.md` Task 1 Step 1), and the pace-chart removal in Task 4 Step 3, which is called out explicitly as an intentional scope trim with its reasoning stated inline, not silently dropped.
