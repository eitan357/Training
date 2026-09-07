# Plan: UX Fixes + Cardio Target System + Shared Date-Field Subsystem

Spec: `docs/superpowers/specs/2026-09-08-b-ux-fixes-and-cardio-date-target-design.md`

Process for every task: implement → re-read diff against that task's done-condition → verify live against the local Firebase hosting emulator → only then move to the next task. Tasks 1-5 are independent and fast; Tasks 6-9 build the date subsystem in order (component → cardio → strength).

## Task 1: Single-press back-to-exit

**Files:** `public/index.html`, `public/translations.js`

- [ ] In `handleHardwareBack`, replace the `atRoot` branch's double-press logic with a direct `exitApp()` call. Remove the `_backPressedOnce` variable entirely.
- [ ] Grep for `app.press_back_exit` — if this was its only use, remove the key from both language blocks in `translations.js`.
- [ ] **Verify:** re-read diff — confirm the `history.back()` fallthrough (in-app navigation) is untouched. Live: cannot fully test hardware back on desktop emulator — confirm via code inspection that `atRoot` logic is correct, and defer final confirmation to the next APK build (note this explicitly, don't claim false certainty).

## Task 2: Fix drag-reversal bug (all 3 editors at once)

**Files:** `public/index.html`

- [ ] In `startGenericDrag`'s `move` handler, add a check at the top that clears `last = null` once the pointer's Y is no longer within `last`'s current `getBoundingClientRect()` bounds, before evaluating rows for a new swap.
- [ ] **Verify:** live-test in the strength editor — drag row 1 down past row 2, then without releasing, drag back up past row 2 again; assert final DOM order matches the original. Repeat once in the cardio editor and once in measurements to confirm the shared fix covers all three (per the investigation, they're byte-identical call sites).

## Task 3: Dark-mode red "clear form" button

**Files:** `public/index.html`

- [ ] Add `[data-theme="dark"] .clear-form-btn { color: var(--red); border-color: var(--red); }` immediately after the existing `[data-theme="dark"] .copy-last-btn` rule.
- [ ] **Verify:** compute/confirm via `getComputedStyle` in dark mode that both strength's and cardio's clear-form buttons resolve to `--red` (`#c07070`), not `#9686d1`. Screenshot both.

## Task 4: Cardio placeholder text

**Files:** `public/index.html`

- [ ] In `renderCardioFieldRow`: number branch → `placeholder="—"`. Text (else) branch → `placeholder="${escHtml(cardioFieldDisplayLabel(field))}"`.
- [ ] **Verify:** live-check a fresh cardio type's number fields show "—" and text-type fields (e.g. an ad-hoc or the "notes" field) show their own label as placeholder.

## Task 5: Per-session field removal on cardio daily-entry page

**Files:** `public/index.html`

- [ ] Restructure `renderCardioFieldRow`'s returned markup: wrap `labelHtml` and a new `✕` remove button in a small flex header div (new class, e.g. `.cardio-field-label-row`), keep `inputHtml` below it — mirroring strength's `.ex-name-row` pattern conceptually. Exclude the remove button when `field.fieldType === 'date'`.
- [ ] Add the matching CSS rule for `.cardio-field-label-row` (flex, space-between, align-items center — same shape as `.ex-name-row`).
- [ ] **Verify:** live-check removing a non-date field row removes it from the DOM only (confirm the template/`cardioEditTemplates` is untouched, and that `submitCardioData` still saves correctly with that field simply absent from the collected list). Confirm the date field has no remove button.

## Task 6: Build the shared calendar date-picker component

**Files:** `public/index.html`

- [ ] New functions: `_openDatePicker(anchorEl, currentValueDDMMYYYY, onSelect)` (renders a popover calendar positioned near `anchorEl`, month-grid, prev/next nav, today highlighted, closes on day-tap calling `onSelect(ddmmyyyy)` or on outside-click/Escape with no selection) and its supporting render/nav helpers. New CSS for the popover (reusing `--surface`/`--border`/`--radius`/`--shadow` tokens already used by cards/modals elsewhere).
- [ ] Add a generic date-display input pattern: a read-only-looking `.cardio-field-input`-styled button/input that shows the current DD/MM/YYYY value and opens the picker on tap (replacing the raw manually-typed text input for any field using this component).
- [ ] **Verify:** build a throwaway test harness (temporary button in a scratch page, or drive directly via the browser console) to open the picker, navigate months, select a day, and confirm `onSelect` fires with the right DD/MM/YYYY string. No permanent app wiring yet — this task only proves the component works in isolation.

## Task 7: Cardio date field — hidden-by-default toggle + picker wiring + save fallback

**Files:** `public/index.html`

- [ ] `CARDIO_MIGRATION_FIELD_MAP`'s date entry: add `hidden: true`.
- [ ] Editor `renderItemRow` (cardio, date branch): replace the three disabled ftype buttons with a single toggle (reusing the now-correctly-sized `.toggle-switch`) bound to `!field.hidden`.
- [ ] `collectItemFromRow` (cardio): for the date row, read `hidden` from the toggle's checked state instead of the old `disabled`-sniffing hack; `fieldType` stays hardcoded `'date'` for this row unconditionally.
- [ ] `renderCardioFieldList`/`renderCardioFieldRow`: skip rendering the date field's row entirely when `field.hidden` is true. When shown, use Task 6's date-picker component instead of the raw text input; remove the now-obsolete digit-slash auto-format listener's relevance for this case (keep the listener itself only if still reachable some other way — otherwise remove it, don't leave dead code).
- [ ] `submitCardioData`: when no `fieldType === 'date'` row exists in the DOM (hidden), fall back to today's date instead of erroring. When a date row exists but its value is empty, ALSO fall back to today (per Eitan's "if cleared, save as today" ask) rather than the current hard validation error — keep the invalid-but-non-empty case (e.g. malformed text) as a real error.
- [ ] `WORKOUT_DOMAINS.cardio.buildAutoSaveEntry`: when no date field is present in `draft.fields` (hidden case), derive the date from `draft.createdAt` (mirroring strength's existing approach) instead of returning `null`. Keep returning `null` when a date field IS present but fails validation (a real, meaningful validation failure, not an absence).
- [ ] **Verify:** (a) a brand-new cardio type has its date field hidden by default — confirm the daily-entry page shows no date row and saving still works, dated today. (b) Toggling it on in the editor makes the date-picker appear on the daily page, defaulting to today. (c) Clearing the picker's value and saving anyway still saves as today. (d) A stale previous-day draft with the date field hidden still auto-saves correctly dated to its `createdAt` day (re-run this round's data-safety-lesson protocol: log full draft contents before any destructive test action, confirm cleanup afterward).

## Task 8: Extend the date-field system to strength

**Files:** `public/index.html`

- [ ] Add the same `hidden`-gated date-field concept to `WORKOUT_DOMAINS.strength`: a new template-level (not per-exercise) date row, default hidden, using Task 6's picker when shown. Given strength's `newItem`/`renderItemRow` are exercise-centric (not field-centric like cardio), this needs its own small, parallel render/collect path rather than literally reusing cardio's `renderItemRow` — but reuses the exact same picker component and toggle pattern.
- [ ] `submitData` (strength): when the date field is hidden or empty, keep today's existing `new Date()` behavior (this is already what happens today — the change is purely additive: when SHOWN and filled, use that date instead).
- [ ] `WORKOUT_DOMAINS.strength.buildAutoSaveEntry`: when a shown date field's value is present in the draft, prefer it over the current `draft.createdAt`-derived date; otherwise keep the existing `createdAt` fallback unchanged.
- [ ] **Verify:** confirm strength's default (hidden) behavior is byte-for-byte unchanged from today (regression check — this must not alter any existing strength save behavior when the feature is off). Then enable the toggle, pick a past date, save, and confirm the entry is dated correctly in History.

## Task 9: Cardio target system

**Files:** `public/index.html`

- [ ] Add `target: ''` to cardio's `newItem()`. Editor `renderItemRow`: add one target input, shown only for `fieldType === 'text'` or `'number'` (hidden for `checkbox` and `date`).
- [ ] `collectItemFromRow` (cardio): read the target input's value into `target`.
- [ ] Cardio's `buildSaveDoc`: persist `target` per field (matching however strength persists `targetWeight` etc. — verify cardio's actual `buildSaveDoc` body first, since it wasn't fully quoted in the investigation).
- [ ] `renderCardioFieldRow` (daily entry): when `field.target` is truthy, render a clickable pill (new function `copyCardioFieldTarget(rowEl)`, mirroring `copyTargetToCard`'s overwrite-confirm UX) next to the label.
- [ ] **Verify:** set a target on a number field and a text field via the editor, confirm both persist and reload correctly; confirm the checkbox field never shows a target input at all; confirm tapping the pill fills the field (with overwrite-confirm if already filled) on the daily-entry page.

## Task 10: Full-suite regression check + docs

- [ ] Run the full local-emulator Playwright suite.
- [ ] Update `docs/product/02-workout-strength.md` and `docs/product/07-running-cardio.md` to document: the removed double-back-exit behavior, the fixed drag reversal, the new cardio target system, and the new shared date-field subsystem (hidden-by-default, picker-on-tap, fallback-to-today) for both domains.

## Commit plan

One commit per task (1-9), plus a final docs+test commit for Task 10.
