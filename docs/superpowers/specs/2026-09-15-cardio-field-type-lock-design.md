# Spec: Lock Cardio Field Type After Creation

**Requested:** 2026-09-15, by Eitan.

## Problem

The cardio template editor (`#cardioEditPanel` → `WORKOUT_DOMAINS.cardio.renderItemRow`, [public/index.html:3310-3342](../../public/index.html#L3310-L3342)) renders a `.field-type-picker` — three buttons (text/number/checkbox, [public/index.html:3334-3338](../../public/index.html#L3334-L3338)) — on **every** field row, unconditionally, whether the field was just added this session or has existed (and been saved, and possibly has real history entries recorded against it) for months.

This lets a user silently reclassify an already-saved field's type — e.g. flip "מרחק" (a `number` field with real distance data in dozens of past `runWorkouts` entries) to `checkbox` — with no warning and no relationship to what's actually stored in history. History's own rendering (`WORKOUT_DOMAINS.cardio.renderCardBody`, [public/index.html:3385-3403](../../public/index.html#L3385-L3403)) and PR/streak calculation key off `fieldType` per-record, not per-template, so this doesn't corrupt existing records — but it does let the *template* drift out of sync with what the field has always meant, silently, with one click and no confirmation. It's also the only structural property in either editor (strength or cardio) that can be mutated in place after creation — everything else structural (a type's `id`/`color`, ever since the 2026-09-10 type-identity work, [docs/product/14-data-model-backend.md](../product/14-data-model-backend.md)) is deliberately immutable once created, and the app's established pattern for "I want this different" is delete-and-recreate, not in-place mutation.

## Design decision

Restrict the field-type picker to a field the user is **actively in the process of creating** — added via "+ הוסף שדה" (`addCardioEditField()`, [public/index.html:4961-4968](../../public/index.html#L4961-L4968)) — and only until that field is actually persisted by a successful "שמור שינויים" (`saveCardioTemplates()`, [public/index.html:5042-5057](../../public/index.html#L5042-L5057)). The instant a save succeeds, that field (and every other field in the template) is "existing" and permanently locked: reopening the editor, switching tabs, or just looking at the row again shows only its label and target — never the picker again, even without leaving the page. The only way to give a field a different type from then on is to delete it (✕) and add a fresh one with the desired type — confirmed explicitly with Eitan as the intended UX ("if a user wants to change a row's behavior, they can create a new one and choose the behavior").

**Confirmed out of scope:** the 8 default fields auto-seeded when creating a brand new cardio type (`confirmAddCardioType()`, [public/index.html:4999-5011](../../public/index.html#L4999-L5011), seeded from `CARDIO_MIGRATION_FIELD_MAP`) are treated as locked from the moment they're seeded — same as any pre-existing field. They were **not** individually created via "+ הוסף שדה" one at a time, and Eitan explicitly chose "locked, no picker" for them over showing the picker on all 7 non-date defaults. Only fields added one at a time through "+ הוסף שדה" ever show the picker.

**Confirmed out of scope:** no visible "type" label/indicator is added for a locked field. Per Eitan: the type stays inferable from whether/what kind of target input is shown (a `number`-typed target input vs. a `text`-typed one vs. none at all for `checkbox`) — no new UI element.

**The strength (workout) template editor is unaffected** — it has no field-type concept at all (only name + target weight/sets/reps), so nothing there changes.

## Mechanism

The distinction between "new, still being created" and "existing, locked" needs a marker that:
1. Is set the moment a field is created via `addCardioEditField()`.
2. Survives every subsequent `collectEdits('cardio')` round-trip within the same unsaved editing session (switching tabs, adding another field, reordering by drag) — collectEdits rebuilds the in-memory template array from the live DOM on every one of those actions, so anything not explicitly preserved through that round-trip is lost after a single such action.
3. Is **never** written to Firestore.
4. Disappears the moment the field is actually saved — even if the user is still looking at the same screen — so the picker vanishes immediately, not just on the next visit.

This is done with a transient `_isNew: true` property on the field's plain-object representation, mirrored onto the row's own `data-is-new` DOM attribute (set once by `renderEditList()`, the same place `data-id`/`data-legacy-target` are already set today) so it survives DOM round-trips without living in Firestore-bound data at all. `WORKOUT_DOMAINS.cardio.buildSaveDoc()` strips `_isNew` before every write. Because `saveCardioTemplates()`'s existing `reloadAppData()` call rebuilds `cardioEditTemplates` **from what Firestore just returned** (which never carries `_isNew`, since it was stripped before the write), a saved field is automatically "existing" in the in-memory state the instant the save succeeds — the editor just also needs to actually re-render its currently-visible list at that point (today it doesn't — `saveCardioTemplates()` has no equivalent of `saveTemplates()`'s explicit post-save DOM patch for strength), or the now-locked field would keep showing its stale, already-rendered picker until the user did something else that happened to re-render the list (switch tabs, leave and come back).

A field's fieldType for an **existing** (locked, no-picker) row must be read from a value stamped onto the row once, at render time (`data-field-type`), rather than re-derived from `.field-type-picker .ftype-btn.active` on every `collectEdits()` call — that selector simply won't exist once the picker isn't rendered, and falling through to a hardcoded default would silently coerce every existing number/checkbox field back to `text` on the next tab-switch, add, remove, or save.

## Testing strategy

Playwright, against the real `test@gmail.com` account (this repo has no Firestore emulator — see [tests/running.spec.ts](../../tests/running.spec.ts)'s own header comment). Structural changes (adding/removing a cardio type) always go through a throwaway type created and removed within the same test (`CTLOCK_<timestamp>` naming, matching the existing `CTID_`/`CTID2_` convention in the "Cardio Type Identity" describe blocks), never onto Eitan's real Running/Elliptical types, and always cleaned up in a `finally` block per this repo's established data-safety discipline (see `[[feedback-verify-before-delete-test-data]]`).

Three behaviors need direct coverage:
1. A pre-existing field never shows the picker (both a real, already-saved field, and a brand-new type's 8 auto-seeded defaults) — read-only assertions, no save needed.
2. A field added via "+ הוסף שדה" this session shows the picker and can still be toggled between text/number/checkbox before saving — read-only/in-memory only, removed before the test ends, never saved.
3. A field added, then actually saved via "שמור שינויים", loses its picker **immediately**, without a reload or navigation away and back — this is the one behavior that did not exist before this feature at all (previously the picker never disappeared, ever) and specifically exercises the `saveCardioTemplates()` re-render fix.

The pre-existing test "field type picker toggles between text/number/checkbox" ([tests/running.spec.ts:322-328](../../tests/running.spec.ts#L322-L328)) directly contradicts the new behavior (it exercises the picker on the *second* field of an already-saved type) and must be replaced, not kept alongside the new tests.
