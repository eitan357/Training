# History Row: Touch Double-Fire Fix + Bottom Expand Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a touch-only double-fire bug in the history long-press-select feature (short-tap doesn't reliably open/select on a real device), and move the row's expand/collapse chevron into a new dedicated full-width strip at the bottom of each card, per the approved design.

**Architecture:** All changes in `public/index.html`. The touch fix is a single `preventDefault()` call added to the existing `_histPressEnd` handler. The new strip is a sibling DOM element to `.session-header`/`.session-body` inside `.session-card`, which — by construction, since the long-press delegation only matches `.closest('.session-header')` — is automatically excluded from the selection gesture with no additional logic.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Playwright (including the pre-configured `mobile-android` project for real touch-event coverage).

**Spec:** `docs/superpowers/specs/2026-08-30-history-expand-strip-and-touch-fix-design.md`

## Global Constraints

- All changes in `public/index.html` and `tests/history.spec.ts` only, except `docs/product/04-history.md` (doc sync, existing project convention).
- Must not change the Measurements page's chevron/header behavior (`.measure-header`, `toggleMeasure`) — `_toggleBody`'s fix must work correctly for both call sites.
- `escHtml()` — not applicable, no new user-controlled strings.
- Commit after every task.

---

## Task 1: Fix the Touch Double-Fire Bug

**Files:**
- Modify: `public/index.html` (`_histPressEnd`, in the "HISTORY LONG-PRESS SELECT" block)

**Interfaces:** none — internal fix to an existing function, no signature change visible to callers (it's an event-listener callback, not called directly elsewhere).

- [ ] **Step 1: Add the event parameter and preventDefault**

Find (in the "HISTORY LONG-PRESS SELECT" block):

```js
function _histPressEnd() {
  if (!_histPress) return;
  clearTimeout(_histPress.timer);
  const { sessionId, idx, header, fired } = _histPress;
  _histPressDetach();
  if (fired) return; // long-press already toggled selection — don't also expand/collapse
  if (selectedSessions.size > 0) { toggleSessionSelect(sessionId); return; }
  toggleSess(idx, header);
}
```

replace with:

```js
function _histPressEnd(e) {
  if (!_histPress) return;
  // Suppress the browser's synthetic mousedown/mouseup/click sequence that
  // fires ~300ms after a real touchend when nothing calls preventDefault()
  // on it — without this, a single real tap re-enters this whole handler a
  // second time via the synthetic mouse events (since this same listener
  // is also registered for mousedown/mouseup to support desktop mouse
  // users), immediately undoing whatever the real tap just did. Scoped to
  // touchend only — touchstart/touchmove stay passive, so list scrolling
  // is unaffected.
  if (e && e.type === 'touchend') e.preventDefault();
  clearTimeout(_histPress.timer);
  const { sessionId, idx, header, fired } = _histPress;
  _histPressDetach();
  if (fired) return; // long-press already toggled selection — don't also expand/collapse
  if (selectedSessions.size > 0) { toggleSessionSelect(sessionId); return; }
  toggleSess(idx, header);
}
```

- [ ] **Step 2: Confirm `touchend` is still registered without `{ passive: true }`**

Run: `grep -n "addEventListener('touchend'" public/index.html`
Expected: the `_histPressEnd` registration inside `_histPressStart` has no `{ passive: true }` option (only `touchstart`/`touchmove` do) — `preventDefault()` inside a passive listener is silently ignored, so this must stay non-passive for the fix to work. If it's already non-passive (it is, as of the current code), no change needed here — this step is a verification, not an edit.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(history): suppress synthetic touch-to-mouse double-fire on long-press/tap"
```

---

## Task 2: Move the Chevron into a New Bottom Expand Strip

**Files:**
- Modify: `public/index.html` — CSS (near `.chevron`/`.session-body` rules, `:415-418`), `buildSessionCard()`, `_toggleBody()`, `renderHistory()`'s first-card-open block

**Interfaces:**
- Consumes: existing `.chevron`/`.chevron.open` CSS rule (reused, not replaced), existing `toggleSess(i, header)`.
- Produces: `.expand-strip` element and CSS classes, consumed by `_toggleBody()` and `renderHistory()`.

- [ ] **Step 1: Add the expand-strip CSS**

Find (currently near `public/index.html:415-418`):

```css
    .chevron { color: var(--sub); font-size: 12px; transition: transform .2s; }
    .chevron.open { transform: rotate(180deg); }
    .session-body { padding: 0 16px 14px; display: none; }
    .session-body.open { display: block; }
```

replace with:

```css
    .chevron { color: var(--sub); font-size: 12px; transition: transform .2s; }
    .chevron.open { transform: rotate(180deg); }
    .session-body { padding: 0 16px 14px; display: none; }
    .session-body.open { display: block; }

    /* ── HISTORY: bottom expand/collapse strip ── */
    .session-header:hover { background: rgba(100,116,139,.06); }
    .expand-strip {
      display: flex; align-items: center; justify-content: center;
      width: 100%; height: 30px;
      background: #ede9fe;
      border-top: 1px solid var(--border);
      cursor: pointer;
      transition: background-color .12s;
    }
    .expand-strip:hover { background: #ddd6fe; }
    .expand-strip.open { background: #e0dbfa; }
    .expand-strip .chevron { color: var(--primary); font-size: inherit; display: flex; }
    [data-theme="dark"] .expand-strip { background: #241f42; }
    [data-theme="dark"] .expand-strip:hover { background: #2d2650; }
    [data-theme="dark"] .expand-strip.open { background: #332a5c; }
```

- [ ] **Step 2: Replace `buildSessionCard()` — remove the inline chevron, add the strip**

Find (currently at `public/index.html`, inside `buildSessionCard()`):

```js
      <div style="display:flex;align-items:center;gap:4px;">
        ${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">${t('draft.auto_badge')}</span>` : ''}
        <span class="session-badge ${badgeClass}">${t('workout.badge')} ${escHtml(s.type)}</span>
        <span class="chevron">▼</span>
      </div>
    </div>
    <div class="session-body" id="sess_${i}">
      <div class="divider"></div>
      <table class="hist-table">
        <thead><tr>
          <th data-i18n="col.exercise">${t('col.exercise')}</th><th class="col-num" data-i18n="col.weight">${t('col.weight')}</th>
          <th class="col-reps" data-i18n="col.reps">${t('col.reps')}</th>
        </tr></thead>
        <tbody>
          ${(s.exercises||[]).map(e => `<tr>
            <td><div class="td-name">${escHtml(String(e.name))}</div>
              ${e.notes ? `<div class="td-note">${escHtml(String(e.notes))}</div>` : ''}</td>
            <td class="td-num">${e.weight||'—'}</td>
            <td class="td-num">${e.reps||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}
```

replace with:

```js
      <div style="display:flex;align-items:center;gap:4px;">
        ${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">${t('draft.auto_badge')}</span>` : ''}
        <span class="session-badge ${badgeClass}">${t('workout.badge')} ${escHtml(s.type)}</span>
      </div>
    </div>
    <div class="session-body" id="sess_${i}">
      <div class="divider"></div>
      <table class="hist-table">
        <thead><tr>
          <th data-i18n="col.exercise">${t('col.exercise')}</th><th class="col-num" data-i18n="col.weight">${t('col.weight')}</th>
          <th class="col-reps" data-i18n="col.reps">${t('col.reps')}</th>
        </tr></thead>
        <tbody>
          ${(s.exercises||[]).map(e => `<tr>
            <td><div class="td-name">${escHtml(String(e.name))}</div>
              ${e.notes ? `<div class="td-note">${escHtml(String(e.notes))}</div>` : ''}</td>
            <td class="td-num">${e.weight||'—'}</td>
            <td class="td-num">${e.reps||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="expand-strip" onclick="toggleSess(${i}, this)">
      <div class="chevron">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  </div>`;
}
```

Note: the strip's `onclick="toggleSess(${i}, this)"` is a plain click handler, deliberately NOT touched by the long-press machinery — `_histPressStart` only arms on `e.target.closest('.session-header')`, and `.expand-strip` is a sibling of `.session-header`, not a descendant, so a press starting on the strip never matches and the selection gesture never engages there. No extra guard code is needed for this exclusion; it falls out of the DOM structure.

- [ ] **Step 3: Fix `_toggleBody()`'s chevron/strip scope**

Find (currently at `public/index.html`):

```js
function _toggleBody(prefix, i, header) {
  const body = document.getElementById(prefix + i);
  if (!body) return;
  body.classList.toggle('open');
  header?.querySelector('.chevron')?.classList.toggle('open', body.classList.contains('open'));
}
```

replace with:

```js
function _toggleBody(prefix, i, header) {
  const body = document.getElementById(prefix + i);
  if (!body) return;
  body.classList.toggle('open');
  const isOpen = body.classList.contains('open');
  // Scoped to the card wrapper, not `header` itself: for history the
  // chevron now lives in a sibling .expand-strip (not inside
  // .session-header), while for measurements it's still inside
  // .measure-header — searching from the card finds it either way.
  const scope = header?.closest('.session-card, .measure-card') || header;
  scope?.querySelector('.chevron')?.classList.toggle('open', isOpen);
  scope?.querySelector('.expand-strip')?.classList.toggle('open', isOpen);
}
```

- [ ] **Step 4: Fix the first-card-open block in `renderHistory()`**

Find (currently at `public/index.html`, end of `renderHistory()`):

```js
  list.innerHTML = html;
  const first = document.getElementById('sess_0');
  if (first) { first.classList.add('open'); document.querySelector('.session-header .chevron')?.classList.add('open'); }
}
```

replace with:

```js
  list.innerHTML = html;
  const first = document.getElementById('sess_0');
  if (first) {
    first.classList.add('open');
    const firstCard = first.closest('.session-card');
    firstCard?.querySelector('.chevron')?.classList.add('open');
    firstCard?.querySelector('.expand-strip')?.classList.add('open');
  }
}
```

- [ ] **Step 5: Manual verification in a browser**

Run: `npx firebase emulators:start --only hosting` (or any static server serving `public/`), open the app, log in, go to History.
- Confirm each session card now shows a full-width tinted strip at the bottom with a down-chevron icon, and no chevron in the top-right corner anymore.
- Click the strip on any card → row opens, strip background darkens slightly, chevron rotates 180°. Click again → closes, chevron rotates back.
- Click anywhere in the row body (not the strip) when nothing is selected → row still opens/closes too (unchanged behavior).
- Long-press a row body → selects it (strip on that card is unaffected visually except for whatever open/closed state it already had).
- With a row selected, click the STRIP of a different (unselected) row → that row opens (does NOT get selected) — confirms the strip is excluded from the selection gesture regardless of selection-mode state.
- With a row selected, short-tap that OTHER row's body (not the strip) → it gets selected (not opened) — unchanged from the previous round.
- Toggle dark mode in Settings → confirm the strip's tint is still visible and legible against the dark card background.

- [ ] **Step 6: Run the existing history + measurements suites to confirm no regression**

Run: `npx playwright test tests/history.spec.ts tests/measurements.spec.ts`
Expected: all pass — measurements' chevron behavior (inside `.measure-header`, untouched) must be unaffected by the `_toggleBody()` scope fix.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat(history): move expand/collapse chevron into a dedicated bottom strip"
```

---

## Task 3: Playwright Coverage on the Real-Touch (`mobile-android`) Project

**Files:**
- Modify: `tests/history.spec.ts`

**Interfaces:** none — test-only. `playwright.config.ts` already defines a `mobile-android` project (`devices['Pixel 5']`), which uses real touch event emulation (`hasTouch: true`), unlike the default `chromium` project — running existing/new tests under `--project=mobile-android` is what actually exercises the `touchstart`/`touchend` code path Task 1 fixed. The existing long-press tests use `page.mouse`, which works identically under both projects (mouse emulation is available regardless of `hasTouch`) but doesn't exercise the touch-only bug — this task adds touch-specific coverage using Playwright's touch APIs.

- [ ] **Step 1: Add a touch-specific long-press test**

Add to `tests/history.spec.ts`, inside `test.describe('History Section', ...)`, after the existing long-press tests:

```ts
  test('touch: short tap opens a row without the browser\'s synthetic click undoing it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'touch emulation is only reliable on Chromium-based projects');
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 0 || document.querySelector('.empty'), { timeout: 15000 });
    const header = page.locator('.session-header').first();
    if (await header.count() === 0) test.skip(true, 'no history rows available in this test account');

    const box = await header.boundingBox();
    const wasOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));

    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    // Give the browser's ~300ms synthetic compatibility click a chance to
    // fire and (pre-fix) undo the real tap's effect before asserting.
    await page.waitForTimeout(500);

    const isOpen = await header.evaluate(h => h.closest('.session-card').querySelector('.session-body').classList.contains('open'));
    expect(isOpen).toBe(!wasOpen);
  });

  test('touch: long-press selects a row, then a short tap on another row selects it too, on the real touch path', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'touch emulation is only reliable on Chromium-based projects');
    await page.waitForFunction(() => document.querySelectorAll('.session-header').length > 1 || document.querySelector('.empty'), { timeout: 15000 });
    const headers = page.locator('.session-header');
    if (await headers.count() < 2) test.skip(true, 'need at least 2 history rows for this test');

    const box1 = await headers.nth(0).boundingBox();
    const touch = await page.context().newCDPSession(page);
    // Playwright's touchscreen has no press-and-hold primitive, so drive a
    // real long-press via raw touch dispatch through CDP: touch down, wait
    // past HIST_LONG_PRESS_MS, touch up — this exercises the exact
    // touchstart/touchend path the fix targets, not mouse emulation.
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 }] });
    await page.waitForTimeout(650);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);

    await expect(page.locator('.session-card').first()).toHaveClass(/sel-active/);
    await expect(page.locator('#histBulkBar')).toBeVisible();

    const box2 = await headers.nth(1).boundingBox();
    await page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.waitForTimeout(500);

    await expect(page.locator('.session-card').nth(1)).toHaveClass(/sel-active/);
  });
```

- [ ] **Step 2: Run the new tests specifically on the `mobile-android` project**

Run: `npx playwright test tests/history.spec.ts --project=mobile-android -g "touch:"`
Expected: both new tests pass. If either fails, Task 1's fix is incomplete — do not proceed to Step 3 until they pass.

- [ ] **Step 3: Run the full history suite on both projects to confirm no regression**

Run: `npx playwright test tests/history.spec.ts`
Expected: all tests pass on both `chromium` and `mobile-android` projects (the pre-existing mouse-based tests are unaffected by the touch-only fix; the two new tests self-skip on non-Chromium projects if any are ever added).

- [ ] **Step 4: Commit**

```bash
git add tests/history.spec.ts
git commit -m "test(history): add real-touch coverage for the long-press double-fire fix"
```

---

## Task 4: Update Product Documentation

**Files:**
- Modify: `docs/product/04-history.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update the session-card description**

In `docs/product/04-history.md`, find the paragraph added in the previous round describing long-press selection (starts "**בחירה מרובה בלחיצה ארוכה**"), and add immediately after it:

```markdown
**עדכון עיצובי:** חץ הפתיחה/סגירה (▼/▲, מסתובב) עבר ממיקום בפינת הכותרת לפס נפרד שתופס את כל רוחב תחתית הכרטיס, עם רקע סגול-בהיר מעט יותר בולט מרקע הכרטיס — כדי שיהיה ברור חזותית שזהו אזור לחיצה נפרד מגוף השורה. לחיצה על הפס תמיד פותחת/סוגרת את הכרטיס, בלי קשר למצב הבחירה המרובה (בשונה מגוף השורה, ששם המשמעות של לחיצה קצרה תלויה אם יש בחירה פעילה). גוף השורה עצמו עדיין פותח/סוגר גם הוא בלחיצה קצרה כשאין בחירה פעילה — כך שיש שתי דרכים מקבילות לפתוח, והפס הוא הדרך היחידה שעובדת גם כשיש בחירה פעילה במסך.
```

- [ ] **Step 2: Commit**

```bash
git add docs/product/04-history.md
git commit -m "docs: update history product doc for the bottom expand strip"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** Spec §1 (touch double-fire root cause + fix) → Task 1. Spec §2 (new strip: CSS, markup, shared-code scope fix, exclusion-by-construction) → Task 2. Spec §1's test-coverage-gap note → Task 3. Spec §3 (files touched) → matches Tasks 1-4's file lists exactly.
- **Type/name consistency check:** `_histPressEnd(e)` gains a parameter but keeps its name and is still registered the same way by `_histPressStart` (unchanged registration code, just now receives the arg it always implicitly had access to as an event listener callback). `_toggleBody(prefix, i, header)` keeps its exact signature — only its internal chevron-lookup scope changes, and both call sites (`toggleSess`, `toggleMeasure`) keep passing the same `header` argument they always did (a `.session-header` or `.measure-header` element respectively), so no caller needs to change.
- **No placeholders:** every step contains complete, copy-pasteable code — no "add appropriate handling" or "similar to Task N" instructions.
