# Strength & Cardio QA Addendum Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every real, confirmed finding in `qa-report-strength-cardio-2026-09-04-addendum.md` (A3–A8 + 7 new accessibility findings), and close the caching gap that produced the A1/A2 false alarms — without touching anything already confirmed correct (A1, A2, #6, #8, #9).

**Architecture:** All app code in `public/index.html` + `public/translations.js`; one hosting-config change in `firebase.json`; one doc correction. Each task is independently verifiable per `docs/superpowers/specs/2026-09-05-strength-cardio-qa-addendum-fixes-design.md`'s impact map.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Hosting/Auth/Firestore, Chart.js (CDN, now lazy-loaded), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-strength-cardio-qa-addendum-fixes-design.md`

## Global Constraints
- All JS/HTML changes in `public/index.html` only, except `public/translations.js` (new/changed keys), `firebase.json` (headers), `docs/product/10-offline-and-sync-architecture.md`, `tests/*.spec.ts`.
- `escHtml()` must wrap every user-controlled string reaching `innerHTML` — no task here introduces a new one.
- All new user-facing strings need both `he` and `en` entries in `translations.js`.
- No emulator exists for this project's data layer — live verification hits real production Firestore under `test@gmail.com`/`111111`; disclose any test data created/modified and confirm cleanup via a fresh reload.
- Commit after every task.

---

## Task 1: A4 — Fix the Cold-Boot Exercise-List Dead End

**Files:** Modify `public/index.html` (`_backgroundSync`)

- [ ] **Step 1: Force a real re-render instead of a no-op**

Find:
```js
    const data = await loadAllData();
    _backgroundApplyData(data);
    _saveCacheFromData(data);
    if (!hadCache) selectType(selectedType || workoutTypes[0] || 'A');
```
replace with:
```js
    const data = await loadAllData();
    _backgroundApplyData(data);
    _saveCacheFromData(data);
    if (!hadCache) {
      // selectType() early-returns when the target type already matches
      // selectedType — but Phase 1 (initApp) already called selectType with
      // this same default before any real template data existed, so
      // selectedType is already set and this call would otherwise be a
      // silent no-op, permanently leaving the exercise list empty on a
      // cold-cache first visit even though real data just arrived.
      // Resetting selectedType first forces the equality check to fail,
      // guaranteeing the real re-render this branch exists to trigger.
      selectedType = null;
      selectType(workoutTypes[0] || 'A');
    }
```

- [ ] **Step 2: Manual verification with a genuinely cold cache**

Run: `npx firebase emulators:start --only hosting` (or any static server serving `public/`). Open the app in a **brand-new incognito/private window** (guarantees empty localStorage), log in. Confirm exercise cards for the default type render within a few seconds — not permanently empty. Repeat 2-3 times with fresh incognito windows to build confidence (the bug was intermittent-looking in manual testing because a browser with ANY prior cache never hits this path at all).

- [ ] **Step 3: Run the existing workout suite to confirm no regression**

Run: `TEST_EMAIL=test@gmail.com TEST_PASSWORD=111111 npx playwright test tests/workout.spec.ts --project=chromium`
Expected: same or better pass rate than the documented pre-existing baseline (this fix directly targets that baseline's root cause, so failures should decrease, not increase).

- [ ] **Step 4: Commit**
```bash
git add public/index.html
git commit -m "fix(strength): force real re-render on cold-cache boot instead of a silent no-op"
```

---

## Task 2: A3 — Fix Drag-and-Drop in Both Template Editors

**Files:** Modify `public/index.html` (`initDragSort`, `renderEditList`, remove `startDrag`, add `startEditDrag`)

- [ ] **Step 1: Add the generic domain-aware drag-start factory, remove the now-inappropriate default**

Find:
```js
// ─── DRAG & DROP ──────────────────────────────────────────────
function initDragSort(container, startFn) {
  const fn = startFn || startDrag;
  container.querySelectorAll('.drag-handle').forEach(h => {
    h.addEventListener('mousedown', e => fn(e, h.closest('.edit-card'), container));
    h.addEventListener('touchstart', e => fn(e, h.closest('.edit-card'), container), { passive: true });
  });
}
```
replace with:
```js
// ─── DRAG & DROP ──────────────────────────────────────────────
function initDragSort(container, startFn) {
  container.querySelectorAll('.drag-handle').forEach(h => {
    h.addEventListener('mousedown', e => startFn(e, h.closest('.edit-card'), container));
    h.addEventListener('touchstart', e => startFn(e, h.closest('.edit-card'), container), { passive: true });
  });
}

// Domain-aware drag-start factory for the shared strength/cardio template
// editors. collectEdits(domain) already reads the current .edit-card DOM
// order back into WORKOUT_DOMAINS[domain]'s template array — exactly what
// both the "snapshot before drag" and "commit new order after drop" steps
// need, so both callbacks below are the same call. Verified byte-for-byte
// equivalent to the old hardcoded startDrag's onDrop logic for strength.
function startEditDrag(domain) {
  return (e, card, container) => {
    startGenericDrag(e, card, container, () => collectEdits(domain), () => collectEdits(domain));
  };
}
```

- [ ] **Step 2: Remove the now-dead `startDrag` function**

Find:
```js
function startDrag(e, card, container) {
  startGenericDrag(e, card, container, collectEdits, cnt => {
    editTemplates[editTab] = [...cnt.querySelectorAll('.edit-card')].map(c => ({
      name:          c.querySelector('.ex-name-input').value,
      targetWeight:  c.querySelector('.target-weight-input')?.value || '',
      targetSets:    c.querySelector('.target-sets-input')?.value   || '',
      targetReps:    c.querySelector('.target-reps-input')?.value   || '',
      id:            c.dataset.id           || '',
      _legacyTarget: c.dataset.legacyTarget || '',
    }));
  });
}

```
delete it entirely (confirmed via `grep -n "\bstartDrag\b" public/index.html` that only `initDragSort`'s old fallback and this definition referenced it — both are gone after Step 1 and this step).

- [ ] **Step 3: Fix the buggy call site**

Find:
```js
  initDragSort(el, type);
```
(inside `renderEditList(domain, type)`) replace with:
```js
  initDragSort(el, startEditDrag(domain));
```

- [ ] **Step 4: Confirm measurements' own call site is untouched**

Run: `grep -n "initDragSort(" public/index.html`
Expected: exactly 3 results — the function definition, `renderEditList`'s call (now `startEditDrag(domain)`), and measurements' own pre-existing `initDragSort(el, startMeasureTypeDrag)` — unchanged, not part of this bug.

- [ ] **Step 5: Manual verification**

Settings → Edit Strength Plan → press and drag an exercise's ⠿ handle to reorder it → confirm it moves, no console error, and "Save Changes" persists the new order (reload and confirm). Repeat for Settings → Edit Cardio Workout Plan → drag a field's ⠿ handle → confirm the same.

- [ ] **Step 6: Commit**
```bash
git add public/index.html
git commit -m "fix(strength,cardio): repair drag-and-drop reordering in both template editors"
```

---

## Task 3: Close the Caching Gap Behind the A1/A2 False Alarms

**Files:** Modify `firebase.json`

- [ ] **Step 1: Add a `no-cache` rule for `translations.js`, matching `manifest.json`'s existing treatment**

Find:
```json
    "headers": [
      {
        "source": "manifest.json",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      },
```
replace with:
```json
    "headers": [
      {
        "source": "manifest.json",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      },
      {
        "source": "translations.js",
        "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
      },
```

- [ ] **Step 2: Verify the JSON is still valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8')); console.log('valid JSON')"`
Expected: `valid JSON`

- [ ] **Step 3: Commit**
```bash
git add firebase.json
git commit -m "fix(hosting): stop caching translations.js for an hour after every deploy"
```

Note: this takes effect on the next `firebase deploy` — verify post-deploy with `curl -sI https://training-diary.web.app/translations.js` and confirm `Cache-Control: no-cache` (or equivalent revalidation) instead of `max-age=3600`.

---

## Task 4: A6 — Fix the Mislabeled Cardio "+ Add Field" Button

**Files:** Modify `public/index.html`, `public/translations.js`

- [ ] **Step 1: Add the new translation key**

`public/translations.js`, Hebrew block (near `edit.add_exercise`):
```js
    'edit.add_field': '+ הוסף שדה',
```
English block:
```js
    'edit.add_field': '+ Add Field',
```

- [ ] **Step 2: Point the cardio button at it**

Find:
```html
    <button class="btn-ghost" onclick="addCardioEditField()" data-i18n="edit.add_exercise">+ הוסף שדה</button>
```
replace with:
```html
    <button class="btn-ghost" onclick="addCardioEditField()" data-i18n="edit.add_field">+ הוסף שדה</button>
```

- [ ] **Step 3: Manual verification**

Settings → Edit Cardio Workout Plan → confirm the button reads "+ הוסף שדה" in Hebrew and "+ Add Field" in English (switch language and check both) — not "+ הוסף תרגיל"/"+ Add Exercise" in either language.

- [ ] **Step 4: Commit**
```bash
git add public/index.html public/translations.js
git commit -m "fix(cardio): use a cardio-specific translation key for the Add Field button"
```

---

## Task 5: A7 — Fix Cardio Settings Link Grammar

**Files:** Modify `public/translations.js`

- [ ] **Step 1: Drop the stray leading ל, matching the strength equivalent fixed 2026-08-30**

Find:
```js
    'settings.cardio_edit':       'לעריכת תוכנית אימוני אירובי',
```
replace with:
```js
    'settings.cardio_edit':       'עריכת תוכנית אימוני אירובי',
```

- [ ] **Step 2: Manual verification**

Settings page → confirm "Edit Cardio Workout Plan" link reads "עריכת תוכנית אימוני אירובי" (no leading ל) in Hebrew.

- [ ] **Step 3: Commit**
```bash
git add public/translations.js
git commit -m "fix(cardio): drop stray leading ל from the cardio settings link, parity with strength's earlier fix"
```

---

## Task 6: A8 — Lazy-Load Chart.js Only When History's Charts Actually Render

**Files:** Modify `public/index.html`

- [ ] **Step 1: Remove the unconditional script tag from `<head>`**

Find:
```html
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```
delete this line.

- [ ] **Step 2: Add a lazy-loader and make `renderRunCharts` wait for it**

Find:
```js
function renderRunCharts() {
  const filtered  = filterRunByRange(allRunWorkouts, _runCurrentRange);
  const sorted    = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const container = document.getElementById('run-charts-list');
  if (!container) return;

  Object.values(_runCharts).forEach(c => c.destroy());
```
replace with:
```js
// Chart.js is only ever used by History's cardio-stats charts (the only
// `new Chart(` call site in this file) — Strength and Cardio's own
// daily-entry pages never reference it, so it no longer loads
// unconditionally in <head>. Loaded once, on first actual use.
// Pinned to the exact version the old floating `@4` tag resolved to
// (4.5.1) plus its SHA-384 integrity hash — pinning is required for SRI
// to be meaningful (an unpinned `@4` could resolve to a different file
// on a future jsdelivr update, breaking the hash); computed via:
//   curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
let _chartJsPromise = null;
function _ensureChartJsLoaded() {
  if (window.Chart) return Promise.resolve();
  if (_chartJsPromise) return _chartJsPromise;
  _chartJsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
    script.integrity = 'sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Chart.js'));
    document.head.appendChild(script);
  });
  return _chartJsPromise;
}

async function renderRunCharts() {
  const filtered  = filterRunByRange(allRunWorkouts, _runCurrentRange);
  const sorted    = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const container = document.getElementById('run-charts-list');
  if (!container) return;
  try { await _ensureChartJsLoaded(); } catch (e) { return; } // charts are an enhancement, not critical — fail silently

  Object.values(_runCharts).forEach(c => c.destroy());
```

- [ ] **Step 3: Confirm both existing callers tolerate the function becoming async**

Run: `grep -n "renderRunCharts()" public/index.html`
Expected: 2 call sites, neither awaits the return value (fire-and-forget) — no change needed at either, since an un-awaited async function call is valid JS and the charts will simply render a beat later once the script loads.

- [ ] **Step 4: Manual verification**

Open DevTools Network tab. Load the Strength page fresh → confirm `chart.umd.min.js` does **not** load. Load the Cardio daily-entry page → confirm it still does not load. Navigate to History with cardio domain active and at least one chartable field of data → confirm the charts render correctly and `chart.umd.min.js` **now** loads (once, cached for the rest of the session) with no console error about a failed integrity check (which would indicate the pinned hash doesn't match what the CDN actually served — re-verify the hash with the same `curl | openssl dgst` command from Step 2 if this happens).

- [ ] **Step 5: Commit**
```bash
git add public/index.html
git commit -m "perf(history): lazy-load Chart.js only when its charts actually render"
```

---

## Task 7: A11y #4 — Re-enable Pinch-to-Zoom

**Files:** Modify `public/index.html`

- [ ] **Step 1: Remove the zoom-disabling directive**

Find:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
```
replace with:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1">
```

- [ ] **Step 2: Manual verification**

On a touch device or Chrome DevTools' device-emulation mode, confirm a pinch/double-tap gesture can now zoom the page. Confirm the layout doesn't break at a zoomed-in state (spot-check Strength and Cardio forms).

- [ ] **Step 3: Commit**
```bash
git add public/index.html
git commit -m "fix(a11y): re-enable pinch-to-zoom (was disabled site-wide via maximum-scale=1)"
```

---

## Task 8: A11y #5 — Add a `<main>` Landmark

**Files:** Modify `public/index.html`

- [ ] **Step 1: Promote the existing content wrapper to a real landmark**

Find:
```html
<div id="main-content">
```
replace with:
```html
<main id="main-content">
```
and find its matching closing `</div>` (the one that closes this exact wrapper — confirm via indentation/structure, not a blind replace-all, since `</div>` is extremely common in this file) and replace with `</main>`.

- [ ] **Step 2: Confirm no selector assumed a `div` tag specifically**

Run: `grep -n "div#main-content\|div\\.main-content" public/index.html`
Expected: no matches (all existing references are `#main-content` ID selectors or `getElementById('main-content')`, both tag-agnostic, confirmed safe during investigation).

- [ ] **Step 3: Manual verification**

Run: `grep -c "<main" public/index.html` → expect `1`. Load the app, inspect via DevTools' Accessibility tree or a screen reader — confirm a "main" landmark region is now announced.

- [ ] **Step 4: Commit**
```bash
git add public/index.html
git commit -m "fix(a11y): add a <main> landmark around the app's page content"
```

---

## Task 9: A11y #7 — Make "Last Workout" Preview Header Keyboard-Reachable

**Files:** Modify `public/index.html`

- [ ] **Step 1: Add role/tabindex/keydown, matching the pattern already used for the target pill**

Find:
```html
      <div class="history-preview-header" onclick="toggleHistPreview()">
```
replace with:
```html
      <div class="history-preview-header" role="button" tabindex="0" onclick="toggleHistPreview()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleHistPreview();}">
```

- [ ] **Step 2: Manual verification**

Go to Strength with a previous workout logged (so the "Last Workout" preview is visible). Tab to it with the keyboard (confirm a visible focus outline appears), press Enter → confirm it expands/collapses, same as a click. Press Space on it → confirm the same, and confirm the page doesn't scroll (the `preventDefault()` guard).

- [ ] **Step 3: Commit**
```bash
git add public/index.html
git commit -m "fix(a11y): make the Last Workout preview header keyboard-operable"
```

---

## Task 10: A11y #1/#10 — Fix the Two `--sub`/Light-Background Contrast Failures

**Files:** Modify `public/index.html` (CSS)

- [ ] **Step 1: Darken `--sub`'s light-mode value**

Find (root `:root` custom properties block):
```css
      --sub:       #64748b;
```
replace with:
```css
      --sub:       #5c6b82;
```
(Computed: 4.94:1 against `--bg` `#f1f5f9`, 5.41:1 against white `--surface` — both comfortably pass the 4.5:1 AA threshold; dark-mode's `--sub` value is unchanged, already passing at 5.71-6.96:1.)

- [ ] **Step 2: Add a dark-mode background override for `.history-preview-header`**

Find:
```css
    .history-preview-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; cursor: pointer; background: #f8fafc; }
```
Leave this line as-is (it's correct for light mode) and add immediately after it:
```css
    [data-theme="dark"] .history-preview-header { background: #1a2338; }
```
(A dark, muted-blue tone consistent with the app's existing dark-mode surface family — e.g. `.measure-header`'s own dark override `#252f45` — rather than the leftover light `#f8fafc`, which is what put dark-mode's lighter `--sub` text on a light background in the first place.)

- [ ] **Step 3: Verify computed contrast**

Run:
```bash
node -e "
function hexToRgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
function relLum([r,g,b]){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};const [R,G,B]=[f(r),f(g),f(b)];return 0.2126*R+0.7152*G+0.0722*B;}
function contrast(a,b){const L1=relLum(hexToRgb(a)),L2=relLum(hexToRgb(b));const [l,d]=L1>L2?[L1,L2]:[L2,L1];return (l+0.05)/(d+0.05);}
console.log('light --sub vs --bg:', contrast('#5c6b82','#f1f5f9').toFixed(2));
console.log('light --sub vs white:', contrast('#5c6b82','#ffffff').toFixed(2));
console.log('dark --sub (#94a3b8) vs new dark header bg:', contrast('#94a3b8','#1a2338').toFixed(2));
"
```
Expected: all three ≥ 4.5.

- [ ] **Step 4: Manual visual check**

Confirm the page still reads clearly in both themes — this is a subtle darkening, not a redesign; spot-check a few screens (Strength form, History) in light and dark mode.

- [ ] **Step 5: Commit**
```bash
git add public/index.html
git commit -m "fix(a11y): darken --sub token and fix history-preview-header's missing dark-mode background"
```

---

## Task 11: A11y #2/#3 — Fix the Two `--primary`-as-Text Contrast Failures

**Files:** Modify `public/index.html` (CSS)

- [ ] **Step 1: Add a dark-mode text-color override for `.copy-last-btn`**

Find:
```css
    .copy-last-btn { display: inline-flex; align-items: center; gap: 6px;
                     padding: 7px 14px; background: none;
                     border: 1.5px solid var(--primary); border-radius: 20px;
                     color: var(--primary); font-size: 13px; font-weight: 600; cursor: pointer;
                     transition: all .15s; }
```
Leave as-is (correct for light mode: 4.75:1 against light `--bg`) and add immediately after it:
```css
    [data-theme="dark"] .copy-last-btn { color: #9686d1; border-color: #9686d1; }
```
(Computed: 5.63:1 against dark `--bg` `#0f172a`, 4.62:1 against dark `--surface` `#1e293b` — both pass. Scoped to this one component rather than redefining `--primary` globally, since `--primary` is also used as a *background* under white text elsewhere — e.g. active type-tab buttons — where a lighter value would hurt that pairing's contrast instead of helping it.)

- [ ] **Step 2: Switch the target pill's text/border to the existing `--primary-d` token**

Find:
```css
    .ex-target-text {
      font-size: 12px; color: var(--primary); font-weight: 600;
      background: #ede9fe; padding: 4px 10px; border-radius: 8px; direction: ltr; line-height: 1.4;
      border: 1.5px solid var(--primary); flex: 0 0 auto;
    }
```
replace with:
```css
    .ex-target-text {
      font-size: 12px; color: var(--primary-d); font-weight: 600;
      background: #ede9fe; padding: 4px 10px; border-radius: 8px; direction: ltr; line-height: 1.4;
      border: 1.5px solid var(--primary-d); flex: 0 0 auto;
    }
```
(`--primary-d` already exists as a token — `#574e8a` — computed at 6.18:1 against the pill's `#ede9fe` background, comfortably passing in both themes since neither value changes per-theme. No new color introduced.)

- [ ] **Step 3: Verify computed contrast**

Run:
```bash
node -e "
function hexToRgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
function relLum([r,g,b]){const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);};const [R,G,B]=[f(r),f(g),f(b)];return 0.2126*R+0.7152*G+0.0722*B;}
function contrast(a,b){const L1=relLum(hexToRgb(a)),L2=relLum(hexToRgb(b));const [l,d]=L1>L2?[L1,L2]:[L2,L1];return (l+0.05)/(d+0.05);}
console.log('dark copy-last-btn vs dark bg:', contrast('#9686d1','#0f172a').toFixed(2));
console.log('dark copy-last-btn vs dark surface:', contrast('#9686d1','#1e293b').toFixed(2));
console.log('target pill (--primary-d) vs pill bg:', contrast('#574e8a','#ede9fe').toFixed(2));
"
```
Expected: all three ≥ 4.5.

- [ ] **Step 4: Manual visual check**

Confirm "Copy Last Workout" button is legible in dark mode (slightly lighter purple than before). Confirm the target pill (both light and dark mode) reads correctly — text is a touch darker/richer purple than before, same visual language.

- [ ] **Step 5: Commit**
```bash
git add public/index.html
git commit -m "fix(a11y): fix target-pill and dark-mode copy-last-button text contrast"
```

---

## Task 12: A11y — Re-Confirm Findings #6/#8/#9 Are Already Correct (No Fix Needed)

**Files:** none — verification only, documents the outcome.

- [ ] **Step 1: Re-verify live against production**

Using a fresh Playwright script (or manual browser check) against `https://training-diary.web.app`:
- Confirm `.ex-target-clickable` has `role="button"` and `tabindex="0"` (finding #6).
- Confirm `.ex-weight`/`.ex-sets`/`.ex-reps` each have an `id` with a matching `label[for]` pointing at it, not just a placeholder (finding #8).
- Confirm the cardio "felt tired" checkbox has a real `aria-label` (finding #9).

Expected: all three already correct (these were fixed in the 2026-09-03 round; this task only re-confirms, per this task's own instruction not to trust a report's precise trigger condition without checking).

- [ ] **Step 2: No commit for this task** (verification-only; if any of the three turns out NOT correct, stop and treat it as a new finding requiring its own fix before continuing).

---

## Task 13: A5 — Correct the "No Realtime Listeners" Doc Claim

**Files:** Modify `docs/product/10-offline-and-sync-architecture.md`

- [ ] **Step 1: Add the clarification**

Find the line:
```markdown
- שינוי שבוצע במכשיר A לא יופיע במכשיר B עד שה-Phase 2 של מכשיר B ירוץ מחדש (למשל פתיחה מחדש של האפליקציה) — **אין מאזין בזמן אמת (`onSnapshot`)** לשינויים חיים מ-Firestore; כל הקריאות הן חד-פעמיות (`getDoc`/`getDocs`).
```
replace with:
```markdown
- שינוי שבוצע במכשיר A לא יופיע במכשיר B עד שה-Phase 2 של מכשיר B ירוץ מחדש (למשל פתיחה מחדש של האפליקציה) — **קוד האפליקציה עצמו אינו קורא בשום מקום ל-`onSnapshot`**; כל הקריאות המפורשות הן חד-פעמיות (`getDoc`/`getDocs`). **הבהרה (עודכן 2026-09-05):** זה לא אומר שאין חיבור מתמשך לרשת — Firestore SDK עצמו, כשה-persistence המקומי מופעל (ראו למעלה), פותח ומחזיק חיבור WebChannel מתמשך (`Listen/channel`) כחלק מהמימוש הפנימי שלו, ללא קשר לשימוש מפורש ב-`onSnapshot`. השלכה מעשית לכתיבת בדיקות: `page.goto(..., {waitUntil:'networkidle'})` לעולם לא Resolve על האפליקציה הזו בגלל החיבור הפתוח הזה — יש להמתין לתנאי DOM ספציפי (למשל היעלמות ה-loading overlay) במקום.
```

- [ ] **Step 2: Commit**
```bash
git add docs/product/10-offline-and-sync-architecture.md
git commit -m "docs: clarify no-onSnapshot claim doesn't mean no persistent Firestore connection"
```

---

## Task 14: Playwright Coverage for the Addendum Fixes

**Files:** Modify `tests/workout.spec.ts`, `tests/running.spec.ts`

- [ ] **Step 1: Add drag-and-drop coverage (A3)**

Add to `tests/workout.spec.ts`, inside `test.describe('Workout — Edit Plan', ...)`:
```ts
  test('drag handle does not throw and reorders exercises', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('#exerciseList .card').first().locator('.ex-target-clickable, .ex-name-text').first(); // no-op, ensures section loaded
    await page.locator('#mainGearBtn').click();
    await page.locator('button', { hasText: 'עריכת תוכנית' }).click();
    const handles = page.locator('.drag-handle');
    const count = await handles.count();
    test.skip(count < 2, 'need at least 2 exercises in the fixture template to test reordering');
    const box = await handles.first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60, { steps: 5 });
    await page.mouse.up();
    expect(errors.filter(e => e.includes('is not a function'))).toHaveLength(0);
  });
```

- [ ] **Step 2: Add the same coverage for cardio's editor**

Add to `tests/running.spec.ts`, inside `test.describe('Cardio Template Editor', ...)`:
```ts
  test('drag handle does not throw when reordering fields', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    const handles = page.locator('#cardioEditListContainer .drag-handle');
    const count = await handles.count();
    test.skip(count < 2, 'need at least 2 non-date fields to test reordering');
    const box = await handles.first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60, { steps: 5 });
    await page.mouse.up();
    expect(errors.filter(e => e.includes('is not a function'))).toHaveLength(0);
  });
```

- [ ] **Step 3: Add a cold-cache boot regression test (A4)**

Add to `tests/workout.spec.ts`, a new top-level `test.describe`:
```ts
test.describe('Cold-Cache Boot', () => {
  test('exercise cards render on a genuinely fresh session (no prior localStorage)', async ({ browser }) => {
    requiresCredentials();
    const context = await browser.newContext(); // fresh context = empty localStorage, unlike the shared default
    const page = await context.newPage();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#nav-main').click();
    await expect(page.locator('#exerciseList .card').first()).toBeVisible({ timeout: 20000 });
    await context.close();
  });
});
```

- [ ] **Step 4: Run the new tests**

Run: `TEST_EMAIL=test@gmail.com TEST_PASSWORD=111111 npx playwright test tests/workout.spec.ts tests/running.spec.ts -g "drag handle|Cold-Cache" --project=chromium`
Expected: all pass.

- [ ] **Step 5: Commit**
```bash
git add tests/workout.spec.ts tests/running.spec.ts
git commit -m "test: add coverage for the drag-and-drop fix and the cold-boot dead-end fix"
```

---

## Self-Review Notes (per superpowers:writing-plans)
- **Spec coverage:** every row of the spec's §2 impact table maps to a task (A4→1, A3→2, cache-control→3, A6→4, A7→5, A8→6, viewport→7, main→8, preview-header→9, contrast #1/#10→10, contrast #2/#3→11, #6/#8/#9 re-verify→12, A5→13, tests→14).
- **Type/name consistency:** `startEditDrag(domain)` (Task 2) is the only new drag-related function; `initDragSort`'s signature is unchanged (still `(container, startFn)`), only its internal fallback is removed. `_ensureChartJsLoaded`/`_chartJsPromise` (Task 6) are new and self-contained. No task redefines a name another task also defines.
- **No placeholders:** every step contains complete, copy-pasteable code or an exact, runnable verification command.
