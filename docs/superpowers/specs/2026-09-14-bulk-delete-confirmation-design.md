# Spec: Bulk-Delete Confirmation (History + Measurements)

**Reported:** 2026-09-14, feature request from Eitan: bulk-deleting more than one record from the History page should ask for confirmation first; deleting a single record (via the same bulk-select flow) should stay immediate, as it is today.

## Problem

Both History (`04-history.md` §"בחירה מרובה ומחיקה קבוצתית") and Measurements (`06-measurements.md` §"מחיקת מדידה בודדת ובחירה מרובה") already document this as a known inconsistency: single-record delete uses the app's "Arm & Confirm" double-tap pattern, but bulk delete via the floating action bar deletes immediately with **zero** confirmation, regardless of how many records are selected.

Both domains route through the exact same shared function, `_bulkDelete(set, barId, collection)` ([index.html:5927-5941](../../public/index.html#L5927-L5941)):

```js
async function _bulkDelete(set, barId, collection) {
  if (!set.size) return;
  const ids = [...set];
  document.getElementById(barId).style.display = 'none';
  try {
    await Promise.all(ids.map(id => deleteDoc(doc(db, 'users', currentUser.uid, collection, id))));
    set.clear();
    toast(ids.length + ' ' + t('bulk.deleted'), 'error');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + firestoreErrMsg(err), 'error');
  }
}
async function bulkDeleteSessions() { await _bulkDelete(selectedSessions, 'histBulkBar', WORKOUT_DOMAINS[historyActiveDomain].entriesCollection); }
async function bulkDeleteMeasures() { await _bulkDelete(selectedMeasures,  'measBulkBar', 'measurements'); }
```

`bulkDeleteSessions` covers **both** strength and cardio history (domain-agnostic via `WORKOUT_DOMAINS[historyActiveDomain]`), and `bulkDeleteMeasures` covers Measurements. Because the deletion logic is already centralized in one function, a fix there fixes all three surfaces (strength history, cardio history, measurements) at once — no per-domain branching needed.

## Design decisions

**Threshold:** confirm only when `set.size > 1`. `set.size === 1` stays exactly as it is today (immediate delete, no dialog) — matches the explicit spec from the user and requires no behavior change to the single-item path.

**UI:** a new global modal, `#bulkConfirmModal`, reusing `#draftModal`'s existing visual language (`.draft-modal-overlay` / `.draft-modal-card` / `.draft-modal-title` / `.draft-modal-details`) rather than inventing new modal chrome. Two buttons: a new `.bulk-confirm-btn-delete` class (red, mirrors `--red` / `.bulk-bar-del`'s existing danger-button color) for the destructive action, and the existing `.draft-modal-btn-discard` text-button style, reused as-is, for Cancel.

**Placement:** `#bulkConfirmModal` sits as a DOM sibling of `#draftModal`, directly under `<main id="main-content">`, **not** nested inside any `.section`. This is the same reason `#draftModal` itself was moved there in the 2026-09-08 fix (`2026-09-08-cardio-visual-and-modal-fixes-design.md`, Issue 4): a `.section:not(.active) { display:none }` hides its entire subtree, so a modal triggered from History must not be a descendant of a section that might not be the active one.

**Dismissal:** unlike `#draftModal` (which deliberately blocks every dismiss path — backdrop click, hardware back — to force an explicit resume/discard choice on a data-loss-sensitive draft), this modal treats backdrop-click and the Android hardware back button as equivalent to pressing Cancel. Canceling a delete is always the safe, non-destructive outcome here, so there's no reason to force the user through the two explicit buttons. `handleHardwareBack()` ([index.html:5984](../../public/index.html#L5984)) gets a new guard, checked *before* its existing `#draftModal` guard.

**Shared logic:** `_bulkDelete` becomes a router:

```js
async function _bulkDelete(set, barId, collection) {
  if (!set.size) return;
  if (set.size === 1) { await _performBulkDelete(set, barId, collection); return; }
  _bulkConfirmSet = set; _bulkConfirmBarId = barId; _bulkConfirmCollection = collection;
  // ...populate + show #bulkConfirmModal
}
```

The actual deletion body (currently inline in `_bulkDelete`) moves unchanged into a new `_performBulkDelete(set, barId, collection)`, called either directly (size === 1) or from `_bulkConfirmYes()` (size > 1, after the user confirms). `_bulkConfirmNo()` just hides the modal and clears the three pending-state variables — no deletion, selection and the bulk bar are left exactly as they were.

**i18n:** three new keys, `bulk.confirm_title` / `bulk.confirm_msg_suffix` / `bulk.confirm_btn`, added to both the `he` and `en` blocks of `translations.js`, following the codebase's existing `${count} ${t('some.suffix.key')}` string-building convention (e.g. `draft.autosaved_toast`) rather than introducing a new placeholder-substitution style. Cancel reuses the existing `btn.cancel` key — no new key needed.

## Testing strategy

Playwright, following this codebase's established pattern (see `workout.spec.ts` / `running.spec.ts` type-identity tests) of creating real throwaway data via the UI and cleaning it up in a `finally` block, rather than mocking.

- **History:** one flow test creates 2 throwaway ad-hoc-exercise sessions, selects both, asserts the modal appears and neither record is deleted yet; cancels and asserts both survive and the bulk bar is still open with both still selected; re-triggers delete and confirms, and asserts both are gone plus the success toast fires. A second, separate test creates exactly 1 throwaway session, selects only it, and asserts the modal never appears (immediate delete) — this second test is expected to pass against the **pre-change** code too, since the single-item path is untouched; it's a regression guard, not a red/green probe.
- **Measurements:** the same two-test shape, adapted to measurements' selection mechanism (click on `.sel-check`, not long-press) and the fact that measurement records have no name field — throwaway entries are identified by a distinctive generated weight value embedded in the card's own text content (Playwright `hasText` locator), consistent with this project's standing rule to verify a record's actual content before selecting/deleting it during live testing rather than assuming by position or count.
- The hardware-back-button guard cannot be exercised by this Playwright web suite (it hooks `window.Capacitor.Plugins.App.addListener`, which only exists in the native Android WebView). It is verified by code review only — called out explicitly here rather than silently skipped.
