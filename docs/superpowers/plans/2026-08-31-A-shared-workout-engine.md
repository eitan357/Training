# Shared Workout Engine — Extraction & Strength Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the strength page's draft-autosave, tab-switching, copy-last-workout/clear-form, submit, template-editor, and history behaviors into domain-parameterized generic functions (a `WORKOUT_DOMAINS` registry, following the exact pattern the codebase already uses for `_toggleSelect`/`toggleSessionSelect`/`toggleMeasureSelect`), with **zero user-visible behavior change** for strength. This is Phase A of the cardio redesign — it must land, fully regression-tested, before Phase B (`2026-08-31-B-cardio-page-rebuild.md`) adds the cardio domain.

**Architecture:** Every task follows the same shape: read the current strength-only implementation (cited below with exact line numbers), split it into (1) a generic function taking a `domain` string/object and (2) the strength-specific pieces registered in a new `WORKOUT_DOMAINS.strength` object, then rewire strength's existing call sites to pass `'strength'` explicitly. No new UI, no new Firestore fields for strength. Draft storage keys change shape (namespaced by domain) — this is the one intentional behavior change, called out in Task 1.

**Tech Stack:** Vanilla JS (ES modules, no bundler), Firebase Auth/Firestore v12 (CDN), Playwright for E2E tests.

**Spec:** `docs/superpowers/specs/2026-08-31-cardio-page-redesign-design.md` §4 ("Shared engine").

## Global Constraints

- All JS changes in `public/index.html` only; test changes in `tests/*.spec.ts`. No new files this phase.
- **Zero behavior change for strength**, with one explicit, user-requested exception: Task 7 replaces the 2-type hardcoded color CSS (`.dot-a`/`.dot-b`) with a 6-color indexed palette shared by both domains, fixing an existing bug where a 3rd+ strength type renders with no color at all. A's and B's colors are pinned to stay pixel-identical; only a 3rd+ type's rendering visibly changes (from broken to correct). Every other task ends with `npx playwright test` (the full suite) passing unchanged — this is the regression canary called out in the spec §4.
- Function names introduced here (`WORKOUT_DOMAINS`, `_draftKey`, `_draftSerialize`, etc.) are **consumed by Phase B** — do not rename after this plan ships without updating `2026-08-31-B-cardio-page-rebuild.md`.
- `escHtml()` wraps any user-controlled string in `innerHTML` — standing project rule, unaffected by this refactor (no new user-controlled strings introduced).
- Commit after every task.

---

## Task 1: Domain-Namespace Draft Storage Keys

**Files:**
- Modify: `public/index.html:2444-2446` (`_draftKey`), and its 6 call sites: `_draftSaveLocal` (2483), `_draftLoadLocal` (2492), `_draftSaveFirestore` (2497-2502), `_draftDelete` (2506-2510), `checkAndAutoSavePreviousDrafts` (2656, 2663, 2698-2699), `clearWorkoutForm` (2780-2781).
- Test: `tests/workout.spec.ts`

**Interfaces:**
- Produces: `_draftKey(domain, type)` → `draft_{uid}_{domain}_{type}`; Firestore path becomes `users/{uid}/drafts/{domain}_{type}` (composite doc ID, not a subcollection change — `drafts` collection stays flat).
- Consumes: nothing new.

- [ ] **Step 1: Add a characterization test for the current draft key format, so the "before" behavior is pinned**

Add to `tests/workout.spec.ts`, inside the existing draft-related `test.describe` block:

```ts
  test('draft is stored under a domain-namespaced localStorage key', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.locator('#exerciseList .ex-weight').first().fill('42');
    await page.waitForTimeout(400); // > 300ms debounce
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('draft_')));
    expect(keys.some(k => k.includes('_strength_'))).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/workout.spec.ts -g "domain-namespaced"`
Expected: FAIL — current key format is `draft_{uid}_{type}`, contains no `_strength_` segment.

- [ ] **Step 3: Generalize `_draftKey`**

Find (`public/index.html:2444-2446`):

```js
function _draftKey(type) {
  return `draft_${currentUser?.uid}_${type}`;
}
```

replace with:

```js
// `domain` distinguishes strength vs. cardio (Phase B) so a strength type
// and a cardio type sharing the same name never collide in storage.
function _draftKey(domain, type) {
  return `draft_${currentUser?.uid}_${domain}_${type}`;
}
```

- [ ] **Step 4: Update every call site to pass `'strength'` explicitly**

In `_draftSaveLocal` (`2483-2490`), `_draftLoadLocal` (`2492-2495`), `_draftDelete` (`2506-2511`): change `_draftKey(type)` → `_draftKey('strength', type)`.

In `_draftSaveFirestore` (`2497-2504`), find:

```js
async function _draftSaveFirestore(type) {
  if (!currentUser) return;
  const local = _draftLoadLocal(type);
  if (!local) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'drafts', type), local);
  } catch(e) { /* silent — localStorage is the fallback */ }
}
```

replace with:

```js
async function _draftSaveFirestore(type) {
  if (!currentUser) return;
  const local = _draftLoadLocal(type);
  if (!local) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + type), local);
  } catch(e) { /* silent — localStorage is the fallback */ }
}
```

In `_draftDelete` (`2506-2511`), find:

```js
async function _draftDelete(type) {
  if (!currentUser) return;
  localStorage.removeItem(_draftKey(type));
  delete _draftDirty[type];
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', type)); } catch(e) {}
}
```

replace with:

```js
async function _draftDelete(type) {
  if (!currentUser) return;
  localStorage.removeItem(_draftKey('strength', type));
  delete _draftDirty[type];
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + type)); } catch(e) {}
}
```

In `checkAndAutoSavePreviousDrafts` (`2652-2704`), find:

```js
  const prefix = `draft_${currentUser.uid}_`;
```

replace with:

```js
  const prefix = `draft_${currentUser.uid}_strength_`;
```

and find:

```js
    const type  = key.slice(prefix.length);
```

(unchanged — `type` still correctly extracts everything after the new, longer prefix). Find the Firestore scan further down:

```js
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'drafts'));
    const toProcess = [];
    snap.forEach(d => toProcess.push({ type: d.id, ...d.data() }));
```

replace with:

```js
    const snap = await getDocs(collection(db, 'users', currentUser.uid, 'drafts'));
    const toProcess = [];
    snap.forEach(d => { if (d.id.startsWith('strength_')) toProcess.push({ type: d.id.slice('strength_'.length), ...d.data() }); });
```

and the two lines further down that use `draft.type` as a raw Firestore doc ID:

```js
      await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', draft.type));
      localStorage.removeItem(_draftKey(draft.type));
```

replace with:

```js
      await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + draft.type));
      localStorage.removeItem(_draftKey('strength', draft.type));
```

Finally, in `clearWorkoutForm` (`2765-2783`), find:

```js
  localStorage.removeItem(_draftKey(selectedType));
  if (currentUser) deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', selectedType)).catch(() => {});
```

replace with:

```js
  localStorage.removeItem(_draftKey('strength', selectedType));
  if (currentUser) deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + selectedType)).catch(() => {});
```

- [ ] **Step 5: Run the new test, verify it passes**

Run: `npx playwright test tests/workout.spec.ts -g "domain-namespaced"`
Expected: PASS

- [ ] **Step 6: Run the full existing suite to confirm no regression**

Run: `npx playwright test`
Expected: all pass. This is a breaking key-format change for any *currently open* strength draft — acceptable one-time cost on deploy day (old-format drafts under `draft_{uid}_{type}` simply become unreadable; a new draft starts clean). Note this in the deploy checklist, no code handles it.

- [ ] **Step 7: Commit**

```bash
git add public/index.html tests/workout.spec.ts
git commit -m "refactor(draft): namespace draft storage keys by domain (strength/cardio)"
```

---

## Task 2: Extract Domain-Specific Draft Serialize/Apply/Qualifies Behind a Registry

**Files:**
- Modify: `public/index.html:2448-2481` (`_draftSerialize`, `_draftHasBannerData`, `_draftHasFormData`, `_draftQualifies`, `_draftApplyToForm`)
- Test: `tests/workout.spec.ts`

**Interfaces:**
- Produces: `WORKOUT_DOMAINS` (object, `{strength: {serialize, applyToForm, hasFormData, qualifies}}` — Phase B adds a `cardio` key), generic `_draftSerialize(domain)`, `_draftApplyToForm(domain, draft)`, `_draftHasFormData(domain)`, `_draftQualifies(domain, draft)`.
- Consumes: `_draftKey` from Task 1.

- [ ] **Step 1: Add a characterization test pinning current serialize/apply behavior**

Add to `tests/workout.spec.ts`:

```ts
  test('draft round-trips exercise fields through localStorage', async ({ page }) => {
    await page.locator('#nav-main').click();
    const card = page.locator('#exerciseList .card').first();
    await card.locator('.ex-weight').fill('55');
    await card.locator('.ex-reps').fill('8,8,8');
    await page.waitForTimeout(400);
    await page.reload();
    await page.locator('#nav-main').click();
    // same-session reload restores silently (no modal) per docs/product/02
    await expect(page.locator('#exerciseList .card').first().locator('.ex-weight')).toHaveValue('55');
    await expect(page.locator('#exerciseList .card').first().locator('.ex-reps')).toHaveValue('8,8,8');
  });
```

- [ ] **Step 2: Run it to verify it currently passes (characterization, not TDD-red — pins existing behavior before refactor)**

Run: `npx playwright test tests/workout.spec.ts -g "round-trips"`
Expected: PASS

- [ ] **Step 3: Extract strength's serialize/apply/qualifies into named strength-only functions, register them**

Find (`public/index.html:2448-2464`):

```js
function _draftSerialize() {
  const exercises = [];
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    exercises.push({
      name:   card.querySelector('.ex-name-text')?.innerText?.trim()   || '',
      target: card.querySelector('.ex-target-text')?.innerText?.trim() || '',
      weight: card.querySelector('.ex-weight').value,
      sets:   card.querySelector('.ex-sets').value,
      reps:   card.querySelector('.ex-reps').value,
      notes:  card.querySelector('.ex-notes').value,
    });
  });
  return {
    workoutName: document.getElementById('sessionNameInput')?.value || '',
    exercises,
  };
}

function _draftQualifies(draft) {
  return !!(draft.workoutName?.trim()) ||
    (draft.exercises || []).some(e => e.weight || e.sets || e.reps || e.notes);
}

function _draftHasBannerData(draft) {
  const hasName = !!(draft.workoutName?.trim());
  const hasEx   = (draft.exercises || []).some(e => e.weight || e.sets || e.reps || e.notes);
  return hasName || hasEx;
}

function _draftHasFormData() {
  if (document.getElementById('sessionNameInput')?.value.trim()) return true;
  return [...document.querySelectorAll('#exerciseList .ex-weight, #exerciseList .ex-sets, #exerciseList .ex-reps, #exerciseList .ex-notes')]
    .some(f => f.value.trim());
}
```

replace with:

```js
// ─── WORKOUT DOMAIN REGISTRY ───────────────────────────────────
// Each domain supplies its own serialize/applyToForm/hasFormData/qualifies
// — everything else in the draft/tab/submit/editor/history engine below is
// generic and dispatches through this registry via a `domain` string key.
// Phase B (cardio) adds a 'cardio' entry with the same four functions.
function _strengthDraftSerialize() {
  const exercises = [];
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    exercises.push({
      name:   card.querySelector('.ex-name-text')?.innerText?.trim()   || '',
      target: card.querySelector('.ex-target-text')?.innerText?.trim() || '',
      weight: card.querySelector('.ex-weight').value,
      sets:   card.querySelector('.ex-sets').value,
      reps:   card.querySelector('.ex-reps').value,
      notes:  card.querySelector('.ex-notes').value,
    });
  });
  return {
    workoutName: document.getElementById('sessionNameInput')?.value || '',
    exercises,
  };
}

function _strengthDraftQualifies(draft) {
  return !!(draft.workoutName?.trim()) ||
    (draft.exercises || []).some(e => e.weight || e.sets || e.reps || e.notes);
}

function _strengthDraftApplyToForm(draft) {
  const nameInput = document.getElementById('sessionNameInput');
  if (nameInput) nameInput.value = draft.workoutName || '';
  document.querySelectorAll('#exerciseList .card').forEach(card => {
    const name = card.querySelector('.ex-name-text')?.innerText?.trim();
    const ex   = (draft.exercises || []).find(e => e.name === name);
    if (!ex) return;
    if (ex.weight) card.querySelector('.ex-weight').value = ex.weight;
    if (ex.sets)   card.querySelector('.ex-sets').value   = ex.sets;
    if (ex.reps)   card.querySelector('.ex-reps').value   = ex.reps;
    if (ex.notes)  card.querySelector('.ex-notes').value  = ex.notes;
  });
}

function _strengthDraftHasFormData() {
  if (document.getElementById('sessionNameInput')?.value.trim()) return true;
  return [...document.querySelectorAll('#exerciseList .ex-weight, #exerciseList .ex-sets, #exerciseList .ex-reps, #exerciseList .ex-notes')]
    .some(f => f.value.trim());
}

const WORKOUT_DOMAINS = {
  strength: {
    serialize:    _strengthDraftSerialize,
    applyToForm:  _strengthDraftApplyToForm,
    hasFormData:  _strengthDraftHasFormData,
    qualifies:    _strengthDraftQualifies,
  },
};

// Generic dispatchers — every caller below (draft engine, tab state,
// copy-last-workout) goes through these, never the per-domain functions
// directly, so Phase B only has to add a registry entry, not touch callers.
function _draftSerialize(domain)          { return WORKOUT_DOMAINS[domain].serialize(); }
function _draftApplyToForm(domain, draft) { return WORKOUT_DOMAINS[domain].applyToForm(draft); }
function _draftHasFormData(domain)        { return WORKOUT_DOMAINS[domain].hasFormData(); }
function _draftQualifies(domain, draft)   { return WORKOUT_DOMAINS[domain].qualifies(draft); }

// "Banner data" (does this draft have enough content to show the resume
// modal for) happens to be identical to qualifies() for strength today —
// kept as its own name because it's a distinct *concept* (Phase B's cardio
// domain could in principle diverge them), not because the logic differs.
function _draftHasBannerData(domain, draft) { return _draftQualifies(domain, draft); }
```

- [ ] **Step 4: Update every call site of the four renamed functions**

Run: `grep -n "_draftSerialize()\|_draftHasBannerData(\|_draftHasFormData()\|_draftQualifies(" public/index.html`

For each match outside the block just replaced, add `'strength'` (or `'strength', ` before an existing argument) as the first argument:
- `_draftSerialize()` → `_draftSerialize('strength')` (call sites: `_tabSnapshotCurrent`, `_draftSaveLocal`'s use inside `..._draftSerialize()`, `_draftModalResume`, `_tabRestoreOrDraft`'s same-session branch, `copyLastWorkout`).
- `_draftHasBannerData(draft)` → `_draftHasBannerData('strength', draft)` (call sites: `_tabRestoreOrDraft`, `copyLastWorkout`).
- `_draftHasFormData()` → `_draftHasFormData('strength')` (call site: `selectType`).
- `_draftQualifies(draft)` → `_draftQualifies('strength', draft)` (call site: `checkAndAutoSavePreviousDrafts`).

Also update `_draftApplyToForm(draft)` call sites (`_draftModalResume`, `_tabRestoreOrDraft`'s same-session branch, `_tabRestoreOrDraft`'s `_tabState[type]` branch) to `_draftApplyToForm('strength', draft)`.

- [ ] **Step 5: Run the characterization test and the full suite**

Run: `npx playwright test`
Expected: all pass, unchanged.

- [ ] **Step 6: Commit**

```bash
git add public/index.html tests/workout.spec.ts
git commit -m "refactor(draft): extract strength serialize/apply/qualifies into WORKOUT_DOMAINS registry"
```

---

## Task 3: Generalize the Draft Timers, Listeners, and Modal

**Files:**
- Modify: `public/index.html:2528-2550` (`_draftOnInput`, `_draftAttachListeners`, `_draftStartFirestoreTimer`), `:2730-2762` (`_draftShowModal`, `_draftModalResume`, `_draftModalDiscard`)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS`, `_draftSaveLocal`/`_draftSaveFirestore`/`_draftLoadLocal`/`_draftDelete` (Task 1, still strength-only signatures — generalized in this task), `_draftApplyToForm`/`_draftHasBannerData` (Task 2).
- Produces: `_draftOnInput(domain)`, `_draftAttachListeners(domain, listId, nameInputId)`, `_draftStartFirestoreTimer(domain)`, `_draftShowModal(domain, type, draft)`, `_draftModalResume()`/`_draftModalDiscard()` (unchanged signature — they read the domain off `_draftModalType`, see Step 3).

- [ ] **Step 1: Generalize `_draftSaveLocal`/`_draftLoadLocal`/`_draftSaveFirestore`/`_draftDelete` to take `domain`**

These currently call `_draftKey(type)` (already fixed to `_draftKey('strength', type)` in Task 1 verbatim, but hardcoded — now make `domain` a real parameter). Find (`public/index.html:2483-2511`, post-Task-1 state):

```js
function _draftSaveLocal(type) {
  if (!currentUser) return;
  const key      = _draftKey('strength', type);
  const existing = JSON.parse(localStorage.getItem(key) || 'null');
  const now      = new Date().toISOString();
  const data     = { ..._draftSerialize('strength'), createdAt: existing?.createdAt || now, lastModified: now };
  localStorage.setItem(key, JSON.stringify(data));
}

function _draftLoadLocal(type) {
  if (!currentUser) return null;
  try { return JSON.parse(localStorage.getItem(_draftKey('strength', type)) || 'null'); } catch(e) { return null; }
}

async function _draftSaveFirestore(type) {
  if (!currentUser) return;
  const local = _draftLoadLocal(type);
  if (!local) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + type), local);
  } catch(e) { /* silent — localStorage is the fallback */ }
}

async function _draftDelete(type) {
  if (!currentUser) return;
  localStorage.removeItem(_draftKey('strength', type));
  delete _draftDirty[type];
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + type)); } catch(e) {}
}
```

replace with:

```js
function _draftSaveLocal(domain, type) {
  if (!currentUser) return;
  const key      = _draftKey(domain, type);
  const existing = JSON.parse(localStorage.getItem(key) || 'null');
  const now      = new Date().toISOString();
  const data     = { ..._draftSerialize(domain), createdAt: existing?.createdAt || now, lastModified: now };
  localStorage.setItem(key, JSON.stringify(data));
}

function _draftLoadLocal(domain, type) {
  if (!currentUser) return null;
  try { return JSON.parse(localStorage.getItem(_draftKey(domain, type)) || 'null'); } catch(e) { return null; }
}

async function _draftSaveFirestore(domain, type) {
  if (!currentUser) return;
  const local = _draftLoadLocal(domain, type);
  if (!local) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'drafts', domain + '_' + type), local);
  } catch(e) { /* silent — localStorage is the fallback */ }
}

async function _draftDelete(domain, type) {
  if (!currentUser) return;
  localStorage.removeItem(_draftKey(domain, type));
  delete _draftDirty[domain + ':' + type];
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', domain + '_' + type)); } catch(e) {}
}
```

Note `_draftDirty`'s key changes from bare `type` to `${domain}:${type}` here — Step 2 updates every reader/writer of `_draftDirty` to match, in the same commit, so it's never in a half-migrated state.

- [ ] **Step 2: Generalize `_draftOnInput`/`_draftAttachListeners`/`_draftStartFirestoreTimer`, update `_draftDirty`/`_draftSaveDebounce` keys**

Find (`public/index.html:2528-2550`):

```js
function _draftOnInput() {
  if (!selectedType) return;
  clearTimeout(_draftSaveDebounce[selectedType]);
  _draftSaveDebounce[selectedType] = setTimeout(() => {
    _draftSaveLocal(selectedType);
    _draftDirty[selectedType] = true;
  }, 300);
}

function _draftAttachListeners() {
  document.getElementById('exerciseList')?.addEventListener('input', _draftOnInput);
  document.getElementById('sessionNameInput')?.addEventListener('input', _draftOnInput);
}

function _draftStartFirestoreTimer() {
  clearInterval(_draftFirestoreTimer);
  _draftFirestoreTimer = setInterval(async () => {
    if (!selectedType || !_draftDirty[selectedType]) return;
    _draftSaveLocal(selectedType);
    await _draftSaveFirestore(selectedType);
    _draftDirty[selectedType] = false;
  }, 30000);
}
```

replace with:

```js
function _draftOnInput(domain) {
  const type = domain === 'strength' ? selectedType : _cardioSelectedType; // _cardioSelectedType added in Phase B; undefined here is fine, strength is the only live caller until then
  if (!type) return;
  const dk = domain + ':' + type;
  clearTimeout(_draftSaveDebounce[dk]);
  _draftSaveDebounce[dk] = setTimeout(() => {
    _draftSaveLocal(domain, type);
    _draftDirty[dk] = true;
  }, 300);
}

function _draftAttachListeners(domain, listId, nameInputId) {
  document.getElementById(listId)?.addEventListener('input', () => _draftOnInput(domain));
  document.getElementById(nameInputId)?.addEventListener('input', () => _draftOnInput(domain));
}

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

`_draftFirestoreTimer` changes from a single `let` to a per-domain map — find its declaration (`public/index.html:1987`, `let _draftFirestoreTimer = null;`) and replace with `let _draftFirestoreTimer = {};`.

- [ ] **Step 3: Update the two call sites in `initApp`**

Find (`public/index.html:2343-2344`, inside `initApp`):

```js
  _draftAttachListeners();
  _draftStartFirestoreTimer();
```

replace with:

```js
  _draftAttachListeners('strength', 'exerciseList', 'sessionNameInput');
  _draftStartFirestoreTimer('strength', () => selectedType);
```

Also find the second `_draftAttachListeners()` call inside `clearWorkoutForm` (`public/index.html:2777`) and replace with `_draftAttachListeners('strength', 'exerciseList', 'sessionNameInput');`.

- [ ] **Step 4: Generalize the draft modal**

Find (`public/index.html:2730-2762`):

```js
function _draftShowModal(type, draft) {
  if (_draftModalType) return;
  _draftModalType = type;
  ...
}

function _draftModalResume() {
  const type  = _draftModalType;
  document.getElementById('draftModal').style.display = 'none';
  _draftModalType = null;
  const draft = _draftLoadLocal(type);
  if (!draft) { toast(t('draft.discard'), 'error'); return; }
  _draftApplyToForm('strength', draft);
  _tabState[type] = _draftSerialize('strength');
}

async function _draftModalDiscard() {
  const type = _draftModalType;
  document.getElementById('draftModal').style.display = 'none';
  _draftModalType = null;
  await _draftDelete(type);
}
```

replace with (only the signatures and the two calls that now need a domain change — the modal's DOM/text content is untouched):

```js
function _draftShowModal(domain, type, draft) {
  if (_draftModalType) return;
  _draftModalType = type;
  _draftModalDomain = domain;
  ...
}

function _draftModalResume() {
  const domain = _draftModalDomain, type = _draftModalType;
  document.getElementById('draftModal').style.display = 'none';
  _draftModalType = null;
  const draft = _draftLoadLocal(domain, type);
  if (!draft) { toast(t('draft.discard'), 'error'); return; }
  _draftApplyToForm(domain, draft);
  _tabState[domain + ':' + type] = _draftSerialize(domain);
}

async function _draftModalDiscard() {
  const domain = _draftModalDomain, type = _draftModalType;
  document.getElementById('draftModal').style.display = 'none';
  _draftModalType = null;
  await _draftDelete(domain, type);
}
```

(`...` marks the unchanged middle of `_draftShowModal`'s body — the exCount/timeStr/nameStr/modal-fill lines stay exactly as they are.) Add `let _draftModalDomain = null;` next to the existing `let _draftModalType = null;` declaration (`public/index.html:1989`).

- [ ] **Step 5: Run the full suite**

Run: `npx playwright test`
Expected: all pass, unchanged (Task 4 rewires `_tabSnapshotCurrent`/`_tabRestoreOrDraft`/`selectType`/`clearWorkoutForm`/`copyLastWorkout` call sites that reference these functions — until that task lands, this task's code will not exercise correctly end-to-end in the browser; run the suite anyway as a syntax/parse sanity check, and treat any *test-runner-level* failure here as a real bug, not an expected gap).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "refactor(draft): generalize draft timers/listeners/modal by domain"
```

---

## Task 4: Generalize Tab Snapshot/Restore, Rewire `selectType`

**Files:**
- Modify: `public/index.html:2707-2728` (`_tabSnapshotCurrent`, `_tabRestoreOrDraft`), `:2785-2822ish` (`selectType`)

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: `_tabSnapshotCurrent(domain, type)`, `_tabRestoreOrDraft(domain, type)`. `selectType(type)` keeps its exact existing signature (Playwright calls `window.selectType` in `workout.spec.ts` — do not change it) and internally calls the generic functions with `'strength'` hardcoded.

- [ ] **Step 1: Generalize `_tabSnapshotCurrent`/`_tabRestoreOrDraft`**

Find (`public/index.html:2707-2728`):

```js
function _tabSnapshotCurrent() {
  if (!selectedType) return;
  _tabState[selectedType] = _draftSerialize();
}

function _tabRestoreOrDraft(type) {
  if (_tabState[type]) {
    _draftApplyToForm(_tabState[type]);
    return;
  }
  const draft = _draftLoadLocal(type);
  if (!draft || !_draftHasBannerData(draft)) return;
  const today = new Date().toISOString().slice(0, 10);
  if ((draft.createdAt || '').slice(0, 10) !== today) return;
  if (_isNewSession) {
    _draftShowModal(type, draft);
  } else {
    // Refresh within same session — restore silently
    _draftApplyToForm(draft);
    _tabState[type] = _draftSerialize();
  }
}
```

replace with:

```js
function _tabSnapshotCurrent(domain, type) {
  if (!type) return;
  _tabState[domain + ':' + type] = _draftSerialize(domain);
}

function _tabRestoreOrDraft(domain, type) {
  const dk = domain + ':' + type;
  if (_tabState[dk]) {
    _draftApplyToForm(domain, _tabState[dk]);
    return;
  }
  const draft = _draftLoadLocal(domain, type);
  if (!draft || !_draftHasBannerData(domain, draft)) return;
  const today = new Date().toISOString().slice(0, 10);
  if ((draft.createdAt || '').slice(0, 10) !== today) return;
  if (_isNewSession) {
    _draftShowModal(domain, type, draft);
  } else {
    // Refresh within same session — restore silently
    _draftApplyToForm(domain, draft);
    _tabState[dk] = _draftSerialize(domain);
  }
}
```

- [ ] **Step 2: Rewire `selectType` to pass `'strength'` explicitly**

Read the current full body of `selectType` at `public/index.html:2785` onward (it continues past line 2822 shown earlier in this plan's research — read the live file before editing, do not assume line numbers past what was cited) and replace its two calls:

```js
  _tabSnapshotCurrent();
```
→
```js
  _tabSnapshotCurrent('strength', selectedType);
```

and

```js
  if (selectedType && _draftHasFormData()) {
    _draftSaveLocal(selectedType);
    _draftDirty[selectedType] = true;
  }
```
→
```js
  if (selectedType && _draftHasFormData('strength')) {
    _draftSaveLocal('strength', selectedType);
    _draftDirty['strength:' + selectedType] = true;
  }
```

Then find (later in the same function, after `selectedType = type;`) the call `_tabRestoreOrDraft(type)` and replace with `_tabRestoreOrDraft('strength', type)`.

- [ ] **Step 3: Run the full suite**

Run: `npx playwright test`
Expected: all pass, unchanged. This task makes the draft engine fully live again end-to-end for strength (Tasks 1-3 were interim states) — this is the first point where a manual smoke test matters too: log in, type into an exercise, switch tabs A→B→A, confirm the value round-trips.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "refactor(draft): generalize tab snapshot/restore, rewire selectType to the domain registry"
```

---

## Task 5: Generalize `copyLastWorkout` / `clearWorkoutForm`

**Files:**
- Modify: `public/index.html:2765-2783` (`clearWorkoutForm`), `:3930-3956` (`copyLastWorkout`)

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: no new exported names — both functions **keep their existing names and signatures** (onclick attributes reference them directly, e.g. `tests/workout.spec.ts` and inline `onclick="clearWorkoutForm()"`/`onclick="copyLastWorkout()"`); only their internal calls into the draft engine change to pass `'strength'`.

- [ ] **Step 1: Update `clearWorkoutForm`'s draft calls**

Find (`public/index.html:2765-2783`, post-Task-1/3 state):

```js
  _draftAttachListeners();
  delete _tabState[selectedType];
  delete _draftDirty[selectedType];
  localStorage.removeItem(_draftKey('strength', selectedType));
  if (currentUser) deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + selectedType)).catch(() => {});
```

replace with:

```js
  _draftAttachListeners('strength', 'exerciseList', 'sessionNameInput');
  delete _tabState['strength:' + selectedType];
  delete _draftDirty['strength:' + selectedType];
  localStorage.removeItem(_draftKey('strength', selectedType));
  if (currentUser) deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', 'strength_' + selectedType)).catch(() => {});
```

- [ ] **Step 2: Update `copyLastWorkout`'s draft calls**

Find (`public/index.html:3930-3956`):

```js
function copyLastWorkout() {
  const last = lastWorkouts[selectedType];
  if (!last) return;
  const existingDraft = _draftLoadLocal(selectedType);
  if (existingDraft && _draftHasBannerData(existingDraft)) {
    if (!confirm(t('draft.overwrite_confirm'))) return;
  }
```

replace with:

```js
function copyLastWorkout() {
  const last = lastWorkouts[selectedType];
  if (!last) return;
  const existingDraft = _draftLoadLocal('strength', selectedType);
  if (existingDraft && _draftHasBannerData('strength', existingDraft)) {
    if (!confirm(t('draft.overwrite_confirm'))) return;
  }
```

and near the end of the same function, find:

```js
  toast(`✓ ${copied} ${t('copy.success')} ${t('copy.from')}${sessionDisplayDate(last)}`, 'success');
  if (copied > 0) _draftOnInput();
}
```

replace with:

```js
  toast(`✓ ${copied} ${t('copy.success')} ${t('copy.from')}${sessionDisplayDate(last)}`, 'success');
  if (copied > 0) _draftOnInput('strength');
}
```

- [ ] **Step 3: Run the full suite, manual smoke test**

Run: `npx playwright test`
Expected: all pass. Manual: click "העתקת אימון אחרון" and "נקה טופס" once each in a browser, confirm identical behavior to before this plan (toast text, field values, draft cleared).

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "refactor(draft): route copyLastWorkout/clearWorkoutForm through the domain-aware draft engine"
```

---

## Task 6: Generalize the Template-Editor Shell

**Files:**
- Modify: `public/index.html:3358-3501` (`renderEditTabs`, `renderEditAll`, `renderEditList`, `switchEditTab`, `addEditExercise`, `removeEditEx`, `collectEdits`, `confirmAddType`, `removeWorkoutType`, `saveTemplates`)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS` (Task 2) — extended in this task with `templatesDocPath`, `typesArrayKey`, `renderItemRow`, `collectItemFromRow`, `newItem` per domain.
- Produces: registry additions consumed by Phase B's cardio template editor (`2026-08-31-B-cardio-page-rebuild.md` Task on the editor).

- [ ] **Step 1: Extend `WORKOUT_DOMAINS.strength` with editor-shell config**

Find the `WORKOUT_DOMAINS` object from Task 2 and add these keys to the `strength` entry:

```js
const WORKOUT_DOMAINS = {
  strength: {
    serialize:    _strengthDraftSerialize,
    applyToForm:  _strengthDraftApplyToForm,
    hasFormData:  _strengthDraftHasFormData,
    qualifies:    _strengthDraftQualifies,
    templatesDoc: ['config', 'templates'],           // doc(db,'users',uid,...templatesDoc)
    editListContainerId: 'editListContainer',
    editTabsId:           'editTabs',
    typeRowId:             'typeRow',
    filterRowId:           'filterRow',
    newItem: () => ({ name: '', targetWeight: '', targetSets: '', targetReps: '', id: '' }),
    renderItemRow: (ex, idx) => `
      <span class="drag-handle">⠿</span>
      <div class="edit-fields">
        <input class="ex-name-input" value="${escHtml(ex.name)}" placeholder="${t('edit.ex_name_ph')}">
        <div class="target-fields">
          <input class="target-field-input target-weight-input" value="${escHtml(ex.targetWeight || '')}" placeholder="${t('col.weight')}">
          <input class="target-field-input target-sets-input"   value="${escHtml(ex.targetSets   || '')}" placeholder="${t('col.sets')}">
          <input class="target-field-input target-reps-input"   value="${escHtml(ex.targetReps   || '')}" placeholder="${t('col.reps')}">
        </div>
      </div>
      <button class="edit-remove" onclick="removeEditEx(${idx})">✕</button>`,
    collectItemFromRow: c => ({
      name:          c.querySelector('.ex-name-input').value,
      targetWeight:  c.querySelector('.target-weight-input')?.value || '',
      targetSets:    c.querySelector('.target-sets-input')?.value   || '',
      targetReps:    c.querySelector('.target-reps-input')?.value   || '',
      id:            c.dataset.id           || '',
      _legacyTarget: c.dataset.legacyTarget || '',
    }),
    buildSaveDoc: (types, templates) => {
      const templateData = { types };
      types.forEach(wtype => {
        templateData[wtype] = (templates[wtype] || [])
          .filter(ex => ex.name.trim())
          .map(ex => {
            const hasNew = (ex.targetWeight || '').trim() || (ex.targetSets || '').trim() || (ex.targetReps || '').trim();
            const r = { id: ex.id || genId(), name: ex.name.trim(), targetWeight: (ex.targetWeight || '').trim(), targetSets: (ex.targetSets || '').trim(), targetReps: (ex.targetReps || '').trim() };
            if (!hasNew && ex._legacyTarget) r.target = ex._legacyTarget;
            return r;
          });
      });
      return templateData;
    },
    isEmptyItem: ex => !ex.name.trim(),
  },
};
```

This mirrors exactly what `saveTemplates`/`collectEdits`/`renderEditList` already do — nothing here changes strength's saved document shape.

- [ ] **Step 2: Generalize `renderEditList`, `addEditExercise`, `removeEditEx`, `collectEdits`**

Find (`public/index.html:3383-3441`):

```js
function renderEditList(type) {
  const el    = document.getElementById('editListContainer');
  const items = editTemplates[type] || [];
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="empty-text">${t('edit.no_exercises')}</div></div>`;
    return;
  }
  el.innerHTML = '';
  items.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className           = 'edit-card';
    card.dataset.id          = ex.id           || '';
    card.dataset.legacyTarget = ex._legacyTarget || '';
    card.innerHTML  = `
      <span class="drag-handle">⠿</span>
      <div class="edit-fields">
        <input class="ex-name-input" value="${escHtml(ex.name)}" placeholder="${t('edit.ex_name_ph')}">
        <div class="target-fields">
          <input class="target-field-input target-weight-input" value="${escHtml(ex.targetWeight || '')}" placeholder="${t('col.weight')}">
          <input class="target-field-input target-sets-input"   value="${escHtml(ex.targetSets   || '')}" placeholder="${t('col.sets')}">
          <input class="target-field-input target-reps-input"   value="${escHtml(ex.targetReps   || '')}" placeholder="${t('col.reps')}">
        </div>
      </div>
      <button class="edit-remove" onclick="removeEditEx(${idx})">✕</button>`;
    el.appendChild(card);
  });
  initDragSort(el, type);
}

function switchEditTab(type) { collectEdits(); editTab = type; renderEditTabs(); renderEditList(type); }

function addEditExercise() {
  collectEdits();
  if (!editTemplates[editTab]) editTemplates[editTab] = [];
  editTemplates[editTab].push({ name: '', targetWeight: '', targetSets: '', targetReps: '', id: '' });
  renderEditTabs();
  renderEditList(editTab);
  window.scrollTo(0, document.body.scrollHeight);
}

function removeEditEx(idx) {
  collectEdits();
  editTemplates[editTab].splice(idx, 1);
  renderEditTabs();
  renderEditList(editTab);
}

function collectEdits() {
  const cards = document.getElementById('editListContainer').querySelectorAll('.edit-card');
  if (!cards.length) return;
  editTemplates[editTab] = [...cards].map(c => ({
    name:          c.querySelector('.ex-name-input').value,
    targetWeight:  c.querySelector('.target-weight-input')?.value || '',
    targetSets:    c.querySelector('.target-sets-input')?.value   || '',
    targetReps:    c.querySelector('.target-reps-input')?.value   || '',
    id:            c.dataset.id           || '',
    _legacyTarget: c.dataset.legacyTarget || '',
  }));
}
```

replace with (behavior identical for strength; `editTemplates`/`editTab`/`workoutTypes` stay strength's own globals — Phase B introduces parallel `cardioEditTemplates`/`cardioEditTab`/`runningTypes` rather than sharing these variables, since sharing globals across domains would risk a type-tab-switch race, see Plan B):

```js
function renderEditList(domain, type) {
  const D     = WORKOUT_DOMAINS[domain];
  const el    = document.getElementById(D.editListContainerId);
  const items = editTemplates[type] || [];
  if (!items.length) {
    el.innerHTML = `<div class="empty"><div class="empty-text">${t('edit.no_exercises')}</div></div>`;
    return;
  }
  el.innerHTML = '';
  items.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className            = 'edit-card';
    card.dataset.id           = ex.id           || '';
    card.dataset.legacyTarget = ex._legacyTarget || '';
    card.innerHTML = D.renderItemRow(ex, idx);
    el.appendChild(card);
  });
  initDragSort(el, type);
}

function switchEditTab(type) { collectEdits('strength'); editTab = type; renderEditTabs(); renderEditList('strength', type); }

function addEditExercise() {
  collectEdits('strength');
  if (!editTemplates[editTab]) editTemplates[editTab] = [];
  editTemplates[editTab].push(WORKOUT_DOMAINS.strength.newItem());
  renderEditTabs();
  renderEditList('strength', editTab);
  window.scrollTo(0, document.body.scrollHeight);
}

function removeEditEx(idx) {
  collectEdits('strength');
  editTemplates[editTab].splice(idx, 1);
  renderEditTabs();
  renderEditList('strength', editTab);
}

function collectEdits(domain) {
  const D     = WORKOUT_DOMAINS[domain];
  const cards = document.getElementById(D.editListContainerId).querySelectorAll('.edit-card');
  if (!cards.length) return;
  editTemplates[editTab] = [...cards].map(D.collectItemFromRow);
}
```

- [ ] **Step 3: Generalize `confirmAddType`/`removeWorkoutType`/`saveTemplates`**

Find (`public/index.html:3451-3500`):

```js
function confirmAddType() {
  const val = document.getElementById('newTypeName').value.trim();
  if (!val) return;
  if (workoutTypes.map(wtype => wtype.toLowerCase()).includes(val.toLowerCase())) { toast(t('edit.type_exists'), 'error'); return; }
  collectEdits();
  workoutTypes.push(val);
  editTemplates[val] = [];
  editTab = val;
  document.getElementById('addTypeForm').style.display = 'none';
  renderEditAll();
  toast(t('edit.type_added'), 'success');
}

function removeWorkoutType(type) {
  if (workoutTypes.length <= 1) { toast(t('edit.min_one_type'), 'error'); return; }
  collectEdits();
  workoutTypes = workoutTypes.filter(wtype => wtype !== type);
  delete editTemplates[type];
  if (editTab === type) editTab = workoutTypes[0];
  renderEditAll();
  toast(t('edit.type_removed'), 'success');
}

async function saveTemplates() {
  collectEdits();
  const templateData = { types: workoutTypes };
  workoutTypes.forEach(wtype => {
    templateData[wtype] = (editTemplates[wtype]||[])
      .filter(ex => ex.name.trim())
      .map(ex => {
        const hasNew = (ex.targetWeight || '').trim() || (ex.targetSets || '').trim() || (ex.targetReps || '').trim();
        const r = { id: ex.id || genId(), name: ex.name.trim(), targetWeight: (ex.targetWeight || '').trim(), targetSets: (ex.targetSets || '').trim(), targetReps: (ex.targetReps || '').trim() };
        if (!hasNew && ex._legacyTarget) r.target = ex._legacyTarget;
        return r;
      });
  });
  const total = workoutTypes.reduce((n, wtype) => n + (templateData[wtype]||[]).length, 0);
  if (!total) { toast(t('edit.no_items'), 'error'); return; }

  const btn = document.querySelector('#mainEditPanel .btn-primary');
  if (btn) { btn.disabled = true; btn.innerText = t('saving'); }
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'templates'), templateData);
    try { localStorage.setItem(_cacheKeyTemplates(), JSON.stringify(templateData)); } catch(e) {}
    toast(t('edit.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.innerText = t('edit.save'); }
}
```

replace with (unchanged strength behavior; the min-1-type guard, save-doc shape, cache write, and toast text are byte-identical — only routed through `WORKOUT_DOMAINS.strength.buildSaveDoc` from Step 1 instead of inline):

```js
function confirmAddType() {
  const val = document.getElementById('newTypeName').value.trim();
  if (!val) return;
  if (workoutTypes.map(wtype => wtype.toLowerCase()).includes(val.toLowerCase())) { toast(t('edit.type_exists'), 'error'); return; }
  collectEdits('strength');
  workoutTypes.push(val);
  editTemplates[val] = [];
  editTab = val;
  document.getElementById('addTypeForm').style.display = 'none';
  renderEditAll();
  toast(t('edit.type_added'), 'success');
}

function removeWorkoutType(type) {
  if (workoutTypes.length <= 1) { toast(t('edit.min_one_type'), 'error'); return; }
  collectEdits('strength');
  workoutTypes = workoutTypes.filter(wtype => wtype !== type);
  delete editTemplates[type];
  if (editTab === type) editTab = workoutTypes[0];
  renderEditAll();
  toast(t('edit.type_removed'), 'success');
}

async function saveTemplates() {
  collectEdits('strength');
  const templateData = WORKOUT_DOMAINS.strength.buildSaveDoc(workoutTypes, editTemplates);
  const total = workoutTypes.reduce((n, wtype) => n + (templateData[wtype]||[]).length, 0);
  if (!total) { toast(t('edit.no_items'), 'error'); return; }

  const btn = document.querySelector('#mainEditPanel .btn-primary');
  if (btn) { btn.disabled = true; btn.innerText = t('saving'); }
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'templates'), templateData);
    try { localStorage.setItem(_cacheKeyTemplates(), JSON.stringify(templateData)); } catch(e) {}
    toast(t('edit.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.innerText = t('edit.save'); }
}
```

- [ ] **Step 4: Update the two other `collectEdits()`/`renderEditList(editTab)` call sites**

Run: `grep -n "collectEdits()\|renderEditList(editTab)\|renderEditList(type)" public/index.html` and fix any remaining bare calls found in `renderEditAll` (`public/index.html:3375-3381`, `renderEditList(editTab)` → `renderEditList('strength', editTab)`) and `submitData` (`public/index.html:2913-2974`, the over-target-confirm branch calls `collectEdits`? — verify with the grep; if present, add `'strength'`).

- [ ] **Step 5: Run the full suite**

Run: `npx playwright test`
Expected: all pass. Manual: open "לעריכת תוכנית אימוני כוח", add a type, add an exercise, drag-reorder, remove a type, save — confirm identical to pre-refactor behavior.

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "refactor(editor): generalize template-editor shell (render/add/remove/collect/save) by domain"
```

---

## Task 7: Generalize History Rendering, Edit, and Delete

**Files:**
- Modify: `public/index.html:3014-3070` (`buildSessionCard`, `renderHistory`), `:3231-3323` (`editSession`, `saveSessionEdit`, `deleteSession`), `:408-414` (`.dot-a`/`.dot-b`/`.badge-a`/`.badge-b` CSS)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS` — extended with `entriesCollection`, `colorClass`, `renderCardBody`, `renderEditRow`, `collectEditRow`.
- Produces: `typeColorClass(types, typeName)` (shared, domain-agnostic — used by both strength in this task and cardio in Plan B/C, see Step 0 below), registry additions consumed by Phase C's history-page unification (`2026-08-31-C-history-unification-and-cleanup.md`).

**One intentional exception to this plan's "zero behavior change" constraint:** today only exactly two strength types (`A`/`B`) have hardcoded colors (`.dot-a`/`.dot-b`) — the *existing* template editor (`03-workout-template-editor.md`) already lets a user add a third/fourth type, and that type silently renders with no color at all (no CSS rule matches `dot-c`, `dot-d`, ...). Per explicit user request, this task fixes that for strength (and Plan B/C reuses the same fix for cardio) by replacing the two hardcoded classes with a 6-color **indexed palette** — color assigned by each type's position in the domain's `types` array, not by its name. Index 0 keeps `A`'s exact existing green, index 1 keeps `B`'s exact existing purple, so **every currently-saved A/B session renders pixel-identical colors after this task** — only a 3rd+ type (which today renders with no color at all) visibly changes, from broken to correct. This is a bug fix riding along with the refactor, not a silent behavior change to anything that worked before.

- [ ] **Step 0: Replace the 2-type hardcoded color CSS with a shared 6-color indexed palette**

Find (`public/index.html:408-414`):

```css
    .dot-a { background: var(--green); }
    .dot-b { background: var(--primary); }
    ...
    .badge-a { background: var(--green); }
    .badge-b { background: var(--primary); }
```

(read the exact live lines — there may be a `.dot-c`-style rule or none at all between `.dot-b` and `.badge-a`; replace only the four lines shown, keep anything else in between untouched) with:

```css
    /* Shared 6-color indexed palette — position-in-types-array decides the
       color, not the type's name, so it works identically for strength's
       user-defined types and cardio's user-defined types (Plan B/C). Index
       0/1 are exactly A's/B's pre-existing green/purple so already-saved
       sessions don't visibly change color. */
    .dot-c0   { background: var(--green); }
    .dot-c1   { background: var(--primary); }
    .dot-c2   { background: #aa7941; }
    .dot-c3   { background: #9b5aaf; }
    .dot-c4   { background: #a05555; }
    .dot-c5   { background: #4a8a8a; }
    .badge-c0 { background: var(--green); }
    .badge-c1 { background: var(--primary); }
    .badge-c2 { background: #aa7941; }
    .badge-c3 { background: #9b5aaf; }
    .badge-c4 { background: #a05555; }
    .badge-c5 { background: #4a8a8a; }
```

Add, near `genId()` (`public/index.html:2156`):

```js
// Shared color-assignment strategy for BOTH strength and cardio type
// badges/dots: color follows a type's position in its domain's `types`
// array (workoutTypes for strength, runningTypes for cardio — Plan B), not
// its name. This is what lets a user-added 3rd/4th/Nth type always get a
// distinct, defined color instead of silently rendering colorless (the bug
// that motivated this function). Index 0/1 are pinned to strength's
// pre-existing green/purple so A/B never visibly change color.
const TYPE_COLOR_PALETTE_SIZE = 6;
function typeColorClass(types, typeName) {
  const idx = types.indexOf(typeName);
  return 'c' + (idx >= 0 ? idx % TYPE_COLOR_PALETTE_SIZE : 0);
}
```

- [ ] **Step 1: Extend `WORKOUT_DOMAINS.strength` with history-rendering config**

Add to the `strength` entry in `WORKOUT_DOMAINS` (from Task 6's block):

```js
    entriesCollection: 'workouts',
    colorClass: s => typeColorClass(workoutTypes, s.type),
    renderCardMeta: s => `${(s.exercises||[]).length} ${t('workout.exercises')}`,
    renderCardBody: s => `
      <table class="hist-table">
        <thead><tr>
          <th data-i18n="col.exercise">${t('col.exercise')}</th><th class="col-num" data-i18n="col.weight">${t('col.weight')}</th>
          <th class="col-reps" data-i18n="col.reps">${t('col.reps')}</th>
        </tr></thead>
        <tbody>
          ${(s.exercises||[]).map(e => `<tr>
            <td><div class="td-name">${escHtml(String(e.name))}</div>
              ${e.notes ? `<div class="td-note">${escHtml(String(e.notes))}</div>` : ''}</td>
            <td class="td-num">${e.weight||'—'}</td>
            <td class="td-num">${e.reps||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`,
    badgeText: s => `${t('workout.badge')} ${escHtml(s.type)}`,
```

- [ ] **Step 2: Generalize `buildSessionCard`/`renderHistory`**

Find (`public/index.html:3014-3058`):

```js
function buildSessionCard(s, i) {
  const dotClass   = 'dot-'   + s.type.toLowerCase();
  const badgeClass = 'badge-' + s.type.toLowerCase();
  const sel = selectedSessions.has(s.id);
  return `<div class="session-card${sel ? ' sel-active' : ''}" data-sid="${escHtml(s.id)}">
    <div class="session-header" data-idx="${i}">
      <div class="session-left">
        <div class="session-dot ${dotClass}"></div>
        <div>
          <div class="session-date">${sessionDisplayDate(s)}</div>
          ${s.sessionName ? `<div class="session-name-label">${escHtml(s.sessionName)}</div>` : ''}
          <div class="session-count">${(s.exercises||[]).length} ${t('workout.exercises')}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        ${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">${t('draft.auto_badge')}</span>` : ''}
        <span class="session-badge ${badgeClass}">${t('workout.badge')} ${escHtml(s.type)}</span>
      </div>
    </div>
    <div class="session-body" id="sess_${i}">
      <div class="divider"></div>
      <table class="hist-table">
        <thead><tr>
          <th data-i18n="col.exercise">${t('col.exercise')}</th><th class="col-num" data-i18n="col.weight">${t('col.weight')}</th>
          <th class="col-reps" data-i18n="col.reps">${t('col.reps')}</th>
        </tr></thead>
        <tbody>
          ${(s.exercises||[]).map(e => `<tr>
            <td><div class="td-name">${escHtml(String(e.name))}</div>
              ${e.notes ? `<div class="td-note">${escHtml(String(e.notes))}</div>` : ''}</td>
            <td class="td-num">${e.weight||'—'}</td>
            <td class="td-num">${e.reps||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="expand-strip" onclick="toggleSess(${i}, this)">
      <div class="chevron">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  </div>`;
}

function renderHistory() {
  selectedSessions.clear();
  updateHistBulkBar();
  const list = document.getElementById('historyList');
  _attachHistLongPress();
  const data = activeFilter === 'all' ? allSessions : allSessions.filter(s => s.type === activeFilter);
  ...
```

replace with (`buildSessionCard` becomes `buildSessionCard(domain, s, i)`; `renderHistory` keeps its exact name/signature — no args — since it's called from many existing sites and stays strength-only until Phase C adds a sibling `renderCardioHistory`, at which point Phase C will introduce a thin `renderHistory()`/`renderCardioHistory()` pair sharing a new `_renderEntryList(domain, ...)` core; this task only makes `buildSessionCard` itself domain-aware so that core can call it):

```js
function buildSessionCard(domain, s, i) {
  const D = WORKOUT_DOMAINS[domain];
  const dotClass   = 'dot-'   + D.colorClass(s);
  const badgeClass = 'badge-' + D.colorClass(s);
  const sel = selectedSessions.has(s.id);
  return `<div class="session-card${sel ? ' sel-active' : ''}" data-sid="${escHtml(s.id)}">
    <div class="session-header" data-idx="${i}">
      <div class="session-left">
        <div class="session-dot ${dotClass}"></div>
        <div>
          <div class="session-date">${sessionDisplayDate(s)}</div>
          ${s.sessionName ? `<div class="session-name-label">${escHtml(s.sessionName)}</div>` : ''}
          <div class="session-count">${D.renderCardMeta(s)}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        ${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">${t('draft.auto_badge')}</span>` : ''}
        <span class="session-badge ${badgeClass}">${D.badgeText(s)}</span>
      </div>
    </div>
    <div class="session-body" id="sess_${i}">
      <div class="divider"></div>
      ${D.renderCardBody(s)}
    </div>
    <div class="expand-strip" onclick="toggleSess(${i}, this)">
      <div class="chevron">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  </div>`;
}

function renderHistory() {
  selectedSessions.clear();
  updateHistBulkBar();
  const list = document.getElementById('historyList');
  _attachHistLongPress();
  const data = activeFilter === 'all' ? allSessions : allSessions.filter(s => s.type === activeFilter);
  ...
```

(`...` — the rest of `renderHistory`'s body, the month-grouping loop, is untouched by this task except its one call to `buildSessionCard(s, si++)` → `buildSessionCard('strength', s, si++)`, done in Step 3.)

- [ ] **Step 3: Update `renderHistory`'s two `buildSessionCard` call sites**

Find (inside `renderHistory`, both branches of the month-grouping `if (isLatest)`):

```js
      sessions.forEach(s => { html += buildSessionCard(s, si++); });
```

(appears twice) replace both with:

```js
      sessions.forEach(s => { html += buildSessionCard('strength', s, si++); });
```

- [ ] **Step 4: Run the full suite**

Run: `npx playwright test`
Expected: all pass, unchanged. Manual: open History, confirm A/B cards, colors, month grouping, long-press select, and expand/collapse are pixel-identical to before this task. Then, in the template editor, add a temporary 3rd strength type, save, log one entry under it, and confirm its History card now renders with a distinct color (amber, per palette index 2) instead of the pre-existing no-color bug — this is the one deliberate visible fix in this task, confirm it, then remove the temporary type again if it isn't wanted long-term.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "refactor(history): generalize buildSessionCard rendering by domain, fix uncolored 3rd+ workout types with a shared indexed palette"
```

---

## Task 8: Full Regression Pass

**Files:** none modified — verification-only task.

- [ ] **Step 1: Run the complete Playwright suite**

Run: `npx playwright test`
Expected: 100% pass, identical pass/fail set to a run taken before Task 1 started (re-run the suite once on `main` before this plan if that baseline wasn't captured, and diff the two result summaries).

- [ ] **Step 2: Manual end-to-end smoke test of every touched strength flow**

In a browser: log a workout on type A, switch to B and back to A (confirm draft round-trip), refresh mid-typing (confirm silent restore), copy last workout, clear form, save, open History and confirm the new entry renders correctly, edit it inline and save, delete it via Arm & Confirm, open the template editor, add/remove a type and an exercise, drag-reorder, save.

- [ ] **Step 3: Commit (only if Steps 1-2 required fixes; otherwise this task produces no diff)**

```bash
git add -A
git commit -m "test: full regression pass after shared-workout-engine extraction"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** Spec §4's extraction list (draft engine, tabs, copy-last-workout/clear-form, template-editor shell, history chrome) → Tasks 1-7 respectively. User feedback from the design-review round (not in the original spec doc, added directly to this plan): the shared indexed color palette (Task 7, Step 0) fixing uncolored 3rd+ workout types for both domains. Spec §3.3 (domain-namespaced draft keys) → Task 1. The "left domain-specific, not shared" half of §4 (strength's exercise-card renderer) is explicitly **not** touched anywhere in this plan — verified by grep in Task 4/Step 2's instruction to read live line numbers rather than assume them, so no task accidentally rewrites `makeExCard`/`copyTargetToCard`/`parseTargetString`.
- **Type/name consistency check:** `WORKOUT_DOMAINS` is declared once (Task 2) and only ever extended (Tasks 6, 7), never redeclared. `_draftKey/_draftSerialize/_draftApplyToForm/_draftHasFormData/_draftQualifies/_draftHasBannerData/_draftSaveLocal/_draftLoadLocal/_draftSaveFirestore/_draftDelete/_draftOnInput/_draftAttachListeners/_draftStartFirestoreTimer/_draftShowModal/_tabSnapshotCurrent/_tabRestoreOrDraft` all gain a leading `domain` parameter in the task that touches them and every downstream task's call sites are updated in the same task (no task leaves a stale bare call for a later task to discover) — Task 8's full-suite run is the backstop that would catch any missed call site immediately (a syntax/runtime error, not a silent behavior change).
- **No placeholders:** every step contains complete, copy-pasteable code except the three places explicitly marked `...` (Tasks 4, 6, 7) — each of those three names the exact unchanged surrounding code by line-range citation and states precisely which one or two lines inside it change, which is the plan's own "read the live file, only these lines move" instruction rather than a placeholder.
