# Strength & Cardio QA Bug Fixes — Design Spec

**Date:** 2026-09-03
**Applies to:** `public/index.html`, `public/translations.js`
**Driven by:** `qa-report-strength-cardio-2026-09-03.md` — a live-Playwright QA pass against production covering the Strength (`#sec-main`) and Cardio (`#sec-running`) pages only. This spec covers every finding in that report classified 🔴/🟠/♿ (7 functional bugs + 3 accessibility gaps). 🟡 Low/Informational items, the "✅ confirmed working" list, and the 4 QA-tooling-process findings are explicitly out of scope (see §7).

## 1. Impact map

| Finding | Root cause (file:line, current code) | Must-touch |
|---|---|---|
| H1 — cardio editor empty on deep-link | `_setCardioEditPanel` (`index.html:3811`) calls `renderCardioEditAll()` synchronously; `runningTypes`/`cardioEditTemplates` are populated by `loadRunData()` (`:1527`), an async Firestore fetch kicked off by `initRunSection()` (`:1629`, not awaited by `showSection`/`_renderRoute`). Precedent fix already exists: `switchHistoryDomain` (`:1463`) awaits `_runDataPromise` before rendering cardio-dependent UI. | `_setCardioEditPanel` (`:3811`) |
| H2 — cardio field labels never translate | `CARDIO_MIGRATION_FIELD_MAP` (`:2861`) seeds literal Hebrew `label` strings into per-user Firestore data (both the one-time migration at `:2908` and fresh-type seeding via `confirmAddCardioType` at `:3879`). `renderCardioFieldRow` (`:1728`) displays `field.label` verbatim — never through `t()`. Labels ARE user-editable in the template editor (`WORKOUT_DOMAINS.cardio.renderItemRow`, `:2622`, a real `<input>`), so a fix must only substitute a translation for fields whose stored label still equals the untouched default — never overwrite a user's rename. | `renderCardioFieldRow` (`:1728`), `translations.js` (new keys) |
| H3 — ad-hoc strength exercise has no name field | `makeExCard` (`:3203`) always renders `.ex-name-text` as a static `<div>`; `addCustomExercise()` (`:3244`) calls it with an empty `name` and there is no path to ever set one. 4 read sites assume `.innerText`: `:2475`, `:2498`, `:3258`, `:4357`. | `makeExCard` (`:3203`), `addCustomExercise` (`:3244`), all 4 `.ex-name-text` read sites |
| M1 — target-pill tap never fills Sets | Two independent target formats share `copyTargetToCard` (`:4304`): the modern structured-field pill (`data-tw`/`data-ts`/`data-tr`) already fills Sets correctly (`:4317`, `if (ts) sInput.value = ts;`) — **not buggy**. The QA repro string ("4x6-8 14 kg") is the **legacy free-text format**, parsed by `parseTargetString` (`:2139`), which returns `{ weight, reps }` with no `sets` key at all (`:2209`) — `copyTargetToCard`'s legacy branch (`:4321-4337`) never touches `.ex-sets`. | `parseTargetString` (`:2139`), `copyTargetToCard`'s legacy branch (`:4321`) |
| M2 — no validation on Strength weight/sets/reps | `submitData()` (`:3249`, confirmed via read) pushes `w`/`s`/`r` straight from `.value` with no numeric/sign checks — by design these are free text (supports `"14+14"` bilateral, `"6,6,6,6"` per-set reps), so a blanket numeric-only rule would break documented formats. | `submitData()` (`:3249`) |
| M3 — cardio ad-hoc field label not renamable | Same defect class as H3: `addCustomCardioField()` (`:1821`) calls `renderCardioFieldRow` with a pre-baked literal `label: t('cardio.new_field_default_label')`, and `renderCardioFieldRow` (`:1728`) always renders the label as a static `<label>`, never an input, in every context (real template fields AND ad-hoc ones share the exact same render path). `submitCardioData()` (`:1828`) reads the final label from `row.dataset.label` (`:1836`), not any input — so a fix must keep that in sync. | `renderCardioFieldRow` (`:1728`), `addCustomCardioField` (`:1821`) |
| M4 — no validation on Cardio numeric fields | `renderCardioFieldRow`'s number branch (`:1734`) has no `min` attribute, and — more importantly — `submitCardioData()` (`:1828`) never calls any constraint-validation API before reading `.value` straight off the DOM, so an HTML `min` attribute alone would not actually block a bad save (no `<form>`/submit-triggered validation exists here). | `renderCardioFieldRow` (`:1734`), `submitCardioData()` (`:1828`) |
| A11y-1 — target pill keyboard-unreachable | `.ex-target-clickable` (`makeExCard`, `:3220`, `:3227`) is a plain `<div onclick>` — no `role`, no `tabindex`, no keydown handler. | `makeExCard` (`:3203`) |
| A11y-2 — cardio field labels/checkbox not programmatically linked | `renderCardioFieldRow` (`:1728`): `<label>` has no `for`, inputs have no `id`; the checkbox's own wrapping `<label class="toggle-switch">` (`:1736`) has no text content at all. | `renderCardioFieldRow` (`:1728`) |
| A11y-3 — strength weight/sets/reps rely on placeholder only | `makeExCard`'s `.field-group` (`:3232-3236`): `<label data-i18n="col.weight">` has no `for`, `.ex-weight`/`.ex-sets`/`.ex-reps` have no `id`. (A visible `<label>` text already exists — the gap is purely the missing programmatic `for`/`id` pairing, not a literal placeholder-only state.) | `makeExCard` (`:3203`) |

**Related-but-out-of-scope** (considered, deliberately not touched):
- L1 (cold-start load time), L2 (multi-tab Firestore persistence warning) — environmental/architectural, not this-page bugs; no action requested.
- L3 (History "Weekly Streak" shows 0) — already flagged in project memory as a known, deliberately-deferred bug in `filterRunByRange`/`calcRunStreak`, and is on the History page, outside this report's Strength/Cardio scope.
- The 4 "Problems with the QA plugin/testing process" findings — about `qa-state.json`/the plugin itself, not app code.
- Everything in "✅ Confirmed Working Correctly" — no change needed.
- `WORKOUT_DOMAINS.cardio.renderItemRow`'s label `<input>` (`:2625`, the TEMPLATE EDITOR's own editable label field) — deliberately left untouched by the H2 fix: substituting a translated string into that input's live `value` would let an innocent open-then-save silently overwrite the stored Hebrew default with whatever the *current UI language* happens to be, which is a data-corruption risk, not a fix. Confirmed via grep that `renderCardioFieldRow` and this input are two independent render paths — no shared code needs touching for H2.
- `cardio.new_field_default_label` translation key (`translations.js:292,579`) — currently unused in `index.html` after the M3 fix (it's replaced by an empty input + the existing `edit.field_label_ph` placeholder, matching H3's pattern). Left in place, not deleted — removing unused translation keys is a separate, unrequested cleanup.

## 2. Fix designs

### H1 — await the data promise before rendering
`_setCardioEditPanel` becomes `async`; when opening, it ensures `_runDataPromise` is kicked off and awaits it (identical pattern to `switchHistoryDomain`) before calling `renderCardioEditAll()`, with a re-check that the panel wasn't closed again during the wait (defensive, avoids a stale render). `_renderRoute` already calls it without `await` — that's fine, since the async function's body still runs to completion and updates the DOM once data resolves, exactly the "self-correct once data arrives" behavior H1 needs.

### H2 — translate default labels, never renamed ones
New `CARDIO_FIELD_LABEL_KEYS` map (`id → translation key`) for the 8 known default field ids. A new `cardioFieldDisplayLabel(field)` helper: if `field.id` isn't in the map (a custom/ad-hoc field) → return `field.label` verbatim. Otherwise, compare `field.label` against `CARDIO_MIGRATION_FIELD_MAP`'s original Hebrew text for that same `id` — if they still match (untouched default), return `t(key)`; if they differ (user renamed it), return `field.label` verbatim (respect the rename, never silently override user data). `renderCardioFieldRow`'s `<label>` calls this helper instead of using `field.label` directly. New `he`/`en` translation keys for all 8 fields.

### H3 / M3 — editable name/label only for ad-hoc entries
Both `makeExCard` and `renderCardioFieldRow` gain a boolean parameter (`isAdhoc` for the strength card — detected from `!name`, no signature change needed since every ad-hoc call site already passes an empty name; an explicit new 3rd param `isAdhoc` for the cardio row, since its 1st param is an object and callers must opt in explicitly). When true: render an empty, focused, editable `<input>` with a "field/exercise name" placeholder (reusing `t('edit.ex_name_ph')`/`t('edit.field_label_ph')`, both of which already exist for this exact purpose in the template editor) instead of the static text. All 4 strength `.ex-name-text` reader sites switch to reading `.value ?? .innerText` (a `<div>` has no `.value`, so this resolves correctly either way) via a small shared helper. Cardio's ad-hoc input gets an `oninput` that keeps `row.dataset.label` in sync, since `submitCardioData()` reads the label from that dataset attribute, not the input directly.

Both save paths (`submitData()`, `submitCardioData()`) reject the whole save with a clear toast if an ad-hoc entry has other data filled in but its name/label is still empty — this is the same defect resurfacing at save time if the fix only added an input without also guarding against leaving it blank, so it's part of the same fix, not a separate feature.

### M1 — legacy target parsing gains a sets count
`parseTargetString` computes `sets: repsArr ? String(repsArr.length) : null` alongside its existing `weight`/`reps` — every branch of the function already builds `repsArr` with exactly one entry per set (that's what "expanding" a rep range across N sets means), so the array's own length is already the sets count in every code path; no new parsing logic, just returning a value that was implicitly available all along. `copyTargetToCard`'s legacy branch fills `.ex-sets` from `parsed.sets` the same way the modern branch already fills it from `ts`, and its `hasData`/overwrite-confirm check is extended to also look at the sets field (matching the modern branch's existing check of all three fields).

### M2 — reject clearly-invalid Strength values, keep documented flexible formats
Two small helpers: `_hasNoDigits(str)` (weight has zero digits anywhere → garbage like `"abc"`) and `_hasNegativeToken(str)` (splitting on `,`/`+` and checking any individual numeric token is negative → catches `"-3"` alone and a negative entry inside a comma list, without rejecting legitimate positive multi-value formats like `"14+14"` or `"6,6,6,6"`). Applied in `submitData()`: weight invalid if either check trips; sets/reps invalid if the negative-token check trips. On any invalid field, abort the save with a toast identifying it — mirrors the existing `workout.fill_first` empty-save guard already in the same function.

*Scope note:* this intentionally does **not** cap absurdly large values (QA's `reps="99999999"` example) — there's no natural, non-arbitrary threshold, and the report itself flags it as informational rather than clearly wrong. Only the two clearly-wrong patterns QA actually reproduced (non-numeric, negative) are blocked.

### M4 — reject negative Cardio numeric values
`min="0"` added to `renderCardioFieldRow`'s number-input branch (UX hint — hides the native spinner's decrement-below-zero and nudges mobile numeric keypads). The actual enforcement is in `submitCardioData()`: for every field with `fieldType === 'number'` and a non-empty value, reject the whole save with a toast if `Number(value) < 0` — needed because there is no `<form>`/submit-triggered constraint validation anywhere in this flow, so the `min` attribute alone is decorative, not enforcing.

### A11y-1 — keyboard-reachable target pill
`.ex-target-clickable` gains `role="button" tabindex="0"` and an `onkeydown` handler that triggers the same `copyTargetToCard` call on Enter/Space (`event.key === 'Enter' || event.key === ' '`, with `event.preventDefault()` on Space to stop page scroll) — the standard accessible-clickable-div pattern, applied to both the modern-pill and legacy-pill variants in `makeExCard`.

### A11y-2 — cardio field label/checkbox association
`renderCardioFieldRow` generates a per-field DOM id (`cardio-field-${field.id}`, safe since `field.id` is already unique per type/entry — either a stable default id like `distanceKm` or a generated `adhoc_...` id) and adds `id="..."` to the input and `for="..."` to the `<label>`. For the checkbox specifically (whose real input is nested inside its own unlabeled `toggle-switch` wrapper), additionally add `aria-label="${escHtml(cardioFieldDisplayLabel(field))}"` directly on the `<input type="checkbox">` — the most robust fix for that control shape, not relying on label-association algorithm nuances across screen readers.

### A11y-3 — strength weight/sets/reps label association
`makeExCard`'s `.field-group` gains per-card-unique ids (reusing the card's own `id` counter variable already in scope: `ex-weight-${id}`, `ex-sets-${id}`, `ex-reps-${id}`, `ex-notes-${id}`) with matching `for` attributes on each `<label>`.

## 3. Test-compatibility check

Grepped `tests/accessibility.spec.ts` and `tests/negative.spec.ts` for the touched selectors (`.ex-weight`, `.ex-target-clickable`, target-pill/negative-value test names) — one existing test (`accessibility.spec.ts:94`, "exercise card inputs have some form of labeling") checks for *any* of label/aria-label/title/placeholder, which the A11y-3 fix satisfies a strict superset of (adds real `for`/`id` pairing on top of the pre-existing visible `<label>`) — confirmed compatible, not a conflict.

## 4. Files touched

`public/index.html` (all fixes above), `public/translations.js` (H2's 8 new key pairs, M2/M4's error-message keys), `tests/negative.spec.ts` + `tests/accessibility.spec.ts` (new coverage), `docs/product/02-workout-strength.md` + `docs/product/07-running-cardio.md` (doc sync for the ad-hoc-name and target-pill-sets behavior changes).

## 5. Security / risk review

No new user-controlled strings reach `innerHTML` unescaped — all new dynamic text (`field.label`, exercise names) already flows through `escHtml()` at every render site touched, matching the existing convention. The H2 translation-substitution reads only static, hardcoded translation keys and compares against static, hardcoded default strings — no new injection surface. No auth/Firestore rule changes.
