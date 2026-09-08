# Plan: Date-Toggle Layout, Live Type-Switch Target, History Detail Filtering

Follow-up to `2026-09-08-b-ux-fixes-and-cardio-date-target.md` — 3 small corrections found after that round shipped.

## Task 1: Date label input + visibility toggle on one row (cardio + strength)

**Files:** `public/index.html`, `public/translations.js`

- [x] Cardio's `WORKOUT_DOMAINS.cardio.renderItemRow` date branch: keep the disabled `.cardio-field-label-input` (still shows "תאריך"), move it into a new `.cardio-date-visibility-row` flex container alongside the toggle (previously on a separate line below it). The `edit.date_show_label` caption stays as its own line below the row.
- [x] Strength's `#mainEditPanel` global toggle: same restructuring — a new static, disabled `#strengthDateLabelInput` (value "תאריך") added alongside the existing toggle in the same `.cardio-date-visibility-row`. Since `data-i18n` only sets `.textContent` (a no-op on an `<input>`'s `.value`), added a small targeted fix in `applyLang()` to set this one input's value directly from `tr['workout.date_label']`.
- [x] Wording change: `edit.date_show_label` from "הצג בטופס היומי" to "הצג תאריך בטופס" (HE) / "Show on daily entry page" to "Show date on entry page" (EN).
- [x] **Verify:** live-checked both editors — label input and toggle are on the same row (Y-coordinates match) in both, caption text reads correctly, input value is still "תאריך"/"Date" and reactively updates on language switch.

## Task 2: `setCardioFieldType` must re-render the row, not just toggle `.active` classes

**Files:** `public/index.html`

- [x] Root cause: `setCardioFieldType` only toggled `.ftype-btn.active` classes — the target input's presence (added in the prior round, gated on `fieldType !== 'checkbox'`) is decided once at initial render and never re-evaluated on a later type change.
- [x] Fix: `setCardioFieldType` now reads the row's current label/target values, then replaces the card's `innerHTML` via a fresh call to `WORKOUT_DOMAINS.cardio.renderItemRow`, preserving `card.dataset.id` (set by the outer `renderEditList`, untouched by an inner `innerHTML` replacement).
- [x] **Verify:** switched a checkbox field to text — target input appeared; switched back to checkbox — target input disappeared. Confirmed inline `onclick` handlers on the freshly-rendered row still fire correctly (no listener loss from the `innerHTML` replacement, since none of this markup uses `addEventListener`).

## Task 3: Cardio History detail table — exclude date, exclude unchecked checkboxes

**Files:** `public/index.html`

- [x] `WORKOUT_DOMAINS.cardio.renderCardBody`: filter `s.fields` to drop `fieldType === 'date'` (redundant — already shown in the row's own header via `sessionDisplayDate`) and drop `fieldType === 'checkbox' && !f.value` (an unchecked box carries no information worth listing). A *checked* checkbox still renders normally (`✓`).
- [x] **Verify:** live-created one entry with felt-tired checked (detail table shows "הרגשתי עייפות ✓", no "תאריך" row) and one with it unchecked (detail table omits it entirely). Both test entries logged and cleaned up.

## Regression fix found during verification

The background Playwright regression pass (`running.spec.ts` + `workout.spec.ts` + `history.spec.ts`) surfaced one real breakage from Task 1's layout change: `tests/running.spec.ts`'s "drag handle reorders fields in the cardio edit panel" test computed its drag-distance offset from the FIRST `.edit-card`'s height, assuming that was always the dragged row. Task 1 shortened the date card (input + toggle combined onto one row), so that assumption broke — the offset now undershot and the test started failing outright (not flaking).

Fixed in two steps:
1. Measure the boundingBox of the row actually being dragged (via `ancestor::` xpath from the handle), not `.edit-card.first()`.
2. That alone was still unreliable in Hebrew/RTL layout: manually computing the handle's click point from `boundingBox()` landed the click on the parent `.edit-card` instead of the small `.drag-handle` span (~9px discrepancy between Playwright's reported box and the actual hit-testable point in RTL). Switched to `handles.first().hover()` for the initial mouse position, which uses Playwright's own hit-target verification — 5/5 clean runs after this fix, versus consistent failure before it.

## Commit plan

One commit for all three (small, tightly related fixes to the same round's own code), plus the test fix above (found and fixed in the same verification pass).
