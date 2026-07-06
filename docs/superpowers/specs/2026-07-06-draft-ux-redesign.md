# Draft UX Redesign — Spec

## Overview

Redesign the auto-save draft experience in the workout logger. Two problems to solve:

1. **Draft banners appear inline** at the top of the page — cluttered and easy to miss. Replace with a focused modal popup.
2. **Tab switching triggers draft prompts** within the same session — unnecessary friction. Preserve in-memory state when switching tabs; only prompt on a new session.

---

## Session Detection

On app load, check `sessionStorage.getItem('session_active')`:
- **Not present** → new session. Set it (`sessionStorage.setItem('session_active', '1')`). Draft popup is eligible to appear.
- **Present** → same session. Skip draft prompts entirely; restore from in-memory state.

The browser clears `sessionStorage` automatically when the tab is closed, so no manual cleanup is needed.

---

## In-Memory Tab State (`_tabState`)

A global JS object that holds the live form state of each workout type:

```js
_tabState = {
  "A": { workoutName: "...", exercises: [{ name, weight, sets, reps, notes }] },
  "B": { ... }
}
```

**On tab switch (A → B):**
1. Serialize current form into `_tabState['A']` (snapshot).
2. If `_tabState['B']` exists → restore it into the form (no localStorage read, no popup).
3. If `_tabState['B']` does not exist → check for a localStorage draft (new-session path below).

**On submit (`submitData`):**
- Delete `_tabState[type]` for the submitted tab.
- Delete localStorage draft and Firestore draft (existing behavior).

The existing localStorage + Firestore save timers run unchanged — they act as a safety net if the page crashes or the user force-closes.

---

## Draft Popup (Modal)

Replaces `#draftBanners` and `#draftIndicator`.

**Trigger conditions (all must be true):**
- New session (flag not found at load time).
- User switches to (or lands on) a tab that has a draft in localStorage.
- `_tabState[type]` does not already exist (first visit to this tab in the session).
- Draft passes `_draftHasBannerData` (has a name or any filled field).

**Appearance:**
- Full-screen semi-transparent backdrop (dark overlay).
- Centered card (max-width 340px) containing:
  - Title: "נמצאה טיוטה לאימון [X]"
  - Details: workout name (if set), number of exercises with data, last-saved time.
  - Primary button: "המשך מהמקום שהפסקת" → applies draft to form, saves into `_tabState`.
  - Secondary button: "התחל מחדש" → discards draft (delete localStorage + Firestore), loads clean template.
- Appears with a short fade-in animation.
- No close-on-backdrop-click (user must make an explicit choice).

**One popup at a time:** The popup is triggered per tab, only when the user actually navigates to that tab. There is no up-front enumeration of all tabs with drafts.

---

## Auto-Save to History (Unchanged)

On login, the app scans Firestore for drafts from **previous days**:
- If a draft passes `_draftQualifies` (at least one exercise with weight + sets + reps) → saved to history automatically.
- Draft is then deleted from Firestore and localStorage.
- Toast message confirms how many workouts were auto-saved.

No changes to this flow.

---

## Removed Code

| Element | Reason |
|---|---|
| `#draftBanners` (HTML) | Replaced by modal |
| `#draftIndicator` (HTML) | Removed (saving happens silently) |
| `.draft-banner`, `.draft-banners`, `.draft-indicator` CSS | No longer needed |
| `_draftRenderBanner(type, draft)` | Replaced by modal |
| `_draftCheckAndShowBanner(type)` | Replaced by new trigger logic |

---

## Added Code

| Element | Purpose |
|---|---|
| `_tabState` (JS object) | In-memory tab state |
| `_tabSnapshotCurrent()` | Serializes current form into `_tabState[selectedType]` |
| `_tabRestoreOrDraft(type)` | On tab switch: restore from memory or trigger draft check |
| `_isNewSession` (boolean, set at load) | Captures whether this is a new session |
| `#draftModal` (HTML) | Modal overlay markup |
| `.draft-modal-*` (CSS) | Modal styles |
| `_draftShowModal(type, draft)` | Renders and shows the modal for a given tab |
| `_draftModalResume(type)` | "Continue" action: apply draft, close modal |
| `_draftModalDiscard(type)` | "Start fresh" action: delete draft, close modal |

---

## Edge Cases

- **User refreshes mid-session**: `sessionStorage` persists across refreshes (within same tab), so `_tabState` is lost but `session_active` is still set. The app treats it as the same session; localStorage draft will be applied silently without a popup (via `_tabRestoreOrDraft` seeing no `_tabState` but `_isNewSession = false`). This is acceptable — the draft is still there and will be loaded.
- **Multiple tabs open**: Each browser tab has its own `sessionStorage` and `_tabState`. They share localStorage. This is existing behavior and unchanged.
- **Draft from yesterday shown today**: Handled by auto-save-to-history on login, so no draft banner or modal will appear for old drafts.
