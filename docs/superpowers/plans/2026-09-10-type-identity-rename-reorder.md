# Workout Type Identity (Rename + Reorder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give workout types (strength's `workoutTypes`, cardio's `runningTypes`) a stable ID, independent of their display name, so users can rename and reorder them without losing history/filter/streak continuity and without retroactively rewriting any historical workout document. Colors move from position-based to ID-based (frozen at creation, survives reorder).

**Architecture:** A one-time, idempotent, per-user, per-domain migration backfills `{id,name,color}` onto every existing type and `typeId` onto every existing historical document (additive only — no existing field is ever rewritten). Every place in the app that currently keys off a type's name switches to keying off its id, resolving the display name via the registry at render time. Two new features (rename, reorder) become possible once identity is decoupled from name. Strength and cardio are structurally identical at every touched site (already verified) — most tasks cover both domains together.

**Tech Stack:** Vanilla JS (`public/index.html`), Firebase Firestore, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-10-type-identity-rename-reorder-design.md`

## Global Constraints

- No existing field on any historical `workouts`/`runWorkouts` document is ever rewritten or deleted — `typeId` is purely additive, `type`/`workoutType` stays exactly as it already is, forever.
- The migration must be idempotent under partial-failure-then-retry, matching the exact discipline `migrateCardioDataV2` already established (per-doc/per-collection guard checks before writing, guard flag set only after full success) — this app has no Firestore emulator, migrations run against real production data.
- No UI anywhere shows a type's previous name(s) after a rename.
- A type's `color` is set once at creation and never recomputed from array position again — reordering must not change any type's color.
- `escHtml()` wraps any user-controlled string (type names, both existing and newly-renamed) going into `innerHTML` — standing rule.
- Commit after every task.

---

## Task 1: One-time migration — backfill `{id,name,color}` onto existing types, `typeId` onto existing history

**Files:**
- Modify: `public/index.html` — new function `migrateTypeIdentity()`, called from `_backgroundSync()` alongside the existing `migrateCardioDataV2()` call.

**Interfaces:**
- Produces: `config/templates.types` and `config/runningTemplates.types` become `{id, name, color}[]` (was `string[]`); every type's field/exercise array is re-keyed from its name to its id; `config/templates.dateFieldHiddenByType` re-keyed from name to id; every `workouts`/`runWorkouts` document gains an additive `typeId` field where it can be matched.
- Consumes: `genId()` (already exists, `public/index.html:2483`), the existing `config/settings` document pattern for migration guard flags.

- [ ] **Step 1: Write the migration function**

Add, immediately after `migrateCardioDataV2()` (find the function's closing `}` at the line matching `} catch (e) { /* silent — retried next load, guard flag only set on full success */ }` followed by `}`, insert after that):

```js
// ─── TYPE IDENTITY MIGRATION (V1 — name-keyed types → {id,name,color}) ───
// One-time, guarded by config/settings.typeIdentityMigratedV1. Same silent
// try/catch + idempotency discipline as migrateCardioDataV2 (spec
// 2026-09-10-type-identity-rename-reorder-design.md §4): a failure here
// must never block app load and must be safe to retry from any partial
// state without corrupting already-migrated data.
async function migrateTypeIdentity() {
  if (!currentUser) return;
  try {
    const settingsRef = doc(db, 'users', currentUser.uid, 'config', 'settings');
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists() && settingsSnap.data().typeIdentityMigratedV1 === true) {
      return;
    }

    await _migrateTypeIdentityForDomain('strength', 'templates', 'workouts', 'type', 'dateFieldHiddenByType');
    await _migrateTypeIdentityForDomain('cardio', 'runningTemplates', 'runWorkouts', 'workoutType', null);

    await setDoc(settingsRef, { typeIdentityMigratedV1: true }, { merge: true });
  } catch (e) { /* silent — retried next load, guard flag only set on full success */ }
}

// domainKey: 'strength' | 'cardio' — only used for error messages/comments below.
// templatesDoc: 'templates' | 'runningTemplates' — the config doc holding `types`.
// entriesCollection: 'workouts' | 'runWorkouts'.
// typeField: the name of the field on each entry doc holding the type name ('type' or 'workoutType').
// perTypeExtraField: an additional name-keyed map living on the SAME templates doc that also
//   needs re-keying (strength's `dateFieldHiddenByType`); null if the domain has none (cardio).
async function _migrateTypeIdentityForDomain(domainKey, templatesDoc, entriesCollection, typeField, perTypeExtraField) {
  const templatesRef = doc(db, 'users', currentUser.uid, 'config', templatesDoc);
  const templatesSnap = await getDoc(templatesRef);
  if (!templatesSnap.exists()) return; // nothing to migrate for this domain
  const data = templatesSnap.data();
  const rawTypes = data.types;
  if (!Array.isArray(rawTypes) || !rawTypes.length) return;
  // Idempotency guard: already-migrated types are objects, not strings.
  if (typeof rawTypes[0] === 'object') return;

  const oldNames = rawTypes; // string[]
  const newTypes = oldNames.map((name, idx) => ({ id: genId(), name, color: idx % TYPE_COLOR_PALETTE_SIZE }));
  const nameToId = {};
  newTypes.forEach(t => { nameToId[t.name] = t.id; });

  const newData = { ...data, types: newTypes };
  newTypes.forEach(t => {
    newData[t.id] = data[t.name] || [];
    if (t.id !== t.name) delete newData[t.name];
  });
  if (perTypeExtraField && data[perTypeExtraField] && typeof data[perTypeExtraField] === 'object') {
    const oldMap = data[perTypeExtraField];
    const newMap = {};
    newTypes.forEach(t => { if (t.name in oldMap) newMap[t.id] = oldMap[t.name]; });
    newData[perTypeExtraField] = newMap;
  }
  await setDoc(templatesRef, newData);

  const entriesSnap = await getDocs(collection(db, 'users', currentUser.uid, entriesCollection));
  for (const entryDoc of entriesSnap.docs) {
    const entry = entryDoc.data();
    if (entry.typeId !== undefined) continue; // already backfilled, idempotency guard
    const matchedId = nameToId[entry[typeField]];
    if (!matchedId) continue; // entry's type name doesn't match any current type (e.g. a removed type) — leave typeId unset, falls back to the frozen name string at render time
    await updateDoc(doc(db, 'users', currentUser.uid, entriesCollection, entryDoc.id), { typeId: matchedId });
  }
}
```

- [ ] **Step 2: Wire it into `_backgroundSync`**

Find (`public/index.html`, inside `_backgroundSync`, the line calling the cardio migration):

```js
    await migrateCardioDataV2();
```

replace with:

```js
    await migrateCardioDataV2();
    await migrateTypeIdentity();
```

- [ ] **Step 3: Manual verification against the real account**

Run once against `test@gmail.com`/`111111` (the only account this project ever uses for live verification, real production Firestore, no emulator): confirm before migration `config/templates.types` is a plain string array; after one app load, confirm it's now `{id,name,color}[]` with `color` values `0,1,...` matching creation order, confirm `dateFieldHiddenByType` (if present) is re-keyed by id, confirm at least one existing `workouts` doc gained a `typeId` matching the right type's new id, and confirm re-running the migration a second time (e.g. reload again) is a genuine no-op (no errors, no duplicate work — read the guard flag directly via `__debugGetDoc` to confirm `typeIdentityMigratedV1 === true` after the first run). Repeat the same checks for cardio (`runningTemplates`/`runWorkouts`/`workoutType`).

**Do not** attempt to simulate a partial-failure-then-retry against the real account directly (matches this project's own established precedent from Phase B's migration work — too risky against real data); instead, verify the idempotency guards by code reading: confirm `typeof rawTypes[0] === 'object'` correctly short-circuits a second run of `_migrateTypeIdentityForDomain` before it touches anything, and confirm `entry.typeId !== undefined` correctly skips an already-backfilled document within the per-entry loop.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(types): add one-time migration backfilling stable IDs onto existing workout types"
```

---

## Task 2: Registry restructuring — editor-side (both domains)

**Files:**
- Modify: `public/index.html` — `editTemplates`/`editTab`/`selectedType` (strength), `cardioEditTemplates`/`cardioEditTab`/`cardioSelectedType` (cardio), `confirmAddType`/`removeWorkoutType`/`switchEditTab`/`renderEditTabs`/`saveTemplates`, their cardio equivalents, and both domains' `buildSaveDoc` in `WORKOUT_DOMAINS`.

**Interfaces:**
- Consumes: Task 1's `{id,name,color}[]` registry shape (must already be live before this task's code can run correctly against real data — this task assumes the migration has already run, exactly like every earlier phase's migration-then-consumer task ordering in this project).
- Produces: every editor-side function now operates on type **ids**, not names. `renderEditTabs`/`renderCardioEditTabs` display `.name` while keying everything else off `.id`.

- [ ] **Step 1: Generalize `renderEditTabs`/`renderCardioEditTabs` to key by id, display name**

Find (`public/index.html:4487-4502`):

```js
function renderEditTabs() {
  const canRemove = workoutTypes.length > 1;
  document.getElementById('editTabs').innerHTML =
    workoutTypes.map(wtype =>
      `<div class="tab-item${wtype===editTab?' active':''}">
        <button class="tab-btn" onclick="switchEditTab('${escHtml(wtype)}')">
          <span class="count-pill">${(editTemplates[wtype]||[]).length}</span>
          ${escHtml(wtype)}
        </button>
        ${canRemove ? `<button class="tab-remove" onclick="removeWorkoutType('${escHtml(wtype)}')" title="✕">✕</button>` : ''}
      </div>`
    ).join('') +
    `<div class="tab-item add-tab-item">
      <button class="tab-btn add-tab-btn" onclick="showAddTypeForm()">+</button>
    </div>`;
}
```

replace with:

```js
function renderEditTabs() {
  const canRemove = workoutTypes.length > 1;
  document.getElementById('editTabs').innerHTML =
    workoutTypes.map(wtype =>
      `<div class="tab-item${wtype.id===editTab?' active':''}">
        <button class="tab-btn" onclick="switchEditTab('${escHtml(wtype.id)}')">
          <span class="count-pill">${(editTemplates[wtype.id]||[]).length}</span>
          ${escHtml(wtype.name)}
        </button>
        ${canRemove ? `<button class="tab-remove" onclick="removeWorkoutType('${escHtml(wtype.id)}')" title="✕">✕</button>` : ''}
      </div>`
    ).join('') +
    `<div class="tab-item add-tab-item">
      <button class="tab-btn add-tab-btn" onclick="showAddTypeForm()">+</button>
    </div>`;
}
```

Apply the exact same transformation to `renderCardioEditTabs` (find via `grep -n "function renderCardioEditTabs"` — same shape, `runningTypes`/`cardioEditTemplates`/`cardioEditTab` in place of `workoutTypes`/`editTemplates`/`editTab`): every `wtype`/`type` loop variable that was a bare string becomes an `{id,name,color}` object; every place that used the bare variable for **identity** (the `onclick` handler argument, the `editTemplates[...]`/`cardioEditTemplates[...]` key, the `===` active-tab comparison) uses `.id`; the one place it was used for **display** (the visible tab label text) uses `.name`.

- [ ] **Step 2: Update `renderEditAll`/`renderCardioEditAll`'s type-existence check**

Find (`public/index.html:4504-4512`):

```js
function renderEditAll() {
  if (!workoutTypes.includes(editTab)) editTab = workoutTypes[0];
```

replace with:

```js
function renderEditAll() {
  if (!workoutTypes.some(wtype => wtype.id === editTab)) editTab = workoutTypes[0]?.id;
```

(`workoutTypes[0]` is now an object — `?.id` extracts its id; `editTab` stays a bare id string throughout, matching every other piece of "currently selected X" state in this file.) Apply the identical transformation to cardio's equivalent check in `renderCardioEditAll`.

- [ ] **Step 3: `switchEditTab`/`switchCardioEditTab` — parameter is now an id**

Find (`public/index.html:4534-4544`):

```js
function switchEditTab(type) {
  collectEdits('strength');
  editTab = type;
  renderEditTabs();
  renderEditList('strength', type);
```

No change needed to the body itself — `type` was already just stored/passed through opaquely; it now happens to be an id instead of a name, which is exactly what `renderEditList('strength', type)`'s `type` parameter, and `editTemplates[type]` inside `renderEditList` (`public/index.html:4514-4532`, via `D.getTemplates()[type]`), already need to look up correctly once `editTemplates` itself is re-keyed (Step 5). The date-field-hidden lookup two lines below (`_isStrengthDateFieldHidden(type)`) is addressed in Task 3. **No edit needed for this step — confirming the call chain is already id-transparent once its inputs are ids**, per the brief's own investigation. `switchCardioEditTab` (`public/index.html:4679`, currently a one-liner) is identical in this respect — no change needed.

- [ ] **Step 4: `confirmAddType`/`confirmAddCardioType` — assign a real id and next-in-rotation color to a brand-new type**

Find (`public/index.html:4577-4588`):

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
```

replace with:

```js
function confirmAddType() {
  const val = document.getElementById('newTypeName').value.trim();
  if (!val) return;
  if (workoutTypes.map(wtype => wtype.name.toLowerCase()).includes(val.toLowerCase())) { toast(t('edit.type_exists'), 'error'); return; }
  collectEdits('strength');
  const newType = { id: genId(), name: val, color: workoutTypes.length % TYPE_COLOR_PALETTE_SIZE };
  workoutTypes.push(newType);
  editTemplates[newType.id] = [];
  editTab = newType.id;
  document.getElementById('addTypeForm').style.display = 'none';
  renderEditAll();
  toast(t('edit.type_added'), 'success');
}
```

Apply the identical transformation to `confirmAddCardioType` (`public/index.html:4719-4730`) — `runningTypes`/`cardioEditTemplates`/`cardioEditTab` in place of the strength names; note cardio's version also seeds `cardioEditTemplates[newType.id]` with `CARDIO_MIGRATION_FIELD_MAP.map(f => ({ ...f }))` (unchanged logic, just keyed by the new id instead of the new name).

- [ ] **Step 5: `removeWorkoutType`/`removeCardioType` — operate by id**

Find (`public/index.html:4590-4598`):

```js
function removeWorkoutType(type) {
  if (workoutTypes.length <= 1) { toast(t('edit.min_one_type'), 'error'); return; }
  collectEdits('strength');
  workoutTypes = workoutTypes.filter(wtype => wtype !== type);
  delete editTemplates[type];
  if (editTab === type) editTab = workoutTypes[0];
  renderEditAll();
  toast(t('edit.type_removed'), 'success');
}
```

replace with:

```js
function removeWorkoutType(typeId) {
  if (workoutTypes.length <= 1) { toast(t('edit.min_one_type'), 'error'); return; }
  collectEdits('strength');
  workoutTypes = workoutTypes.filter(wtype => wtype.id !== typeId);
  delete editTemplates[typeId];
  if (editTab === typeId) editTab = workoutTypes[0].id;
  renderEditAll();
  toast(t('edit.type_removed'), 'success');
}
```

Apply the identical transformation to `removeCardioType` (`public/index.html:4732-4740`).

- [ ] **Step 6: `buildSaveDoc` (both domains in `WORKOUT_DOMAINS`) — write the `{id,name,color}[]` shape, key field arrays by id**

Find (`public/index.html:3003-3015`, strength's `buildSaveDoc`):

```js
    buildSaveDoc: (types, templates) => {
      const templateData = { types, dateFieldHiddenByType: strengthDateFieldHiddenByType };
      types.forEach(wtype => {
        templateData[wtype] = (templates[wtype] || [])
          .filter(ex => !WORKOUT_DOMAINS.strength.isEmptyItem(ex))
          .map(ex => {
            const hasNew = (ex.targetWeight || '').trim() || (ex.targetSets || '').trim() || (ex.targetReps || '').trim();
            const r = { id: ex.id || genId(), name: ex.name.trim(), targetWeight: (ex.targetWeight || '').trim(), targetSets: (ex.targetSets || '').trim(), targetReps: (ex.targetReps || '').trim() };
            if (!hasNew && ex._legacyTarget) r.target = ex._legacyTarget;
            return r;
          });
      });
```

`types` here is already `workoutTypes` itself (an array of `{id,name,color}` objects by the time this runs, post-migration) — the only change needed is every `templateData[wtype]` (using the bare object as a key, which would stringify to `[object Object]`) must become `templateData[wtype.id]`:

replace the `types.forEach(wtype => { templateData[wtype] = ...` line specifically with:

```js
      types.forEach(wtype => {
        templateData[wtype.id] = (templates[wtype.id] || [])
```

(keep every other line in that block — the `.filter`/`.map` body — completely unchanged; only the two `templateData[wtype]`/`templates[wtype]` object-key expressions become `.id`-qualified). Apply the identical single-line-shape change to cardio's `buildSaveDoc` (`public/index.html:3212`ish, find via the second `buildSaveDoc:` match) — `templateData[type]`/`templates[type]` → `templateData[type.id]`/`templates[type.id]`.

- [ ] **Step 7: `saveTemplates`/`saveCardioTemplates` — the `.reduce` total-count check iterates types, needs `.id`**

Find (`public/index.html:4600-4604`):

```js
async function saveTemplates() {
  collectEdits('strength');
  const templateData = WORKOUT_DOMAINS.strength.buildSaveDoc(workoutTypes, editTemplates);
  const total = workoutTypes.reduce((n, wtype) => n + (templateData[wtype]||[]).length, 0);
```

replace the `reduce` line with:

```js
  const total = workoutTypes.reduce((n, wtype) => n + (templateData[wtype.id]||[]).length, 0);
```

Apply the identical one-line change to `saveCardioTemplates` (`public/index.html:4742-4746`, `templateData[type]` → `templateData[type.id]`).

- [ ] **Step 8: Run the full suite, manual check**

`npx playwright test`. Manual: open the strength template editor, confirm existing types (post-Task-1-migration) render with their real names, add a new type, confirm it gets a real id/color, remove a type, confirm the remaining ones are unaffected, save, reload, confirm everything persisted correctly including field templates staying attached to the right (now-renamed-internally-but-not-yet-exposed) type. Repeat for cardio.

- [ ] **Step 9: Commit**

```bash
git add public/index.html
git commit -m "feat(types): convert template editors to key types by id instead of name"
```

---

## Task 3: Registry restructuring — consumption side (both domains)

**Files:**
- Modify: `public/index.html` — `typeColorClass`, `lastWorkouts`/`lastCardioWorkouts`, `strengthDateFieldHiddenByType`/`_isStrengthDateFieldHidden`, `_draftKey` + every inlined draft-key call site, `checkAndAutoSavePreviousDrafts`, `WORKOUT_DOMAINS.strength.colorClass`/`badgeText` and cardio's equivalents (history card rendering), `selectType`/cardio's daily-entry type selection, `activeFilter`/`renderFilterButtons`/history filtering.

**Interfaces:**
- Consumes: Task 1's migrated registry shape, Task 2's id-keyed editor state.
- Produces: every remaining name-keyed lookup in the file now resolves by id; history cards resolve their displayed name/color via `typeId` → current registry entry, falling back to the frozen name string only when `typeId` is absent (pre-migration edge case, per spec §3.2).

- [ ] **Step 1: `typeColorClass` — read the type's own frozen `.color`, not array position**

Find (`public/index.html:2495-2498`):

```js
function typeColorClass(types, typeName) {
  const idx = types.indexOf(typeName);
  return 'c' + (idx >= 0 ? idx % TYPE_COLOR_PALETTE_SIZE : 0);
}
```

replace with:

```js
// `types` is the domain's {id,name,color}[] registry; `typeId` is the id
// to resolve. Reads the color frozen at that type's creation time (spec
// 2026-09-10-type-identity-rename-reorder-design.md §3.1) rather than
// recomputing from the type's current array position, so reordering types
// never changes anyone's color.
function typeColorClass(types, typeId) {
  const match = types.find(t => t.id === typeId);
  return 'c' + (match ? match.color : 0);
}
```

Every call site of `typeColorClass(types, X)` must now pass a **typeId**, not a name — this is addressed by Step 6 below (history card rendering, the only real caller).

- [ ] **Step 2: `strengthDateFieldHiddenByType`/`_isStrengthDateFieldHidden` — already re-keyed by Task 1's migration; confirm all read/write sites use ids**

Find (`public/index.html:1661`):

```js
function _isStrengthDateFieldHidden(type) { return strengthDateFieldHiddenByType[type] !== false; }
```

No code change needed here — the function is already opaque to whether `type` is a name or an id; it now receives ids everywhere because every call site (`switchEditTab`'s `editTab`, `submitData`'s `selectedType`, `saveTemplates`'s `selectedType`) already carries an id post-Task-2. **Verify, don't blindly trust**: grep every `_isStrengthDateFieldHidden(` call site and confirm each one's argument is genuinely an id-typed variable by this point in the plan (`editTab`, `selectedType`) — if any site still passes a raw name (shouldn't, given Tasks 2's own conversions, but confirm).

The write side is `_setStrengthDateFieldHidden(hidden) { strengthDateFieldHiddenByType[editTab] = hidden; }` (`public/index.html:1662`, immediately next to `_isStrengthDateFieldHidden` above it) — already keyed by `editTab`, already an id post-Task-2. **Confirmed via direct code reading — no change needed.**

- [ ] **Step 3: `lastWorkouts`/`lastCardioWorkouts` — re-key by id at population time**

Find (`public/index.html`, inside `applyAppData`/`_backgroundApplyData`, the line building `lastWorkouts` from `data.lastWorkouts` — search `lw\[s\.type\]` per the earlier investigation, `public/index.html:2676`):

```js
  workouts.forEach(s => { if (!lw[s.type]) lw[s.type] = s; });
```

replace with:

```js
  workouts.forEach(s => { const key = s.typeId || s.type; if (!lw[key]) lw[key] = s; });
```

(Falls back to the frozen name string only for the rare entry that never got a `typeId` backfilled — matches spec §3.2's fallback rule exactly.) Every **read** site of `lastWorkouts[...]`/`lastCardioWorkouts[...]` (the session-name placeholder, `public/index.html:1553`/`3844`; cardio's `copyLastCardioWorkout` family, `public/index.html:2079`/`2120`/`2133`/`2193`) must be looked up the same way — by the CURRENTLY selected type's **id** (`selectedType`/`cardioSelectedType`, already ids post-Task-2), so no further change is needed at those read sites, since they already index by the current-selection variable which is now an id.

Apply the identical `key = w.typeId || w.workoutType` transformation to cardio's equivalent population line (`public/index.html:1755`, inside `loadRunData`).

- [ ] **Step 4: Draft keys — switch from name to id**

Find (`public/index.html:2907-2909`):

```js
function _draftKey(domain, type) {
  return `draft_${currentUser?.uid}_${domain}_${type}`;
}
```

No code change needed in this function itself — it's already opaque to name-vs-id, same reasoning as Step 2/3's read sites. What changes is every **caller** now passes an id instead of a name. Grep `_draftKey(` and confirm every call site's second argument is `selectedType`/`cardioSelectedType`/an already-id-typed variable post-Task-2 (should already be true — verify, don't assume).

The Firestore-side draft document id is **inlined separately** at 4 call sites rather than going through `_draftKey` (confirmed by investigation) — find each `'drafts', domain + '_' + type` / `'drafts', 'cardio_' + cardioSelectedType` / `'drafts', 'strength_' + selectedType` pattern (`public/index.html:2128`, `3303`, `3311`, `3857`) and confirm each one's `type`/`cardioSelectedType`/`selectedType` variable is already id-typed post-Task-2 — no textual change needed at these 4 sites either, since they already reference the same now-id-typed variables; this step is a verification pass, not a rewrite, and exists specifically to confirm the "affected place" flagged during investigation doesn't slip through untested.

- [ ] **Step 5: `buildAutoSaveEntry` (both domains) — the real fix location, not `checkAndAutoSavePreviousDrafts` itself**

Read `checkAndAutoSavePreviousDrafts()` (`public/index.html:3581-3656`) in full before touching anything nearby — **verified it needs zero changes**: it never compares a draft's type against the registry at all. It extracts whatever string follows `{domain}_` directly out of each draft's own Firestore **document id** (`d.id.slice(matchedPrefix.length)`, line 3625) and passes that straight through as `draft.type` to `D.buildAutoSaveEntry(draft)`/`_draftQualifies(domain, draft)`/`_draftKey(domain, draft.type)` — completely opaque to whether that string is a name or an id. Since Task 2/3's changes make every *new* draft's Firestore doc id embed a **type id** (not a name) going forward, `draft.type` here will already correctly be an id with zero changes to this function.

The real gap is inside `buildAutoSaveEntry` itself (`WORKOUT_DOMAINS.strength.buildAutoSaveEntry`, `public/index.html:3024-3047`), which currently writes `draft.type` straight into the new permanent history document's `type` field with no `typeId` at all:

```js
      return {
        date:        dateStr,
        dateISO:     `${yyyy}-${mm}-${dd}`,
        type:        draft.type,
        sessionName: draft.workoutName || '',
```

Once `draft.type` is an id, this would write a raw id string into `type` (the field every OTHER part of the app treats as a human-readable frozen name fallback) and never set `typeId` at all — silently breaking both the new id-based path AND the legacy name-fallback path for every auto-saved entry. Replace with:

```js
      const matchedType = workoutTypes.find(t => t.id === draft.type);
      return {
        date:        dateStr,
        dateISO:     `${yyyy}-${mm}-${dd}`,
        type:        matchedType ? matchedType.name : draft.type, // matchedType.name for the normal case; draft.type itself is only used as a last-resort display fallback if the type was deleted between the draft's creation and this promotion
        typeId:      draft.type,
        sessionName: draft.workoutName || '',
```

Apply the identical two-line change (`matchedType` lookup against `runningTypes`, `workoutType: matchedType ? matchedType.name : draft.type` + `typeId: draft.type`) to cardio's `buildAutoSaveEntry` (`public/index.html:3127-3155`, the `workoutType: draft.type` line).

- [ ] **Step 6: History card rendering — resolve name/color via `typeId`, fall back to frozen name string**

Find `WORKOUT_DOMAINS.strength.colorClass`/`badgeText` and cardio's equivalents (search `colorClass: s =>` — two matches, one per domain). Current strength shape (confirmed via investigation, `public/index.html:3048`/`3065`):

```js
    colorClass: s => typeColorClass(workoutTypes, s.type),
```
```js
    badgeText: s => `${t('workout.badge')} ${escHtml(s.type)}`,
```

replace with:

```js
    colorClass: s => typeColorClass(workoutTypes, s.typeId || s.type),
```
```js
    badgeText: s => {
      const match = s.typeId ? workoutTypes.find(t => t.id === s.typeId) : null;
      return `${t('workout.badge')} ${escHtml(match ? match.name : s.type)}`;
    },
```

(`typeColorClass`'s own Step 1 fallback (`match ? match.color : 0`) already degrades gracefully if `s.typeId || s.type` resolves to neither a real id nor anything `.find` can match — no crash, just falls to color `0`, acceptable for the rare pre-migration-edge-case entry.) Apply the identical two-function transformation to cardio's `colorClass`/`badgeText` (reading `s.workoutType`/`runningTypes` in place of `s.type`/`workoutTypes`).

- [ ] **Step 7: Daily-entry type-selector buttons, History filter buttons, and the filter comparison itself**

`selectType(type)`/`selectCardioType(type)` (`public/index.html:3861`/`2069`) themselves need **no changes** — verified they only ever store/compare whatever `type` value they're handed opaquely (`selectedType === type`, `lastWorkouts[type]` — the latter already correctly resolves once Task 3 Step 3's re-keying is in place). The actual rendering of their button markup is a separate function each, and DOES need changing:

Find (`public/index.html:4471-4475`, `renderTypeButtons` — the strength daily-entry page's own type tabs):

```js
function renderTypeButtons() {
  document.getElementById('typeRow').innerHTML = workoutTypes.map(wtype =>
    `<button class="type-btn${wtype === selectedType ? ' active' : ''}" data-type="${escHtml(wtype)}" onclick="selectType('${escHtml(wtype)}')">${escHtml(t('workout.badge') + ' ' + wtype)}</button>`
  ).join('');
}
```

replace with:

```js
function renderTypeButtons() {
  document.getElementById('typeRow').innerHTML = workoutTypes.map(wtype =>
    `<button class="type-btn${wtype.id === selectedType ? ' active' : ''}" data-type="${escHtml(wtype.id)}" onclick="selectType('${escHtml(wtype.id)}')">${escHtml(t('workout.badge') + ' ' + wtype.name)}</button>`
  ).join('');
}
```

Find (`public/index.html:2063-2067`, `renderCardioTypeButtons` — cardio's equivalent):

```js
function renderCardioTypeButtons() {
  document.getElementById('cardioTypeRow').innerHTML = runningTypes.map(type =>
    `<button class="type-btn${type === cardioSelectedType ? ' active' : ''}" data-type="${escHtml(type)}" onclick="selectCardioType('${escHtml(type)}')">${escHtml(type)}</button>`
  ).join('');
}
```

replace with:

```js
function renderCardioTypeButtons() {
  document.getElementById('cardioTypeRow').innerHTML = runningTypes.map(type =>
    `<button class="type-btn${type.id === cardioSelectedType ? ' active' : ''}" data-type="${escHtml(type.id)}" onclick="selectCardioType('${escHtml(type.id)}')">${escHtml(type.name)}</button>`
  ).join('');
}
```

Find (`public/index.html:4477-4485`, `renderFilterButtons` — the History page's filter row, already domain-generic):

```js
function renderFilterButtons() {
  const types = historyActiveDomain === 'cardio' ? runningTypes : workoutTypes;
  const label = wtype => historyActiveDomain === 'cardio' ? escHtml(wtype) : escHtml(t('workout.badge') + ' ' + wtype);
  document.getElementById('filterRow').innerHTML =
    `<button class="filter-btn${activeFilter==='all'?' active':''}" data-filter="all" onclick="filterHistory('all')">${t('filter.all')}</button>` +
    types.map(wtype =>
      `<button class="filter-btn${activeFilter===wtype?' active':''}" data-filter="${escHtml(wtype)}" onclick="filterHistory('${escHtml(wtype)}')">${label(wtype)}</button>`
    ).join('');
}
```

replace with:

```js
function renderFilterButtons() {
  const types = historyActiveDomain === 'cardio' ? runningTypes : workoutTypes;
  const label = wtype => historyActiveDomain === 'cardio' ? escHtml(wtype.name) : escHtml(t('workout.badge') + ' ' + wtype.name);
  document.getElementById('filterRow').innerHTML =
    `<button class="filter-btn${activeFilter==='all'?' active':''}" data-filter="all" onclick="filterHistory('all')">${t('filter.all')}</button>` +
    types.map(wtype =>
      `<button class="filter-btn${activeFilter===wtype.id?' active':''}" data-filter="${escHtml(wtype.id)}" onclick="filterHistory('${escHtml(wtype.id)}')">${label(wtype)}</button>`
    ).join('');
}
```

Find (`public/index.html:4173`, `renderHistory` — the actual filter-by-type predicate; `filterHistory(f)` itself, `public/index.html:4124-4126`, just assigns `activeFilter = f` and needs no change since `f` is now already an id, passed straight from the button's `onclick` above):

```js
  const data = activeFilter === 'all' ? sourceData : sourceData.filter(s => s[typeKey] === activeFilter);
```

replace with:

```js
  const data = activeFilter === 'all' ? sourceData : sourceData.filter(s => (s.typeId || s[typeKey]) === activeFilter);
```

- [ ] **Step 8: Run the full suite, manual check**

`npx playwright test`. Manual: confirm History renders correctly for both domains post-migration (colors, badges, filters all still work exactly as before — this task is a pure refactor, zero visible behavior change expected yet, since rename/reorder don't exist until Tasks 4/5); confirm "copy last workout" and the session-name placeholder still work; confirm an in-flight draft survives a normal save/reload cycle (not yet testing the rename-survives-draft case — that's Task 4's job).

- [ ] **Step 9: Commit**

```bash
git add public/index.html
git commit -m "feat(types): convert history rendering, drafts, and filters to resolve types by id"
```

---

## Task 4: Rename feature (both domains)

**Files:**
- Modify: `public/index.html` — `renderEditTabs`/`renderCardioEditTabs` (Task 2 already updated these; this task adds the rename affordance itself), new functions `renameWorkoutType`/`renameCardioType`.
- Modify: `public/translations.js` — new i18n keys if any new UI text is introduced (a rename prompt/input, if using a `prompt()`-free inline-edit pattern matching this app's existing conventions).

**Interfaces:**
- Produces: `renameWorkoutType(typeId, newName)`/`renameCardioType(typeId, newName)` — validate non-empty + no duplicate (case-insensitive) against every *other* type's current name, update the matched type's `.name` in place, re-render, no other field touched.

- [ ] **Step 1: Design the rename affordance's markup**

This app has no existing inline-rename pattern to copy verbatim (confirmed during investigation — every other editable text in this app is either a full form input always visible, or an add-only flow). Add a simple, consistent affordance: make the tab label itself a clickable element that swaps to an `<input>` in place, matching the visual weight of the existing "add type" flow's own input styling (`#newTypeName`'s CSS class). Find `renderEditTabs` (as updated by Task 2 Step 1) and add an `onclick` on the name span (not the whole tab button, to avoid conflicting with the existing tab-switch click) that calls a new `promptRenameType(typeId)`:

```js
function renderEditTabs() {
  const canRemove = workoutTypes.length > 1;
  document.getElementById('editTabs').innerHTML =
    workoutTypes.map(wtype =>
      `<div class="tab-item${wtype.id===editTab?' active':''}">
        <button class="tab-btn" onclick="switchEditTab('${escHtml(wtype.id)}')">
          <span class="count-pill">${(editTemplates[wtype.id]||[]).length}</span>
          <span class="tab-name" ondblclick="event.stopPropagation(); promptRenameType('${escHtml(wtype.id)}')">${escHtml(wtype.name)}</span>
        </button>
        ${canRemove ? `<button class="tab-remove" onclick="removeWorkoutType('${escHtml(wtype.id)}')" title="✕">✕</button>` : ''}
      </div>`
    ).join('') +
    `<div class="tab-item add-tab-item">
      <button class="tab-btn add-tab-btn" onclick="showAddTypeForm()">+</button>
    </div>`;
}
```

(Double-click/double-tap to rename, matching a common, discoverable-enough convention that doesn't require new persistent UI chrome or risk accidental triggers from a single tap that's already claimed by tab-switching. `event.stopPropagation()` prevents the double-click's first click from also firing the parent button's `switchEditTab`.) Apply the identical `<span class="tab-name" ondblclick="...">` wrapping to `renderCardioEditTabs`.

- [ ] **Step 2: Implement `promptRenameType`/`promptRenameCardioType` + `renameWorkoutType`/`renameCardioType`**

Add, near `confirmAddType`:

```js
function promptRenameType(typeId) {
  const current = workoutTypes.find(t => t.id === typeId);
  if (!current) return;
  const newName = prompt(t('edit.rename_prompt'), current.name);
  if (newName === null) return; // cancelled
  renameWorkoutType(typeId, newName.trim());
}

function renameWorkoutType(typeId, newName) {
  if (!newName) return;
  const current = workoutTypes.find(t => t.id === typeId);
  if (!current) return;
  const duplicate = workoutTypes.some(t => t.id !== typeId && t.name.toLowerCase() === newName.toLowerCase());
  if (duplicate) { toast(t('edit.type_exists'), 'error'); return; }
  current.name = newName;
  renderEditAll();
  toast(t('edit.type_renamed'), 'success');
}
```

Add the identical pair (`promptRenameCardioType`/`renameCardioType`) operating on `runningTypes`/`renderCardioEditAll`. Note: this only updates in-memory state — the existing `saveTemplates()`/`saveCardioTemplates()` button (already wired, unchanged) persists it, exactly like every other in-editor change (add/remove/field edits) already works today; no new save path needed.

- [ ] **Step 3: Add the new translation keys**

Find `public/translations.js`'s Hebrew block, near `'edit.type_added'`/`'edit.type_exists'`/`'edit.type_removed'`, add:

```js
    'edit.rename_prompt':  'שם חדש לסוג האימון:',
    'edit.type_renamed':   'שם הסוג עודכן',
```

Add the matching English pair near the equivalent English keys:

```js
    'edit.rename_prompt':  'New name for this workout type:',
    'edit.type_renamed':   'Type renamed',
```

- [ ] **Step 4: Window-export the two new onclick-invoked functions**

Per this file's established, repeatedly-learned-the-hard-way convention (`<script type="module">` doesn't auto-attach top-level functions to `window`): add `promptRenameType, promptRenameCardioType` to the same `Object.assign(window, {...})` block that already exports `confirmAddType`/`confirmAddCardioType` (grep to find the exact block, confirm `renameWorkoutType`/`renameCardioType` do NOT need exporting since they're never called from markup directly, only from the two prompt functions).

- [ ] **Step 5: Run the full suite, manual check**

`npx playwright test`. Manual, both domains: double-click/tap a type's tab name, confirm the rename prompt appears pre-filled with the current name, rename it, confirm the tab updates immediately, save, reload, confirm the new name persisted. Confirm renaming to a duplicate (case-insensitive) of another existing type is rejected with the existing `edit.type_exists` message. **Confirm the specific scenario this whole plan exists for**: rename a type that has real history, switch to History, confirm entries logged under the OLD name now display under the NEW name and are still correctly grouped/filterable as one continuous type (not split into two). Confirm a type's color is unchanged after a rename.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "feat(types): add rename for workout types (strength + cardio)"
```

---

## Task 5: Reorder feature (both domains)

**Files:**
- Modify: `public/index.html` — `renderEditTabs`/`renderCardioEditTabs` (add drag handles to type tabs), new `startTypeDrag(domain)` factory reusing `startGenericDrag`.

**Interfaces:**
- Consumes: `startGenericDrag(e, card, container, collectAtStart, onDrop)` (already exists, `public/index.html:4779`, already generic over what "collect"/"drop" mean).
- Produces: `startTypeDrag(domain)`, wired into `renderEditTabs`/`renderCardioEditTabs` via `initDragSort`.

- [ ] **Step 1: Give each type tab a `.drag-handle` and mark the tab container as drag-sortable**

`initDragSort(container, startFn)` (`public/index.html:4760-4765`) already generically wires up any `.drag-handle` inside `container` to `startFn`, and `startGenericDrag`'s own reorder logic (`public/index.html:4779-4814`) already generically operates on whatever elements share the class `.edit-card` inside that container (re-reads DOM order via `collectAtStart`/writes it back via `onDrop`) — it has **no hardcoded assumption about what's being dragged**, confirmed during investigation. Reusing it for type tabs means giving each tab a `.edit-card` class (not just `.tab-item`) and a `.drag-handle` child, then calling `initDragSort` on the tabs container the same way `renderEditList` already does for field/exercise cards.

Find `renderEditTabs` (as it stands after Task 4 Step 1) and add a drag handle + the `edit-card` class to each `.tab-item`:

```js
function renderEditTabs() {
  const canRemove = workoutTypes.length > 1;
  document.getElementById('editTabs').innerHTML =
    workoutTypes.map(wtype =>
      `<div class="tab-item edit-card${wtype.id===editTab?' active':''}" data-id="${escHtml(wtype.id)}">
        <span class="drag-handle">⠿</span>
        <button class="tab-btn" onclick="switchEditTab('${escHtml(wtype.id)}')">
          <span class="count-pill">${(editTemplates[wtype.id]||[]).length}</span>
          <span class="tab-name" ondblclick="event.stopPropagation(); promptRenameType('${escHtml(wtype.id)}')">${escHtml(wtype.name)}</span>
        </button>
        ${canRemove ? `<button class="tab-remove" onclick="removeWorkoutType('${escHtml(wtype.id)}')" title="✕">✕</button>` : ''}
      </div>`
    ).join('') +
    `<div class="tab-item add-tab-item">
      <button class="tab-btn add-tab-btn" onclick="showAddTypeForm()">+</button>
    </div>`;
  initDragSort(document.getElementById('editTabs'), startTypeDrag('strength'));
}
```

(`data-id` mirrors the exact pattern `renderEditList`'s own `.edit-card` elements already use, `public/index.html:4526` — `card.dataset.id = ex.id`. The `+`-add tab intentionally stays a plain `.tab-item` without `.edit-card`, so it's never a drag target — `startGenericDrag`'s reorder loop only ever queries `.edit-card`, confirmed by reading its implementation, so this exclusion is automatic, not something requiring an extra guard.) Apply the identical transformation to `renderCardioEditTabs`, calling `initDragSort(..., startTypeDrag('cardio'))`.

- [ ] **Step 2: Implement `startTypeDrag`**

Add, near `startEditDrag`:

```js
// Domain-aware drag-start factory for reordering the type tabs themselves
// (as opposed to startEditDrag, which reorders one type's field/exercise
// list). Mirrors startEditDrag's own shape exactly: startGenericDrag
// doesn't care what's being dragged, only that .edit-card elements exist
// inside the given container and that collectAtStart/onDrop can read/write
// the domain's own order state.
function startTypeDrag(domain) {
  return (e, card, container) => {
    startGenericDrag(e, card, container, () => {}, () => _commitTypeOrder(domain, container));
  };
}

function _commitTypeOrder(domain, container) {
  const orderedIds = [...container.querySelectorAll('.edit-card')].map(c => c.dataset.id);
  const registry = domain === 'cardio' ? runningTypes : workoutTypes;
  const reordered = orderedIds.map(id => registry.find(t => t.id === id)).filter(Boolean);
  if (domain === 'cardio') runningTypes = reordered; else workoutTypes = reordered;
}
```

(`collectAtStart` is a no-op here — unlike `startEditDrag`, which needs to snapshot in-progress field-edit DOM state via `collectEdits` before the drag begins, there is no in-progress editable state to lose when dragging a tab; the type registry itself only needs to be re-read from DOM order once, on drop, via `_commitTypeOrder`.)

- [ ] **Step 3: Confirm colors/ids are untouched by a reorder (this is the whole point of Task 1's color-at-creation design)**

No code change for this step — it's a direct consequence of Task 1/Task 3 Step 1 (`typeColorClass` reads `.color`, never recomputes from position) and this task's own `_commitTypeOrder` (which only ever reorders the array, never mutates any entry's `id`/`name`/`color`). Confirm this holds by manual verification in Step 4, not by writing defensive code that shouldn't be necessary if the earlier tasks were implemented correctly.

- [ ] **Step 4: Run the full suite, manual check**

`npx playwright test`. Manual, both domains: drag a type tab to a new position, confirm it visually reorders and stays there through a subsequent re-render (e.g. adding/removing a different type); save, reload, confirm the new order persisted; **confirm every type's color is exactly what it was before the reorder** (this is the specific regression this whole design decision exists to prevent); confirm the daily-entry page's own type-selector buttons (not just the editor's tabs) reflect the new order too, since both read from the same `workoutTypes`/`runningTypes` array.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat(types): add drag-to-reorder for workout type tabs (strength + cardio)"
```

---

## Task 6: New test coverage + full regression pass

**Files:**
- Modify: `tests/workout.spec.ts` (strength rename/reorder/color-persistence tests), `tests/running.spec.ts` (cardio equivalents), possibly `tests/history.spec.ts` (rename-preserves-history-grouping test).

- [ ] **Step 1: Write the tests specified in the spec's §8**

Per `docs/superpowers/specs/2026-09-10-type-identity-rename-reorder-design.md` §8: rename persists across reload; reorder persists across reload without changing colors; history correctly groups an old-named entry under a type's new name after rename; a mid-session draft survives a rename of its own type; the migration is idempotent (a targeted unit-style check of `_migrateTypeIdentityForDomain`'s two guard conditions, matching how `migrateCardioDataV2`'s idempotency was originally verified — by code reading/targeted repro, not a live double-migration against real account data). Write these as real Playwright tests following this project's own established conventions (see any recent `tests/*.spec.ts` file added by an earlier plan in this project's history for the house style — real UI interaction, not internal-state pokes, except where a debug hook is the established pattern for something otherwise unobservable).

- [ ] **Step 2: Run the FULL suite (not just the new/targeted tests)**

`npx playwright test` — all spec files. This project's own history has repeatedly found real regressions this way that targeted-test-only verification missed (documented multiple times across earlier plans in this project). Categorize every failure: confirm it's either a known pre-existing category (exercise-card timing race, dark-mode toggle) or a genuine regression from this plan's own 5 prior tasks — fix any genuine regression found before proceeding.

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "test: add coverage for workout type rename, reorder, and color persistence"
```

---

## Task 7: Update product documentation

**Files:**
- Modify: `docs/product/02-workout-strength.md`, `docs/product/07-running-cardio.md`, `docs/product/14-data-model-backend.md`, `docs/product/04-history.md`.

- [ ] **Step 1: Update each doc**

Read each file's current content first (per this project's own standing convention — describe what's actually shipped, not what the plan predicted, in case anything shifted during implementation). `02-workout-strength.md`/`07-running-cardio.md`: document the new rename (double-click a tab name) and reorder (drag a tab) capabilities. `14-data-model-backend.md`: replace the `types: string[]` description with `types: {id,name,color}[]`, document the additive `typeId` field on `workouts`/`runWorkouts` documents and its fallback behavior when absent, document the one-time `typeIdentityMigratedV1` migration. `04-history.md`: note that filtering/grouping resolves by `typeId` (falling back to the frozen name string), so a renamed type's full history stays together under its current name.

- [ ] **Step 2: Commit**

```bash
git add docs/product/
git commit -m "docs: document workout type rename/reorder and the id-based type identity model"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Spec coverage:** §3 (data model) → Task 1. §4 (migration) → Task 1. §5.1 (rename) → Task 4. §5.2 (reorder) → Task 5. §6 (full affected-site list) → Tasks 2/3 cover every row. §8 (testing) → Task 6. §9 (docs) → Task 7.
- **Type/name consistency check:** `typeId` (the new field name on historical documents) is used identically across Tasks 1/3/4/6. `{id,name,color}` field names are used identically across every task that constructs or reads a type object. `genId()`, `escHtml()`, `initDragSort`/`startGenericDrag` are all pre-existing helpers reused verbatim, not redefined.
- **No placeholders:** every step has real code for its novel logic. Tasks 2/3's more repetitive conversions are specified as complete, unambiguous transformation rules applied to an exhaustively verified list of exact locations (file:line references confirmed via direct code reading during this plan's own investigation phase) rather than vague instructions — this is a deliberate, disclosed calibration for this plan's unusually large surface area, not a gap: an implementer following Task 3 Step 2/4/5/7's "confirm X, apply the same pattern" instructions has a fully specified, mechanically-checkable job, even where the exact current line text wasn't reproduced verbatim in this document.
