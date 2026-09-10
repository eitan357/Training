# Workout Type Identity (Rename + Reorder) — Design Spec

## 1. Problem & Goal

Today, a workout type (strength's "A"/"B", cardio's "Running"/"Elliptical") has no identity beyond its display name — `workoutTypes`/`runningTypes` are plain string arrays, and every place in the app that needs to reference "this specific type" (templates, history, colors, filters, drafts, last-workout lookups) does so by comparing that name string directly. This means:

- **There is no way to rename a type today.** The only operations are add and remove.
- **There is no way to reorder types relative to each other.** (Field-level drag-reorder exists *within* a type's template; type-level reordering of the tabs themselves does not exist.)

Eitan asked for both: rename a type's display name, and reorder types — **without retroactively rewriting historical workout data**, by introducing a stable ID that survives a rename. Confirmed via discussion:

- IDs must be backfilled retroactively onto every type that already exists in every user's data, not just new types going forward.
- The UI never needs to show anything about a type's previous name(s) — the ID linkage is purely internal bookkeeping, not a user-facing feature.
- Colors, currently assigned by array **position** (`typeColorClass`'s `types.indexOf(typeName) % 6`), move to being assigned **once, permanently, at ID-creation time** — so reordering a type no longer reshuffles its color.

## 2. Scope

Both domains — strength (`workoutTypes`/`editTemplates`) and cardio (`runningTypes`/`cardioEditTemplates`) — since they share the exact same structural pattern (confirmed identical shape across every touched function during investigation).

## 3. Data Model

### 3.1 Type registry shape change

**Before:** `config/templates` (strength) / `config/runningTemplates` (cardio) documents have a `types: string[]` field, and each type's exercise/field array is stored under a top-level key equal to the type's **name** (e.g. `templateData['A'] = [...]`).

**After:** `types` becomes `{ id: string, name: string, color: number }[]`. Each type's field/exercise array is stored under a top-level key equal to the type's **id**, not its name — so a rename only ever touches the `name` property of one array entry; nothing about where its template data lives changes.

`color` is an integer `0..5` (an index into the existing 6-color palette — `--green`/`--primary`/`#aa7941`/`#9b5aaf`/`#a05555`/`#4a8a8a`), assigned once at creation time and never recomputed from position again:
- **For types backfilled by the migration** (§4): assigned in the existing array's current order (index 0, 1, 2, ...) — the same values types 0/1 already have today (green/purple) are preserved for the two oldest types in every existing user's data, so no already-saved session visibly changes color at migration time.
- **For a brand-new type added after migration** (`confirmAddType`/`confirmAddCardioType`, §5): assigned the next color in rotation — `existingTypes.length % 6` at the moment of creation (i.e. simply continuing the same sequence the migration started, consistent with how `typeColorClass` already computes `idx % TYPE_COLOR_PALETTE_SIZE` today, just evaluated once at creation instead of on every render).

`dateFieldHiddenByType` (strength's per-type "hide the date field" setting, `public/index.html:3004`) is keyed by name today — becomes keyed by id, same rationale.

### 3.2 Historical documents

**Every `workouts` and `runWorkouts` document already stores `type`/`workoutType` as a plain name string — this field is left completely untouched, forever.** No historical document's existing fields are rewritten. This directly satisfies "info shouldn't change retroactively" in the strongest sense: not even a bulk name-relabel touches saved workout data.

A new field, `typeId`, is added going forward on every new save, and **backfilled once, retroactively, on every existing document** via the one-time migration (§4). Once backfilled, every doc — old and new — carries both:
- `type`/`workoutType`: a frozen name snapshot (what it already had, or what was current at save time going forward) — kept only as a defensive fallback, never read as the primary source of truth for display once `typeId` is present.
- `typeId`: the stable, permanent reference.

**Display and grouping always resolve through `typeId` → the current registry entry**, so a card logged under the old name shows the *current* name after a rename, and current-name filters/streaks correctly include everything ever logged under that type regardless of what it was called at save time. (This is the practical reason "link by ID" matters: without it, renaming a type would silently split its history into two disconnected buckets under History's filter UI.)

### 3.3 Drafts (auto-save)

Draft keys — both the `localStorage` key and the Firestore document id under `users/{uid}/drafts/` — currently embed the type **name** directly (`draft_${uid}_${domain}_${type}`, and separately, inlined at several call sites, `${domain}_${type}` as the Firestore doc id). Both move to embedding the type's **id** instead, so an in-flight draft survives a rename performed mid-session rather than becoming unreachable under a since-changed key.

## 4. Migration (one-time, retroactive, per-user)

Runs once per user on next load, guarded the same way every other one-time migration in this app already is (`config/settings.<flag>MigratedVN === true`), with the same idempotency discipline this project has needed twice before (Phase B's cardio migration, both times for real): **a partial-failure-then-retry must never re-process an already-migrated record.**

Per user, per domain (strength then cardio, independently guarded):

1. Read the current `types: string[]` array from `config/templates`/`config/runningTemplates`.
2. If already migrated (guard flag set, or `types` entries are already objects — belt-and-suspenders check), skip.
3. For each existing name, generate a stable id (`genId()`, the helper already used everywhere else in this file for exercise/field ids) and an assigned `color` (0-indexed by position in this original array — preserving today's existing green/purple assignment for whichever two types are first, exactly as already true).
4. Move each name's field/exercise array from being keyed by name to being keyed by the new id.
5. Write the new `{id,name,color}[]` registry back to `config/templates`/`config/runningTemplates`.
6. Read every `workouts`/`runWorkouts` document for that user; for each one whose `type`/`workoutType` string matches one of the just-assigned names **and that doesn't already have a `typeId`** (idempotency guard, matching the exact pattern Phase B's `migrateCardioDataV2` already established), write `typeId` onto it — an additive field, the existing `type`/`workoutType` string is untouched.
7. Set the guard flag only after every step above succeeds for that domain.

Drafts are **not** migrated by this pass — an in-flight draft that predates this migration is, at worst, lost the same one-time way Phase A's draft-key-shape change already cost users once before (already documented/accepted precedent, `docs/product` already notes this asymmetry) — not worth the complexity of migrating live in-progress form state.

## 5. New Features

### 5.1 Rename

A new inline rename affordance on each type's tab in the template editor (both domains) — click/tap a type name to edit it, matching the app's plain, no-frills editing conventions elsewhere. Renaming looks the type up by id in the registry and updates only its `name`; nothing else about it (id, color, field templates, position) changes. Duplicate-name validation (case-insensitive, matching the existing add-type check) applies against every *other* type's current name.

### 5.2 Reorder

Drag-and-drop reordering of the type tabs themselves, reusing the exact same drag mechanism already used for reordering fields/exercises within a type (`initDragSort`/`startGenericDrag`/`startEditDrag`) — extended to also support reordering the top-level `types` array. Reordering only changes array order; it never touches any type's `id`/`color`, so colors stay exactly where the user last set them regardless of tab order (§3.1).

## 6. Full List of Affected Call Sites (name-keyed → id-keyed)

Verified by direct code reading, not assumed. Both domains have the identical shape at each row.

| Concern | Strength | Cardio |
|---|---|---|
| Registry array | `workoutTypes` | `runningTypes` |
| Field/exercise template map | `editTemplates[name]` → `editTemplates[id]` | `cardioEditTemplates[name]` → `[id]` |
| Currently-active tab | `editTab` (name → id) | `cardioEditTab` (name → id) |
| Currently-selected daily-entry type | `selectedType` (name → id) | `cardioSelectedType` (name → id) |
| Add | `confirmAddType` | `confirmAddCardioType` |
| Remove | `removeWorkoutType` | `removeCardioType` |
| Switch tab | `switchEditTab` | `switchCardioEditTab` |
| Save | `saveTemplates` → `WORKOUT_DOMAINS.strength.buildSaveDoc` | `saveCardioTemplates` → `WORKOUT_DOMAINS.cardio.buildSaveDoc` |
| Render tabs | `renderEditTabs` | `renderCardioEditTabs` |
| Color assignment | `typeColorClass(types, typeName)` → resolve by id, read `.color` directly instead of computing from position | same function, shared |
| History filter | `activeFilter`, `renderFilterButtons` | same, domain-generic already |
| Last-workout lookup | `lastWorkouts[name]` → `[id]` | `lastCardioWorkouts[name]` → `[id]` |
| Per-type date-field-hidden setting | `strengthDateFieldHiddenByType[name]` → `[id]`, `_isStrengthDateFieldHidden` | n/a (cardio's date field is per-field-row, not per-type) |
| Draft keys (localStorage + Firestore doc id) | `_draftKey(domain, type)` + inlined `domain + '_' + type` at ~4 call sites | same, shared function |
| Draft promotion | `checkAndAutoSavePreviousDrafts()` | same |
| History card badge/body/color dispatch | `WORKOUT_DOMAINS.strength.colorClass`/`badgeText` (read `s.type`) | `WORKOUT_DOMAINS.cardio` equivalents (read `s.workoutType`) — both move to resolving the CURRENT name via `typeId` first, falling back to the frozen name string only if `typeId` is absent (pre-migration edge case) |

## 7. Explicitly Out of Scope

- No UI ever shows a type's previous name(s) after a rename (confirmed, not needed).
- No migration of in-flight drafts (§4).
- No change to how strength's per-exercise `id` or cardio's per-field `id` work — this is entirely about the type/tab level, one level up.
- The already-known, already-disclosed pre-existing bugs from earlier rounds (the `DD/MM/YYYY` month-filter misparse, `deleteSession`'s missing UI, etc.) are untouched by this feature.

## 8. Testing

New Playwright coverage needed (existing tests are expected to be unaffected by this refactor's own mechanics, since none of them assert on the *shape* of `workoutTypes`/`runningTypes` directly — they interact through the rendered UI): rename persists across reload; reorder persists across reload and doesn't touch colors; a type's color survives a reorder; history correctly groups an old-named entry under a type's new name after rename; a mid-session draft survives a rename of its own type; the one-time migration is idempotent under a simulated partial-failure-then-retry (matching the existing test pattern already used for Phase B's cardio migration).

## 9. Documentation

`docs/product/02-workout-strength.md`, `docs/product/07-running-cardio.md` (both: document rename/reorder), `docs/product/14-data-model-backend.md` (registry shape, `typeId` backfill), `docs/product/04-history.md` (filter/grouping now resolves by id). Updated per-task as the implementation plan proceeds, per standing instruction.
