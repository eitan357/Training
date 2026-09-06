# Strength & Cardio QA Addendum Fixes — Design Spec

**Date:** 2026-09-05
**Applies to:** `public/index.html`, `public/translations.js`, `firebase.json`, `docs/product/10-offline-and-sync-architecture.md`
**Driven by:** `qa-report-strength-cardio-2026-09-04-addendum.md`, a same-day follow-up to the 2026-09-03 report (already fully fixed — see `docs/superpowers/specs/2026-09-03-strength-cardio-qa-fixes-design.md`).

## 1. Investigation: what's real vs. a false alarm

Before planning fixes, every addendum finding was independently re-verified against the **live production site right now**, not assumed from the report text — the report itself flags real uncertainty in two places (A1's "appears to be," A2's "stated conservatively... worth a code-level look").

### A1/A2 — NOT reproducible right now; not a code bug. Root cause: missing cache-control on `translations.js`.
A completely fresh, cold Playwright browser session against `https://training-diary.web.app` right now (both via in-app nav click AND a hard reload) shows **correct** Hebrew/English cardio field labels **and** correct `for`/`id` association simultaneously — i.e., neither of A1's "broken key text" nor A2's "no association at all" reproduces. Checked live response headers:

```
translations.js: Cache-Control: max-age=3600, Last-Modified: [deploy timestamp]
index.html:      Cache-Control: max-age=3600, Last-Modified: [same deploy timestamp]
```

Both files share the exact same `Last-Modified` (deployed atomically together — ruling out a partial/mismatched deploy), but **both get Firebase Hosting's default 1-hour browser cache with no revalidation forcing**, despite `sw.js`'s own code/comments explicitly treating `translations.js` as "changes frequently" and excluding it from the Service Worker's cache (confirmed: `if (url.pathname.endsWith('/translations.js')...) return;` — falls through to network, every time, at the SW layer only). The addendum's "same day, hours apart" + "two different code paths" symptom is exactly what a stale 1-hour HTTP cache produces: a browser tab/session with resources loaded shortly before the 2026-09-03 fix deployed would keep serving pieces of the old, cached version for up to an hour after — mixing old/new JS and translations depending on exactly which sub-resource happened to be re-fetched vs. still-cached at each moment. There is only ONE `renderCardioFieldRow` function in the whole codebase — there are no two competing code paths to reconcile, confirming this is caching, not logic.

**Action:** no code-logic fix (there's nothing to fix — the current code is already correct, per live re-verification). **Do** fix the actual gap this exposed: `translations.js` has no explicit cache-control rule in `firebase.json` (unlike `manifest.json`, which already gets `no-cache`), so it inherits the 1-hour default despite the SW-layer already treating it as high-churn. Add the same `no-cache` treatment for `translations.js` in `firebase.json`'s `headers` array, closing this exact false-alarm/real-staleness window for every future deploy, not just this one.

### A4 — Confirmed live, root-caused precisely (worse than "slow," genuinely a dead end)
A fresh cold session against production right now: `#typeRow` populates with 2 types, but `#exerciseList` renders **zero cards indefinitely** (confirmed no resolution after 100+ seconds, no console errors at all — ruling out the addendum's own IndexedDB-lock-contention theory as *the* cause here, though that may be a compounding factor in other cases). Root cause, read directly from the live source:

- `initApp()`'s Phase 1 calls `selectType(workoutTypes[0] || 'A')` unconditionally, before any real template data exists (empty `editTemplates`) — this sets `selectedType` to e.g. `'A'` but renders 0 cards (nothing to render yet).
- `_backgroundSync()`'s Phase 2, after the real fetch completes, does `if (!hadCache) selectType(selectedType || workoutTypes[0] || 'A');` — but `selectedType` is already `'A'` from Phase 1, so this evaluates to `selectType('A')` again.
- `selectType(type)`'s very first line is `if (selectedType === type) return;` — an exact match, so this second call is **always a no-op** on a cold-cache boot, defeating its own purpose of re-rendering with the now-available real data.

This is a genuine, severe, first-visit-breaking bug (not a performance/latency issue — the QA agent's own "90+s, twice" observation is consistent with this being a permanent dead end they eventually gave up waiting on, not a slow-but-resolving load). It very likely explains the project's own long-documented "~11-14 exercise-card timing race" Playwright test baseline too (same code path, same trigger condition: a test run with no pre-existing local cache).

**Action:** fix the dead end directly — force a real re-render in this one cold-boot path.

### A3 — Confirmed exactly as reported; root cause pinpointed
`renderEditList(domain, type)` (shared by Strength's and Cardio's template editors since the Phase A engine refactor) calls `initDragSort(el, type)` — passing the **type name string** where `initDragSort(container, startFn)` expects a callback. `const fn = startFn || startDrag;` — a non-empty string is truthy, so `fn` becomes the string itself; calling it throws `TypeError`. Measurements' own direct call (`initDragSort(el, startMeasureTypeDrag)`) passes a real function and is unaffected — confirms this is isolated to the two domains that went through the shared-engine refactor, exactly as the report states.

**Action:** replace the buggy string-passing call with a small domain-aware factory built on the **already-existing** generic `collectEdits(domain)` dispatcher (used elsewhere for exactly this "read the current DOM order back into the template array" operation) — this restores strength's exact original drag behavior (verified byte-for-byte identical to the old hardcoded `startDrag`'s logic) and gives cardio the same working behavior for the first time, through one shared, generic mechanism (matching the refactor's own stated "zero behavior change for strength" goal, which this bug currently violates).

### A5 — Doc wording is misleading, not simply wrong
`grep`-confirmed: the app's own code never calls `onSnapshot` anywhere — the doc's literal claim ("no onSnapshot call") is code-accurate. But the doc's *implication* — that this means no persistent Firestore connection exists — is wrong: the Firestore SDK itself opens a persistent `Listen/channel` WebChannel as part of its own internal offline-persistence implementation, independent of whether the app code ever calls `onSnapshot`. This is exactly why `page.goto(..., {waitUntil:'networkidle'})` never resolves on this app.

**Action:** clarify the doc to state both facts precisely, with the practical Playwright guidance the addendum itself flagged as valuable.

### A6/A7 — Confirmed exactly as reported (simple copy fixes)
- A6: `public/index.html`'s cardio "+ Add Field" button carries `data-i18n="edit.add_exercise"` (Strength's key) instead of a cardio-specific one — confirmed live, `t('edit.add_exercise')` resolves to "+ הוסף תרגיל"/"+ Add Exercise" regardless of which domain's button renders it.
- A7: `'settings.cardio_edit'` still reads `'לעריכת תוכנית אימוני אירובי'` — the identical leading-ל grammar issue the 2026-08-30 session already fixed for strength's equivalent key, just never applied to this newer, cardio-specific string.

### A8 — Confirmed; the fix is straightforward given only one call site exists
`grep`-confirmed exactly one `new Chart(` call site in the whole file, inside `renderRunCharts()` (History's cardio-stats charts) — Strength and Cardio's own daily-entry pages never reference `Chart` at all, yet `chart.umd.min.js` loads unconditionally via a plain `<script src>` in `<head>`, on every page. Both existing callers of `renderRunCharts()` already call it without awaiting (fire-and-forget), so converting it to lazy-load Chart.js on first actual use is a safe, drop-in change.

### Accessibility findings — verified against the live DOM/CSS, precise root cause for each contrast failure
Findings #6 (target pill unreachable), #8 (weight/sets/reps placeholder-only), #9 (cardio checkbox unlabeled) **already have the fixes shipped in the 2026-09-03 round** (`role="button" tabindex="0"` + keydown on `.ex-target-clickable`; real `for`/`id` on strength fields; `aria-label` on the cardio checkbox) — live re-verification against production confirms all three are already correct. These are very likely more instances of the SAME stale-browser-cache artifact as A1/A2 (the `qa-accessibility` axe pass ran in the same multi-hour window) — **not re-fixed** (nothing to fix), but explicitly re-confirmed rather than assumed, per this task's own instructions.

The 4 genuinely new contrast findings were traced to exact hex-pair computations (WCAG relative-luminance formula), not just accepted at face value:

| Finding | Element | Colors | Computed ratio | Root cause |
|---|---|---|---|---|
| #1 | `.history-preview-title` | `--sub` (dark-mode `#94a3b8`) on `.history-preview-header`'s hardcoded `#f8fafc` | **2.45** (matches report exactly) | `.history-preview-header` has no dark-mode background override — dark-mode's lighter `--sub` (designed for dark backgrounds) ends up on this leftover light background |
| #2 | `.copy-last-btn` | `--primary` (`#6d64a8`, same value in both themes) on dark-mode `--bg` (`#0f172a`) | **3.43** (matches report exactly) | `--primary` has no dark-mode-specific value; it was tuned for light backgrounds only |
| #3 | `.ex-target-text` (target pill) | `--primary` on `#ede9fe` (no dark-mode override, same in both themes) | **4.38** (matches report's 4.37) | Same `--primary`-not-dark-aware root cause, manifesting as "just under" here because the background is also light |
| #10 | `.run-form-label` (cardio field label) | `--sub` (light-mode `#64748b`) on `--bg` (`#f1f5f9`) | **4.34** (matches exactly) | `--sub`'s light-mode value passes against `--surface` (white, 4.76) but falls just short against the slightly-darker `--bg` |

**Action, scoped deliberately narrow:** rather than redefining `--primary` globally (which is also used as a *background* under white text elsewhere — e.g. active type-tab buttons — where making it lighter would hurt, not help, that contrast pair), fix each finding at its actual point of use: a per-component dark-mode override for `.copy-last-btn`'s text color, reusing the existing `--primary-d` token for the target pill (computed: `#574e8a` on `#ede9fe` = 6.18, comfortably passes, and needs no new color at all), a dark-mode background override for `.history-preview-header` (matching the exact pattern `.measure-header` already uses for the same problem class), and a small darkening of the `--sub` **token itself** for finding #10 (computed replacement `#5c6b82`: 4.94 against `--bg`, 5.41 against white — a safe, barely-perceptible global improvement, not a per-component patch, since `--sub` is used in dozens of places and this fixes/improves all of them consistently rather than leaving latent near-misses elsewhere).

Findings #4 (viewport `maximum-scale=1`) and #5 (no `<main>` landmark) and #7 (`.history-preview-header` keyboard-unreachable) are straightforward, confirmed live: the meta tag literally contains `maximum-scale=1`; `grep` confirms zero `<main>` elements exist; `.history-preview-header` is a plain `onclick` div with no `role`/`tabindex`, same defect class as `.ex-target-clickable` before its 2026-09-03 fix.

## 2. Impact map — must-touch

| Item | File:function |
|---|---|
| A4 fix (boot dead-end) | `index.html` — `_backgroundSync` |
| A3 fix (drag-and-drop) | `index.html` — `initDragSort`, `renderEditList`, new `startEditDrag` (replaces now-dead `startDrag`) |
| Cache-control gap (A1/A2 root cause) | `firebase.json` — `headers` array |
| A5 | `docs/product/10-offline-and-sync-architecture.md` |
| A6 | `index.html` (cardio add-field button's `data-i18n`), `translations.js` (new `edit.add_field` key) |
| A7 | `translations.js` (`settings.cardio_edit` value) |
| A8 | `index.html` — remove `<script src>` from `<head>`, add lazy-loader, `renderRunCharts` becomes `async` |
| A11y #4 | `index.html` — `<meta name="viewport">` |
| A11y #5 | `index.html` — `<div id="main-content">` → `<main id="main-content">` |
| A11y #7 | `index.html` — `.history-preview-header` markup + `toggleHistPreview` keydown wiring |
| A11y #1/#10 | `index.html` — CSS: `--sub` value, `.history-preview-header` dark-mode override |
| A11y #2/#3 | `index.html` — CSS: `.copy-last-btn` dark-mode override, `.ex-target-text` → `--primary-d` |

**Related-but-out-of-scope (explicit):**
- A1/A2 themselves — confirmed not reproducible, no code change needed beyond the cache-control fix above.
- Findings #6/#8/#9 — already fixed 2026-09-03, re-confirmed live, no new change.
- The addendum's own IndexedDB-lock-contention theory for A4 — not reproduced in this investigation (zero console errors in the repro that found the *actual* dead-end); if it's a real, separate, intermittent issue, it needs its own dedicated investigation, not bundled into this fix.
- "Confirmed working" list (Copy Last Workout, Clear Form, remove-exercise, duplicate-type detection, new-type creation, cardio's locked date field, field-type picker, XSS escaping in cardio labels) — no action, already correct.
- Deeper dark-mode color-token redesign beyond the 4 specific findings — a full audit of every `--primary`/`--sub` usage for theoretical dark-mode contrast issues is out of scope; only the 4 axe-confirmed failures are fixed.

## 3. Security / risk review
No new user-controlled data paths. The drag-and-drop fix only changes which function handles reordering, using data already flowing through the existing, escaped `collectItemFromRow`/`renderItemRow` per domain. The Chart.js lazy-load adds one dynamically-created `<script>` tag pointing at the exact same CDN URL already trusted today (no new origin). The cache-control header change is hosting configuration only, no code-path change.
