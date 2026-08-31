# Unified Navigation & URL Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-variable `prevSection` navigation model with a real `history.pushState`-backed router so that (1) the Android hardware back button, (2) every in-app "← back" button, and (3) the browser/OS back gesture all walk the exact same navigation stack and produce identical results — and so every reachable screen gets a real, bookmarkable URL.

**Architecture:** All code lives in `public/index.html` (single source for web + Capacitor Android — no new files except one Node test script and one npm dependency). A static `ROUTES` table maps real paths to full screen-state objects; `navigateTo()` is the only function that pushes a new URL; `pushSubState()` layers sub-screens (edit panels' equivalent state, running wizard steps) on the current URL; `_renderRoute()` is the single function that makes the DOM match any state object, called identically from clicks, `popstate`, Android's hardware back button, and app boot.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Auth/Firestore v12 (CDN), Capacitor 8 (`@capacitor/app` new dependency), Playwright for E2E tests.

**Spec:** `docs/superpowers/specs/2026-08-30-unified-navigation-history-design.md`

## Global Constraints

- All JS/HTML changes in `public/index.html` only, except: `public/translations.js` (2 new i18n keys), `package.json` (1 new dependency), `scripts/test-router.js` (new pure-logic test), `tests/*.spec.ts` (new/updated Playwright coverage), and `docs/product/*.md` (post-implementation doc sync).
- `window.showSection(name)` must remain callable directly with **no history side effect** — `tests/navigation.spec.ts:38` and `tests/running.spec.ts:21` call it this way.
- `window.toggleTypesEditor()` must remain callable directly as a raw toggle, independent of history — `tests/measurements.spec.ts:90,94` calls it twice via `page.evaluate`.
- Onclick attribute strings `runGoBack()`, `runShowAdd()`, `runShowHistory()`, `runShowStep3({})` must not change (selected by exact attribute string in `tests/running.spec.ts`) — only their function **bodies** may change.
- No bare-specifier ESM imports for Capacitor plugins (no bundler) — always access via `window.Capacitor.Plugins.X`, matching the existing `FirebaseAuthentication` pattern at `public/index.html:2035`.
- Any value derived from `location.pathname` is used **only** as a lookup key into the static `ROUTES` object — never interpolated into HTML, never used to build a Firestore path.
- All new user-facing strings need both `he` and `en` entries in `public/translations.js` (existing project convention, stated in `docs/superpowers/plans/2026-08-04-copy-target-to-form.md`).
- `escHtml()` must wrap any user-controlled string put into `innerHTML` — not applicable to this feature (no new user-controlled strings reach the DOM), stated here because it's a standing project rule.
- Commit after every task.

---

## Task 1: Core Router — Route Table, `navigateTo`, `pushSubState`, `_renderRoute`, unified `popstate`

**Files:**
- Modify: `public/index.html:2373-2417` (NAVIGATION block)
- Create: `scripts/test-router.js`

**Interfaces:**
- Produces: `ROUTES` (object, path → `{section, editPanel?, runSubView?, runStep?}`), `navigateTo(path, {replace, isRoot})`, `pushSubState(patch)`, `_renderRoute(state)`, `goBack()`, `showSection(name)` (unchanged signature, history side effect removed), global `popstate` listener.
- Consumes: nothing new yet (later tasks wire call sites to these).

- [ ] **Step 1: Write the failing pure-logic test for the route table**

Create `scripts/test-router.js`:

```js
// scripts/test-router.js
// Run: node scripts/test-router.js
//
// ROUTES is duplicated here (not imported) — public/index.html has no
// module boundary a plain Node script can import from. Keep this table
// in sync with the ROUTES constant in public/index.html by hand; a
// mismatch here would only catch itself if the app's own Playwright
// suite (tests/navigation.spec.ts) also fails, which is the real source
// of truth for behavior. This script exists to pin the routing contract
// down cheaply, the same way scripts/test-parse-target.js pins parsing.

const ROUTES = {
  '/':                           { section: 'main' },
  '/timer':                      { section: 'timer' },
  '/measurements':               { section: 'measurements' },
  '/running':                    { section: 'running', runSubView: null },
  '/history':                    { section: 'history' },
  '/settings':                   { section: 'settings' },
  '/settings/workout-plan':      { section: 'main', editPanel: 'workout' },
  '/settings/measurement-types': { section: 'measurements', editPanel: 'measurementTypes' },
  '/running/add':                { section: 'running', runSubView: 'add', runStep: 1 },
  '/running/history':            { section: 'running', runSubView: 'history' },
};

function resolveRoute(path) {
  return ROUTES[path] || null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
  ok ? passed++ : failed++;
}

eq('root resolves to main',                 resolveRoute('/'),                           { section: 'main' });
eq('unknown path resolves to null',         resolveRoute('/nope'),                       null);
eq('workout-plan carries editPanel',        resolveRoute('/settings/workout-plan'),      { section: 'main', editPanel: 'workout' });
eq('measurement-types carries editPanel',   resolveRoute('/settings/measurement-types'), { section: 'measurements', editPanel: 'measurementTypes' });
eq('running/add carries wizard defaults',   resolveRoute('/running/add'),                { section: 'running', runSubView: 'add', runStep: 1 });
eq('running/history carries subview',       resolveRoute('/running/history'),            { section: 'running', runSubView: 'history' });
eq('trailing slash is NOT normalized (documents current strictness)', resolveRoute('/timer/'), null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it currently passes (this is pure duplicated logic, not TDD-red — it validates the table's shape before it exists in the app itself)**

Run: `node scripts/test-router.js`
Expected: `7 passed, 0 failed`

- [ ] **Step 3: Replace the NAVIGATION block in `public/index.html`**

Find and replace this exact block (currently at `public/index.html:2373-2417`):

```js
// ─── NAVIGATION ───────────────────────────────────────────────
const SECTION_ORDER = { main: 0, timer: 1, running: 2, measurements: 2, history: 3, settings: 4 };
let currentSection = 'main';
let prevSection    = 'main';
const _sectionScrollPos = {};

function showSection(name) {
  if (editPanelOpen) toggleEditPanel();
  if (typesEditorOpen) toggleTypesEditor();
  if (name === currentSection) return;

  const mc = document.getElementById('main-content');
  _sectionScrollPos[currentSection] = mc.scrollTop;

  prevSection = currentSection;
  const fromIdx = SECTION_ORDER[currentSection] ?? 0;
  const toIdx   = SECTION_ORDER[name] ?? 0;
  const isRTL = LANGUAGES[currentLang]?.dir === 'rtl';
  const goingForward = toIdx > fromIdx;
  const animCls = (goingForward === isRTL) ? 'anim-left' : 'anim-right';

  document.querySelectorAll('.section').forEach(s =>
    s.classList.remove('active', 'anim-left', 'anim-right')
  );
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const next = document.getElementById('sec-' + name);
  next.classList.add('active', animCls);
  next.addEventListener('animationend', () => next.classList.remove('anim-left', 'anim-right'), { once: true });

  mc.scrollTop = _sectionScrollPos[name] ?? 0;

  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  currentSection = name;
  if (name === 'measurements') setDefaultDate();
  if (name === 'running') initRunSection();
  if (name === 'timer') {
    if (_timerRunning || _timerSecs < _timerTotal) { _tv2ShowView('running'); _tv2UpdateDisplay(); }
    else { _tv2ShowView('setting'); _tv2InitPickers(); }
  }
  if (name === 'settings') initSettingsUI();
  updateHistBulkBar();
  updateMeasBulkBar();
}
```

with:

```js
// ─── NAVIGATION ───────────────────────────────────────────────
const SECTION_ORDER = { main: 0, timer: 1, running: 2, measurements: 2, history: 3, settings: 4 };

// Every top-level screen reachable by URL / bookmark / hardware back
// button. Edit panels and running sub-views get real paths too, so the
// address bar always matches what's on screen. The running wizard's
// steps (1/2/3) stay OUT of this table on purpose — see pushSubState().
const ROUTES = {
  '/':                           { section: 'main' },
  '/timer':                      { section: 'timer' },
  '/measurements':               { section: 'measurements' },
  '/running':                    { section: 'running', runSubView: null },
  '/history':                    { section: 'history' },
  '/settings':                   { section: 'settings' },
  '/settings/workout-plan':      { section: 'main', editPanel: 'workout' },
  '/settings/measurement-types': { section: 'measurements', editPanel: 'measurementTypes' },
  '/running/add':                { section: 'running', runSubView: 'add', runStep: 1 },
  '/running/history':            { section: 'running', runSubView: 'history' },
};

let currentSection = 'main';
const _sectionScrollPos = {};

// Pure DOM primitive: makes the visible section match `name`. Never
// touches history/URL — kept history-free on purpose because two
// Playwright tests call window.showSection() directly and expect no
// side effect beyond the DOM swap.
function showSection(name) {
  if (name === currentSection) return;

  const mc = document.getElementById('main-content');
  _sectionScrollPos[currentSection] = mc.scrollTop;

  const fromIdx = SECTION_ORDER[currentSection] ?? 0;
  const toIdx   = SECTION_ORDER[name] ?? 0;
  const isRTL = LANGUAGES[currentLang]?.dir === 'rtl';
  const goingForward = toIdx > fromIdx;
  const animCls = (goingForward === isRTL) ? 'anim-left' : 'anim-right';

  document.querySelectorAll('.section').forEach(s =>
    s.classList.remove('active', 'anim-left', 'anim-right')
  );
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const next = document.getElementById('sec-' + name);
  next.classList.add('active', animCls);
  next.addEventListener('animationend', () => next.classList.remove('anim-left', 'anim-right'), { once: true });

  mc.scrollTop = _sectionScrollPos[name] ?? 0;

  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  currentSection = name;
  if (name === 'measurements') setDefaultDate();
  if (name === 'running') initRunSection();
  if (name === 'timer') {
    if (_timerRunning || _timerSecs < _timerTotal) { _tv2ShowView('running'); _tv2UpdateDisplay(); }
    else { _tv2ShowView('setting'); _tv2InitPickers(); }
  }
  if (name === 'settings') initSettingsUI();
  updateHistBulkBar();
  updateMeasBulkBar();
}

// ─── ROUTER ────────────────────────────────────────────────────
// navigateTo() is the ONLY place that pushes/replaces a history entry
// with a NEW URL. Every nav-bar button, gear icon, and settings
// shortcut calls this — never showSection() directly — so the browser
// back button, the Android hardware back button, and in-app "← back"
// buttons all walk the exact same stack.
function navigateTo(path, opts = {}) {
  const { replace = false, isRoot = false } = opts;
  const route = ROUTES[path];
  if (!route) { if (!replace) navigateTo('/', { replace: true, isRoot: true }); return; }
  const state = { editPanel: null, runSubView: null, runStep: null, ...route, isRoot };
  if (replace) history.replaceState(state, '', path);
  else         history.pushState(state, '', path);
  _renderRoute(state);
}

// Layers a sub-screen (edit panel state carried on /settings/*, running
// wizard step) on top of the CURRENT url without changing the visible
// path. Used only by the running wizard (Task 5) — the edit panels get
// their own real paths instead (Tasks 3-4).
function pushSubState(patch) {
  const state = { ...(history.state || { section: currentSection }), ...patch, isRoot: false };
  history.pushState(state, '', location.pathname);
  _renderRoute(state);
}

// The single function that makes the DOM match ANY state object.
// Called from navigateTo(), pushSubState(), the popstate listener
// below, the Android hardware-back handler (Task 9), and app boot
// (Task 6). This is what guarantees identical behavior across all of
// those triggers — they all funnel through here.
function _renderRoute(state) {
  showSection(state.section);
  _setWorkoutEditPanel(state.section === 'main' && state.editPanel === 'workout');
  _setMeasurementTypesPanel(state.section === 'measurements' && state.editPanel === 'measurementTypes');
  if (state.section === 'running') _renderRunState(state.runSubView, state.runStep);
}

function goBack() { history.back(); }

window.addEventListener('popstate', e => {
  _renderRoute(e.state || ROUTES[location.pathname] || ROUTES['/']);
});
```

Note: `_setWorkoutEditPanel`, `_setMeasurementTypesPanel`, and `_renderRunState` are defined in Tasks 3, 4, and 5 respectively — this task will not run cleanly end-to-end in the browser until those land, which is expected (they're part of the same navigation refactor, right-sized into separate reviewable tasks). Do not skip Step 4 below; it only checks the file parses and the pure logic matches, not full app behavior.

- [ ] **Step 4: Confirm the file still parses (no browser yet — full behavior lands after Task 5)**

`public/index.html` is HTML, not pure JS, so `node --check` can't run on it directly — extract the module script's contents to a temp `.mjs` file and check that instead (this only parses, it does not execute or fetch the remote CDN imports, so it works offline):

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const m = html.match(/<script type=\"module\">([\s\S]*?)<\/script>/);
fs.writeFileSync('.worktrees-syntax-check.mjs', m[1]);
"
node --check .worktrees-syntax-check.mjs && echo "SYNTAX OK"
rm .worktrees-syntax-check.mjs
```

Expected: `SYNTAX OK`. If this fails, the error message includes a line number into the extracted script — cross-reference against the block you just edited before doing anything else. Do **not** attempt to load the app in a browser until Task 5 is complete — `_setWorkoutEditPanel`/`_setMeasurementTypesPanel`/`_renderRunState` don't exist yet and the app will throw on the first render.

- [ ] **Step 5: Commit**

```bash
git add scripts/test-router.js public/index.html
git commit -m "feat(nav): add router core (ROUTES, navigateTo, pushSubState, _renderRoute)"
```

---

## Task 2: Wire Top-Level Navigation to the Router

**Files:**
- Modify: `public/index.html` (bottom nav `:1243-1255`, gear icons `:865,938,952,1003,1037`, settings back button `:1149`)

**Interfaces:**
- Consumes: `navigateTo(path)`, `goBack()` from Task 1.
- Produces: nothing new — this task only rewires existing onclick attributes.

- [ ] **Step 1: Rewrite the bottom nav buttons**

In `public/index.html:1243-1255`, replace:

```html
  <button class="nav-item active" id="nav-main"         onclick="showSection('main')">
```
```html
  <button class="nav-item"        id="nav-timer"        onclick="showSection('timer')">
```
```html
  <button class="nav-item"        id="nav-measurements" onclick="showSection('measurements')">
```
```html
  <button class="nav-item"        id="nav-running"      onclick="showSection('running')" style="display:none;">
```
```html
  <button class="nav-item"        id="nav-history"      onclick="showSection('history')">
```

with (only the `onclick` values change — keep every other attribute identical):

```html
  <button class="nav-item active" id="nav-main"         onclick="navigateTo('/')">
```
```html
  <button class="nav-item"        id="nav-timer"        onclick="navigateTo('/timer')">
```
```html
  <button class="nav-item"        id="nav-measurements" onclick="navigateTo('/measurements')">
```
```html
  <button class="nav-item"        id="nav-running"      onclick="navigateTo('/running')" style="display:none;">
```
```html
  <button class="nav-item"        id="nav-history"      onclick="navigateTo('/history')">
```

- [ ] **Step 2: Rewrite all 5 gear-icon buttons**

At `public/index.html:865,938,952,1003,1037`, change `onclick="showSection('settings')"` to `onclick="navigateTo('/settings')"` in each of the 5 occurrences (topbar gear icon in main, timer, running, measurements, and history sections). Every other attribute on these buttons is unchanged.

- [ ] **Step 3: Rewrite the settings page's own back button**

At `public/index.html:1149`, replace:

```html
    <button class="topbar-back-btn" onclick="goBack()" data-i18n="btn.back">← חזרה</button>
```

with (unchanged — `goBack()` already means `history.back()` after Task 1, no HTML edit needed here):

```html
    <button class="topbar-back-btn" onclick="goBack()" data-i18n="btn.back">← חזרה</button>
```

(No change required — confirming explicitly so this isn't mistaken for a missed step: `goBack()` was redefined in Task 1 to call `history.back()`, so this button is already correct.)

- [ ] **Step 4: Manually verify in a browser**

Run: `npx firebase emulators:start --only hosting` (or any static server serving `public/`) and open the app in a browser with devtools open.
- Click through all 5 bottom-nav items and confirm the address bar updates to `/`, `/timer`, `/measurements`, `/history` (and `/running` once enabled via settings).
- Click a gear icon, confirm the address bar shows `/settings`.
- Click the settings "← back" button, confirm it returns to whatever page you came from and the URL updates accordingly.
- Click the browser's own back button from `/settings`, confirm identical behavior to the in-app back button.

- [ ] **Step 5: Run the existing navigation test suite to confirm no regression**

Run: `npx playwright test tests/navigation.spec.ts`
Expected: all existing tests pass unchanged (they assert `.active` classes and element visibility, not URLs — see spec §7).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat(nav): wire bottom nav, gear icons, and settings back button to navigateTo/goBack"
```

---

## Task 3: Workout-Plan Editor as a Real Route (`/settings/workout-plan`)

**Files:**
- Modify: `public/index.html:3719-3741` (`toggleEditPanel`, `goBack`-adjacent block, `openWorkoutEdit`, `closeWorkoutEdit`)

**Interfaces:**
- Consumes: `navigateTo`, `pushSubState` (unused here — this uses a real route, not a sub-state), `ROUTES['/settings/workout-plan']` from Task 1.
- Produces: `_setWorkoutEditPanel(open)` — consumed by `_renderRoute` (Task 1).

- [ ] **Step 1: Replace the block**

Find and replace this exact block (currently at `public/index.html:3719-3741`):

```js
let editPanelOpen = false;
function toggleEditPanel() {
  editPanelOpen = !editPanelOpen;
  document.getElementById('mainWorkoutContent').style.display = editPanelOpen ? 'none' : 'block';
  document.getElementById('mainEditPanel').style.display      = editPanelOpen ? 'block' : 'none';
  document.getElementById('mainBackBtn').style.display        = editPanelOpen ? '' : 'none';
  document.getElementById('mainGearBtn').style.display        = editPanelOpen ? 'none' : '';
  if (editPanelOpen) document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  else document.getElementById('nav-main')?.classList.add('active');
  if (editPanelOpen) renderEditAll();
}

function goBack() { showSection(prevSection); }

function openWorkoutEdit() {
  showSection('main');
  if (!editPanelOpen) toggleEditPanel();
}

function closeWorkoutEdit() {
  if (editPanelOpen) toggleEditPanel();
  showSection('settings');
}
```

with:

```js
let editPanelOpen = false;

// Pure DOM primitive: makes the workout-plan editor panel match `open`.
// Kept independent of history/URL — called by _renderRoute() (Task 1)
// with whatever `state.editPanel === 'workout'` evaluates to.
function _setWorkoutEditPanel(open) {
  if (open === editPanelOpen) return;
  editPanelOpen = open;
  document.getElementById('mainWorkoutContent').style.display = editPanelOpen ? 'none' : 'block';
  document.getElementById('mainEditPanel').style.display      = editPanelOpen ? 'block' : 'none';
  document.getElementById('mainBackBtn').style.display        = editPanelOpen ? '' : 'none';
  document.getElementById('mainGearBtn').style.display        = editPanelOpen ? 'none' : '';
  if (editPanelOpen) document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  else document.getElementById('nav-main')?.classList.add('active');
  if (editPanelOpen) renderEditAll();
}

// Kept as a thin backward-compatible alias — not called anywhere after
// this task, but harmless to keep in case a future manual/console call
// relies on the old toggle-style name.
function toggleEditPanel() { _setWorkoutEditPanel(!editPanelOpen); }

function openWorkoutEdit()  { navigateTo('/settings/workout-plan'); }
function closeWorkoutEdit() { history.back(); }
```

- [ ] **Step 2: Run the existing workout edit-panel tests**

Run: `npx playwright test tests/workout.spec.ts`
Expected: **8 pre-existing failures unrelated to this plan** are known and out of scope (confirmed in the SDD ledger, `.superpowers/sdd/2026-08-30-unified-navigation-history/progress.md`) — all 7 "Workout — Log Session" tests that depend on `selectFirstWorkoutType()` (a workout-type-tab → exercise-card rendering issue, nowhere near navigation code) plus the unrelated dark-mode-toggle test in settings.spec.ts. Do not attempt to fix these. The test that actually matters for this task, `closing edit panel navigates back to settings`, passed in the confirmed clean baseline and **must still pass** here (verified against this exact design in the spec, §7) — the sequence `main → settings (navigateTo) → /settings/workout-plan (openWorkoutEdit → navigateTo) → history.back()` lands back on the `/settings` entry, which carries no `editPanel`, so `_renderRoute` closes the panel. If any test beyond the known 8 starts failing, that IS a regression from this task.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(nav): route workout-plan editor through /settings/workout-plan"
```

---

## Task 4: Measurement-Types Editor as a Real Route (`/settings/measurement-types`)

**Files:**
- Modify: `public/index.html:3636-3645` (`toggleTypesEditor`), `:3743-3751` (`openMeasurementsEdit`, `closeMeasurementsEdit`)

**Interfaces:**
- Consumes: `navigateTo`, `ROUTES['/settings/measurement-types']` from Task 1.
- Produces: `_setMeasurementTypesPanel(open)` — consumed by `_renderRoute` (Task 1).

- [ ] **Step 1: Replace `toggleTypesEditor`**

Find and replace this exact block (currently at `public/index.html:3636-3645`):

```js
function toggleTypesEditor() {
  typesEditorOpen = !typesEditorOpen;
  document.getElementById('typesEditorPanel').style.display    = typesEditorOpen ? 'block' : 'none';
  document.getElementById('measurementsContent').style.display = typesEditorOpen ? 'none'  : 'block';
  document.getElementById('measBackBtn').style.display         = typesEditorOpen ? '' : 'none';
  document.getElementById('measGearBtn').style.display         = typesEditorOpen ? 'none' : '';
  if (typesEditorOpen) document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  else document.getElementById('nav-measurements')?.classList.add('active');
  if (typesEditorOpen) { editMeasureTypes = measureTypes.map(t => ({ ...t })); renderTypesList(); }
}
```

with:

```js
// Pure DOM primitive, kept under its ORIGINAL name and toggle-style
// signature on purpose: tests/measurements.spec.ts:90,94 calls
// window.toggleTypesEditor() directly, twice, expecting a raw open/close
// toggle independent of history. _renderRoute() (Task 1) calls the
// explicit-boolean variant below instead.
function toggleTypesEditor() { _setMeasurementTypesPanel(!typesEditorOpen); }

function _setMeasurementTypesPanel(open) {
  if (open === typesEditorOpen) return;
  typesEditorOpen = open;
  document.getElementById('typesEditorPanel').style.display    = typesEditorOpen ? 'block' : 'none';
  document.getElementById('measurementsContent').style.display = typesEditorOpen ? 'none'  : 'block';
  document.getElementById('measBackBtn').style.display         = typesEditorOpen ? '' : 'none';
  document.getElementById('measGearBtn').style.display         = typesEditorOpen ? 'none' : '';
  if (typesEditorOpen) document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  else document.getElementById('nav-measurements')?.classList.add('active');
  if (typesEditorOpen) { editMeasureTypes = measureTypes.map(t => ({ ...t })); renderTypesList(); }
}
```

- [ ] **Step 2: Replace `openMeasurementsEdit`/`closeMeasurementsEdit`**

Find and replace this exact block (currently at `public/index.html:3743-3751`):

```js
function openMeasurementsEdit() {
  showSection('measurements');
  if (!typesEditorOpen) toggleTypesEditor();
}

function closeMeasurementsEdit() {
  if (typesEditorOpen) toggleTypesEditor();
  showSection('settings');
}
```

with:

```js
function openMeasurementsEdit()  { navigateTo('/settings/measurement-types'); }
function closeMeasurementsEdit() { history.back(); }
```

- [ ] **Step 3: Run the existing measurement editor tests**

Run: `npx playwright test tests/measurements.spec.ts`
Expected: all pass, including the two `window.toggleTypesEditor()` direct-call tests (Step 1's raw toggle is untouched in behavior, only internally delegated).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(nav): route measurement-types editor through /settings/measurement-types"
```

---

## Task 5: Running Section as Real Routes + Wizard Steps as Sub-States

**Files:**
- Modify: `public/index.html:1569-1608` (`runShowDashboard/runShowAdd/runShowHistory/runGoBack/runBackFromForm`), `:1723-1764` (`runShowStep1/runSelectType/runShowStep2/runShowStep3`), `:1063,1081,1126` (wizard back button onclick attributes), `:4189-4191` (delete the old dedicated `popstate` listener — Task 1 already installed the unified one)

**Interfaces:**
- Consumes: `navigateTo`, `pushSubState`, `ROUTES['/running']`, `ROUTES['/running/add']`, `ROUTES['/running/history']` from Task 1.
- Produces: `_renderRunState(runSubView, runStep)` — consumed by `_renderRoute` (Task 1).

- [ ] **Step 1: Replace the dashboard/add/history/back functions**

Find and replace this exact block (currently at `public/index.html:1569-1608`):

```js
function runShowDashboard() {
  document.getElementById('run-view-dashboard').classList.add('active');
  document.getElementById('run-view-add').classList.remove('active');
  document.getElementById('run-view-history').classList.remove('active');
  renderRunDashboard();
  renderRunCharts();
}

function runShowAdd() {
  history.pushState({ runSubView: 'add' }, '');
  document.getElementById('run-view-dashboard').classList.remove('active');
  document.getElementById('run-view-add').classList.add('active');
  document.getElementById('run-view-history').classList.remove('active');
  runShowStep1();
}

function runShowHistory() {
  history.pushState({ runSubView: 'history' }, '');
  document.getElementById('run-view-dashboard').classList.remove('active');
  document.getElementById('run-view-add').classList.remove('active');
  document.getElementById('run-view-history').classList.add('active');
  renderRunHistory();
}

function runGoBack() {
  if (history.state?.runSubView) {
    history.back();
  } else {
    runShowDashboard();
  }
}

function runBackFromForm() {
  const type = runWorkoutTypes.find(tp => tp.id === _runSelectedTypeId);
  if (type?.name === 'Elliptical') {
    runShowStep2();
  } else {
    runShowStep1();
  }
}
```

with:

```js
// Pure DOM primitive: makes the running section's 3 top-level views
// (dashboard/add/history) AND the add-wizard's 3 steps match the given
// arguments. Never touches history — called by _renderRoute() (Task 1).
function _renderRunState(runSubView, runStep) {
  document.getElementById('run-view-dashboard').classList.toggle('active', !runSubView);
  document.getElementById('run-view-add').classList.toggle('active', runSubView === 'add');
  document.getElementById('run-view-history').classList.toggle('active', runSubView === 'history');

  if (!runSubView) { renderRunDashboard(); renderRunCharts(); }
  else if (runSubView === 'history') { renderRunHistory(); }
  else if (runSubView === 'add') { _renderRunStep(runStep || 1); }
}

// runShowDashboard/runShowAdd/runShowHistory stay as the PUBLIC entry
// points wired to onclick attributes (their exact names are asserted by
// tests/running.spec.ts) — each now just navigates through the router
// instead of touching the DOM directly.
function runShowDashboard() { navigateTo('/running'); }
function runShowAdd()       { navigateTo('/running/add'); }
function runShowHistory()   { navigateTo('/running/history'); }

// One code path for "back" everywhere in the running section — same
// history.back() the settings page and edit panels use. Because
// runShowAdd/runShowHistory push real routes on top of /running, and
// each wizard step pushes a sub-state on top of /running/add (Step 2
// below), history.back() alone always lands on the correct previous
// screen with no special-casing needed.
function runGoBack() { history.back(); }
```

Note: `runBackFromForm` is deleted entirely — its only job was guessing which step to return to, which the real history stack now answers correctly on its own (see Step 3).

- [ ] **Step 2: Replace the wizard step functions**

Find and replace this exact block (currently at `public/index.html:1723-1764`, only the parts shown — leave the DOM-filling body of `runShowStep3` between lines 1760-1764 untouched):

```js
function runShowStep1() {
  _runSelectedTypeId = null;
  document.getElementById('run-add-step1').style.display = '';
  document.getElementById('run-add-step2').style.display = 'none';
  document.getElementById('run-add-step3').style.display = 'none';

  const list = document.getElementById('run-type-list');
  list.innerHTML = runWorkoutTypes.map(type =>
    `<button class="run-type-btn" onclick="runSelectType('${type.id}','${escHtml(type.name)}')">${escHtml(translateTypeName(type.name))}</button>`
  ).join('');
}

function runSelectType(id, name) {
  _runSelectedTypeId = id;
  if (name === 'Elliptical') {
    runShowStep2();
  } else {
    runShowStep3({});
  }
}

function runShowStep2() {
  document.getElementById('run-add-step1').style.display = 'none';
  document.getElementById('run-add-step2').style.display = '';
  document.getElementById('run-add-step3').style.display = 'none';
  document.getElementById('runOcrZoneText').textContent = '';
  document.getElementById('runOcrError').style.display = 'none';
}

function runShowStep3(prefill) {
  _runPrefill = prefill;
  document.getElementById('run-add-step1').style.display = 'none';
  document.getElementById('run-add-step2').style.display = 'none';
  document.getElementById('run-add-step3').style.display = '';
```

with:

```js
// _renderRunStep(n) is the pure DOM primitive for "show wizard step n
// with whatever _runPrefill/_runSelectedTypeId already hold" — no
// history writes. runShowStep1/2/3 (below) are the PUBLIC entry points
// that render AND push a sub-state; _renderRunState (Step 1) calls this
// directly (no push) when responding to an already-changed history
// position (back button, popstate, boot).
function _renderRunStep(n) {
  document.getElementById('run-add-step1').style.display = n === 1 ? '' : 'none';
  document.getElementById('run-add-step2').style.display = n === 2 ? '' : 'none';
  document.getElementById('run-add-step3').style.display = n === 3 ? '' : 'none';
  if (n === 1) {
    const list = document.getElementById('run-type-list');
    list.innerHTML = runWorkoutTypes.map(type =>
      `<button class="run-type-btn" onclick="runSelectType('${type.id}','${escHtml(type.name)}')">${escHtml(translateTypeName(type.name))}</button>`
    ).join('');
  } else if (n === 2) {
    document.getElementById('runOcrZoneText').textContent = '';
    document.getElementById('runOcrError').style.display = 'none';
  } else if (n === 3) {
    _renderRunStep3Form();
  }
}

function runShowStep1() { _runSelectedTypeId = null; _renderRunStep(1); pushSubState({ runStep: 1 }); }

function runSelectType(id, name) {
  _runSelectedTypeId = id;
  if (name === 'Elliptical') { _renderRunStep(2); pushSubState({ runStep: 2 }); }
  else                       { runShowStep3({}); }
}

// _renderRunStep3Form(prefill) is the pure DOM-filling half of the old
// runShowStep3 body — unchanged logic, just split out so _renderRunStep
// (no-history-write path) and runShowStep3 (history-writing path) can
// both reach it. `prefill` defaults to whatever runShowStep3 last set on
// _runPrefill so popstate/back re-renders the same values.
function _renderRunStep3Form(prefill = _runPrefill) {
  _runPrefill = prefill;
  const selectedType = runWorkoutTypes.find(tp => tp.id === _runSelectedTypeId);
  document.getElementById('run-step3-type').textContent = selectedType ? translateTypeName(selectedType.name) : '';
```

Leave the remainder of the original `runShowStep3` body (the `document.getElementById('run-f-date').value = ...` lines and everything after, through the function's closing brace) exactly as it is — only the two lines shown above (`_runPrefill = prefill;` and the `document.getElementById('run-step3-type')...` line) are being moved into the new `_renderRunStep3Form` function. After the original body's closing brace, add the new public entry point:

```js
function runShowStep3(prefill) { _renderRunStep3Form(prefill); pushSubState({ runStep: 3 }); }
```

- [ ] **Step 3: Rewrite the wizard back-button onclick attributes**

At `public/index.html:1081`, replace:
```html
          <button class="run-btn run-btn-secondary" style="width:100%;margin-top:8px;" onclick="runShowStep1()" data-i18n="btn.back">← חזרה</button>
```
with:
```html
          <button class="run-btn run-btn-secondary" style="width:100%;margin-top:8px;" onclick="goBack()" data-i18n="btn.back">← חזרה</button>
```

At `public/index.html:1126`, replace:
```html
          <button class="run-btn run-btn-secondary" style="width:100%;margin-top:4px;" onclick="runBackFromForm()" data-i18n="btn.back">← חזרה</button>
```
with:
```html
          <button class="run-btn run-btn-secondary" style="width:100%;margin-top:4px;" onclick="goBack()" data-i18n="btn.back">← חזרה</button>
```

Leave `public/index.html:1063` and `:1135` (`onclick="runGoBack()"`) untouched — their function body already becomes `history.back()` in Step 1, and their exact attribute string is asserted by `tests/running.spec.ts:96`.

- [ ] **Step 4: Delete the now-redundant dedicated `popstate` listener**

At `public/index.html:4189-4191`, delete:

```js
window.addEventListener('popstate', () => {
  if (currentSection === 'running') runShowDashboard();
});
```

(The unified `popstate` listener installed in Task 1 now handles this — folding the running section's special case into the general mechanism instead of keeping two listeners.)

- [ ] **Step 5: Remove `runBackFromForm` from the running exports block**

At `public/index.html:4180-4187`, replace:

```js
Object.assign(window, {
  runShowDashboard, runShowAdd, runShowHistory,
  runShowStep1, runSelectType, runShowStep2, runShowStep3,
  runHandleOcr, runSaveWorkout,
  runGoBack, runBackFromForm,
  runSetRange, runToggleHistoryRow,
  saveRunningEnabled,
});
```

with:

```js
Object.assign(window, {
  runShowDashboard, runShowAdd, runShowHistory,
  runShowStep1, runSelectType, runShowStep3,
  runHandleOcr, runSaveWorkout,
  runGoBack,
  runSetRange, runToggleHistoryRow,
  saveRunningEnabled,
});
```

(`runShowStep2` and `runBackFromForm` are no longer called from any `onclick` attribute after Step 3 — `runShowStep2`'s only remaining caller is `runSelectType`, an internal JS call that doesn't need a `window` export; keep the function itself, just drop it from this export list. `runBackFromForm` is fully deleted.)

- [ ] **Step 6: Run the existing running-section tests**

Run: `npx playwright test tests/running.spec.ts`
**Confirmed pre-existing, out-of-scope gap (verified in the SDD ledger by checking out the pre-Task-1 commit and reproducing identically): 13 of 15 tests in this file already fail before this task, and before this whole plan — every test that depends on the `enableRunningSection()` helper (its toggle-click step hangs until timeout). This is NOT something to investigate or fix as part of this task.** Only 2 tests are expected to pass and must keep passing: "running section is present in DOM" and "running toggle exists in settings" (neither uses the broken helper). Since the automated suite cannot exercise anything past the enable step, Step 7 below (manual browser verification) is this task's PRIMARY verification, not a supplement — do not skip it or treat a "13 failed, as expected" result as sufficient on its own.

- [ ] **Step 7: Manual verification of the wizard-step back fix**

The normal settings-toggle UI path is blocked by the pre-existing bug from Step 6 (the toggle click hangs), so bypass it: `saveRunningEnabled` is directly exported to `window` (`public/index.html:4250` area) — write a small throwaway Playwright script (not part of the committed test suite) that logs in, then runs `page.evaluate(() => (window).saveRunningEnabled(true))` instead of clicking the toggle, then `page.goto('/running/add')` (or `page.evaluate(() => (window).runShowAdd())`), selects "Elliptical" to reach step 2, calls `page.goBack()`, and asserts `page.url()` ends in `/running/add` with step 1's DOM visible (`#run-add-step1` displayed, not step 2) — confirming you land on step 1 of the wizard, not the dashboard (the mid-wizard regression fix described in spec §3.3/§5.4). Then `page.goBack()` again and assert you land on `/running` with the dashboard visible. Delete the throwaway script when done — it is not part of this task's committed deliverable, just a verification aid for the pre-existing broken toggle helper.

- [ ] **Step 8: Commit**

```bash
git add public/index.html
git commit -m "feat(nav): route running dashboard/add/history + wizard steps through the router"
```

---

## Task 6: Boot-Time Route Resolution + Running Feature-Gate Re-Check

**Files:**
- Modify: `public/index.html:2314-2324` (`initApp`)

**Interfaces:**
- Consumes: `navigateTo`, `ROUTES` from Task 1; existing running-gate check pattern from `initSettingsUI` (read, not modified, in this task).
- Produces: nothing new — this task makes boot resolve from the URL instead of always defaulting to `main`.

- [ ] **Step 1: Replace `initApp`**

Find and replace this exact block (currently at `public/index.html:2314-2324`):

```js
async function initApp() {
  // Phase 1 — instant from localStorage (no Firestore)
  const hadCache = _applyLocalCache();
  selectType(workoutTypes[0] || 'A');
  renderTypeButtons();
  _draftAttachListeners();
  _draftStartFirestoreTimer();
  hideOverlay();
  // Phase 2 — background Firestore sync (non-blocking)
  _backgroundSync(hadCache).catch(() => {});
}
```

with:

```js
async function initApp() {
  // Phase 1 — instant from localStorage (no Firestore)
  const hadCache = _applyLocalCache();
  selectType(workoutTypes[0] || 'A');
  renderTypeButtons();
  _draftAttachListeners();
  _draftStartFirestoreTimer();
  hideOverlay();
  // Phase 2 — background Firestore sync (non-blocking)
  _backgroundSync(hadCache).catch(() => {});

  // Boot-time route resolution: land on whatever URL the tab actually
  // has (deep link, refresh, bookmark) instead of always defaulting to
  // main. An unrecognized path falls back to '/' — see spec §3.5/§4 for
  // why location.pathname is only ever used as an allowlist lookup key.
  let bootPath = ROUTES[location.pathname] ? location.pathname : '/';
  if (bootPath.startsWith('/running') && !_isRunningAllowed()) bootPath = '/';
  navigateTo(bootPath, { replace: true, isRoot: true });
}

// Re-checks the exact same gate initSettingsUI already applies (hard-coded
// email allow-list + the runningEnabled flag) so a direct/bookmarked
// /running URL can't show the section to a user it isn't meant for. This
// is UI convenience, not a security boundary — see docs/product/12-security-and-privacy.md.
function _isRunningAllowed() {
  const allowed = ['eitan357@gmail.com', 'test@gmail.com'];
  return allowed.includes(currentUser?.email) && runningEnabled === true;
}
```

- [ ] **Step 2: Also guard `navigateTo` itself against a direct in-app click reaching `/running` while ungated**

In the `navigateTo` function from Task 1 (`public/index.html`, NAVIGATION block), find:

```js
function navigateTo(path, opts = {}) {
  const { replace = false, isRoot = false } = opts;
  const route = ROUTES[path];
  if (!route) { if (!replace) navigateTo('/', { replace: true, isRoot: true }); return; }
```

and replace with:

```js
function navigateTo(path, opts = {}) {
  const { replace = false, isRoot = false } = opts;
  if (path.startsWith('/running') && typeof _isRunningAllowed === 'function' && !_isRunningAllowed()) path = '/';
  const route = ROUTES[path];
  if (!route) { if (!replace) navigateTo('/', { replace: true, isRoot: true }); return; }
```

(The `typeof _isRunningAllowed === 'function'` guard is because `navigateTo` is defined earlier in the file than `_isRunningAllowed` — this task adds the check without needing to physically move either function.)

- [ ] **Step 3: Verify `runningEnabled`/`currentUser` are already in scope at this point in the file**

Run: `grep -n "^let runningEnabled\|^let currentUser" public/index.html`
Expected: both are declared as top-level `let` bindings earlier in the file (before the NAVIGATION block), so they're safely readable from `_isRunningAllowed` regardless of where it's defined.

- [ ] **Step 4: Manual verification**

- Log in, navigate to `/timer`, refresh the page (F5) → confirm you land back on the Timer section, not Main.
- Manually type an unknown path (e.g. `/does-not-exist`) in the address bar and load it → confirm it redirects to `/` and shows Main.
- As a non-gated test user, manually type `/running` in the address bar → confirm it redirects to `/` (or shows Main), not the running dashboard.

- [ ] **Step 5: Run the full navigation + running suites**

Run: `npx playwright test tests/navigation.spec.ts tests/running.spec.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat(nav): resolve boot route from URL, re-check running feature gate"
```

---

## Task 7: Deep-Link-After-Login

**Files:**
- Modify: `public/index.html:1970-1997` (`onAuthStateChanged` listener)

**Interfaces:**
- Consumes: `ROUTES`, `navigateTo` from Task 1; `initApp` from Task 6 (this task changes what happens around the `initApp()` call, not inside it).
- Produces: `_pendingPath` (module-scope variable).

- [ ] **Step 1: Replace the `onAuthStateChanged` listener**

Find and replace this exact block (currently at `public/index.html:1970-1997`):

```js
// ─── AUTH STATE LISTENER ─────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    _updateTopbarName();
    document.getElementById('auth-screen').classList.add('hidden');
    const ov = document.getElementById('loading-overlay');
    ov.classList.remove('fade-out');
    ov.style.display = 'flex';
    await initApp();
  } else {
    currentUser = null;

    // Reset all per-user in-memory state so the next login gets a clean slate
    selectedType       = null;
    _tabState          = {};
    activeFilter       = 'all';
    runWorkouts        = [];
    runWorkoutTypes    = [];
    _runSelectedTypeId = null;
    _runPrefill        = {};
    clearInterval(_draftFirestoreTimer);
    if (editPanelOpen)   toggleEditPanel();
    if (typesEditorOpen) toggleTypesEditor();

    document.getElementById('auth-screen').classList.remove('hidden');
    hideOverlay();
  }
});
```

with:

```js
// ─── AUTH STATE LISTENER ─────────────────────────────────────
// Set only while the auth screen is visible: the path the user actually
// asked for (deep link / bookmark) before we knew whether they were
// logged in. Read once, right after successful login, then cleared.
let _pendingPath = null;

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    _updateTopbarName();
    document.getElementById('auth-screen').classList.add('hidden');
    const ov = document.getElementById('loading-overlay');
    ov.classList.remove('fade-out');
    ov.style.display = 'flex';

    // Allowlist check: _pendingPath is user-controllable (whatever path
    // was in the address bar before login) — only ever used as a lookup
    // key into the static ROUTES table, never trusted as-is. See spec §4.
    const requested   = (_pendingPath && ROUTES[_pendingPath]) ? _pendingPath : null;
    _pendingPath = null;

    await initApp(); // Task 6's boot resolution reads location.pathname as a fallback

    if (requested) navigateTo(requested, { replace: true, isRoot: true });
  } else {
    currentUser = null;

    // Reset all per-user in-memory state so the next login gets a clean slate
    selectedType       = null;
    _tabState          = {};
    activeFilter       = 'all';
    runWorkouts        = [];
    runWorkoutTypes    = [];
    _runSelectedTypeId = null;
    _runPrefill        = {};
    clearInterval(_draftFirestoreTimer);
    if (editPanelOpen)   toggleEditPanel();
    if (typesEditorOpen) toggleTypesEditor();

    // Remember what the user was trying to reach (if it's a real route)
    // so a fresh login can return them there, then reset the address bar
    // to '/' — a logged-out tab should never display a deep path in the
    // URL while showing the auth screen.
    _pendingPath = ROUTES[location.pathname] ? location.pathname : null;
    history.replaceState(null, '', '/');

    document.getElementById('auth-screen').classList.remove('hidden');
    hideOverlay();
  }
});
```

- [ ] **Step 2: Manual verification**

- While logged out, manually navigate to `/history` (address bar shows `/` per Step 1's `replaceState`, but this simulates the "was mid-navigation when session expired" case by setting `_pendingPath` before logging in) — simplest real test: log out from `/history`, confirm the address bar resets to `/`; then log back in and confirm you're returned to `/history`.
- Load the app fresh (new incognito tab) at `/settings`, log in from scratch → confirm you land on `/settings` after login, not Main.

- [ ] **Step 3: Run the full auth + navigation suites**

Run: `npx playwright test tests/auth.spec.ts tests/navigation.spec.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(nav): resume the requested deep link after login, reset URL on logout"
```

---

## Task 8: Android Hardware Back Button

**Files:**
- Modify: `package.json` (add dependency), `public/index.html` (new handler, near the end of the script before the exports block)
- Modify: `public/translations.js` (2 new keys)

**Interfaces:**
- Consumes: `history.state.isRoot` from Task 1's `navigateTo`; `toast()`, `t()` (existing).
- Produces: `handleHardwareBack()`.

- [ ] **Step 1: Install the plugin**

Run: `npm install @capacitor/app`

Expected: `package.json`'s `dependencies` block gains a new `"@capacitor/app": "^<version>"` line (npm picks the version compatible with the existing Capacitor 8 packages already in the file — do not hand-pin a version number).

- [ ] **Step 2: Add the two i18n keys**

In `public/translations.js`, in the Hebrew block, find:

```js
    'btn.delete_confirm': 'מחק?',
```

and add immediately after it:

```js
    'btn.delete_confirm': 'מחק?',

    // ── App-level (hardware back button) ────────────────────────────
    'app.press_back_exit': 'לחץ שוב ליציאה',
```

In the English block, find:

```js
    'btn.delete_confirm': 'Delete?',
```

and add immediately after it:

```js
    'btn.delete_confirm': 'Delete?',

    // ── App-level (hardware back button) ────────────────────────────
    'app.press_back_exit': 'Press back again to exit',
```

- [ ] **Step 3: Add the hardware back button handler**

In `public/index.html`, find the `// ─── RUNNING EXPORTS ─────────────────────────────────` `Object.assign(window, {...})` block (the one Task 5 last edited) and add the following code **immediately after its closing `});`**, i.e. exactly where Task 5 Step 4 deleted the old dedicated `popstate` listener, right before the closing `</script>` tag — this is genuinely the last statement in the module script, so anchor on "right after the RUNNING EXPORTS block's closing `});`", not on any line number (every earlier task in this plan shifts line numbers — match by the code shown, never by a cited line):

```js
// ─── ANDROID HARDWARE BACK BUTTON ──────────────────────────────
// Routes the physical back button / gesture-nav through the exact same
// history.back() every in-app "← back" button already uses (Tasks 2-5),
// so there is exactly one back-navigation mechanism in the whole app.
let _backPressedOnce = false;

function handleHardwareBack() {
  // Never dismiss the draft modal via hardware back — same rule as its
  // existing no-backdrop-dismiss behavior (data-loss protection).
  const draftModal = document.getElementById('draftModal');
  if (draftModal && draftModal.style.display !== 'none') return;

  const authVisible = !document.getElementById('auth-screen').classList.contains('hidden');
  const atRoot = authVisible || history.state?.isRoot === true;

  if (atRoot) {
    if (_backPressedOnce) { window.Capacitor.Plugins.App.exitApp(); return; }
    _backPressedOnce = true;
    toast(t('app.press_back_exit'));
    setTimeout(() => { _backPressedOnce = false; }, 2000);
    return;
  }
  history.back();
}

if (window.Capacitor?.isNativePlatform()) {
  window.Capacitor.Plugins.App.addListener('backButton', handleHardwareBack);
}
```

- [ ] **Step 4: Sync Capacitor**

Run: `npx cap sync android`

Expected: output confirms `@capacitor/app` was found and its native Android module was added to the `android/` project.

- [ ] **Step 5: Manual verification on a device or emulator**

Build and run the debug APK (`npx cap open android` → Run in Android Studio):
- From the Main screen (root), press the hardware back button once → confirm a "Press back again to exit" toast appears and the app stays open.
- Press it again within ~2 seconds → confirm the app exits.
- Navigate Main → Timer → Settings → Workout Plan editor, then press the hardware back button repeatedly → confirm it retraces exactly: editor → Settings → Timer → Main (root, showing the exit toast).
- Trigger the draft-modal (have an unsaved draft from a previous session, or manually show `#draftModal` via devtools) and press the hardware back button → confirm the modal stays open and nothing else happens.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json public/index.html public/translations.js
git commit -m "feat(nav): add Android hardware back button support via @capacitor/app"
```

Note: this task changes app behavior, which per `docs/product/11-android-app.md` requires a new Android build/release (`versionCode`/`versionName` bump + signed AAB) to actually reach users of the installed app — the web deploy (`firebase deploy --only hosting`) picks up everything else in this plan immediately, but this task's user-visible effect is Android-app-only and ships on the app's own release cadence.

---

## Task 9: Update Product Documentation

**Files:**
- Modify: `docs/product/00-overview.md` (navigation principles section)
- Modify: `docs/product/08-settings.md` (back-button description)
- Modify: `docs/product/07-running-cardio.md` (wizard back-button note)
- Modify: `docs/product/11-android-app.md` (hardware back button)

**Interfaces:** none — documentation only, no code interfaces.

- [ ] **Step 1: Update `docs/product/00-overview.md`**

In the "עקרונות מוצריים חוצי-אפליקציה" (cross-app product principles) numbered list, add a new item after the existing "Feature Gating" entry:

```markdown
8. **ניווט מבוסס URL אחיד:** כל עמוד נגיש (כולל פאנלי עריכה ותתי-מסכי אירובי) מיוצג ב-`history.pushState` עם נתיב אמיתי (`/timer`, `/settings/workout-plan` וכו'). כפתור "← חזרה" בכל מקום באפליקציה, כפתור החזרה של הדפדפן, ומחוות/כפתור החזרה הפיזי באפליקציית האנדרואיד — כולם קוראים לאותה פונקציה (`history.back()`), כך שהתנהגות הניווט אחורה זהה בכל שלושת המקורות. פירוט מלא ב-`docs/superpowers/specs/2026-08-30-unified-navigation-history-design.md`.
```

- [ ] **Step 2: Update `docs/product/08-settings.md`**

Find the sentence describing the settings back button (near `prevSection`/`goBack` behavior) and replace any description implying a single "last visited section" memory with:

```markdown
כפתור "← חזרה" קורא ל-`history.back()` — חלק ממנגנון ניווט מאוחד המבוסס על מחסנית history אמיתית (לא משתנה יחיד), כך שרצף ניווט מרובה-שלבים (למשל טיימר → הגדרות → עריכת תוכנית → הגדרות → חזרה) מחזיר תמיד לעמוד הנכון, ללא קשר לכמה מסכי-ביניים נפתחו בדרך. פירוט ב-`docs/superpowers/specs/2026-08-30-unified-navigation-history-design.md`.
```

- [ ] **Step 3: Update `docs/product/07-running-cardio.md`**

Add a note after the description of the 3-step add-workout wizard:

```markdown
**הערה מוצרית (עודכן):** כל שלב באשף (בחירת סוג / OCR / טופס) נדחף כרשומת history נפרדת. לחיצה על "חזרה" (בממשק, בדפדפן, או בכפתור הפיזי באפליקציית האנדרואיד) חוזרת שלב-שלב באשף, ולא קופצת ישירות לדשבורד — תיקון להתנהגות קודמת שבה חזרה באמצע האשף דילגה תמיד לדשבורד.
```

- [ ] **Step 4: Update `docs/product/11-android-app.md`**

Add a new section after "נקודת השוני האמיתית היחידה: התחברות Google":

```markdown
## כפתור החזרה הפיזי (Hardware Back Button)

תלות נוספת שנדרשה לצורך תמיכה בכפתור/מחוות הניווט הפיזי של אנדרואיד: `@capacitor/app`. ההתנהגות: מהיכן שהמשתמש נמצא, לחיצה על כפתור החזרה מבצעת בדיוק את אותה פעולה שכפתור "← חזרה" באפליקציה היה מבצע (`history.back()`) — לא פעולה נפרדת. במסך הבית (Main, ללא פאנל פתוח) ובמסך ההתחברות, לחיצה ראשונה מציגה הודעת "לחץ שוב ליציאה" ורק לחיצה שנייה תוך כ-2 שניות סוגרת את האפליקציה בפועל (התנהגות סטנדרטית באנדרואיד, ושיפור לעומת ברירת המחדל הקודמת של יציאה מיידית מכל מקום באפליקציה). מודל הטיוטה (`#draftModal`) חוסם את כפתור החזרה הפיזי לגמרי, עקבי עם מדיניות "אין סגירה בלחיצה על הרקע" הקיימת שלו.
```

- [ ] **Step 5: Commit**

```bash
git add docs/product/00-overview.md docs/product/08-settings.md docs/product/07-running-cardio.md docs/product/11-android-app.md
git commit -m "docs: update product docs for unified navigation/routing architecture"
```

---

## Task 10: New/Updated Playwright Coverage (Including the Reported Bug's Regression Test)

**Files:**
- Modify: `tests/navigation.spec.ts` (add URL assertions + the exact regression scenario)
- Modify: `tests/settings.spec.ts` (add multi-hop back regression coverage if not already covered by the above)

**Interfaces:** none — test-only.

- [ ] **Step 1: Add URL-per-page assertions to `tests/navigation.spec.ts`**

Add this new test inside the existing `test.describe('Navigation', ...)` block, after the `'navigate to history section'` test:

```ts
  test('navigating updates the URL for each top-level page', async ({ page }) => {
    await page.locator('#nav-timer').click();
    await expect(page).toHaveURL(/\/timer$/);

    await page.locator('#nav-history').click();
    await expect(page).toHaveURL(/\/history$/);

    await page.locator('#mainGearBtn').click();
    await page.locator('#nav-main').click(); // nav-main isn't visible from settings; navigate directly
  });
```

Note: the second half of the test above is intentionally minimal because `#nav-main` is not part of the settings screen — adjust if needed once Task 2 is verified in a live run, but do not remove the URL assertions for `/timer` and `/history`, which are the core of this test.

- [ ] **Step 2: Add the exact reported-bug regression test**

Add this new test inside `test.describe('Navigation', ...)`:

```ts
  test('regression: back from settings after visiting an edit panel returns to the ORIGINAL page, not the edit panel\'s section', async ({ page }) => {
    // Reproduces the reported bug exactly: Timer -> Settings -> open an
    // edit panel -> back (lands on Settings, correct) -> back again
    // (used to land on the edit panel's own section instead of Timer).
    await page.locator('#nav-timer').click();
    await expect(page.locator('#sec-timer')).toHaveClass(/active/);

    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    await page.locator('button.settings-item', { hasText: 'עריכת תוכנית' }).click();
    await expect(page.locator('#mainEditPanel')).toBeVisible({ timeout: 8000 });

    await page.locator('#mainBackBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);

    // Scoped to #sec-settings specifically — mainBackBtn (#sec-main) and
    // measBackBtn (#sec-measurements) share the same .topbar-back-btn class
    // and the same "חזרה" text, so an unscoped locator would be ambiguous.
    await page.locator('#sec-settings .topbar-back-btn').click();
    await expect(page.locator('#sec-timer')).toHaveClass(/active/);
  });
```

- [ ] **Step 3: Run the updated suite**

Run: `npx playwright test tests/navigation.spec.ts`
Expected: all pass, including the two new tests. If the regression test fails, do not proceed — it means Tasks 1-3 were not applied correctly; re-check the exact diffs in those tasks before continuing.

- [ ] **Step 4: Run the full test suite once as a final cross-check**

Run: `npx playwright test`
Expected: the pre-existing, out-of-scope failures logged in the SDD ledger (8 as of Task 1: `settings.spec.ts:22` dark-mode-toggle, and 7 `workout.spec.ts` "Log Session" tests depending on `selectFirstWorkoutType()`) plus whatever `running.spec.ts`/`measurements.spec.ts` baseline was confirmed before Tasks 4-5 — check the ledger for the final confirmed count. Every OTHER spec must pass. Any failure outside that named, ledger-confirmed set is a real regression from this plan and must be fixed before this task is considered done.

- [ ] **Step 5: Commit**

```bash
git add tests/navigation.spec.ts
git commit -m "test(nav): add URL assertions and the reported multi-hop back-button regression test"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** §3.1 route table → Task 1. §3.2 three functions → Task 1. §3.3 wizard sub-states → Task 5. §3.4 hardware back → Task 8. §3.5 boot resolution/deep-link → Tasks 6-7. §3.6 feature-gate re-check → Task 6. §3.7 logout → Task 7 (folded into the same `onAuthStateChanged` edit). §4 security → enforced by the allowlist pattern in Tasks 6-7 and called out explicitly in their step descriptions. §5 UX decisions → Tasks 5 (wizard), 8 (double-back-to-exit, draft modal guard). §6 extensibility → achieved by construction (Task 1's `ROUTES`-driven design), no separate task needed. §7 test-compatibility constraints → verified inline in Tasks 1, 3, 4, 5 and covered by Task 10's regression test.
- **Type/name consistency check:** `_setWorkoutEditPanel`/`_setMeasurementTypesPanel`/`_renderRunState` are declared as consumed in Task 1's interfaces and defined with matching names/signatures in Tasks 3, 4, 5 respectively. `navigateTo`, `pushSubState`, `goBack`, `ROUTES` are defined once (Task 1) and only ever consumed, never redefined, by later tasks. `_isRunningAllowed` is defined in Task 6 and referenced defensively (via `typeof` guard) from `navigateTo`, which is physically defined earlier in the file — call order at runtime is unaffected since both are hoisted function declarations.
- **No placeholders:** every step above contains complete, copy-pasteable code — no "add appropriate handling" or "similar to Task N" instructions.
