# New-User Onboarding Defaults + Settings Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give new users complete, bilingual (Hebrew/English) default data across strength, cardio, and measurements instead of Hebrew-only/incomplete data, set a display name and a sticky language default on first entry, and fix two related Firestore-write error-handling bugs in Settings.

**Architecture:** All changes live in one file, `public/index.html` (a single-page app with no build step — edits take effect on save/refresh). `initNewUser(uid)` becomes `initNewUser(uid, email)` and grows from writing 2 Firestore config docs to 4, picking Hebrew or English literal text based on `currentLang` at the moment it runs (no new i18n keys — this mirrors how the existing defaults already work, just duplicated per language instead of hardcoded Hebrew-only). Two independent bugfixes (`saveRunningEnabled`, `saveDisplayName`) touch unrelated functions in the same file and can be done in either order relative to the defaults work.

**Tech Stack:** Vanilla JS (ES modules), Firebase v12 SDK (Auth + Firestore), no bundler/build step, no unit-test framework — verification is manual via the Playwright browser MCP tool against the real dev-served app, plus the existing Playwright E2E suite (`tests/*.spec.ts`, runs against a real production Firebase account) for regression checks. See "Global Constraints" for why steps below use manual verification procedures instead of automated test code.

**Spec:** `docs/superpowers/specs/2026-09-10-new-user-defaults-design.md`

## Global Constraints

- No unit-test framework and no Firestore emulator exist in this repo — every "test" step below is a concrete manual verification procedure (exact browser actions + exact expected result), not automated test code, because none would actually run. Do not skip these steps or replace them with "looks right."
- All new default text must match the approved glossary in the spec **exactly** (Hebrew and English) — do not improvise wording.
- The cardio default fields are a **separate, dedicated label set** — do NOT reuse or modify `CARDIO_MIGRATION_FIELD_MAP` (`index.html:3448-3457`) or `CARDIO_FIELD_LABEL_KEYS` (`index.html:1972-1981`). Those stay untouched; this is a deliberate scope boundary from the spec.
- No new `translations.js` keys are needed for the default content itself (strength/cardio/measurement text is picked as plain JS literals by `currentLang`, not routed through `t()`) — the two bugfixes reuse existing keys (`error.save`, `err.fs_*`) already added in a prior session.
- After every task, update the relevant `docs/product/*.md` file(s) before moving to the next task — do not batch doc updates to the end.
- Every `setDoc`/Firestore-write code touched must keep using the existing `t()` + `firestoreErrMsg(err)` pattern already established in this file (see `index.html:2429-2441` for `firestoreErrMsg`, and any of the 13 call sites like `index.html:4623-4625` for the exact usage pattern) — never a raw or hardcoded-language error message.

---

## Task 1: Localize `saveRunningEnabled`'s error toast

**Files:**
- Modify: `public/index.html:1596-1602`
- Docs: `docs/product/08-settings.md`

**Interfaces:**
- Consumes: existing `t()`, `firestoreErrMsg(err)` (defined at `index.html:2429-2441`), `toast()`.
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Read current code and confirm exact match**

Current code at `index.html:1596-1602`:
```js
async function saveRunningEnabled(val) {
  runningEnabled = val;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'settings'), { runningEnabled: val }, { merge: true });
  } catch { toast('שגיאה בשמירת הגדרות', 'error'); }
  applyRunningGate();
}
```

- [ ] **Step 2: Fix the catch block**

Replace with:
```js
async function saveRunningEnabled(val) {
  runningEnabled = val;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'settings'), { runningEnabled: val }, { merge: true });
  } catch (err) { toast(t('error.save') + firestoreErrMsg(err), 'error'); }
  applyRunningGate();
}
```

- [ ] **Step 3: Manual verification (no automated test exists for this path)**

1. Serve the app locally: `cd public && "/c/Python313/python" -m http.server 8123` (or any static server — Firestore/Auth calls go to the real project regardless of how `index.html` itself is served).
2. Open the app in the Playwright browser tool, log in with an existing test account, open Settings.
3. In DevTools (or via `browser_network_request` blocking), force the next Firestore write to fail (e.g. toggle the browser to offline mode right before flipping the toggle, or block requests to `firestore.googleapis.com`).
4. Toggle "הצג עמוד אירובי" (`#runningEnabledToggle`).
5. Expected: a toast reading `"שגיאה: "` + a localized, actionable Firestore message (e.g. the offline/`unavailable` message from `err.fs_unavailable`) — never the old raw `'שגיאה בשמירת הגדרות'` string, and never raw English SDK text.
6. Re-enable network, retry the toggle, confirm it saves successfully with no error toast.

- [ ] **Step 4: Update docs**

In `docs/product/08-settings.md`, find the section documenting the cardio-visibility toggle / `saveRunningEnabled` (search for `runningEnabled` or `הצג עמוד אירובי`). Add a line noting the error toast is now localized via `t('error.save') + firestoreErrMsg(err)` instead of a hardcoded Hebrew string. If no such section exists yet, add a short one under the relevant settings-row description.

- [ ] **Step 5: Commit**

```bash
git add public/index.html docs/product/08-settings.md
git commit -m "fix(settings): localize saveRunningEnabled's error toast"
```

---

## Task 2: `saveDisplayName` — retry-on-next-sync instead of silent failure

**Files:**
- Modify: `public/index.html:1560-1567` (`saveDisplayName`)
- Modify: `public/index.html:2709-2724` (`reloadAppData` — add retry hook)
- Modify: `public/index.html:3339-3350` (`_draftStartFirestoreTimer` — add retry hook)
- Docs: `docs/product/08-settings.md`

**Interfaces:**
- Consumes: `currentUser`, `db`, `doc`, `setDoc` (all already imported/available at top of file).
- Produces: `_syncDisplayName(name)` and `_retryPendingDisplayNameSync()` — new functions, both used only within this task (no other task calls them), but must exist and be named exactly this for Task 6's manual verification steps to reference correctly.

- [ ] **Step 1: Read current code and confirm exact match**

Current `saveDisplayName` at `index.html:1560-1567`:
```js
function saveDisplayName() {
  const name = document.getElementById('displayNameInput').value.trim();
  const key  = 'displayName_' + (currentUser?.uid || '');
  if (name) localStorage.setItem(key, name); else localStorage.removeItem(key);
  _updateTopbarName();
  if (currentUser) setDoc(doc(db, 'users', currentUser.uid, 'config', 'profile'), { displayName: name }, { merge: true }).catch(() => {});
  toast(t('display_name_saved'), 'success');
}
```

- [ ] **Step 2: Replace with the retry-aware version**

```js
function saveDisplayName() {
  const name = document.getElementById('displayNameInput').value.trim();
  const key  = 'displayName_' + (currentUser?.uid || '');
  if (name) localStorage.setItem(key, name); else localStorage.removeItem(key);
  _updateTopbarName();
  _syncDisplayName(name);
  toast(t('display_name_saved'), 'success');
}

// Fire-and-forget write to Firestore. On failure we never bother the user —
// per product decision, a failed displayName sync is flagged and retried
// opportunistically the next time we're already talking to Firestore for
// something else (see _retryPendingDisplayNameSync, called from
// reloadAppData() and the draft auto-save timer), instead of showing an
// error for something this low-stakes.
function _syncDisplayName(name) {
  if (!currentUser) return;
  const pendingKey = 'displayNamePending_' + currentUser.uid;
  setDoc(doc(db, 'users', currentUser.uid, 'config', 'profile'), { displayName: name }, { merge: true })
    .then(() => { try { localStorage.removeItem(pendingKey); } catch (e) {} })
    .catch(() => { try { localStorage.setItem(pendingKey, '1'); } catch (e) {} });
}

// Cheap no-op when nothing is pending (single localStorage read, no network
// call) — safe to call unconditionally from any existing Firestore-write
// hot path.
function _retryPendingDisplayNameSync() {
  if (!currentUser) return;
  const pendingKey = 'displayNamePending_' + currentUser.uid;
  if (!localStorage.getItem(pendingKey)) return;
  const nameKey = 'displayName_' + currentUser.uid;
  _syncDisplayName(localStorage.getItem(nameKey) || '');
}
```

- [ ] **Step 3: Hook the retry into `reloadAppData`**

Current code at `index.html:2709-2724`:
```js
async function reloadAppData() {
  try {
    // loadRunData() runs alongside loadAllData() so cardio's data layer
    // (allRunWorkouts/runningTypes) is just as fresh as strength's by the
    // time applyAppData() calls renderHistory() — otherwise a cardio
    // edit/delete succeeds in Firestore but the History page keeps
    // showing stale data until a hard reload (loadRunData() is the only
    // thing that repopulates allRunWorkouts, and it was never wired into
    // this shared post-mutation refresh path).
    const [data] = await Promise.all([loadAllData(), loadRunData()]);
    applyAppData(data);
    if (selectedType) selectType(selectedType);
  } catch (err) {
    toast(t('error.load') + firestoreErrMsg(err), 'error');
  }
}
```

Add the retry call right after the try block's existing work (runs on the success path only — matches "we're already talking to Firestore and it just worked"):
```js
async function reloadAppData() {
  try {
    const [data] = await Promise.all([loadAllData(), loadRunData()]);
    applyAppData(data);
    if (selectedType) selectType(selectedType);
    _retryPendingDisplayNameSync();
  } catch (err) {
    toast(t('error.load') + firestoreErrMsg(err), 'error');
  }
}
```
(Keep the existing comment block above `const [data] = ...` — omitted here only for brevity in this plan; do not delete it from the actual file.)

- [ ] **Step 4: Hook the retry into the draft auto-save timer**

Current code at `index.html:3339-3350`:
```js
function _draftStartFirestoreTimer(domain, getType) {
  clearInterval(_draftFirestoreTimer[domain]);
  _draftFirestoreTimer[domain] = setInterval(async () => {
    const type = getType();
    if (!type) return;
    const dk = domain + ':' + type;
    if (!_draftDirty[dk]) return;
    _draftSaveLocal(domain, type);
    await _draftSaveFirestore(domain, type);
    _draftDirty[dk] = false;
  }, 30000);
}
```

Add the retry call at the top of the interval tick, unconditionally (cheap check, runs every 30s regardless of draft-dirty state):
```js
function _draftStartFirestoreTimer(domain, getType) {
  clearInterval(_draftFirestoreTimer[domain]);
  _draftFirestoreTimer[domain] = setInterval(async () => {
    _retryPendingDisplayNameSync();
    const type = getType();
    if (!type) return;
    const dk = domain + ':' + type;
    if (!_draftDirty[dk]) return;
    _draftSaveLocal(domain, type);
    await _draftSaveFirestore(domain, type);
    _draftDirty[dk] = false;
  }, 30000);
}
```

- [ ] **Step 5: Manual verification**

1. Log in, open Settings, go offline (DevTools/network throttling → Offline).
2. Change the display name and save. Expected: the "✓ שם תצוגה עודכן" success toast still appears (local save always succeeds), the topbar name updates immediately.
3. Confirm `localStorage.getItem('displayNamePending_' + uid)` is now `'1'` (inspect via `browser_evaluate`).
4. Go back online. Trigger any save (e.g. save a workout) — this calls `reloadAppData()`.
5. Confirm `displayNamePending_<uid>` is removed from `localStorage` afterward, and re-fetching `config/profile` from Firestore (or reloading the page and checking the topbar) shows the new name actually persisted.
6. Repeat steps 1-3, but this time trigger recovery via the 30-second draft auto-save timer instead of a manual save (start a strength/cardio entry so the timer is running, wait ~35s after going back online) — confirm the same cleanup happens.

- [ ] **Step 6: Update docs**

In `docs/product/08-settings.md`, find or add the section describing `saveDisplayName`. Document: local save + UI update + success toast are unconditional; the Firestore write retries silently (no user-facing error) via `_retryPendingDisplayNameSync()`, triggered from `reloadAppData()` (after any manual save) and the draft auto-save timer (every 30s) — cross-reference `10-offline-and-sync-architecture.md` if that doc discusses similar patterns.

- [ ] **Step 7: Commit**

```bash
git add public/index.html docs/product/08-settings.md
git commit -m "fix(settings): retry failed displayName sync silently instead of swallowing the error"
```

---

## Task 3: Persist the detected default language to localStorage

**Files:**
- Modify: `public/index.html:1477`
- Docs: `docs/product/09-i18n-and-theming.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (Task 4 reads `currentLang`, which already exists — this task only changes how its *fallback* value gets persisted, not its type or name).

- [ ] **Step 1: Read current code and confirm exact match**

Current code at `index.html:1477`:
```js
let currentLang  = (() => { const s = localStorage.getItem('lang'); return LANGUAGES[s] ? s : (navigator.language.startsWith('he') ? 'he' : 'en'); })();
```

- [ ] **Step 2: Replace with a version that persists the fallback**

```js
let currentLang = (() => {
  const s = localStorage.getItem('lang');
  if (LANGUAGES[s]) return s;
  const detected = navigator.language.startsWith('he') ? 'he' : 'en';
  try { localStorage.setItem('lang', detected); } catch (e) {}
  return detected;
})();
```

- [ ] **Step 3: Manual verification**

1. Using the Playwright browser tool, clear site data / open a fresh context with no prior `localStorage` for the app's origin.
2. Set the browser's language to Hebrew (`navigator.language` starting with `he`), navigate to the app.
3. Confirm via `browser_evaluate` that `localStorage.getItem('lang') === 'he'` immediately after the first load (not just that the UI happens to render in Hebrew).
4. Repeat with the browser language set to English (e.g. `en-US`) in a fresh context — confirm `localStorage.getItem('lang') === 'en'`.
5. Confirm the existing manual language switcher (Settings → שפה) still works and still overrides this — pick the other language, reload, confirm `currentLang` now reflects the manually-chosen value, not device detection.

- [ ] **Step 4: Update docs**

In `docs/product/09-i18n-and-theming.md`, find the section on language detection/`currentLang`. Add a line: the device-language fallback is now persisted to `localStorage['lang']` on first computation (not just held in memory), so it becomes a real sticky default instead of being silently recomputed (and potentially changing) on every future load if the OS language changes.

- [ ] **Step 5: Commit**

```bash
git add public/index.html docs/product/09-i18n-and-theming.md
git commit -m "fix(i18n): persist detected device-language default to localStorage"
```

---

## Task 4: Rewrite `initNewUser` — bilingual strength/cardio/measurement defaults + display name

This is the core task. It replaces the whole body of `initNewUser`, changes its signature, and updates both call sites in the same commit (a signature change can't be shipped half-done).

**Files:**
- Modify: `public/index.html:2444-2480` (`initNewUser`)
- Modify: `public/index.html:2308-2309` (`handleAuthSubmit` call site)
- Modify: `public/index.html:2324-2344` (`handleGoogleLogin` call site)
- Docs: `docs/product/01-auth-onboarding.md`, `docs/product/02-workout-strength.md`, `docs/product/06-measurements.md`, `docs/product/07-running-cardio.md`

**Interfaces:**
- Consumes: `currentLang` (`index.html:1477`, module-scope — already correctly resolved by the time either call site runs, since both require prior user interaction on the loaded page), `t()`, `doc`, `db`, `setDoc`, `crypto.randomUUID`.
- Produces: `initNewUser(uid, email)` — new signature (was `initNewUser(uid)`). Both call sites must pass `email` as the second argument.

- [ ] **Step 1: Read current `initNewUser` and confirm exact match**

Current code at `index.html:2444-2480`:
```js
async function initNewUser(uid) {
  const g = () => crypto.randomUUID().replace(/-/g,'').substring(0,12).toUpperCase();
  const DEFAULT_TEMPLATES = {
    types: ['A', 'B'],
    A: [
      { id: g(), name: 'בכן סקוואט',           target: '3 X 4-6 + 1 X 15-20' },
      { id: g(), name: 'ספליט סקוואט / לאנג G', target: '3 X 10-12 / 3 X הלך-חזור' },
      { id: g(), name: 'לחיצת כפיים',           target: '3 X 4-6 + 1 X 15-20' },
      { id: g(), name: 'הרמקת כתף',             target: '3 X 15' },
      { id: g(), name: 'יד אחורית',             target: '3 X 12-15' },
      { id: g(), name: 'Toes to Bar',           target: '3 X 8-10' },
      { id: g(), name: 'תליה על מתח',           target: '3 X 50s' },
    ],
    B: [
      { id: g(), name: 'מתח כבד',              target: '2 X 3-5' },
      { id: g(), name: 'מתח טבעות',            target: '3 X 6-10' },
      { id: g(), name: 'חתירה אוסטרלית',       target: '2 X 12-15' },
      { id: g(), name: "בצ'",                  target: '3 X 3-5' },
      { id: g(), name: 'מקבילים משקל/טבעות',  target: '2 X RIR2' },
      { id: g(), name: 'שיפוע עליון',          target: '2 X 20' },
      { id: g(), name: 'יד קדמית סופינציה',    target: '2 X 12-15' },
      { id: g(), name: 'יד קדמית פטיש',        target: '1 X 12-15' },
    ]
  };
  const DEFAULT_MEASURE_TYPES = [
    { id: g(), name: 'משקל',    unit: 'ק"ג' },
    { id: g(), name: 'חזה',     unit: 'ס"מ' },
    { id: g(), name: 'כתפיים',  unit: 'ס"מ' },
    { id: g(), name: 'זרוע',    unit: 'ס"מ' },
    { id: g(), name: 'ירך',     unit: 'ס"מ' },
    { id: g(), name: 'שוק',     unit: 'ס"מ' },
    { id: g(), name: 'מותניים', unit: 'ס"מ' },
    { id: g(), name: 'ישבן',    unit: 'ס"מ' },
  ];
  await setDoc(doc(db, 'users', uid, 'config', 'templates'),       DEFAULT_TEMPLATES);
  await setDoc(doc(db, 'users', uid, 'config', 'measurementTypes'), { types: DEFAULT_MEASURE_TYPES });
}
```

- [ ] **Step 2: Replace with the full bilingual version**

```js
async function initNewUser(uid, email) {
  const g = () => crypto.randomUUID().replace(/-/g,'').substring(0,12).toUpperCase();
  const isHe = currentLang === 'he';

  const DEFAULT_TEMPLATES = isHe ? {
    types: ['A', 'B'],
    A: [
      { id: g(), name: 'מתח',          target: '' },
      { id: g(), name: 'שכיבות סמיכה', target: '' },
      { id: g(), name: 'סקוואט',       target: '' },
      { id: g(), name: 'כפיפות בטן',   target: '' },
      { id: g(), name: 'דדליפט',       target: '' },
    ],
    B: [
      { id: g(), name: "בנץ' פרס",  target: '' },
      { id: g(), name: 'כפיפת ירך', target: '' },
      { id: g(), name: 'מקבילים',   target: '' },
      { id: g(), name: 'יד קדמית',  target: '' },
      { id: g(), name: 'יד אחורית', target: '' },
    ],
  } : {
    types: ['A', 'B'],
    A: [
      { id: g(), name: 'Pull-up',  target: '' },
      { id: g(), name: 'Push-up',  target: '' },
      { id: g(), name: 'Squat',    target: '' },
      { id: g(), name: 'Sit-up',   target: '' },
      { id: g(), name: 'Deadlift', target: '' },
    ],
    B: [
      { id: g(), name: 'Bench Press',       target: '' },
      { id: g(), name: 'Hip Flexion',       target: '' },
      { id: g(), name: 'Dips',              target: '' },
      { id: g(), name: 'Biceps Curl',       target: '' },
      { id: g(), name: 'Triceps Extension', target: '' },
    ],
  };

  const DEFAULT_MEASURE_TYPES = isHe ? [
    { id: g(), name: 'משקל',    unit: 'ק"ג' },
    { id: g(), name: 'חזה',     unit: 'ס"מ' },
    { id: g(), name: 'כתפיים',  unit: 'ס"מ' },
    { id: g(), name: 'זרוע',    unit: 'ס"מ' },
    { id: g(), name: 'ירך',     unit: 'ס"מ' },
    { id: g(), name: 'שוק',     unit: 'ס"מ' },
    { id: g(), name: 'מותניים', unit: 'ס"מ' },
    { id: g(), name: 'ישבן',    unit: 'ס"מ' },
  ] : [
    { id: g(), name: 'Weight',    unit: 'kg' },
    { id: g(), name: 'Chest',     unit: 'cm' },
    { id: g(), name: 'Shoulders', unit: 'cm' },
    { id: g(), name: 'Arm',       unit: 'cm' },
    { id: g(), name: 'Thigh',     unit: 'cm' },
    { id: g(), name: 'Calf',      unit: 'cm' },
    { id: g(), name: 'Waist',     unit: 'cm' },
    { id: g(), name: 'Glutes',    unit: 'cm' },
  ];

  // Deliberately NOT CARDIO_MIGRATION_FIELD_MAP (index.html:3448) — that map's
  // wording ("דופק ממוצע"/"הרגשתי עייפות") is what's already live on existing
  // accounts; new-user defaults use different, shorter wording on purpose
  // (spec: docs/superpowers/specs/2026-09-10-new-user-defaults-design.md),
  // so this set deliberately does not participate in cardioFieldDisplayLabel's
  // translate-on-view mechanism — see that spec's "Known limitation".
  const DEFAULT_CARDIO_FIELDS = isHe ? [
    { id: 'date',             label: 'תאריך',  fieldType: 'date',    hidden: true },
    { id: 'distanceKm',       label: 'מרחק',   fieldType: 'number' },
    { id: 'durationMinutes',  label: 'זמן',    fieldType: 'number' },
    { id: 'calories',         label: 'קלוריות', fieldType: 'number' },
    { id: 'avgStridesPerMin', label: 'צעדים',  fieldType: 'number' },
    { id: 'avgHeartRate',     label: 'דופק',   fieldType: 'number' },
    { id: 'feltTired',        label: 'עייפות', fieldType: 'checkbox' },
    { id: 'notes',            label: 'הערות',  fieldType: 'text' },
  ] : [
    { id: 'date',             label: 'Date',       fieldType: 'date',    hidden: true },
    { id: 'distanceKm',       label: 'Distance',   fieldType: 'number' },
    { id: 'durationMinutes',  label: 'Time',       fieldType: 'number' },
    { id: 'calories',         label: 'Calories',   fieldType: 'number' },
    { id: 'avgStridesPerMin', label: 'Steps',      fieldType: 'number' },
    { id: 'avgHeartRate',     label: 'Heart Rate', fieldType: 'number' },
    { id: 'feltTired',        label: 'Tired',      fieldType: 'checkbox' },
    { id: 'notes',            label: 'Notes',      fieldType: 'text' },
  ];
  const cardioTypeName = t('run.default_type');
  const DEFAULT_RUNNING_TEMPLATES = {
    types: [cardioTypeName],
    [cardioTypeName]: DEFAULT_CARDIO_FIELDS,
  };

  await setDoc(doc(db, 'users', uid, 'config', 'templates'),        DEFAULT_TEMPLATES);
  await setDoc(doc(db, 'users', uid, 'config', 'measurementTypes'), { types: DEFAULT_MEASURE_TYPES });
  await setDoc(doc(db, 'users', uid, 'config', 'runningTemplates'), DEFAULT_RUNNING_TEMPLATES);
  await setDoc(doc(db, 'users', uid, 'config', 'profile'),          { displayName: email ? email.split('@')[0] : '' });
}
```

- [ ] **Step 3: Update the `handleAuthSubmit` call site**

Current, at `index.html:2308-2309`:
```js
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await initNewUser(cred.user.uid);
```
Replace with (the local `email` variable from line 2299 is already the right value — no need to read it off `cred.user`):
```js
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await initNewUser(cred.user.uid, email);
```

- [ ] **Step 4: Update the `handleGoogleLogin` call site**

Current, at `index.html:2324-2345`:
```js
async function handleGoogleLogin() {
  try {
    let uid;

    if (window.Capacitor?.isNativePlatform()) {
      // Android app: Chrome Custom Tab (Google allows it, unlike WebView)
      const { FirebaseAuthentication } = window.Capacitor.Plugins;
      const result     = await FirebaseAuthentication.signInWithGoogle();
      const idToken    = result.credential?.idToken;
      const credential = GoogleAuthProvider.credential(idToken);
      const fbResult   = await signInWithCredential(auth, credential);
      uid = fbResult.user.uid;
    } else {
      // Web browser: standard popup flow
      const provider = new GoogleAuthProvider();
      const result   = await signInWithPopup(auth, provider);
      uid = result.user.uid;
    }

    const snap = await getDoc(doc(db, 'users', uid, 'config', 'templates'));
    if (!snap.exists()) await initNewUser(uid);
  } catch (e) {
```
Replace with:
```js
async function handleGoogleLogin() {
  try {
    let uid, userEmail;

    if (window.Capacitor?.isNativePlatform()) {
      // Android app: Chrome Custom Tab (Google allows it, unlike WebView)
      const { FirebaseAuthentication } = window.Capacitor.Plugins;
      const result     = await FirebaseAuthentication.signInWithGoogle();
      const idToken    = result.credential?.idToken;
      const credential = GoogleAuthProvider.credential(idToken);
      const fbResult   = await signInWithCredential(auth, credential);
      uid = fbResult.user.uid;
      userEmail = fbResult.user.email;
    } else {
      // Web browser: standard popup flow
      const provider = new GoogleAuthProvider();
      const result   = await signInWithPopup(auth, provider);
      uid = result.user.uid;
      userEmail = result.user.email;
    }

    const snap = await getDoc(doc(db, 'users', uid, 'config', 'templates'));
    if (!snap.exists()) await initNewUser(uid, userEmail);
  } catch (e) {
```
(Leave everything from the `catch (e) {` line onward untouched — only the signature-in/body-above changes.)

- [ ] **Step 5: Manual verification — Hebrew**

1. In the Playwright browser tool, open a fresh context with no stored app data, browser language set to Hebrew.
2. Register a brand-new disposable account (e.g. `qa-defaults-he-<timestamp>@training-diary.web.app`, a real password).
3. After registration completes and the app loads: open the strength page, confirm workout types A and B exist with exactly the 5 Hebrew exercise names each from the glossary, and confirm no exercise shows a target value.
4. Enable the cardio tab (Settings → הצג עמוד אירובי), open it, confirm one workout type named "אימון" exists with exactly the 7 visible fields (מרחק/זמן/קלוריות/צעדים/דופק/עייפות/הערות) in that wording, and that no date field is shown on the entry form.
5. Open Measurements → עריכת סוגי מדידות, confirm all 8 Hebrew measurement types exist with the correct units (ק"ג for weight, ס"מ for the rest).
6. Open Settings, confirm "שם תצוגה" shows the part of the registration email before `@`.
7. Confirm `localStorage.getItem('lang') === 'he'` (Task 3's fix).
8. While in Settings on this same fresh account, also confirm the three already-correct defaults from the spec: theme selector shows "אוטומטי", "צליל בסוף טיימר" toggle is on, and the "הצג עמוד אירובי" toggle/row is visible and usable (not hidden/disabled) — these need no code change but are part of this feature's full scope and this is a free opportunity to confirm them on a genuinely fresh account.

- [ ] **Step 6: Manual verification — English**

Repeat Step 5 with a fresh context, browser language `en-US`, a new disposable account — confirm every item in English per the glossary (Pull-up/Push-up/Squat/Sit-up/Deadlift for A; Bench Press/Hip Flexion/Dips/Biceps Curl/Triceps Extension for B; Distance/Time/Calories/Steps/Heart Rate/Tired/Notes for cardio, type name "Workout"; Weight(kg)/Chest(cm)/Shoulders(cm)/Arm(cm)/Thigh(cm)/Calf(cm)/Waist(cm)/Glutes(cm) for measurements), display name = email prefix, `localStorage.getItem('lang') === 'en'`.

- [ ] **Step 7: Regression check**

Run the existing settings/auth-related Playwright specs against the pre-existing (already-provisioned) test account to confirm nothing broke for existing users:
```bash
npx playwright test tests/auth.spec.ts tests/settings.spec.ts
```
Expected: all passing, same as before this task (this task doesn't touch the login path itself, only what happens once on brand-new registration).

- [ ] **Step 8: Update docs**

- `docs/product/01-auth-onboarding.md`: rewrite the "יצירת משתמש חדש (Onboarding)" section (currently lines ~47-54) to describe all 4 docs now written (templates, measurementTypes, runningTemplates, profile), the bilingual selection based on `currentLang`, and **remove** the now-stale "הערה מוצרית" caveat about hardcoded-Hebrew defaults (line 54) — replace it with a note about the accepted no-live-retranslation limitation instead (per the spec).
- `docs/product/02-workout-strength.md`: update wherever it currently describes the default template content to the new 5-exercise/no-target A+B lists (bilingual).
- `docs/product/06-measurements.md`: add the English measurement-type defaults alongside the existing Hebrew ones.
- `docs/product/07-running-cardio.md`: document that new users now get one default cardio type ("אימון"/"Workout") with the 7 visible + 1 hidden fields, instead of zero cardio types.

- [ ] **Step 9: Commit**

```bash
git add public/index.html docs/product/01-auth-onboarding.md docs/product/02-workout-strength.md docs/product/06-measurements.md docs/product/07-running-cardio.md
git commit -m "feat(onboarding): bilingual strength/cardio/measurement defaults + display name for new users"
```

---

## Task 5: Final wrap-up verification and summary

**Files:** none modified — verification and reporting only.

- [ ] **Step 1: Full regression pass**

```bash
npx playwright test
```
Expected: same pass/fail state as before this plan started (confirm via `git stash`+re-run if any pre-existing failures are suspected, then restore). This plan should introduce zero regressions since every touched function is either net-new behavior (initNewUser's extra docs, degrade gracefully per the spec's finding B) or additive to functions with no prior test coverage.

- [ ] **Step 2: Re-read every task's manual verification results**

Confirm each of Tasks 1-4's manual verification steps was actually performed and passed (not skipped) — re-run any that weren't captured during that task.

- [ ] **Step 3: Write the feature summary for the user**

Summarize in chat (not a new file): what changed, which docs were updated, the two bugfixes, and explicitly call out the one open design tradeoff already accepted (no live-retranslation of defaults on language switch) so it's not rediscovered as a surprise later.

- [ ] **Step 4: Final commit if any doc fixes were needed in Step 2**

```bash
git add -A
git commit -m "docs: final verification pass for new-user-defaults feature"
```
(Only if Step 2 found something to fix — otherwise skip, nothing to commit.)
