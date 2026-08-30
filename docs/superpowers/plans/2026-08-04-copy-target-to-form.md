# Copy Target to Form Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click an exercise's target pill in the workout form to auto-fill weight and reps inputs from the parsed target string, and add a +0.5 kg quick-bump button in the settings template editor.

**Architecture:** All logic lives in `public/index.html` (single-file vanilla JS app). Two pure functions (`minOfRange`, `parseTargetString`) handle all parsing; the rest is UI wiring. A separate Node.js test script validates the parsing functions in isolation by duplicating them.

**Tech Stack:** Vanilla JS, HTML/CSS, Firebase Firestore, `public/translations.js` for i18n.

## Global Constraints

- Single file: `public/index.html` (~3600 lines). No build step, no bundler.
- i18n via `t(key)` from `translations.js`. All new user-facing strings need both `he` and `en` entries.
- No changes to Firestore data or document shape — frontend-only.
- Overwrite warning uses `confirm()`, same pattern as `copyLastWorkout()`.
- Always take the **minimum** of a range (e.g. "4-8" → 4, "8-4" → 4).
- `escHtml()` must wrap any user-controlled string put into innerHTML.
- `window.Object.assign(window, {...})` exports module-scoped functions for inline `onclick` handlers.

---

## File Map

| File | Change |
|------|--------|
| `public/index.html` | Add CSS, add `minOfRange` + `parseTargetString` + `copyTargetToCard` + `bumpTargetWeight` functions, modify `makeExCard` and `renderEditList`, export new functions via `Object.assign(window,…)` |
| `public/translations.js` | Add 6 new i18n keys (he + en) |
| `scripts/test-parse-target.js` | New file — standalone Node.js test runner for the two pure parsing functions |

---

## Task 1: i18n keys

**Files:**
- Modify: `public/translations.js`

**Interfaces:**
- Produces: `t('target.copy_hint')`, `t('target.overwrite_confirm')`, `t('target.parse_error')`, `t('target.no_target')`, `t('target.no_weight')`, `t('target.bump_btn')`

- [ ] **Step 1: Read the current end of translations.js to find where to insert**

Open `public/translations.js`, find the last key before the closing `}` of each language block.

- [ ] **Step 2: Add 6 keys to both `he` and `en` blocks**

In `public/translations.js`, inside the `he` object add:

```js
'target.copy_hint':       'לחץ להעתיק ערכי יעד לטופס',
'target.overwrite_confirm':'שדות מלאים יידרסו. להמשיך?',
'target.parse_error':     'לא הצלחתי לפענח את היעד',
'target.no_target':       'אין יעד להעתקה',
'target.no_weight':       'היעד לא מכיל משקל',
'target.bump_btn':        '+0.5',
```

Inside the `en` object add:

```js
'target.copy_hint':       'Tap to copy target values to form',
'target.overwrite_confirm':'Form fields have data. Overwrite?',
'target.parse_error':     'Could not parse the target',
'target.no_target':       'No target to copy',
'target.no_weight':       'Target has no weight value',
'target.bump_btn':        '+0.5',
```

- [ ] **Step 3: Bump the translations import version in index.html**

Find `translations.js?v=` in `public/index.html` and increment the version number by 1.

- [ ] **Step 4: Verify**

Open `public/index.html` in a browser (or `node -e "console.log(Object.keys(require('./public/translations.js').he).filter(k=>k.startsWith('target')))"` if exported) and confirm no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add public/translations.js public/index.html
git commit -m "i18n: add target copy/bump translation keys"
```

---

## Task 2: Parsing functions + tests

**Files:**
- Modify: `public/index.html` — add `minOfRange` and `parseTargetString` near other utility functions (after `genId()` or `escHtml()`)
- Create: `scripts/test-parse-target.js`

**Interfaces:**
- Produces:
  - `minOfRange(str: string): number | null` — returns the minimum of a range string
  - `parseTargetString(target: string): { weight: string|null, reps: string|null } | null`

**Parsing rules:**
| Input | weight | reps |
|-------|--------|------|
| `"4x6-8 30 kg"` | `"30"` | `"6,6,6,6"` |
| `"4×8-12 8 kg"` | `"8"` | `"8,8,8,8"` |
| `"4x2"` | `null` | `"2,2,2,2"` |
| `"2x1 + 2x4"` | `null` | `"1,1,4,4"` |
| `"סטים: 3, חזרות: 8"` | `null` | `"8,8,8"` |
| `"סטים: 2,2, חזרות: 4-8,8-12"` | `null` | `"4,4,8,8"` |
| `"חזרות: 6,10"` | `null` | `"6,10"` |
| `"4x4 8s"` | `null` | `"4,4,4,4"` (8s ignored) |
| `"30 kg"` | `"30"` | `null` |
| `""` or `null` | — | — (returns `null`) |
| `"8-4 30 kg"` | `"30"` | `"4"` (min of reversed range) |

- [ ] **Step 1: Write the test file first**

Create `scripts/test-parse-target.js` with the parsing functions duplicated inline (since they can't be imported from index.html) and assertions:

```js
// scripts/test-parse-target.js
// Run: node scripts/test-parse-target.js

function minOfRange(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (m) return Math.min(parseFloat(m[1]), parseFloat(m[2]));
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseTargetString(targetStr) {
  if (!targetStr || !targetStr.trim()) return null;
  let t = targetStr.trim();

  // 1. Extract weight
  let weight = null;
  const wm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|קילו)\b/i);
  if (wm) {
    weight = String(parseFloat(wm[1].replace(',', '.')));
    t = t.replace(wm[0], '').trim();
  }

  // Strip duration tokens
  t = t.replace(/\d+\s*(?:sec|שניות|שניה|min|דקות|\bs\b)/gi, '').trim();

  let repsArr = null;

  // 2. Labeled format: "סטים: 2,2, חזרות: 4-8,8-12" or "sets: 3, reps: 8"
  const setsLabelM = t.match(/(?:סטים|sets)\s*:\s*([\d,\s]+)/i);
  const repsLabelM = t.match(/(?:חזרות|reps)\s*:\s*([\d,\-\s]+)/i);
  if (repsLabelM) {
    const repsParts = repsLabelM[1].split(',').map(s => s.trim()).filter(Boolean);
    if (setsLabelM) {
      const setsCounts = setsLabelM[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      if (setsCounts.length > 0 && repsParts.length > 0) {
        repsArr = [];
        if (repsParts.length === 1) {
          // e.g. sets: 3, reps: 8  →  8,8,8
          const total = setsCounts.reduce((a, b) => a + b, 0);
          const rv = minOfRange(repsParts[0]);
          if (rv !== null) for (let i = 0; i < total; i++) repsArr.push(rv);
        } else {
          // e.g. sets: 2,2, reps: 4-8,8-12  →  4,4,8,8
          setsCounts.forEach((cnt, i) => {
            const rp = repsParts[i] ?? repsParts[repsParts.length - 1];
            const rv = minOfRange(rp);
            if (rv !== null) for (let j = 0; j < cnt; j++) repsArr.push(rv);
          });
        }
        if (repsArr.length === 0) repsArr = null;
      }
    } else {
      // No sets label — just reps: "חזרות: 6,10"
      const arr = repsParts.map(p => minOfRange(p)).filter(v => v !== null);
      if (arr.length === repsParts.length && arr.length > 0) repsArr = arr;
    }
  }

  // 3. Compact "NxM" or multi-group "Nx M + Nx M"
  if (!repsArr) {
    const groups = t.split('+').map(s => s.trim());
    const allReps = [];
    let matched = false;
    for (const grp of groups) {
      const gm = grp.match(/^(\d+)\s*[xX×]\s*([\d\-.]+)/);
      if (gm) {
        matched = true;
        const numSets = parseInt(gm[1]);
        const rv = minOfRange(gm[2]);
        if (rv !== null && numSets > 0 && numSets <= 20) {
          for (let i = 0; i < numSets; i++) allReps.push(rv);
        }
      }
    }
    if (matched && allReps.length > 0) repsArr = allReps;
  }

  // 4. Fallback: comma-separated ranges or single value
  if (!repsArr) {
    // Strip anything that looks like a label word
    const cleaned = t.replace(/[a-zא-ת]+/gi, '').trim();
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const arr = parts.map(p => minOfRange(p)).filter(v => v !== null);
      if (arr.length === parts.length && arr.length > 0) repsArr = arr;
    }
  }

  if (!weight && !repsArr) return null;
  return { weight, reps: repsArr ? repsArr.join(',') : null };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
  ok ? passed++ : failed++;
}

// minOfRange
eq('minOfRange 4-8',  minOfRange('4-8'),  4);
eq('minOfRange 8-4',  minOfRange('8-4'),  4);
eq('minOfRange 8',    minOfRange('8'),    8);
eq('minOfRange null', minOfRange(null),  null);
eq('minOfRange empty',minOfRange(''),    null);

// parseTargetString
eq('null input',   parseTargetString(null), null);
eq('empty string', parseTargetString(''),   null);

eq('4x6-8 30 kg',  parseTargetString('4x6-8 30 kg'),  { weight: '30', reps: '6,6,6,6' });
eq('4×8-12 8 kg',  parseTargetString('4×8-12 8 kg'),  { weight: '8',  reps: '8,8,8,8' });
eq('4x2',          parseTargetString('4x2'),           { weight: null, reps: '2,2,2,2' });
eq('2x1 + 2x4',    parseTargetString('2x1 + 2x4'),    { weight: null, reps: '1,1,4,4' });
eq('4x4 8s',       parseTargetString('4x4 8s'),       { weight: null, reps: '4,4,4,4' });
eq('30 kg only',   parseTargetString('30 kg'),         { weight: '30', reps: null });
eq('8-4 30 kg reversed', parseTargetString('8-4 30 kg'), { weight: '30', reps: '4' });

eq('sets:3 reps:8', parseTargetString('סטים: 3, חזרות: 8'), { weight: null, reps: '8,8,8' });
eq('sets:2,2 reps:4-8,8-12', parseTargetString('סטים: 2,2, חזרות: 4-8,8-12'), { weight: null, reps: '4,4,8,8' });
eq('reps only label', parseTargetString('חזרות: 6,10'), { weight: null, reps: '6,10' });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run tests — they should all pass (even though no app code changed yet, since functions are duplicated)**

```
node scripts/test-parse-target.js
```

Expected: all assertions pass, `0 failed`.

- [ ] **Step 3: Add `minOfRange` and `parseTargetString` to index.html**

Find the location of `escHtml` or `genId` utility functions in `public/index.html`. After those functions, insert:

```js
function minOfRange(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (m) return Math.min(parseFloat(m[1]), parseFloat(m[2]));
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseTargetString(targetStr) {
  if (!targetStr || !targetStr.trim()) return null;
  let t = targetStr.trim();

  let weight = null;
  const wm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|קילו)\b/i);
  if (wm) {
    weight = String(parseFloat(wm[1].replace(',', '.')));
    t = t.replace(wm[0], '').trim();
  }

  t = t.replace(/\d+\s*(?:sec|שניות|שניה|min|דקות|\bs\b)/gi, '').trim();

  let repsArr = null;

  const setsLabelM = t.match(/(?:סטים|sets)\s*:\s*([\d,\s]+)/i);
  const repsLabelM = t.match(/(?:חזרות|reps)\s*:\s*([\d,\-\s]+)/i);
  if (repsLabelM) {
    const repsParts = repsLabelM[1].split(',').map(s => s.trim()).filter(Boolean);
    if (setsLabelM) {
      const setsCounts = setsLabelM[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      if (setsCounts.length > 0 && repsParts.length > 0) {
        repsArr = [];
        if (repsParts.length === 1) {
          const total = setsCounts.reduce((a, b) => a + b, 0);
          const rv = minOfRange(repsParts[0]);
          if (rv !== null) for (let i = 0; i < total; i++) repsArr.push(rv);
        } else {
          setsCounts.forEach((cnt, i) => {
            const rp = repsParts[i] ?? repsParts[repsParts.length - 1];
            const rv = minOfRange(rp);
            if (rv !== null) for (let j = 0; j < cnt; j++) repsArr.push(rv);
          });
        }
        if (repsArr.length === 0) repsArr = null;
      }
    } else {
      const arr = repsParts.map(p => minOfRange(p)).filter(v => v !== null);
      if (arr.length === repsParts.length && arr.length > 0) repsArr = arr;
    }
  }

  if (!repsArr) {
    const groups = t.split('+').map(s => s.trim());
    const allReps = [];
    let matched = false;
    for (const grp of groups) {
      const gm = grp.match(/^(\d+)\s*[xX×]\s*([\d\-.]+)/);
      if (gm) {
        matched = true;
        const numSets = parseInt(gm[1]);
        const rv = minOfRange(gm[2]);
        if (rv !== null && numSets > 0 && numSets <= 20) {
          for (let i = 0; i < numSets; i++) allReps.push(rv);
        }
      }
    }
    if (matched && allReps.length > 0) repsArr = allReps;
  }

  if (!repsArr) {
    const cleaned = t.replace(/[a-zא-ת]+/gi, '').trim();
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const arr = parts.map(p => minOfRange(p)).filter(v => v !== null);
      if (arr.length === parts.length && arr.length > 0) repsArr = arr;
    }
  }

  if (!weight && !repsArr) return null;
  return { weight, reps: repsArr ? repsArr.join(',') : null };
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/test-parse-target.js public/index.html
git commit -m "feat: add parseTargetString + minOfRange with full test suite"
```

---

## Task 3: Copy-target button on workout card

**Files:**
- Modify: `public/index.html` — add CSS, add `copyTargetToCard` function, modify `makeExCard`, export via `Object.assign(window,…)`

**Interfaces:**
- Consumes: `parseTargetString` (Task 2), `t()`, `toast()`
- Produces: `copyTargetToCard(cardEl: HTMLElement): void` — exported to window

- [ ] **Step 1: Add CSS for clickable target pill**

In the `<style>` block, find the `.ex-target-text` rule and add these rules after it:

```css
.ex-target-clickable {
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s;
}
.ex-target-clickable:active { opacity: 0.65; }
```

- [ ] **Step 2: Add `copyTargetToCard` function**

Near `copyLastWorkout()` in `public/index.html`, add:

```js
function copyTargetToCard(cardEl) {
  const target = cardEl.querySelector('.ex-target-text')?.innerText?.trim();
  if (!target) { toast(t('target.no_target'), 'error'); return; }

  const parsed = parseTargetString(target);
  if (!parsed) { toast(t('target.parse_error'), 'error'); return; }

  const weightInput = cardEl.querySelector('.ex-weight');
  const repsInput   = cardEl.querySelector('.ex-reps');
  const hasData     = weightInput.value.trim() || repsInput.value.trim();

  if (hasData && !confirm(t('target.overwrite_confirm'))) return;

  if (parsed.weight !== null) weightInput.value = parsed.weight;
  if (parsed.reps   !== null) repsInput.value   = parsed.reps;

  if (!parsed.weight && !parsed.reps) {
    toast(t('target.parse_error'), 'error');
  }
}
```

- [ ] **Step 3: Export `copyTargetToCard` to window**

Find the `Object.assign(window, {` call that exports module-scoped functions. Add `copyTargetToCard` to it.

- [ ] **Step 4: Modify `makeExCard` to make target pill clickable**

Find the `makeExCard` function. Change the `.ex-target-text` line from:

```js
<div class="ex-target-text">${escHtml(target)}</div>
```

to:

```js
${target && target.trim()
  ? `<div class="ex-target-text ex-target-clickable" onclick="copyTargetToCard(this.closest('.card'))" title="${t('target.copy_hint')}">${escHtml(target)}</div>`
  : ''}
```

(If `target` is empty, render nothing — no pill shown for custom exercises without a target.)

- [ ] **Step 5: Manual test in browser**

1. Open workout page, select a workout type.
2. Confirm target pills are visible for exercises that have a target.
3. Click a target pill — confirm it fills weight/reps in that exercise's fields.
4. Verify overwrite confirm appears when fields are non-empty.
5. Verify error toast appears if target cannot be parsed (edit a template to have a non-parseable string like "xyz").
6. Verify reversed range "8-4" → fills reps with "4".

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat: tap target pill to copy weight/reps to workout form fields"
```

---

## Task 4: +0.5 kg button in settings editor

**Files:**
- Modify: `public/index.html` — add CSS, add `bumpTargetWeight` function, modify `renderEditList`, export via `Object.assign(window,…)`

**Interfaces:**
- Consumes: `t()`, `toast()`
- Produces: `bumpTargetWeight(inputEl: HTMLInputElement, delta: number): void` — exported to window

- [ ] **Step 1: Add CSS for the bump button and target-row layout**

In the `<style>` block, after the `.ex-target-input` rule, add:

```css
.target-row {
  display: flex; align-items: center; gap: 6px;
}
.target-row .ex-target-input { flex: 1; }
.target-bump-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  border: 1.5px solid var(--primary);
  border-radius: 8px;
  background: var(--bg);
  color: var(--primary);
  font-size: 13px; font-weight: 700;
  cursor: pointer; white-space: nowrap;
}
.target-bump-btn:active { opacity: 0.7; }
```

- [ ] **Step 2: Add `bumpTargetWeight` function**

Near `copyTargetToCard`, add:

```js
function bumpTargetWeight(inputEl, delta) {
  const wm = inputEl.value.match(/(\d+(?:[.,]\d+)?)\s*(kg|קילו)\b/i);
  if (!wm) { toast(t('target.no_weight'), 'error'); return; }
  const current  = parseFloat(wm[1].replace(',', '.'));
  const newVal   = Math.round((current + delta) * 10) / 10;
  inputEl.value  = inputEl.value.replace(wm[0], `${newVal} ${wm[2]}`);
}
```

- [ ] **Step 3: Export `bumpTargetWeight` to window**

Add `bumpTargetWeight` to the `Object.assign(window, {` export block.

- [ ] **Step 4: Modify `renderEditList` to wrap target input in `.target-row` and add bump button**

Find the `card.innerHTML = \`` template inside `renderEditList`. Change:

```js
<input class="ex-target-input" value="${escHtml(ex.target)}" placeholder="${t('edit.ex_target_ph')}">
```

to:

```js
<div class="target-row">
  <input class="ex-target-input" value="${escHtml(ex.target)}" placeholder="${t('edit.ex_target_ph')}">
  <button class="target-bump-btn" type="button" onclick="bumpTargetWeight(this.previousElementSibling, 0.5)">${t('target.bump_btn')}</button>
</div>
```

- [ ] **Step 5: Verify `collectEdits` still reads the input correctly**

`collectEdits` does `c.querySelector('.ex-target-input').value` — this still works because `.ex-target-input` is a direct descendant of `.edit-card` (the `querySelector` is not limited to direct children). No change needed.

Also verify the drag-sort in `initDragSort` is not affected (it works on `.edit-card` elements, which are unchanged).

- [ ] **Step 6: Manual test in browser**

1. Open Settings → Templates tab.
2. Find an exercise with a weight in its target (e.g. "4x6-8 30 kg").
3. Click the "+0.5" button — confirm the target updates to "4x6-8 30.5 kg".
4. Click again — confirm "31 kg".
5. Verify that clicking "+0.5" on a target without "kg" or "קילו" shows an error toast.
6. Save templates and reload. Confirm weight persists correctly.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: add +0.5 kg quick-bump button in settings template editor"
```

---

## Task 5: Integration smoke test + deploy

**Files:**
- None modified

- [ ] **Step 1: Run the full parse test suite one more time**

```
node scripts/test-parse-target.js
```

Expected: all `✓`, `0 failed`.

- [ ] **Step 2: Full end-to-end walkthrough in browser**

1. Settings → add template with target `"4x6-8 30 kg"`, save.
2. Go to workout page, select that type.
3. Tap the purple target pill → weight fills `30`, reps fills `6,6,6,6`.
4. Tap again while fields are non-empty → overwrite confirm appears.
5. Go back to Settings → click "+0.5" on that exercise → target becomes `"4x6-8 30.5 kg"`.
6. Go to workout page — target pill now shows `30.5 kg`; tapping fills `30.5`.
7. Test with Hebrew template `"סטים: 3, חזרות: 8"` → tapping fills reps `8,8,8`.
8. Test with invalid target `"xyz"` → error toast shown, no fields changed.

- [ ] **Step 3: Deploy**

```bash
git push origin main
```

Wait for GitHub Actions deploy to complete (check Actions tab or Firebase Hosting URL).

- [ ] **Step 4: Verify on production URL and on installed PWA**

Open the production URL and the installed PWA (home screen icon). Repeat steps 3 and 5 from Step 2 above.

---

## Self-Review

**Spec coverage:**
- ✓ Parsing sets/reps from compact "NxM" format
- ✓ Parsing labeled "סטים/חזרות" format
- ✓ Min of range including reversed ("8-4" → 4)
- ✓ Weight extraction and fill
- ✓ Overwrite confirm
- ✓ Error UI (toast on parse failure, no target, no weight)
- ✓ +0.5 kg button in settings
- ✓ i18n (he + en)
- ✓ Tests for parsing functions
- ✓ `collectEdits` backward compatibility confirmed

**Placeholder scan:** None found.

**Type consistency:**
- `parseTargetString` returns `{ weight: string|null, reps: string|null } | null` — used consistently in `copyTargetToCard`
- `bumpTargetWeight(inputEl, delta)` — `inputEl` is `HTMLInputElement`, `delta` is `number` (always `0.5` at call sites)
- `minOfRange(str)` returns `number | null` — consistent across test file and production code
