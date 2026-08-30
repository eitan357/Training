# Running App Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a gated running tracker feature (dashboard, add workout, history, charts) inside the existing training diary app.

**Architecture:** All code lives in `public/index.html` — one HTML file, vanilla JS ES module, Firebase Firestore. A new `#sec-running` section with internal sub-views replaces the `מדידות` nav slot when `runningEnabled` is true for `eitan357@gmail.com`. No new files needed.

**Tech Stack:** Vanilla JS, Firebase Firestore v12, Chart.js v4 (CDN), Tesseract.js v5 (CDN, lazy-loaded)

## Global Constraints

- All code in `public/index.html` only — no new files
- RTL Hebrew UI, `dir="rtl"`, dark-theme compatible (`var(--bg)`, `var(--surface)`, `var(--text)`, `var(--sub)`, `var(--primary)`)
- Feature gated: `currentUser.email === 'eitan357@gmail.com'`
- Firestore prefix: `users/{uid}/runWorkouts`, `users/{uid}/runWorkoutTypes`
- `SECTION_ORDER` currently: `{ main:0, timer:1, measurements:2, history:3, settings:4 }` — add `running:2`
- Nav bar has 4 items: main, timer, measurements, history. `מדידות` slot replaced by `ריצה` when enabled
- Existing `toast(msg, type)` available for user feedback
- Chart.js CDN: `https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js`
- Tesseract.js CDN: `https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js`
- Commit after every task

---

## Task 1: CDN Scripts + CSS + Running State Variables

**Files:**
- Modify: `public/index.html` — `<head>` (CDN), `<style>` block (CSS), JS state section (~line 1056)

**Interfaces:**
- Produces: `runningEnabled` (boolean), `runWorkouts` (array), `runWorkoutTypes` (array), CSS classes `.run-card`, `.run-sub-view`, `.run-btn`

- [ ] **Step 1: Add Chart.js CDN script after `</style>` tag (before `</head>`) at ~line 635**

```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
</head>
```

- [ ] **Step 2: Add running CSS in the `<style>` block, before the closing `</style>` tag (~line 634)**

```css
    /* ── RUNNING SECTION ── */
    .run-card {
      background: var(--surface); border-radius: var(--radius);
      box-shadow: var(--shadow); border: 1px solid var(--border);
      padding: 16px; margin-bottom: 12px;
    }
    .run-card-title { font-size: 13px; font-weight: 700; color: var(--sub); margin-bottom: 10px; letter-spacing: .4px; text-transform: uppercase; }
    .run-stat-row { display: flex; gap: 12px; flex-wrap: wrap; }
    .run-stat { flex: 1; min-width: 80px; text-align: center; }
    .run-stat-val { font-size: 22px; font-weight: 800; color: var(--text); }
    .run-stat-lbl { font-size: 11px; color: var(--sub); margin-top: 2px; }
    .run-sub-view { display: none; }
    .run-sub-view.active { display: block; }
    .run-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 18px; border: none; border-radius: var(--radius);
      font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity .15s; }
    .run-btn:active { opacity: .8; }
    .run-btn-primary { background: var(--primary); color: #fff; }
    .run-btn-secondary { background: var(--surface); color: var(--text); border: 1.5px solid var(--border); }
    .run-type-btn { width: 100%; padding: 14px; background: var(--surface);
      border: 1.5px solid var(--border); border-radius: var(--radius);
      font-size: 15px; font-weight: 700; color: var(--text); cursor: pointer;
      text-align: center; margin-bottom: 10px; transition: border-color .15s; }
    .run-type-btn:hover { border-color: var(--primary); }
    .run-range-btn { padding: 6px 14px; border: 1.5px solid var(--border); border-radius: 20px;
      background: transparent; color: var(--sub); font-size: 13px; font-weight: 600; cursor: pointer; }
    .run-range-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .run-range-row { display: flex; gap: 8px; margin-bottom: 12px; }
    .run-chart-wrap { position: relative; height: 160px; margin-bottom: 20px; }
    .run-history-row { display: flex; justify-content: space-between; align-items: center;
      padding: 12px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
    .run-history-row:last-child { border-bottom: none; }
    .run-history-detail { padding: 10px 0 4px; display: none; font-size: 13px; color: var(--sub); }
    .run-history-detail.open { display: block; }
    .run-history-date { font-size: 14px; font-weight: 700; color: var(--text); }
    .run-history-meta { font-size: 13px; color: var(--sub); margin-top: 2px; }
    .run-streak-badge { text-align: center; padding: 16px; }
    .run-streak-num { font-size: 48px; font-weight: 900; color: var(--primary); }
    .run-streak-lbl { font-size: 14px; color: var(--sub); margin-top: 4px; }
    .run-form-field { margin-bottom: 14px; }
    .run-form-label { font-size: 13px; font-weight: 700; color: var(--sub); margin-bottom: 6px; display: block; }
    .run-form-input { width: 100%; padding: 11px 13px; border: 1.5px solid var(--border);
      border-radius: var(--radius); font-size: 15px; background: var(--bg); color: var(--text); }
    .run-form-input:focus { outline: none; border-color: var(--primary); }
    .run-toggle-row { display: flex; justify-content: space-between; align-items: center; }
    .run-ocr-zone { width: 100%; padding: 32px 16px; border: 2px dashed var(--primary);
      border-radius: var(--radius); text-align: center; cursor: pointer; color: var(--primary);
      font-weight: 700; font-size: 15px; margin-bottom: 12px; }
    .settings-running-gate { display: none; }
```

- [ ] **Step 3: Add state variables after the existing state block (~line 1071, after `let lastWorkouts = {};`)**

```js
// ─── RUNNING STATE ────────────────────────────────────────────
let runningEnabled    = false;
let runWorkouts       = [];
let runWorkoutTypes   = [];
let _runCharts        = {};
let _runCurrentRange  = 'year';
let _runAddStep       = 1;
let _runSelectedTypeId = null;
let _runPrefill       = {};
```

- [ ] **Step 4: Verify the file compiles (open dev tools in browser — no errors expected yet)**

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add CDN scripts, CSS, and state variables"
```

---

## Task 2: Feature Gate — Settings Toggle + Nav Swap

**Files:**
- Modify: `public/index.html` — settings HTML (~line 920), nav HTML (~line 928), `initSettingsUI()` (~line 1032), `showSection()` (~line 1329), `SECTION_ORDER` (~line 1325)

**Interfaces:**
- Consumes: `runningEnabled`, `currentUser`
- Produces: `loadRunningEnabled()`, `saveRunningEnabled(val)`, nav slot swap, `showSection('running')` support

- [ ] **Step 1: Add the settings toggle HTML inside `#sec-settings`, before the logout button (~line 920). Insert after the timer card block:**

```html
    <!-- RUNNING GATE (eitan357 only) -->
    <div class="settings-running-gate" id="runningGateBlock" style="margin-top:8px;">
      <div class="settings-group-label">ריצה</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-item-text">
            <div class="settings-row-label">הצג עמוד ריצה</div>
            <div class="settings-item-sub">מחליף את עמוד המדידות בנב-בר</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="runningEnabledToggle" onchange="saveRunningEnabled(this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: Add `id="nav-measurements"` nav button attribute and modify nav HTML to include a running button. Replace the entire `<nav class="bottomnav">` block (~lines 928–941):**

```html
<nav class="bottomnav">
  <button class="nav-item active" id="nav-main"         onclick="showSection('main')">
    <span class="nav-icon">🏋️</span><span data-i18n="nav.workout">אימון</span>
  </button>
  <button class="nav-item"        id="nav-timer"        onclick="showSection('timer')">
    <span class="nav-icon" id="timerNavIcon">⏱️</span><span id="timerNavLabel" data-i18n="nav.timer">טיימר</span>
  </button>
  <button class="nav-item"        id="nav-measurements" onclick="showSection('measurements')">
    <span class="nav-icon">📏</span><span data-i18n="nav.measurements">מדידות</span>
  </button>
  <button class="nav-item"        id="nav-running"      onclick="showSection('running')" style="display:none;">
    <span class="nav-icon">🏃</span><span>ריצה</span>
  </button>
  <button class="nav-item"        id="nav-history"      onclick="showSection('history')">
    <span class="nav-icon">📊</span><span data-i18n="nav.history">היסטוריה</span>
  </button>
</nav>
```

- [ ] **Step 3: Update `SECTION_ORDER` (~line 1325) to include `running`:**

```js
const SECTION_ORDER = { main: 0, timer: 1, running: 2, measurements: 2, history: 3, settings: 4 };
```

- [ ] **Step 4: Add `if (name === 'running') initRunSection();` inside `showSection()` after the measurements check (~line 1352):**

```js
  if (name === 'measurements') setDefaultDate();
  if (name === 'running') initRunSection();
  if (name === 'timer') {
```

- [ ] **Step 5: Add Firestore load/save functions and nav swap function. Insert after `initSettingsUI()` (~line 1037):**

```js
// ─── RUNNING SETTINGS ────────────────────────────────────────
async function loadRunningEnabled() {
  if (!currentUser) return;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'config', 'settings'));
    const data = snap.exists() ? snap.data() : {};
    runningEnabled = data.runningEnabled === true;
  } catch { runningEnabled = false; }
  applyRunningGate();
}

async function saveRunningEnabled(val) {
  runningEnabled = val;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'settings'), { runningEnabled: val }, { merge: true });
  } catch { toast('שגיאה בשמירת הגדרות', 'error'); }
  applyRunningGate();
}

function applyRunningGate() {
  const navMeas    = document.getElementById('nav-measurements');
  const navRun     = document.getElementById('nav-running');
  if (!navMeas || !navRun) return;
  navMeas.style.display = runningEnabled ? 'none' : '';
  navRun.style.display  = runningEnabled ? '' : 'none';
  // If currently on measurements and running gets disabled (or vice versa), stay put
}
```

- [ ] **Step 6: Update `initSettingsUI()` to show the gate block and set the toggle value:**

Replace the existing `initSettingsUI` function body:
```js
function initSettingsUI() {
  document.getElementById('darkModeToggle').checked = currentTheme === 'dark';
  document.getElementById('tv2SoundToggle').checked = _timerSoundOn;
  renderLangSelector();
  document.getElementById('displayNameInput').value = localStorage.getItem('displayName') || '';

  // Running gate — only for eitan357@gmail.com
  const gateBlock = document.getElementById('runningGateBlock');
  if (gateBlock) {
    gateBlock.style.display = currentUser?.email === 'eitan357@gmail.com' ? '' : 'none';
    const tog = document.getElementById('runningEnabledToggle');
    if (tog) tog.checked = runningEnabled;
  }
}
```

- [ ] **Step 7: Call `loadRunningEnabled()` inside `initApp()` before `hideOverlay()`. Modify `initApp()` (~line 1270):**

```js
async function initApp() {
  try {
    const data = await loadAllData();
    applyAppData(data);
    const autoSaved = await checkAndAutoSavePreviousDrafts();
    if (autoSaved > 0) {
      const fresh = await loadAllData();
      applyAppData(fresh);
    }
    selectType('A');
  } catch (err) {
    toast(t('error.load') + err.message, 'error');
    selectType('A');
  }
  await loadRunningEnabled();
  _draftAttachListeners();
  _draftStartFirestoreTimer();
  hideOverlay();
}
```

- [ ] **Step 8: Test — log in as eitan357@gmail.com, go to Settings, verify toggle appears. Toggle it on, verify nav shows ריצה and hides מדידות. Reload — verify state persists.**

- [ ] **Step 9: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add feature gate toggle in settings and nav swap"
```

---

## Task 3: Firebase Data Layer + Calculation Functions

**Files:**
- Modify: `public/index.html` — JS section, add after running state variables

**Interfaces:**
- Consumes: `db`, `currentUser`, `runWorkouts`, `runWorkoutTypes`
- Produces:
  - `loadRunData()` → `{ workouts: RunWorkout[], types: RunWorkoutType[] }`
  - `addRunWorkout(workout)` → `Promise<void>`
  - `calcPace(durationMinutes, distanceKm)` → `number`
  - `formatPace(paceMinPerKm)` → `"MM:SS"`
  - `calcRunStreak(workouts)` → `number`
  - `calcRunPRs(workouts)` → `{ bestDistanceKm, bestPaceMinPerKm, lowestHeartRate }`
  - `filterRunByRange(workouts, range)` → `RunWorkout[]`

- [ ] **Step 1: Add `loadRunData()` after the running state variables block:**

```js
// ─── RUNNING DATA LAYER ──────────────────────────────────────
async function loadRunData() {
  if (!currentUser) return;
  try {
    // Load workout types; seed defaults on first visit
    const typesRef = collection(db, 'users', currentUser.uid, 'runWorkoutTypes');
    const typesSnap = await getDocs(query(typesRef, orderBy('order')));
    if (typesSnap.empty) {
      await Promise.all([
        addDoc(typesRef, { name: 'Running',   order: 0 }),
        addDoc(typesRef, { name: 'Elliptical', order: 1 }),
      ]);
      const fresh = await getDocs(query(typesRef, orderBy('order')));
      runWorkoutTypes = fresh.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      runWorkoutTypes = typesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    // Load workouts
    const wRef  = collection(db, 'users', currentUser.uid, 'runWorkouts');
    const wSnap = await getDocs(query(wRef, orderBy('date', 'desc')));
    runWorkouts = wSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    toast('שגיאה בטעינת נתוני ריצה: ' + err.message, 'error');
  }
}

async function addRunWorkout(workout) {
  const ref = collection(db, 'users', currentUser.uid, 'runWorkouts');
  await addDoc(ref, { ...workout, createdAt: serverTimestamp() });
  // Reload local cache
  const snap = await getDocs(query(ref, orderBy('date', 'desc')));
  runWorkouts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```

- [ ] **Step 2: Add pure calculation functions after `loadRunData`:**

```js
// ─── RUNNING CALCULATIONS ────────────────────────────────────
function calcPace(durationMinutes, distanceKm) {
  if (!distanceKm || distanceKm === 0) return 0;
  return durationMinutes / distanceKm;
}

function formatPace(paceMinPerKm) {
  if (!paceMinPerKm || paceMinPerKm <= 0) return '--:--';
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function calcRunStreak(workouts) {
  if (!workouts.length) return 0;
  // Build set of ISO weeks that have at least one workout
  const weeksWithWorkout = new Set(workouts.map(w => {
    const d = new Date(w.date);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${week}`;
  }));
  const now = new Date();
  let streak = 0;
  let checkDate = new Date(now);
  while (true) {
    const jan4 = new Date(checkDate.getFullYear(), 0, 4);
    const week = Math.ceil(((checkDate - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    const key = `${checkDate.getFullYear()}-W${week}`;
    if (!weeksWithWorkout.has(key)) break;
    streak++;
    checkDate.setDate(checkDate.getDate() - 7);
  }
  return streak;
}

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

function filterRunByRange(workouts, range) {
  const now = new Date();
  if (range === 'all') return workouts;
  return workouts.filter(w => {
    const d = new Date(w.date);
    if (range === 'month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (range === 'year') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}
```

- [ ] **Step 3: Open browser console, verify no JS errors after reload**

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add Firebase data layer and calculation functions"
```

---

## Task 4: `#sec-running` HTML Section + Dashboard Render

**Files:**
- Modify: `public/index.html` — HTML body, add `#sec-running` before `#sec-settings` (~line 852); JS, add `initRunSection()` and `renderRunDashboard()`

**Interfaces:**
- Consumes: `runWorkouts`, `runWorkoutTypes`, `calcRunStreak()`, `calcRunPRs()`, `formatPace()`
- Produces: `initRunSection()`, `renderRunDashboard()`

- [ ] **Step 1: Add `#sec-running` HTML section before `<div id="sec-settings" class="section">` (~line 852):**

```html
<!-- ══ RUNNING ══ -->
<div id="sec-running" class="section">
  <div class="topbar">
    <div><div class="topbar-title">ריצה 🏃</div><div class="topbar-sub topbar-email"></div></div>
    <button class="topbar-icon-btn" onclick="showSection('settings')" title="הגדרות">⚙️</button>
  </div>
  <div style="padding:16px;">

    <!-- Dashboard sub-view -->
    <div id="run-view-dashboard" class="run-sub-view active">
      <div style="display:flex;gap:10px;margin-bottom:14px;">
        <button class="run-btn run-btn-primary" style="flex:1;" onclick="runShowAdd()">+ הוסף אימון</button>
        <button class="run-btn run-btn-secondary" style="flex:1;" onclick="runShowHistory()">היסטוריה</button>
      </div>
      <div id="run-streak-card" class="run-card"></div>
      <div id="run-prs-card" class="run-card"></div>
      <div id="run-last-card" class="run-card"></div>
      <div id="run-charts-card" class="run-card">
        <div class="run-card-title">גרפים</div>
        <div class="run-range-row">
          <button class="run-range-btn" onclick="runSetRange('month')">חודש</button>
          <button class="run-range-btn active" onclick="runSetRange('year')">שנה</button>
          <button class="run-range-btn" onclick="runSetRange('all')">הכל</button>
        </div>
        <div id="run-charts-list"></div>
      </div>
    </div>

    <!-- Add workout sub-view -->
    <div id="run-view-add" class="run-sub-view">
      <button class="run-btn run-btn-secondary" style="margin-bottom:14px;" onclick="runShowDashboard()">← חזרה</button>
      <!-- Step 1: Type -->
      <div id="run-add-step1">
        <div class="run-card"><div class="run-card-title">בחר סוג אימון</div><div id="run-type-list"></div></div>
      </div>
      <!-- Step 2: OCR -->
      <div id="run-add-step2" style="display:none;">
        <div class="run-card">
          <div class="run-card-title">תמונה מהמסך</div>
          <div class="run-ocr-zone" id="runOcrZone" onclick="document.getElementById('runFileInput').click()">
            <span id="runOcrZoneText">📷 צלם או בחר תמונה</span>
          </div>
          <input type="file" id="runFileInput" accept="image/*" capture="environment" style="display:none;" onchange="runHandleOcr(this)">
          <p id="runOcrError" style="color:var(--red);font-size:13px;display:none;"></p>
          <button class="run-btn run-btn-secondary" style="width:100%;margin-top:8px;" onclick="runShowStep3({})">הכנס ידנית</button>
          <button class="run-btn run-btn-secondary" style="width:100%;margin-top:8px;" onclick="runShowStep1()">← חזרה</button>
        </div>
      </div>
      <!-- Step 3: Review form -->
      <div id="run-add-step3" style="display:none;">
        <div class="run-card">
          <div class="run-card-title">פרטי האימון</div>
          <div class="run-form-field">
            <label class="run-form-label">תאריך *</label>
            <input type="date" id="run-f-date" class="run-form-input">
          </div>
          <div class="run-form-field">
            <label class="run-form-label">מרחק (ק"מ) *</label>
            <input type="number" id="run-f-dist" class="run-form-input" step="0.01" min="0" placeholder="0.00">
          </div>
          <div class="run-form-field">
            <label class="run-form-label">משך (דקות) *</label>
            <input type="number" id="run-f-dur" class="run-form-input" min="0" placeholder="30">
          </div>
          <div class="run-form-field">
            <label class="run-form-label">קלוריות</label>
            <input type="number" id="run-f-cal" class="run-form-input" min="0" placeholder="--">
          </div>
          <div class="run-form-field">
            <label class="run-form-label">צעדים/דקה</label>
            <input type="number" id="run-f-spm" class="run-form-input" min="0" placeholder="--">
          </div>
          <div class="run-form-field">
            <label class="run-form-label">דופק ממוצע</label>
            <input type="number" id="run-f-hr" class="run-form-input" min="0" placeholder="--">
          </div>
          <div class="run-form-field">
            <div class="run-toggle-row">
              <span class="run-form-label" style="margin:0;">הרגשתי עייפות</span>
              <label class="toggle-switch">
                <input type="checkbox" id="run-f-tired">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          <div class="run-form-field">
            <label class="run-form-label">הערות</label>
            <textarea id="run-f-notes" class="run-form-input" rows="3" placeholder="הערות אופציונליות..."></textarea>
          </div>
          <button class="run-btn run-btn-primary" style="width:100%;margin-top:4px;" id="runSaveBtn" onclick="runSaveWorkout()">שמור אימון</button>
          <p id="runFormError" style="color:var(--red);font-size:13px;margin-top:8px;display:none;"></p>
        </div>
      </div>
    </div>

    <!-- History sub-view -->
    <div id="run-view-history" class="run-sub-view">
      <button class="run-btn run-btn-secondary" style="margin-bottom:14px;" onclick="runShowDashboard()">← חזרה</button>
      <div class="run-card">
        <div class="run-card-title">היסטוריית אימונים</div>
        <div id="run-history-list"></div>
      </div>
    </div>

  </div>
</div>
```

- [ ] **Step 2: Add JS functions for sub-view navigation and dashboard rendering. Insert after the calculation functions:**

```js
// ─── RUNNING UI ──────────────────────────────────────────────
async function initRunSection() {
  await loadRunData();
  runShowDashboard();
}

function runShowDashboard() {
  document.getElementById('run-view-dashboard').classList.add('active');
  document.getElementById('run-view-add').classList.remove('active');
  document.getElementById('run-view-history').classList.remove('active');
  renderRunDashboard();
  renderRunCharts();
}

function runShowAdd() {
  document.getElementById('run-view-dashboard').classList.remove('active');
  document.getElementById('run-view-add').classList.add('active');
  document.getElementById('run-view-history').classList.remove('active');
  runShowStep1();
}

function runShowHistory() {
  document.getElementById('run-view-dashboard').classList.remove('active');
  document.getElementById('run-view-add').classList.remove('active');
  document.getElementById('run-view-history').classList.add('active');
  renderRunHistory();
}

function renderRunDashboard() {
  const streak = calcRunStreak(runWorkouts);
  document.getElementById('run-streak-card').innerHTML = `
    <div class="run-streak-badge">
      <div class="run-streak-num">${streak}</div>
      <div class="run-streak-lbl">שבועות רצופים</div>
    </div>`;

  const prs = calcRunPRs(runWorkouts);
  document.getElementById('run-prs-card').innerHTML = `
    <div class="run-card-title">שיאים אישיים</div>
    <div class="run-stat-row">
      <div class="run-stat"><div class="run-stat-val">${prs.bestDistanceKm > 0 ? prs.bestDistanceKm.toFixed(1) : '--'}</div><div class="run-stat-lbl">מרחק מירבי (ק"מ)</div></div>
      <div class="run-stat"><div class="run-stat-val">${prs.bestPaceMinPerKm > 0 ? formatPace(prs.bestPaceMinPerKm) : '--'}</div><div class="run-stat-lbl">קצב מהיר</div></div>
      <div class="run-stat"><div class="run-stat-val">${prs.lowestHeartRate > 0 ? prs.lowestHeartRate : '--'}</div><div class="run-stat-lbl">דופק נמוך</div></div>
    </div>`;

  const last = runWorkouts[0];
  if (last) {
    const typeName = runWorkoutTypes.find(t => t.id === last.workoutTypeId)?.name ?? 'אימון';
    document.getElementById('run-last-card').innerHTML = `
      <div class="run-card-title">אימון אחרון</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px;">${last.date} — ${typeName}</div>
      <div class="run-stat-row">
        <div class="run-stat"><div class="run-stat-val">${(last.distanceKm ?? 0).toFixed(1)}</div><div class="run-stat-lbl">ק"מ</div></div>
        <div class="run-stat"><div class="run-stat-val">${last.durationMinutes ?? '--'}</div><div class="run-stat-lbl">דקות</div></div>
        <div class="run-stat"><div class="run-stat-val">${last.paceMinPerKm ? formatPace(last.paceMinPerKm) : '--'}</div><div class="run-stat-lbl">קצב</div></div>
      </div>`;
  } else {
    document.getElementById('run-last-card').innerHTML = `
      <div class="run-card-title">אימון אחרון</div>
      <div style="text-align:center;color:var(--sub);padding:12px;">עוד לא נרשמו אימונים</div>`;
  }
}
```

- [ ] **Step 3: Test — enable running in settings, click ריצה in nav, verify dashboard renders with streak=0, empty PRs, no last workout card.**

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add running section HTML and dashboard render"
```

---

## Task 5: Chart.js Graphs

**Files:**
- Modify: `public/index.html` — JS, add `renderRunCharts()` and `runSetRange()`

**Interfaces:**
- Consumes: `runWorkouts`, `_runCurrentRange`, `filterRunByRange()`, `formatPace()`, `Chart` (global from CDN)
- Produces: `renderRunCharts()`, `runSetRange(range)`

- [ ] **Step 1: Add `renderRunCharts()` and `runSetRange()` after `renderRunDashboard()`:**

```js
const RUN_CHARTS_CONFIG = [
  { key: 'distanceKm',       label: 'מרחק (ק"מ)',      color: '#2563eb', fmt: v => v.toFixed(1) },
  { key: 'avgHeartRate',     label: 'דופק ממוצע',      color: '#dc2626', fmt: v => Math.round(v) },
  { key: 'paceMinPerKm',     label: 'קצב (דק/ק"מ)',     color: '#16a34a', fmt: formatPace },
  { key: 'calories',         label: 'קלוריות',          color: '#d97706', fmt: v => Math.round(v) },
  { key: 'avgStridesPerMin', label: 'צעדים/דקה',        color: '#7c3aed', fmt: v => Math.round(v) },
];

function runSetRange(range) {
  _runCurrentRange = range;
  document.querySelectorAll('.run-range-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === { month: 'חודש', year: 'שנה', all: 'הכל' }[range]);
  });
  renderRunCharts();
}

function renderRunCharts() {
  const filtered = filterRunByRange(runWorkouts, _runCurrentRange);
  const sorted   = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const container = document.getElementById('run-charts-list');
  if (!container) return;

  // Destroy old charts
  Object.values(_runCharts).forEach(c => c.destroy());
  _runCharts = {};
  container.innerHTML = '';

  for (const cfg of RUN_CHARTS_CONFIG) {
    const vals = sorted.map(w => w[cfg.key] ?? null).filter(v => v !== null);
    if (vals.length === 0) continue;

    const labels = sorted.filter(w => w[cfg.key] != null).map(w => w.date.slice(5)); // MM-DD
    const data   = sorted.filter(w => w[cfg.key] != null).map(w => w[cfg.key]);

    const wrap = document.createElement('div');
    wrap.innerHTML = `<div style="font-size:12px;font-weight:700;color:var(--sub);margin-bottom:4px;">${cfg.label}</div>
      <div class="run-chart-wrap"><canvas id="rChart-${cfg.key}"></canvas></div>`;
    container.appendChild(wrap);

    const ctx = document.getElementById('rChart-' + cfg.key).getContext('2d');
    _runCharts[cfg.key] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: cfg.color,
          backgroundColor: cfg.color + '22',
          borderWidth: 2,
          pointRadius: data.length > 20 ? 0 : 3,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#33415533' } },
          y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: '#33415533' } },
        },
      },
    });
  }

  if (container.innerHTML === '') {
    container.innerHTML = '<div style="text-align:center;color:var(--sub);padding:20px;">אין נתונים לטווח הנבחר</div>';
  }
}
```

- [ ] **Step 2: Test — add a dummy workout via browser console to `runWorkouts`, call `renderRunCharts()`. Verify charts render.**

```js
// In browser console (for testing only):
runWorkouts = [{ date: '2026-07-01', distanceKm: 5.2, paceMinPerKm: 5.5, avgHeartRate: 145, calories: 380, avgStridesPerMin: 165 }];
renderRunCharts();
```

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add Chart.js graphs with time range filter"
```

---

## Task 6: Add Workout Wizard (Type Select + OCR + Form)

**Files:**
- Modify: `public/index.html` — JS, add step navigation and save functions

**Interfaces:**
- Consumes: `runWorkoutTypes`, `_runSelectedTypeId`, `_runPrefill`, `calcPace()`, `addRunWorkout()`
- Produces: `runShowStep1()`, `runShowStep2()`, `runShowStep3(prefill)`, `runHandleOcr(input)`, `runSaveWorkout()`

- [ ] **Step 1: Add step-navigation and form functions after `renderRunHistory` (Task 7 placeholder — add before it):**

```js
function runShowStep1() {
  _runSelectedTypeId = null;
  document.getElementById('run-add-step1').style.display = '';
  document.getElementById('run-add-step2').style.display = 'none';
  document.getElementById('run-add-step3').style.display = 'none';

  const list = document.getElementById('run-type-list');
  list.innerHTML = runWorkoutTypes.map(type =>
    `<button class="run-type-btn" onclick="runSelectType('${type.id}','${escHtml(type.name)}')">${escHtml(type.name)}</button>`
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
  document.getElementById('runOcrZoneText').textContent = '📷 צלם או בחר תמונה';
  document.getElementById('runOcrError').style.display = 'none';
}

function runShowStep3(prefill) {
  _runPrefill = prefill;
  document.getElementById('run-add-step1').style.display = 'none';
  document.getElementById('run-add-step2').style.display = 'none';
  document.getElementById('run-add-step3').style.display = '';

  // Default date to today
  document.getElementById('run-f-date').value  = prefill.date  ?? new Date().toISOString().slice(0,10);
  document.getElementById('run-f-dist').value  = prefill.distanceKm        ?? '';
  document.getElementById('run-f-dur').value   = prefill.durationMinutes   ?? '';
  document.getElementById('run-f-cal').value   = prefill.calories          ?? '';
  document.getElementById('run-f-spm').value   = prefill.avgStridesPerMin  ?? '';
  document.getElementById('run-f-hr').value    = prefill.avgHeartRate      ?? '';
  document.getElementById('run-f-tired').checked = prefill.feltTired ?? false;
  document.getElementById('run-f-notes').value = prefill.notes ?? '';
  document.getElementById('runFormError').style.display = 'none';
  document.getElementById('runSaveBtn').disabled = false;
}

async function runHandleOcr(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  document.getElementById('runOcrZoneText').textContent = 'מפענח תמונה...';
  document.getElementById('runOcrError').style.display = 'none';

  try {
    // Lazy-load Tesseract.js
    if (!window.Tesseract) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    const prefill = parseOcrText(text);
    runShowStep3(prefill);
  } catch {
    document.getElementById('runOcrZoneText').textContent = '📷 צלם או בחר תמונה';
    document.getElementById('runOcrError').textContent = 'לא הצלחתי לקרוא את התמונה. נסה שוב או הכנס ידנית.';
    document.getElementById('runOcrError').style.display = '';
  }
}

function parseOcrText(text) {
  // Simple regex extraction from OCR output
  const num = (pattern) => { const m = text.match(pattern); return m ? parseFloat(m[1]) : undefined; };
  return {
    distanceKm:       num(/(\d+\.?\d*)\s*(?:km|ק"מ)/i),
    durationMinutes:  num(/(\d+)\s*(?:min|דק)/i),
    calories:         num(/(\d+)\s*(?:cal|kcal|קל)/i),
    avgStridesPerMin: num(/(\d+)\s*(?:spm|strides)/i),
    avgHeartRate:     num(/(\d+)\s*(?:bpm|דופק)/i),
  };
}

async function runSaveWorkout() {
  const date     = document.getElementById('run-f-date').value;
  const distStr  = document.getElementById('run-f-dist').value;
  const durStr   = document.getElementById('run-f-dur').value;
  const errEl    = document.getElementById('runFormError');

  if (!date || !distStr || !durStr) {
    errEl.textContent = 'יש למלא תאריך, מרחק ומשך';
    errEl.style.display = '';
    return;
  }

  const distanceKm      = parseFloat(distStr);
  const durationMinutes = parseFloat(durStr);
  if (distanceKm <= 0 || durationMinutes <= 0) {
    errEl.textContent = 'מרחק ומשך חייבים להיות גדולים מ-0';
    errEl.style.display = '';
    return;
  }

  const btn = document.getElementById('runSaveBtn');
  btn.disabled = true;
  btn.textContent = 'שומר...';

  const workout = {
    date,
    workoutTypeId:   _runSelectedTypeId,
    distanceKm,
    durationMinutes,
    paceMinPerKm:    calcPace(durationMinutes, distanceKm),
    calories:        document.getElementById('run-f-cal').value  ? parseFloat(document.getElementById('run-f-cal').value)  : null,
    avgStridesPerMin: document.getElementById('run-f-spm').value ? parseFloat(document.getElementById('run-f-spm').value) : null,
    avgHeartRate:    document.getElementById('run-f-hr').value   ? parseFloat(document.getElementById('run-f-hr').value)   : null,
    feltTired:       document.getElementById('run-f-tired').checked,
    notes:           document.getElementById('run-f-notes').value.trim() || null,
  };

  try {
    await addRunWorkout(workout);
    toast('האימון נשמר בהצלחה! 🏃');
    runShowDashboard();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'שמור אימון';
    errEl.textContent = 'שגיאה בשמירה: ' + err.message;
    errEl.style.display = '';
  }
}
```

- [ ] **Step 2: Test full add-workout flow — enable running, click + הוסף אימון, select Running, fill form, save. Verify toast appears and dashboard updates.**

- [ ] **Step 3: Test OCR — select Elliptical, take photo, verify form gets pre-filled (or error + manual fallback).**

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add workout wizard with OCR (Tesseract.js) and form save"
```

---

## Task 7: History Sub-view

**Files:**
- Modify: `public/index.html` — JS, add `renderRunHistory()`

**Interfaces:**
- Consumes: `runWorkouts`, `runWorkoutTypes`, `formatPace()`
- Produces: `renderRunHistory()`, `runToggleHistoryRow(id)`

- [ ] **Step 1: Add `renderRunHistory()` and row toggle after the save functions:**

```js
function renderRunHistory() {
  const list = document.getElementById('run-history-list');
  if (!list) return;
  if (runWorkouts.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--sub);padding:20px;">עוד לא נרשמו אימונים</div>';
    return;
  }
  list.innerHTML = runWorkouts.map(w => {
    const typeName = runWorkoutTypes.find(t => t.id === w.workoutTypeId)?.name ?? '';
    const pace     = w.paceMinPerKm ? formatPace(w.paceMinPerKm) : '--';
    const tired    = w.feltTired ? '😴' : '';
    return `
      <div class="run-history-row" onclick="runToggleHistoryRow('${w.id}')">
        <div>
          <div class="run-history-date">${w.date} ${tired}</div>
          <div class="run-history-meta">${typeName} · ${(w.distanceKm ?? 0).toFixed(1)} ק"מ · ${pace} דק/ק"מ</div>
        </div>
        <span style="color:var(--sub);">›</span>
      </div>
      <div class="run-history-detail" id="rhd-${w.id}">
        ${w.durationMinutes ? `<div>משך: ${w.durationMinutes} דקות</div>` : ''}
        ${w.calories        ? `<div>קלוריות: ${w.calories}</div>` : ''}
        ${w.avgHeartRate    ? `<div>דופק ממוצע: ${w.avgHeartRate} bpm</div>` : ''}
        ${w.avgStridesPerMin? `<div>צעדים/דקה: ${w.avgStridesPerMin}</div>` : ''}
        ${w.notes           ? `<div>הערות: ${w.notes}</div>` : ''}
      </div>`;
  }).join('');
}

function runToggleHistoryRow(id) {
  const el = document.getElementById('rhd-' + id);
  if (el) el.classList.toggle('open');
}
```

- [ ] **Step 2: Test — add 2-3 workouts, click היסטוריה, verify list appears in reverse-chronological order. Click a row, verify detail expands.**

- [ ] **Step 3: Test empty state — clear runWorkouts locally and call renderRunHistory() in console. Verify empty message shown.**

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(running): add history sub-view with expandable rows"
```

---

## Task 8: Expose Functions to Window + Final Wiring

**Files:**
- Modify: `public/index.html` — JS, add `window.*` exports for inline `onclick` handlers

**Interfaces:**
- All running functions called from HTML `onclick` must be on `window`

- [ ] **Step 1: Locate the `window.*` exports block near the bottom of the `<script>` tag (~line 2694). Add running exports:**

```js
// ─── RUNNING EXPORTS ─────────────────────────────────────────
Object.assign(window, {
  runShowDashboard, runShowAdd, runShowHistory,
  runShowStep1, runShowStep2, runShowStep3,
  runSelectType, runHandleOcr, runSaveWorkout,
  runSetRange, runToggleHistoryRow,
  saveRunningEnabled,
});
```

- [ ] **Step 2: Full end-to-end test:**
  1. Log in as `eitan357@gmail.com`
  2. Go to Settings — verify toggle visible
  3. Enable running — verify nav shows ריצה, hides מדידות
  4. Click ריצה — verify dashboard loads (streak=0, no workouts)
  5. Click הוסף אימון — verify step 1 (type list)
  6. Select Running — verify step 3 (review form, today's date)
  7. Fill distance=5, duration=30 — click שמור — verify toast + dashboard updates
  8. Verify streak badge, last workout card, and charts update
  9. Click היסטוריה — verify workout appears
  10. Reload page — verify running still enabled, data persists
  11. Log in as different user — verify no ריצה in nav, no toggle in settings

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(running): expose window exports and complete wiring"
```

---

## Task 9: Deploy

- [ ] **Step 1: Push to `main` — GitHub Actions deploys automatically**

```bash
git push origin main
```

- [ ] **Step 2: Wait for CI to complete (check GitHub Actions tab)**

- [ ] **Step 3: Open the deployed app, log in as `eitan357@gmail.com`, run through the full end-to-end flow on the live URL**

- [ ] **Step 4: Verify other users see no change (open incognito, sign in with a different account)**
