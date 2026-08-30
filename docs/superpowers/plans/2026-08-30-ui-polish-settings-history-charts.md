# Settings Copy, History Long-Press Select, Chart Color Muting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three independent, small UI fixes in one session: (1) drop a stray "ל" from the workout-plan-editor settings label, (2) replace History's per-row selection circle with long-press-to-select while keeping short-tap-to-expand, (3) mute 3 of the 5 running-dashboard chart line colors to match the app's existing pastel/muted palette.

**Architecture:** All app code lives in `public/index.html` (single source for web + Capacitor Android) and `public/translations.js` — no new files except test updates. Item 2 reuses the existing `selectedSessions` Set / bulk-bar machinery unchanged, only replacing how a row enters/exits that Set (long-press instead of a circle tap), following the same document-level mousedown+mousemove+mouseup/touchstart+touchmove+touchend gesture pattern already used by the drag-and-drop code (`startGenericDrag`).

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Auth/Firestore v12 (CDN), Chart.js (item 3 only), Playwright for E2E tests.

**Spec:** `docs/superpowers/specs/2026-08-30-ui-polish-settings-history-charts-design.md`

## Global Constraints

- All JS/HTML changes in `public/index.html` and `public/translations.js` only, except `tests/*.spec.ts` (new/updated Playwright coverage) and `docs/product/*.md` (post-implementation doc sync — existing project convention).
- Item 2 must not touch the shared generic bulk-select helpers (`_toggleSelect`, `_updateBulkBar`, `_bulkDelete`) or `buildMeasureCard()` — Measurements keeps its `.sel-check` circle exactly as-is.
- `escHtml()` must wrap any user-controlled string put into `innerHTML` — not applicable to any task here (no new user-controlled strings reach the DOM), stated because it's a standing project rule.
- All new user-facing strings need both `he` and `en` entries in `public/translations.js` — not applicable (no new user-facing strings in this plan; item 1 edits an existing key's existing value).
- Commit after every task.

---

## Task 1: Settings — Fix Workout-Plan-Editor Label Copy

**Files:**
- Modify: `public/translations.js:170`
- Test: `tests/settings.spec.ts`

**Interfaces:** none — single string constant.

- [ ] **Step 1: Write the failing test**

Add to `tests/settings.spec.ts`, inside `test.describe('Settings Section', ...)`:

```ts
  test('workout plan edit label has no stray leading ל', async ({ page }) => {
    const label = page.locator('.settings-item-title', { hasText: 'עריכת תוכנית אימוני כוח' });
    await expect(label).toHaveText('עריכת תוכנית אימוני כוח');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/settings.spec.ts -g "stray leading"`
Expected: FAIL — actual text is `לעריכת תוכנית אימוני כוח` (extra leading ל), not an exact match.

- [ ] **Step 3: Fix the translation value**

In `public/translations.js`, find (line 170):

```js
    'settings.workout_edit':      'לעריכת תוכנית אימוני כוח',
```

replace with:

```js
    'settings.workout_edit':      'עריכת תוכנית אימוני כוח',
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test tests/settings.spec.ts -g "stray leading"`
Expected: PASS

- [ ] **Step 5: Run the full settings + workout suites to confirm no regression**

Run: `npx playwright test tests/settings.spec.ts tests/workout.spec.ts`
Expected: all pass, including `tests/workout.spec.ts:86`'s `hasText: 'עריכת תוכנית'` substring match (still a substring of the new copy).

- [ ] **Step 6: Commit**

```bash
git add public/translations.js tests/settings.spec.ts
git commit -m "fix(settings): drop stray leading ל from workout-plan-editor label"
```

---

## Task 2: History — Remove Selection Circle, Prepare Markup/CSS for Long-Press

**Files:**
- Modify: `public/index.html:2990-3010` (`buildSessionCard`), `:405` (`.session-header` CSS)

**Interfaces:**
- Produces: `.session-header[data-idx]` attribute (consumed by Task 3's press-end handler).
- Consumes: nothing new.

- [ ] **Step 1: Remove the circle and the header's inline onclick, add `data-idx`**

Find and replace this exact block (currently at `public/index.html:2994-3010`):

```js
  return `<div class="session-card${sel ? ' sel-active' : ''}" data-sid="${escHtml(s.id)}">
    <div class="session-header" onclick="toggleSess(${i}, this)">
      <div class="session-left">
        <div class="sel-check${sel ? ' checked' : ''}" onclick="event.stopPropagation();toggleSessionSelect('${escHtml(s.id)}')"></div>
        <div class="session-dot ${dotClass}"></div>
        <div>
          <div class="session-date">${sessionDisplayDate(s)}</div>
          ${s.sessionName ? `<div class="session-name-label">${escHtml(s.sessionName)}</div>` : ''}
          <div class="session-count">${(s.exercises||[]).length} ${t('workout.exercises')}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        ${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">${t('draft.auto_badge')}</span>` : ''}
        <span class="session-badge ${badgeClass}">${t('workout.badge')} ${escHtml(s.type)}</span>
        <span class="chevron">▼</span>
      </div>
    </div>
```

with:

```js
  return `<div class="session-card${sel ? ' sel-active' : ''}" data-sid="${escHtml(s.id)}">
    <div class="session-header" data-idx="${i}">
      <div class="session-left">
        <div class="session-dot ${dotClass}"></div>
        <div>
          <div class="session-date">${sessionDisplayDate(s)}</div>
          ${s.sessionName ? `<div class="session-name-label">${escHtml(s.sessionName)}</div>` : ''}
          <div class="session-count">${(s.exercises||[]).length} ${t('workout.exercises')}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        ${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">${t('draft.auto_badge')}</span>` : ''}
        <span class="session-badge ${badgeClass}">${t('workout.badge')} ${escHtml(s.type)}</span>
        <span class="chevron">▼</span>
      </div>
    </div>
```

(The `onclick="toggleSess(...)"` is intentionally removed here — Task 3's press-end handler calls `toggleSess` itself once it has decided the press was short, so a native `click` firing this too would double-toggle. `data-idx="${i}"` replaces the index that onclick used to carry.)

- [ ] **Step 2: Add long-press-friendly CSS to `.session-header`**

Find (currently at `public/index.html:405`):

```css
    .session-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; cursor: pointer; }
```

replace with:

```css
    .session-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
```

(Prevents a long-press from triggering native text selection or, on iOS Safari/WebView, a callout menu — the row itself has no selectable text purpose.)

- [ ] **Step 3: Confirm the file still parses**

Run: `node -e "require('fs').readFileSync('public/index.html','utf8')" && echo "file readable"`
Expected: `file readable` (this is a sanity read, not a JS syntax check — `index.html` isn't pure JS; visually re-diff the two blocks above and confirm every brace/backtick balances before proceeding).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "refactor(history): remove selection circle markup, prep session-header for long-press"
```

Note: the app will not be in a fully working state between this commit and Task 3's — `toggleSessionSelect` is no longer reachable from the UI at all until Task 3 lands. This is expected (small, reviewable, sequential tasks); do not deploy between Task 2 and Task 3.

---

## Task 3: History — Long-Press Selection Logic

**Files:**
- Modify: `public/index.html` (new block, placed directly after `renderHistory()`, currently ending at `:3075`)

**Interfaces:**
- Consumes: `toggleSessionSelect(id)`, `toggleSess(idx, header)`, `selectedSessions` (all pre-existing, unchanged).
- Produces: `_attachHistLongPress()` (called from `renderHistory()`).

- [ ] **Step 1: Wire the attach call into `renderHistory()`**

Find (currently at `public/index.html:3031-3034`):

```js
function renderHistory() {
  selectedSessions.clear();
  updateHistBulkBar();
  const list = document.getElementById('historyList');
```

replace with:

```js
function renderHistory() {
  selectedSessions.clear();
  updateHistBulkBar();
  const list = document.getElementById('historyList');
  _attachHistLongPress();
```

- [ ] **Step 2: Add the long-press implementation**

Immediately after the closing brace of `renderHistory()` (currently at `public/index.html:3075`, right before `function _toggleBody(prefix, i, header) {`), add:

```js
// ─── HISTORY LONG-PRESS SELECT ─────────────────────────────────
// Long-press (500ms, <10px movement) anywhere on a .session-header
// enters/extends multi-select (same selectedSessions Set the bulk bar
// already reads) instead of a dedicated circle. Short-tap keeps
// expanding/collapsing the row UNLESS a selection is already active, in
// which case short-tap toggles that row's selection too (standard
// long-press-to-select convention — Gmail/Photos/Files/WhatsApp).
// Delegated from #historyList (attached once, survives renderHistory()'s
// innerHTML replacement) using the same mousedown/touchstart +
// document-level mousemove/mouseup + touchmove/touchend pattern as the
// existing drag-and-drop code (startGenericDrag) for consistency.
const HIST_LONG_PRESS_MS        = 500;
const HIST_LONG_PRESS_TOLERANCE = 10;
let _histPress = null;

function _attachHistLongPress() {
  const list = document.getElementById('historyList');
  if (!list || list.dataset.longPressAttached) return;
  list.dataset.longPressAttached = 'true';
  list.addEventListener('mousedown',  _histPressStart);
  list.addEventListener('touchstart', _histPressStart, { passive: true });
  list.addEventListener('contextmenu', e => { if (_histPress) e.preventDefault(); });
}

function _histPressStart(e) {
  if (e.type === 'mousedown' && e.button !== 0) return;
  const header = e.target.closest('.session-header');
  if (!header) return;
  const card = header.closest('.session-card');
  if (!card) return;
  const point = e.touches ? e.touches[0] : e;
  _histPress = {
    sessionId: card.dataset.sid,
    idx:       Number(header.dataset.idx),
    header,
    startX:    point.clientX,
    startY:    point.clientY,
    fired:     false,
    timer:     null,
  };
  _histPress.timer = setTimeout(() => {
    if (!_histPress) return;
    _histPress.fired = true;
    if (navigator.vibrate) navigator.vibrate(30);
    toggleSessionSelect(_histPress.sessionId);
  }, HIST_LONG_PRESS_MS);

  document.addEventListener('mousemove',  _histPressMove);
  document.addEventListener('touchmove',  _histPressMove, { passive: true });
  document.addEventListener('mouseup',    _histPressEnd);
  document.addEventListener('touchend',   _histPressEnd);
  document.addEventListener('touchcancel', _histPressCancel);
}

function _histPressMove(e) {
  if (!_histPress) return;
  const point = e.touches ? e.touches[0] : e;
  const dx = Math.abs(point.clientX - _histPress.startX);
  const dy = Math.abs(point.clientY - _histPress.startY);
  if (dx > HIST_LONG_PRESS_TOLERANCE || dy > HIST_LONG_PRESS_TOLERANCE) _histPressCancel();
}

function _histPressEnd() {
  if (!_histPress) return;
  clearTimeout(_histPress.timer);
  const { sessionId, idx, header, fired } = _histPress;
  _histPressDetach();
  if (fired) return; // long-press already toggled selection — don't also expand/collapse
  if (selectedSessions.size > 0) { toggleSessionSelect(sessionId); return; }
  toggleSess(idx, header);
}

function _histPressCancel() {
  if (!_histPress) return;
  clearTimeout(_histPress.timer);
  _histPressDetach();
}

function _histPressDetach() {
  _histPress = null;
  document.removeEventListener('mousemove',  _histPressMove);
  document.removeEventListener('touchmove',  _histPressMove);
  document.removeEventListener('mouseup',    _histPressEnd);
  document.removeEventListener('touchend',   _histPressEnd);
  document.removeEventListener('touchcancel', _histPressCancel);
}
```

- [ ] **Step 3: Manual verification in a browser**

Run: `npx firebase emulators:start --only hosting` (or any static server serving `public/`), open the app, log in, go to History.
- Short-click a row → it expands/collapses exactly as before.
- Press and hold a row (mouse: press and don't release for ~600ms, don't move) → the row gets the purple `sel-active` outline, `#histBulkBar` appears with count "1", and the row does NOT expand.
- While that row is selected, short-click a *different* row → it also becomes selected (count "2"), bulk bar updates, and neither row expands from that tap.
- Short-click one of the two selected rows again → it deselects (count "1").
- Short-click the last remaining selected row → it deselects, `#histBulkBar` disappears, and the app is back to normal short-tap-expands mode.
- Long-press, then drag the mouse/finger more than ~10px before releasing → nothing happens (no selection, no expand) — this is the movement-cancels-long-press guard working.
- With exactly one row selected, click "ערוך" in the bulk bar → the existing inline session editor opens (unchanged `editSelectedSession` → `editSession` path).
- With one or more rows selected, click "מחק נבחרים" → the existing bulk delete runs (unchanged `bulkDeleteSessions`).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(history): long-press to select session rows, replacing the selection circle"
```

---

## Task 4: History — Playwright Coverage for Long-Press Selection

**Files:**
- Modify: `tests/history.spec.ts`

**Interfaces:** none — test-only. Uses Playwright's `page.mouse.down()`/`page.mouse.up()` with a `waitForTimeout` in between to simulate a long-press (these dispatch real `mousedown`/`mouseup` events, which `_histPressStart`/`_histPressEnd` from Task 3 handle identically to touch).

- [ ] **Step 1: Add the long-press-selects test**

Add to `tests/history.spec.ts`, inside `test.describe('History Section', ...)`, after the existing tests (requires at least one saved workout in the test account's history — if the suite's fixture account has none, this test will find zero `.session-header` rows and should be skipped defensively as shown):

```ts
  test('long-press on a history row selects it and shows the bulk action bar', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    if (await header.count() === 0) test.skip(true, 'no history rows available in this test account');

    const box = await header.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650); // > HIST_LONG_PRESS_MS
    await page.mouse.up();

    await expect(page.locator('.session-card').first()).toHaveClass(/sel-active/);
    await expect(page.locator('#histBulkBar')).toBeVisible();
    await expect(page.locator('#histBulkCount')).not.toBeEmpty();
  });

  test('short click on a history row still expands it (not selection)', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').nth(1);
    if (await header.count() === 0) test.skip(true, 'no second history row available in this test account');

    const wasOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));
    await header.click();
    const isOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));
    expect(isOpen).toBe(!wasOpen);
    await expect(page.locator('#histBulkBar')).toBeHidden();
  });

  test('long-press then dragging past the movement tolerance cancels the long-press', async ({ page }) => {
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    if (await header.count() === 0) test.skip(true, 'no history rows available in this test account');

    const box = await header.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(650);
    await page.mouse.up();

    await expect(page.locator('#histBulkBar')).toBeHidden();
  });
```

- [ ] **Step 2: Run the new tests**

Run: `npx playwright test tests/history.spec.ts`
Expected: all pass (existing tests unchanged and still passing, plus the 3 new ones). If the test account's history is empty, the two skip-guarded tests will report `skipped`, not `failed` — that's acceptable but means the test account should ideally have ≥2 saved workouts for real coverage; note this to the user rather than fabricating fixture data as part of this plan.

- [ ] **Step 3: Commit**

```bash
git add tests/history.spec.ts
git commit -m "test(history): add long-press select, short-tap-expands, and drag-cancels coverage"
```

---

## Task 5: History — Update Product Documentation

**Files:**
- Modify: `docs/product/04-history.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Replace the selection-circle description**

In `docs/product/04-history.md`, find the line describing the selection circle (currently: `- **עיגול בחירה** (\`sel-check\`) — מפעיל מצב בחירה מרובה (ראו למטה) בלי לפתוח/לסגור את הכרטיס.`) inside the "כרטיס אימון (Session Card)" section, and replace with:

```markdown
- **בחירה מרובה בלחיצה ארוכה** — במקום עיגול ייעודי, לחיצה ארוכה (כ-500ms, ללא גרירה) בכל מקום על שורת הכותרת (`session-header`) מכניסה את האימון לבחירה מרובה (מפעילה `sel-active` וסרגל הפעולות הצף) בלי לפתוח/לסגור את הכרטיס. לחיצה קצרה ממשיכה לפתוח/לסגור את הכרטיס כרגיל — **אלא אם** כבר יש בחירה פעילה, ואז לחיצה קצרה על שורה מוסיפה/מסירה אותה מהבחירה במקום לפתוח אותה (דפוס בחירה מרובה סטנדרטי). עמוד מדידות (`06-measurements.md`) עדיין משתמש בעיגול הבחירה הישן — שינוי זה חל על היסטוריה בלבד.
```

- [ ] **Step 2: Commit**

```bash
git add docs/product/04-history.md
git commit -m "docs: update history product doc for long-press selection"
```

---

## Task 6: Running Charts — Mute the 3 Over-Saturated Line Colors

**Files:**
- Modify: `public/index.html:1646-1652` (`RUN_CHARTS_CONFIG`)

**Interfaces:** none — 3 constant value changes.

- [ ] **Step 1: Replace the color values**

Find (currently at `public/index.html:1646-1652`):

```js
const RUN_CHARTS_CONFIG = [
  { key: 'distanceKm',       tKey: 'run.chart.distance', color: '#2563eb', fmt: v => v.toFixed(1) },
  { key: 'avgHeartRate',     tKey: 'run.chart.hr',       color: '#a05555', fmt: v => Math.round(v) },
  { key: 'paceMinPerKm',     tKey: 'run.chart.pace',     color: '#3c7a54', fmt: formatPace },
  { key: 'calories',         tKey: 'run.chart.calories', color: '#d97706', fmt: v => Math.round(v) },
  { key: 'avgStridesPerMin', tKey: 'run.chart.spm',      color: '#7c3aed', fmt: v => Math.round(v) },
];
```

replace with:

```js
// Colors are hand-muted to the app's existing pastel palette (roughly
// S 30-45%, matching --primary/--green/--red in the CSS custom
// properties above) — the originals here were 2-3x more saturated than
// every other colored element in the app. avgHeartRate/paceMinPerKm
// were already in-family (paceMinPerKm literally reuses --green-d) and
// are unchanged. See docs/superpowers/specs/2026-08-30-ui-polish-settings-history-charts-design.md §3.
const RUN_CHARTS_CONFIG = [
  { key: 'distanceKm',       tKey: 'run.chart.distance', color: '#536fac', fmt: v => v.toFixed(1) },
  { key: 'avgHeartRate',     tKey: 'run.chart.hr',       color: '#a05555', fmt: v => Math.round(v) },
  { key: 'paceMinPerKm',     tKey: 'run.chart.pace',     color: '#3c7a54', fmt: formatPace },
  { key: 'calories',         tKey: 'run.chart.calories', color: '#aa7941', fmt: v => Math.round(v) },
  { key: 'avgStridesPerMin', tKey: 'run.chart.spm',      color: '#9b5aaf', fmt: v => Math.round(v) },
];
```

- [ ] **Step 2: Confirm no test hardcodes the old values**

Run: `grep -rn "2563eb\|d97706\|7c3aed" tests/`
Expected: no matches (already verified during design — this step just re-confirms at implementation time in case tests changed since the spec was written).

- [ ] **Step 3: Manual visual verification**

Run: `npx firebase emulators:start --only hosting` (or any static server serving `public/`), open the app, log in as a user with running enabled and ≥1 saved run/elliptical workout with distance/calories/steps-per-minute data, go to Running → confirm the 5 chart lines render in visibly muted/pastel tones consistent with the rest of the app's buttons/badges, with distance still reading as "blue-ish," calories as "amber/tan," and steps/min as "muted violet" (still distinguishable from each other and from the heart-rate/pace lines).

Note: a dedicated automated color-assertion test is intentionally not added here — `RUN_CHARTS_CONFIG` is a module-scoped constant not exposed on `window`, and asserting a Chart.js canvas's rendered stroke color would require either exposing test-only globals or canvas pixel-reading, disproportionate test infrastructure for a 3-value constant swap with zero existing test coverage on the old values either. Grep + manual visual check (Steps 2-3) is the right-sized verification here.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "fix(running): mute distance/calories/steps-per-minute chart colors to match app palette"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** Spec §1 (settings copy) → Task 1. Spec §2 (history long-press: interaction model, dead-code note, out-of-scope Measurements) → Tasks 2-5. Spec §3 (chart color audit + fix table) → Task 6. Spec §5 (security/risk review) → no dedicated task needed, confirmed inline in spec (no new task required since no code path in this plan touches auth/Firestore/escHtml).
- **Type/name consistency check:** `toggleSess(idx, header)` in Task 3 matches its existing pre-plan signature (`public/index.html:3083`, untouched) — `idx` is read from `data-idx` added in Task 2. `toggleSessionSelect(id)` matches its existing signature (`public/index.html:4122`, untouched). `_attachHistLongPress()` is defined once in Task 3 and called once from `renderHistory()` in the same task — no other task redefines or calls it.
- **No placeholders:** every step contains complete, copy-pasteable code — no "add appropriate handling" or "similar to Task N" instructions.
