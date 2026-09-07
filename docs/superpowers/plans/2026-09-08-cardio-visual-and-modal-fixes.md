# Plan: Cardio Visual Fixes + Draft-Modal DOM Restructuring

Spec: `docs/superpowers/specs/2026-09-08-cardio-visual-and-modal-fixes-design.md`

Process for every task: implement → re-read diff against that task's done-condition → verify live against the local Firebase hosting emulator → only then move to the next task.

## Task 1: Cardio input field contrast (light mode)

**Files:** `public/index.html`

- [ ] Change `.cardio-field-input`'s `background: var(--bg);` to `background: var(--surface);`.
- [ ] **Step: Verify done-condition.** Compute the actual light-mode contrast ratio of the field's border/text against its new background, and screenshot both light and dark themes on the cardio daily-entry page to confirm dark mode is unaffected (dark `--bg`/`--surface` already differ enough to be visible, per the original report only flagging light mode).

## Task 2: Cardio clear/copy button order

**Files:** `public/index.html`

- [ ] Add a new shared CSS class `.top-action-row { justify-content: space-between; flex-wrap: wrap; }`.
- [ ] Add `class="top-action-row"` to cardio's button-row div ([index.html:1130](../../public/index.html#L1130)), keeping its existing inline `display:flex;gap:8px;margin:10px 0;`.
- [ ] **Step: Verify done-condition.** Re-read diff: confirm `#topActionRow` (strength) is untouched. Live-check cardio's row: "clear form" must be visually on the far side from "copy last workout" (left in RTL, right in LTR), matching strength's existing layout.

## Task 3: Toggle-switch invisible (0×0) — both locations

**Files:** `public/index.html`

- [ ] Add `display: inline-block;` to `.toggle-switch`'s CSS rule ([index.html:308](../../public/index.html#L308)).
- [ ] **Step: Verify done-condition.** Re-read diff: confirm this is the only change to that rule (no other properties touched). Live-check with `boundingBox()` (not just visual inspection) that the toggle now measures 48×28px in BOTH: (a) the cardio daily-entry form's "felt tired" field, and (b) History → edit a past cardio session's checkbox field. Also re-check the two Settings-page toggles (running-enabled, timer-sound) still render and function identically (no regression from the flex-context becoming redundant-but-harmless).

## Task 4: Move `#draftModal` out of `#sec-main`

**Files:** `public/index.html`

- [ ] Move the `#draftModal` markup block ([index.html:925-932](../../public/index.html#L925-L932)) from inside `#sec-main` to be a direct child of `<main id="main-content">`, placed as a sibling immediately before or after the `.section` divs (position doesn't matter functionally, given `position:fixed`).
- [ ] **Step: Verify done-condition.** Re-read diff: confirm `#sec-main`'s own structure is otherwise unchanged (topbar, draft-modal removed, rest intact), and confirm exactly one `#draftModal` element still exists in the document (no duplication).
- [ ] **Step: Live verification (reproduces the exact failure mode from the spec, not just a generic check).**
  1. On `/running`, craft a real qualifying draft, force a fresh-session check, and assert `page.locator('#draftModal').isVisible()` is `true` **immediately**, while still on `/running` — this is the core regression check (the 2026-09-07 fix could only ever get this to `false` due to the DOM-nesting bug; this is the first time it should read `true` here).
  2. Confirm resume/discard both still work correctly from this now-properly-visible state.
  3. Re-run the 2026-09-07 round's original guard test (open a draft check while on Strength — must NOT show) to confirm the guard and the DOM move work together correctly, not just each in isolation.
  4. Confirm the modal is *not* visible on Strength immediately after this — i.e., that moving the DOM position didn't accidentally make it globally-always-rendered regardless of `_draftModalType` state.

## Task 5: Full-suite regression check + docs

**Files:** test suite (no spec changes expected), `docs/product/07-running-cardio.md`

- [ ] Run the full local-emulator Playwright suite (not just targeted tests) — per the 2026-09-07 round's own lesson, this is where an unrelated regression was last found.
- [ ] Add a short note to `07-running-cardio.md`'s draft-modal cross-reference (added 2026-09-07) clarifying the modal is now a section-independent global overlay, not nested in any specific section — so the guard function is what actually determines correctness, not DOM position.

## Commit plan

One commit per task:
1. `fix(cardio): give input fields visible contrast in light mode`
2. `fix(cardio): push clear-form to the opposite side from copy-last`
3. `fix(a11y): toggle-switch collapses to 0x0 outside a flex container`
4. `fix(draft): move the shared draft modal out of the Strength section so it's actually visible where it opens`
5. `test: full-suite regression pass`
