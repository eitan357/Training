# Feature Summary: Bulk-Delete Confirmation

**Spec:** `docs/superpowers/specs/2026-09-14-bulk-delete-confirmation-design.md`
**Plan:** `docs/superpowers/plans/2026-09-14-bulk-delete-confirmation.md`

## What changed

Bulk-deleting **2 or more** selected records — in History (strength or cardio)
or Measurements — now shows a confirmation modal (`#bulkConfirmModal`) before
anything is deleted. Canceling leaves every selected record and the
selection itself untouched. Bulk-deleting exactly **1** selected record
(via the same "מחק נבחרים" button) is unchanged: still immediate, no dialog.

## Where

- `public/index.html`: `_bulkDelete()` is now a router (size 1 → straight to
  new `_performBulkDelete()`; size 2+ → shows `#bulkConfirmModal`, which
  resolves via `_bulkConfirmYes()`/`_bulkConfirmNo()`). One new global modal,
  styled like `#draftModal`. `handleHardwareBack()` treats the new modal as
  Cancel (opposite of `#draftModal`'s block-everything policy).
- `public/translations.js`: 3 new keys (`bulk.confirm_title`,
  `bulk.confirm_msg_suffix`, `bulk.confirm_btn`) in `he`/`en`.
- `tests/history.spec.ts`, `tests/measurements.spec.ts`: new tests covering
  show/cancel/confirm for 2+ and the immediate path for exactly 1.
- Docs updated: `docs/product/04-history.md`, `docs/product/06-measurements.md`,
  `docs/product/00-overview.md`, `docs/product/11-android-app.md`.

## Regression found and fixed during verification

Task 2's `#bulkConfirmMsg` div originally reused the `.draft-modal-details`
CSS class from the pre-existing `#draftModal`. That collision broke
`tests/running.spec.ts:250`'s locator (Playwright strict-mode violation — 2
elements matched instead of 1). Fixed in commit `f927bf4`: `#bulkConfirmMsg`
now uses its own `.bulk-confirm-msg` class, isolated from `#draftModal`'s
styling. Verified fixed under a full clean run in Task 5 Step 1 (0 failures
matching that symptom).

## Known limitation

The Android hardware-back-button guard (Task 4) is verified by code review
only — Capacitor's native back-button listener cannot be exercised by this
repo's Playwright/Chromium test suite. If you have a device/emulator handy,
a manual spot-check is described in the plan's Task 4, Step 2.

## Test evidence

- **Step 1** (`workout.spec.ts` + `running.spec.ts`, chromium): 54 passed, 2
  flaky (passed on retry), 1 skipped, 0 failed (5.7m). Both teardown-dependent
  tests whose `finally` blocks exercise the immediate size===1 delete path
  (`workout.spec.ts:662`, `running.spec.ts:630`) passed.
- **Step 2** (`history.spec.ts` + `measurements.spec.ts` + `i18n.spec.ts`,
  chromium): 34 passed, 1 failed, 4 flaky, 2 skipped (6.3m). The 1 failure
  (`history.spec.ts:330`) reproduced clean on two immediate re-runs (isolated
  and full-file), consistent with the same login/auth flakiness confirmed
  directly in Step 3.
- **Step 3** (full suite, `--project=chromium`, per the controller's ruling
  to skip `mobile-android` given the test account's tight sign-in quota):
  **178 passed, 4 failed, 9 flaky, 3 skipped (21.2m)**.

  The 4 failures were individually root-caused via each test's saved
  `error-context.md`, none implicating this feature:
  - `measurements.spec.ts:85` and `timer.spec.ts:28` — both show
    `"שגיאה: auth/quota-exceeded"` rendered live on the auth screen: genuine
    Firebase Auth quota exhaustion on the shared test account (an
    environmental condition explicitly flagged as a risk going into this
    task), not a product regression.
  - `settings.spec.ts:22` and `ui.spec.ts:69` — both fail on a missing
    `#darkModeToggle` checkbox; the app's settings page now renders a
    3-button light/dark/auto theme selector instead. Confirmed pre-existing
    and unrelated to this branch two ways: `git diff 01cfb4b^..f927bf4 --
    public/index.html` shows none of Tasks 1-4's commits touched theme code,
    and `git log -S "darkModeToggle" -- public/index.html` shows the
    checkbox was removed in an ancestral commit predating this branch's
    divergence from main.

  Every test exercising the bulk-delete-confirmation feature itself (the
  History and Measurements bulk-delete show/cancel/confirm/immediate-path
  tests) passed at least once across these runs, including clean isolated
  re-runs — no failure or flake in this regression pass points to a defect
  in the feature.
