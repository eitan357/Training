# Plan: Draft-Modal Cross-Domain Bugs + Cardio Auto-Save Parity

Spec: `docs/superpowers/specs/2026-09-07-draft-modal-cardio-parity-design.md`

Process for every task below: implement → re-read the diff against that task's own done-condition → verify live against the local Firebase hosting emulator (real production Firestore) → only then move to the next task.

## Task 1: Add `sectionName` + `getSelectedType`-based visibility guard, gate `_draftShowModal`

**Files:** `public/index.html`

- [ ] Add `sectionName: 'main'` to `WORKOUT_DOMAINS.strength`, `sectionName: 'running'` to `WORKOUT_DOMAINS.cardio`.
- [ ] Add new function near `_tabRestoreOrDraft`:
  ```js
  function _isDomainTypeCurrentlyVisible(domain, type) {
    const D = WORKOUT_DOMAINS[domain];
    return currentSection === D.sectionName && D.getSelectedType() === type;
  }
  ```
- [ ] In `_tabRestoreOrDraft`, gate the `_draftShowModal` call:
  ```js
  if (_isNewSession) {
    if (!_isDomainTypeCurrentlyVisible(domain, type)) return;
    _draftShowModal(domain, type, draft);
  } else {
    ...
  ```
- [ ] **Step: Verify done-condition.** Re-read diff: confirm the silent-restore (`else`) branch is untouched (only the modal path is gated — a same-session refresh must still restore silently regardless of section, since that path never shows a modal in the first place and isn't part of this bug). Confirm no other caller of `_draftShowModal` exists (grep) that would bypass this gate.
- [ ] **Step: Live verification.**
  1. Log in against the local emulator, open DevTools console.
  2. `currentSection` should read `'main'` while on Strength. Run `_isDomainTypeCurrentlyVisible('cardio', 'Running')` → expect `false` (proves the guard would correctly block a stale cardio modal from showing while on Strength).
  3. Navigate to `/running`, select the "Running" type (or whatever the first cardio type is). Run `_isDomainTypeCurrentlyVisible('cardio', <that type>)` → expect `true`.
  4. Manually reproduce the original race: in the console, run `cardioSelectedType = null; showSection('main');` immediately followed by `initRunSection()` (simulating the pending continuation resolving after navigating away) with an existing qualifying local draft for that type (`_draftSaveLocal('cardio', 'Running')` after typing something, or craft one directly via `localStorage.setItem`) — confirm the modal does **not** appear while `#sec-main` is active, and confirm it **does** appear correctly the next time you actually navigate to `/running` and select that type.

## Task 2: Generalize the draft item-count line

**Files:** `public/index.html`

- [ ] Add to `WORKOUT_DOMAINS.strength`:
  ```js
  draftItemsSummary: draft => `${(draft.exercises || []).filter(e => e.weight || e.sets || e.reps).length} ${t('workout.exercises')}`,
  ```
- [ ] Add to `WORKOUT_DOMAINS.cardio`:
  ```js
  draftItemsSummary: draft => `${(draft.fields || []).filter(f => f.value !== '' && f.value != null && f.value !== false).length} ${t('cardio.fields_count')}`,
  ```
- [ ] In `_draftShowModal`, replace:
  ```js
  const exCount = (draft.exercises || []).filter(e => e.weight || e.sets || e.reps).length;
  ```
  and its use in the details line, with a call to `WORKOUT_DOMAINS[domain].draftItemsSummary(draft)`, dropping the now-redundant `${exCount} ${t('workout.exercises')}` concatenation in favor of the pre-built string.
- [ ] **Step: Verify done-condition.** Re-read diff: strength's count filter must be byte-for-byte the same predicate as before (no behavior change for strength — pure extraction). Confirm `_draftShowModal` no longer references `draft.exercises` or `t('workout.exercises')` directly.
- [ ] **Step: Live verification.**
  1. Craft a strength draft with 2 exercises having weight/sets filled, open a new tab/session, select that type → confirm modal shows the correct count (e.g. "2 תרגילים"), matching pre-fix behavior exactly.
  2. Craft a cardio draft with distance+time filled (2 real fields, date auto-filled = a 3rd), open a new tab/session, navigate to that cardio type → confirm modal shows the correct field count with "שדות"/"fields" wording, not "תרגילים"/"exercises", and not "0".

## Task 3: Fix the auto-save badge's domain-scoped "most recent" check

**Files:** `public/index.html`

- [ ] Add `getAllEntries: () => allSessions` to `WORKOUT_DOMAINS.strength`, `getAllEntries: () => allRunWorkouts` to `WORKOUT_DOMAINS.cardio`.
- [ ] In `buildSessionCard`, change `!allSessions.some(o => o.dateISO > s.dateISO)` to `!WORKOUT_DOMAINS[domain].getAllEntries().some(o => o.dateISO > s.dateISO)`.
- [ ] **Step: Verify done-condition.** Re-read diff: confirm `buildSessionCard`'s strength call sites are unaffected in output (since `WORKOUT_DOMAINS.strength.getAllEntries()` returns the exact same `allSessions` reference the old code read directly).
- [ ] **Step: Live verification.** Deferred to Task 4's live verification, since cardio has no `autoSaved: true` entries to exercise this path until then — testing it in isolation now would require hand-injecting a fake `autoSaved` flag into a real Firestore doc, which is riskier than just verifying it end-to-end once Task 4 exists. Note this explicitly rather than silently skipping it.

## Task 4: Generalize `checkAndAutoSavePreviousDrafts` for cardio parity

**Files:** `public/index.html`

- [ ] Add `buildAutoSaveEntry` to `WORKOUT_DOMAINS.strength` — extract the existing inline logic from `checkAndAutoSavePreviousDrafts` verbatim (dating via `draft.createdAt`, filtering exercises with weight/sets/reps/notes), returning the entry object (no `qualifies()` pre-check inside it — the caller already checks `qualifies()` before calling, per the loop shape below).
- [ ] Add `buildAutoSaveEntry` to `WORKOUT_DOMAINS.cardio` — mirrors `submitCardioData()`'s validation:
  ```js
  buildAutoSaveEntry: draft => {
    const fields = [];
    for (const f of (draft.fields || [])) {
      if (f.fieldType !== 'checkbox' && (f.value === '' || f.value == null)) continue;
      if (!f.label || !String(f.label).trim()) return null;
      if (f.fieldType === 'number' && Number(f.value) < 0) return null;
      fields.push({ id: f.id, label: f.label, fieldType: f.fieldType, value: f.value });
    }
    const dateField = fields.find(f => f.fieldType === 'date');
    if (!dateField || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateField.value)) return null;
    const [dd, mm, yyyy] = dateField.value.split('/');
    return {
      date: dateField.value, dateISO: `${yyyy}-${mm}-${dd}`,
      workoutType: draft.type, sessionName: draft.workoutName || '', fields,
      autoSaved: true, createdAt: serverTimestamp(),
    };
  },
  ```
- [ ] Rewrite `checkAndAutoSavePreviousDrafts()` to loop over `Object.keys(WORKOUT_DOMAINS)`, extracting the per-domain body into a new `_autoSavePreviousDraftsForDomain(domain, today)` that:
  1. Syncs same-shaped local-only stale drafts to Firestore first (prefix `draft_${uid}_${domain}_`) — same as today, just domain-parametrized instead of hardcoded to `'strength_'`.
  2. Reads all Firestore drafts once (share the single `getDocs` call across the domain loop — don't re-fetch per domain; fetch once in the outer function, partition by prefix inside).
  3. For docs matching `${domain}_` prefix (plus, strength-only, the legacy bare-type-name fallback — unchanged from today): if previous-day, call `buildAutoSaveEntry(draft)`; if it returns an entry, `addDoc` into `WORKOUT_DOMAINS[domain].entriesCollection` and delete the draft (local + Firestore); else if `_draftQualifies(domain, draft)`, leave the draft in place untouched; else delete it (matches today's unconditional-delete-if-not-qualifying behavior).
  4. Returns the count of entries actually auto-saved for that domain.
  Outer function sums counts across domains, shows the toast once if `count > 0` (unchanged wording).
- [ ] **Step: Verify done-condition.** Re-read diff: confirm the Firestore read is still a single `getDocs(collection(db,'users',uid,'drafts'))` call (not one per domain — avoid a needless extra read). Confirm strength's exact current behavior is preserved (same conditions, same fields written, same delete-always-happens-on-non-qualifying semantics). Confirm cardio's legacy-doc fallback is NOT triggered (only strength gets that fallback).
- [ ] **Step: Live verification.**
  1. Create a cardio draft dated yesterday (via `localStorage`/Firestore direct write, or by changing the system clock is not an option — instead directly construct the draft object with `createdAt` set to yesterday's ISO string and a valid filled date field) with real field data (distance, time) → reload/re-login → confirm: (a) a "workouts auto-saved to history" toast appears, (b) the entry is now visible in Cardio History dated correctly, tagged "Auto-saved" (confirming Task 3's badge fix works end-to-end), (c) the stale draft is gone from `localStorage`/Firestore drafts collection.
  2. Create a second stale cardio draft with an invalid/missing date field but some other real field data → reload → confirm it is NOT deleted (still present in localStorage/Firestore afterward) and NOT promoted to a fake history entry — instead resurfaces as a normal "draft found" modal next time that type is visited (proving the fixed Task 1 gate + this task's "leave in place" branch both work together correctly).
  3. Re-run one of the original strength-only scenarios (a stale strength draft from yesterday) to confirm zero regression in existing strength behavior.

## Task 4b: Fix a race exposed by Task 4 — `prefetchRunData()` can read `runWorkouts` before the auto-save write commits

**Found during Task 4's own live verification, not anticipated in the original spec.** `_backgroundSync` runs `checkAndAutoSavePreviousDrafts()` and `loadRunningEnabled().then(() => { if (runningEnabled) prefetchRunData(); })` as siblings inside the same `Promise.all` ([index.html:3079-3085](../../public/index.html#L3079-L3085)) — unordered relative to each other. Before Task 4, this was harmless (cardio had nothing to auto-save, so nothing `checkAndAutoSavePreviousDrafts` did could matter to `prefetchRunData`'s read). Now that cardio auto-save can *write* to `runWorkouts` inside `checkAndAutoSavePreviousDrafts()`, and `prefetchRunData()` *reads* that same collection, their unordered concurrency means a just-auto-saved cardio entry can silently be missing from `allRunWorkouts` for the rest of that session (until an explicit reload) if the read happens to win the race. Strength's own data load (`loadAllData()`) was never at risk — it already runs strictly after the whole `Promise.all` resolves.

**Files:** `public/index.html`

- [ ] In `_backgroundSync`, start `checkAndAutoSavePreviousDrafts()` before the `Promise.all` (so it and `loadRunningEnabled()` still run concurrently — no added latency for the common case), but `await` that same promise inside the `loadRunningEnabled().then(...)` callback before calling `prefetchRunData()`:
  ```js
  const autoSavePromise = checkAndAutoSavePreviousDrafts();
  await Promise.all([
    autoSavePromise,
    loadRunningEnabled().then(async () => {
      try { localStorage.setItem(_cacheKeyRunning(), String(runningEnabled)); } catch(e) {}
      if (runningEnabled) {
        await autoSavePromise; // ensure any auto-saved cardio entry is written before reading runWorkouts
        prefetchRunData();
      }
    }),
  ]);
  ```
- [ ] **Step: Verify done-condition.** Re-read diff: confirm `loadRunningEnabled()` itself is NOT delayed by the auto-save scan (only `prefetchRunData()`'s call is) — the flag read and the draft scan still run fully in parallel.
- [ ] **Step: Live verification.** Re-run Task 4's scenario 1 end-to-end (stale valid cardio draft → reload → check Cardio History) and confirm the auto-saved entry is now visible in the SAME session's rendered History without needing a second reload.

## Task 5: Docs

**Files:** `docs/product/02-workout-strength.md`, `docs/product/07-running-cardio.md`

- [ ] Update `02-workout-strength.md`'s "טיוטה אוטומטית" section — the "שמירה אוטומטית להיסטוריה של טיוטות 'יתומות'" subsection is no longer strength-only; reword to state it's a shared strength+cardio mechanism, with cardio's validation difference (requires a valid date field, no negative values, no unnamed fields — matching `submitCardioData`) noted explicitly.
- [ ] Add a short cross-reference note in `07-running-cardio.md` pointing to the (now-shared) draft-autosave section in `02-workout-strength.md`, rather than duplicating the full description.
- [ ] **Step: Verify done-condition.** Re-read both docs: no remaining claim that this is strength-exclusive.

## Task 6: Test coverage

**Files:** `tests/workout.spec.ts`, `tests/running.spec.ts`

- [ ] `tests/workout.spec.ts` (or a shared helper file, given the guard logic is domain-generic): a test that calls `_isDomainTypeCurrentlyVisible` via `page.evaluate` under both a matching and a non-matching `currentSection`/selected-type, asserting `true`/`false` correctly — deterministic coverage of Task 1's actual fix (per the spec's testing-strategy rationale: don't try to race real network timing).
- [ ] `tests/running.spec.ts`: a test that crafts a cardio draft with real field data via `localStorage`, opens a new browser context (fresh session so the modal path — not the silent-restore path — is exercised), navigates to that exact cardio type, and asserts the modal shows the correct non-zero field count with cardio wording.
- [ ] `tests/workout.spec.ts`: keep/extend an equivalent strength-side draft-modal count test if one doesn't already exist, to lock in Task 2's byte-for-byte strength behavior preservation.
- [ ] **Step: Verify done-condition.** Run the new tests against the local emulator (with `PLAYWRIGHT_TEST_BASE_URL` set to it, and a freshly-regenerated `storageState` for that origin, per the established process from the prior round) — confirm they pass against the fixed code and, where practical, fail against a git-stashed pre-fix version (proving they're real regression tests).

## Commit plan

One commit per task, following the pattern from the prior round:
1. `fix(draft): don't show the draft-found modal for a domain/type the user isn't currently viewing`
2. `fix(cardio): show the real field count in the draft-found modal instead of always "0"`
3. `fix(history): scope the auto-save badge's "most recent" check to the correct domain`
4. `feat(cardio): auto-save previous-day drafts into history, matching strength's existing safety net`
5. `docs: document draft auto-save as a shared strength+cardio mechanism`
6. `test: add coverage for the draft-modal visibility guard and cardio field-count display`
