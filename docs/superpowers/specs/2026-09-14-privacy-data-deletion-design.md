# Design: Privacy & Data Deletion Page

## Problem

`docs/product/12-security-and-privacy.md` and `docs/product/14-data-model-backend.md` both flag the same gap: the app has no in-product way for a user to delete their data or their account, even though the Play Store Data Safety declaration (`docs/product/11-android-app.md`) promises both are possible. This spec closes that gap with a new "Privacy" screen reachable from Settings.

## Scope

**In scope:**
- A new `#sec-privacy` page, reachable only via Settings → "פרטיות" (Privacy).
- A plain-language explanation of what data the app stores about the user, grouped by category.
- Two red, clearly-labeled destructive actions, each with its own explanatory caption directly under it:
  1. **מחיקת נתונים** (Delete Data) — wipes all Firestore data but keeps the account/login usable.
  2. **מחיקה מלאה של הפרופיל** (Delete Account Permanently) — wipes all Firestore data **and** deletes the Firebase Auth account itself.

**Out of scope (explicitly not built here):**
- Data export / "download my data" (GDPR portability) — not requested.
- Any change to Firestore security rules (not in this repo per `12-security-and-privacy.md`).
- The static `public/privacy.html` policy page mentioned as "planned" in `11-android-app.md` — separate deliverable.

## Data footprint (what gets deleted)

Per `docs/product/14-data-model-backend.md`'s collection map, a full wipe removes, all under `users/{uid}/...`:

- **Config docs (5):** `config/templates`, `config/measurementTypes`, `config/profile`, `config/settings`, `config/runningTemplates`
- **Entry collections (3, every doc):** `workouts`, `measurements`, `runWorkouts`
- **Drafts collection (1, every doc):** `drafts` (covers both `strength_*`/`cardio_*` current-format ids and any pre-migration legacy ids, per `02-workout-strength.md`'s draft-format note — a full collection scan catches both without needing to know the id scheme)

Plus every `localStorage` key scoped to the current `uid` (`displayName_<uid>`, `displayNamePending_<uid>`, `templates_<uid>`, `lastWorkout_<uid>_*`, `running_enabled_<uid>`, `runningTemplates_<uid>`, `draft_<uid>_*`) — found by substring match on `_<uid>` across `Object.keys(localStorage)`, mirroring how these keys are already written ad hoc throughout `public/index.html` (no single registry of key names exists today).

**Decision (confirmed with user):** after "Delete Data", nothing is reseeded — no call to `initNewUser`. The account is left with zero templates/history, same as the transient state a brand-new account is already in before `initNewUser`'s writes land (`public/index.html:2829`, `selectType(workoutTypes[0]?.id || 'A')`) — the app already tolerates an empty `workoutTypes` array without crashing (empty `#typeRow`, hidden history-preview, etc.), so no new empty-state UI work is required.

## Confirmation UX

**Decision (confirmed with user):** neither button uses the app's existing "Arm & Confirm" pattern (`armDelete()`, used for single history/measurement deletes) — both are far more destructive than a single record. Instead, clicking either button opens a shared modal (`#privacyConfirmModal`, new — visually based on the existing `#draftModal`'s `.draft-modal-overlay`/`.draft-modal-card` classes, the app's only existing "blocking modal, no backdrop-dismiss" pattern) that:

- States in plain language exactly what will happen (different copy per action).
- Requires the user to type an exact confirmation word (`מחק` / `DELETE`, translated) into a text input before the confirm button becomes enabled.
- Has a plain-text cancel action, consistent with `#draftModal`'s `.draft-modal-btn-discard`.

## Reauthentication for account deletion

**Decision (confirmed with user):** catch-and-reauth. `deleteUser(currentUser)` is attempted directly first. If it rejects with `auth/requires-recent-login`, a second small modal opens asking the user to re-prove their identity:
- **Password users** (`currentUser.providerData[0].providerId === 'password'`): a password field, verified via `reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password))`.
- **Google users** (`providerId === 'google.com'`): a "Sign in with Google again" button, reusing the exact browser/native branching `handleGoogleLogin()` already uses (`public/index.html:2381-2400`) to get a fresh credential, then `reauthenticateWithCredential(currentUser, credential)` instead of `signInWithCredential`.

On success, the original `deleteUser()` call is retried once. This flow only exists for full-account deletion — "Delete Data" never calls `deleteUser`, so it never needs reauth.

**Known limitation (documented, not solved here):** there is no practical way to exercise the `auth/requires-recent-login` branch in an automated Playwright test — it only fires when the real login is stale by Firebase's internal freshness window, which can't be simulated without waiting real wall-clock time or manipulating Firebase's token internals. The reauth code path is covered by careful manual QA against an account with an old session, not by an automated test. The round-trip e2e test below only exercises the direct-success path (fresh login → `deleteUser()` succeeds immediately).

## Where the page lives

Settings today has one "עריכה" (Edit) group and a plain "יציאה" (Sign out) button at the bottom (`public/index.html:1336-1425`). This adds a new group between "טיימר" and the sign-out button:

```
settings.section.privacy  →  "פרטיות"
  [icon-shield] "פרטיות ומחיקת נתונים" (settings.privacy) → openPrivacySettings() → navigateTo('/settings/privacy')
```

`#sec-privacy` is a **full top-level section** (like `#sec-settings` itself), not an edit-panel layered on an existing section (unlike `/settings/workout-plan` etc., which reuse `main`/`measurements`/`running`) — because its content isn't an editor for something that already has a home page. New route: `ROUTES['/settings/privacy'] = { section: 'privacy' }`; new `SECTION_ORDER.privacy = 5`.

## Testing strategy (important — real production Firebase)

Every existing Playwright test in this repo runs against the live production project (`https://training-diary.web.app`) using long-lived shared accounts (`TEST_EMAIL`/`TEST_PASSWORD`, `TEST_EMAIL_UNGATED`) — see `tests/helpers/auth.ts` and every `*.spec.ts` file. **No test in this feature may ever call the real delete-data or delete-account path against those shared accounts.**

- **UI-only tests** (safe, run against `TEST_EMAIL`): page is reachable, explanation text renders, both buttons are visible and styled red, clicking either opens the confirm modal, the confirm button stays disabled until the exact word is typed, cancel closes the modal with zero Firestore/Auth calls made.
- **Destructive round-trip test** (the only test allowed to actually run the delete flow): registers a **brand-new, disposable account** through the real UI register flow (`qa-privacy-delete-<Date.now()>@example.com`, a fresh, never-reused address) — never `TEST_EMAIL`. Adds one throwaway workout, runs "Delete Data", verifies the app now shows the empty state and the account is still logged in; then runs "Delete Account Permanently" (fresh login ⇒ no reauth branch needed), verifies redirect to the auth screen, then verifies logging back in with the same credentials now fails.
- **Safety net:** the round-trip test also calls `firebase-admin`'s `getAuth().deleteUser(uid)` in a `finally` block (via a small Node helper script, same pattern as `scripts/read-workouts.js`, using the real on-disk credential file `service-account-key.json.json`) to guarantee the disposable account never survives as orphaned junk in production even if the in-app deletion path itself is what's under test and fails.
