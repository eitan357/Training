# Cardio Page Redesign & Strength/Cardio Shared Engine — Design Spec

**Date:** 2026-08-31
**Applies to:** `public/index.html` (single source for web + Android/Capacitor), `public/translations.js`
**Driven by:** a single user request to (1) open the cardio page to all users, (2) rebuild it to match the strength page's UX (type tabs, dynamic fields, draft auto-save, copy-last-workout, clear-form), (3) give it a template editor like the strength page's, (4) fold its history into the unified History page, and (5) extract the overlapping behavior into shared functions used by *both* strength and cardio.

## 1. Current state (verified by reading the code, not assumed)

- **Feature gate:** `RUN_ALLOWED = ['eitan357@gmail.com', 'test@gmail.com']` ([index.html:1402](../../../public/index.html#L1402)) controls only the visibility of the settings toggle row ([index.html:1405](../../../public/index.html#L1405)); it is not a security boundary (documented in `docs/product/12-security-and-privacy.md`).
- **Running page today** is a 3-sub-view SPA-within-a-section (`run-view-dashboard`/`run-view-add`/`run-view-history`), navigated via its own `history.pushState` calls ([index.html:1595](../../../public/index.html#L1595), [1603](../../../public/index.html#L1603)) and a dedicated `popstate` listener ([index.html:4189-4191](../../../public/index.html#L4189-L4191)) — separate from, and not integrated with, the (also unimplemented) unified router plan.
  - Dashboard: `renderRunDashboard()` ([1628](../../../public/index.html#L1628)) — streak, PR card, "last workout" card. `renderRunCharts()` ([1686](../../../public/index.html#L1686)) — 5 Chart.js lines driven by `RUN_CHARTS_CONFIG` ([1670](../../../public/index.html#L1670)).
  - Add wizard: `runShowStep1/runSelectType/runShowStep2/runShowStep3` ([1747-1824](../../../public/index.html#L1747)) — step 2 is Elliptical-only OCR via `runHandleOcr()` ([1798](../../../public/index.html#L1798)) → `parseOcrText()` ([1824](../../../public/index.html#L1824), lazy-loads Tesseract.js).
  - History: `renderRunHistory()` ([1949](../../../public/index.html#L1949)) — flat list, no month grouping, no edit, no delete.
  - Data layer: `loadRunData()` ([1483](../../../public/index.html#L1483)) auto-creates `runWorkoutTypes` (`Running`, `Elliptical`) on first visit; `addRunWorkout()` ([1513](../../../public/index.html#L1513)) writes to `users/{uid}/runWorkouts` with a **fixed** field set (`distanceKm`, `durationMinutes`, `calories?`, `avgStridesPerMin?`, `avgHeartRate?`, `feltTired`, `notes?`).
  - `loadRunningEnabled()`/`saveRunningEnabled()` ([1412](../../../public/index.html#L1412), [1422](../../../public/index.html#L1422)) — the on/off toggle, `users/{uid}/config/settings.runningEnabled`.
- **Strength page's reusable behaviors (the extraction source):**
  - Type tabs + snapshot/restore: `selectType()` ([2785](../../../public/index.html#L2785)), `_tabSnapshotCurrent()` ([2707](../../../public/index.html#L2707)), `_tabRestoreOrDraft()` ([2712](../../../public/index.html#L2712)).
  - Draft engine: `_draftAttachListeners()` ([2537](../../../public/index.html#L2537)), `_draftStartFirestoreTimer()` ([2542](../../../public/index.html#L2542)), `_draftQualifies()` ([2466](../../../public/index.html#L2466)), `checkAndAutoSavePreviousDrafts()` ([2652](../../../public/index.html#L2652)), `_applyLocalCache()` ([2557](../../../public/index.html#L2557)). Draft keys today: `draft_{uid}_{type}` (localStorage), `users/{uid}/drafts/{type}` (Firestore) — **not namespaced by domain**.
  - `copyLastWorkout()` ([3930](../../../public/index.html#L3930)), `clearWorkoutForm()` ([2765](../../../public/index.html#L2765)), `submitData()` ([2913](../../../public/index.html#L2913)).
  - Template editor shell: `confirmAddType()` ([3451](../../../public/index.html#L3451)), `removeWorkoutType()` ([3464](../../../public/index.html#L3464)), `renderEditList()` ([3383](../../../public/index.html#L3383)), `addEditExercise()` ([3414](../../../public/index.html#L3414)), `saveTemplates()` ([3474](../../../public/index.html#L3474)), drag/drop via `startGenericDrag()` ([3512](../../../public/index.html#L3512), already shared with Measurements).
  - History: `renderHistory()` ([3060](../../../public/index.html#L3060)), `toggleSess()` ([3221](../../../public/index.html#L3221)), long-press select (`_attachHistLongPress` and friends, [3098-3161]), `editSession()` ([3231](../../../public/index.html#L3231)), `deleteSession()` ([3313](../../../public/index.html#L3313)), `bulkDeleteSessions()` ([4294](../../../public/index.html#L4294)), `_toggleSelect()` ([4250](../../../public/index.html#L4250)).
  - Settings nav row for the template editor: [index.html:1172-1178](../../../public/index.html#L1172-L1178).
- **Data model today** (full detail in `docs/product/14-data-model-backend.md`): strength exercises are denormalized copies at save time, not references — this same guarantee is what the new cardio schema must replicate.

## 2. Goals / non-goals

**Goals:** open cardio to everyone; rebuild its daily-entry page and give it a template editor, both matching strength's UX; fold cardio history into the unified History page with full edit/delete parity; move the dashboard's streak/PR/charts into History as a stats block; extract genuinely-shared behavior into functions consumed by both strength and cardio, updating strength's call sites to use them.

**Non-goals (confirmed with the user):** OCR is removed entirely, not adapted. `runWorkoutTypes` as a standalone collection is retired. No new top-level nav tab — cardio continues to occupy the same nav slot it swaps with Measurements today (section 1 of the request only asks to make that swap's *toggle* visible to everyone, not to add a 5th tab). This spec does not touch the unimplemented `2026-08-30-unified-navigation-history` plan directly, but flags where it goes stale (§8).

## 3. Data model

### 3.1 `users/{uid}/config/runningTemplates` (new, replaces `runWorkoutTypes` collection)

Single document, same shape as `config/templates`:

```js
{
  types: ["Running", "Elliptical"],           // display order
  "Running":    [ {id, label, fieldType}, ... ],
  "Elliptical": [ {id, label, fieldType}, ... ],
}
```

- `fieldType`: `'date' | 'text' | 'number' | 'checkbox'`.
- Field #1 of every type is always `{id:'date', label:<i18n at creation time>, fieldType:'date'}` — created automatically, not removable in the editor (its label remains editable). This mirrors Measurements' fixed date field and guarantees every entry sorts/groups correctly in History.
- New types created via the editor seed with the 8 fields from request §2.3/§4.2: תאריך (fixed), מרחק (number), זמן (number), קלוריות (number), צעדים (number), דופק ממוצע (number), הרגשתי עייפות (checkbox), הערות (text).
- `id` is a stable slug/uuid per field, independent of `label` — this is what lets a later label edit not orphan history (§3.2).

### 3.2 `users/{uid}/runWorkouts` (schema rewritten)

```js
{
  date, dateISO,                 // same dual-format convention as workouts/measurements
  workoutType: "Running",        // plain type name, same convention as strength's `type`
  sessionName?: string,
  fields: [ {id, label, fieldType, value}, ... ],   // denormalized snapshot at save time
  autoSaved?: true,
  createdAt,
}
```

This directly parallels the strength `exercises[]` denormalization described in `docs/product/14-data-model-backend.md` §"תרגילים... נשמרים שטוחים": renaming a field in the template later does not rewrite existing history, by design.

### 3.3 Draft keys get domain-namespaced

`draft_{uid}_{domain}_{type}` (localStorage) and `users/{uid}/drafts/{domain}_{type}` (Firestore), `domain ∈ {strength, cardio}`. This is a breaking key-format change for strength too (existing in-flight strength drafts under the old `draft_{uid}_{type}` key are a one-time loss for anyone with an open draft the day this ships — acceptable, called out in the plan as a deploy-day note, not a silent bug).

### 3.4 Migration (automatic, first load, one-time)

Guarded by a flag doc (`users/{uid}/config/settings.runningMigratedV2: true`) so it runs exactly once per user:
1. If `runningTemplates` doesn't exist and old `runWorkoutTypes` does: create `runningTemplates` with `Running`/`Elliptical`, each seeded with the **exact old fixed field set** (date, distanceKm→מרחק, durationMinutes→זמן, calories→קלוריות, avgStridesPerMin→צעדים, avgHeartRate→דופק ממוצע, feltTired→הרגשתי עייפות [checkbox], notes→הערות), preserving field `id`s equal to the old Firestore field keys (so step 2 can map by key).
2. Rewrite every old `runWorkouts` doc in place into the new `{fields: [...]}` shape using that mapping. Old `workoutTypeId` → resolved `workoutType` name via the (about-to-be-retired) `runWorkoutTypes` doc.
3. Delete the now-empty `runWorkoutTypes` collection docs (data itself already folded into `runningTemplates`).
4. Set the guard flag. Wrapped in the same silent try/catch pattern as `_backgroundSync` (§`docs/product/10`) — a migration failure must not block app load; it retries next load since the flag isn't set until success.

## 4. Shared engine (the extraction)

Each shared function takes a **domain descriptor** distinguishing strength vs. cardio, e.g.:

```js
const STRENGTH_DOMAIN = {
  key: 'strength',
  templatesDoc: 'config/templates',
  entriesCollection: 'workouts',
  draftPrefix: 'strength',
  itemsField: 'exercises',          // fixed-shape items, untouched renderer
};
const CARDIO_DOMAIN = {
  key: 'cardio',
  templatesDoc: 'config/runningTemplates',
  entriesCollection: 'runWorkouts',
  draftPrefix: 'cardio',
  itemsField: 'fields',             // dynamic-shape items, new typed renderer
};
```

**Extracted to shared, parameterized by domain:** type-tab row + snapshot/restore (generalizes `selectType`/`_tabSnapshotCurrent`/`_tabRestoreOrDraft`), the full draft engine (generalizes `_draft*`, keyed per §3.3), `copyLastWorkout`/`clearWorkoutForm`/session-name-field wiring, `submitData`'s outer skeleton (validate → write → update last-workout cache → clear draft → refresh), the template-editor shell (type carousel + add/remove-type + drag-drop + save-all, generalizes `confirmAddType`/`removeWorkoutType`/`saveTemplates`), and the entire History chrome (filter buttons, month grouping, long-press select, bulk delete, Arm & Confirm, per-type colors — generalizes `renderHistory`/`toggleSess`/`editSession`/`deleteSession`/`bulkDeleteSessions`/`_toggleSelect`).

**Left domain-specific (not shared):** strength's exercise-card renderer/collector (weight/sets/reps, legacy-target parsing, target-pill, over-target confirm dialog — **zero changes to this logic**, only its call sites move behind the new skeleton) and cardio's new typed-field renderer/collector (text/number/checkbox inputs, the add-field type-picker in the editor).

This is the highest-regression-risk part of the whole change, because it means editing strength's currently-working code paths. The implementation plan (§ next steps) sequences it as its own phase with the full existing strength Playwright suite (`workout.spec.ts`, `navigation.spec.ts`, `settings.spec.ts`) re-run after *every* task, before cardio-specific work starts.

## 5. Cardio daily page (`#sec-running`, replaces the 3-view dashboard)

Same layout skeleton as strength's main page, built on the shared engine (§4) with the `CARDIO_DOMAIN` descriptor:

1. Type tab row (user's cardio types, e.g. "Running", "Elliptical", or whatever they rename/add).
2. Last-workout preview (collapsible, same card pattern) + "העתק אימון אחרון" + "נקה טופס" + שם אימון field.
3. One input per template field, in template order, rendered by `fieldType` (text/number/checkbox; date field gets the same auto-format-while-typing `DD/MM/YYYY` input as Measurements' date field, for UI consistency across the app).
4. "+ הוסף שדה" — ad-hoc, **this entry only**, free-text value (same simplicity as strength's "+ הוסף תרגיל"; not saved to the template). Flagged as an open point in the summary below — the request doesn't say whether the ad-hoc field should also get a type picker.
5. "שמור אימון".

Draft auto-save applies identically (per cardio-type, `cardio_{type}` key).

## 6. Cardio template editor ("עריכת תוכנית אימוני אירובי")

New settings nav row inserted between the existing strength-editor row and the measurement-types row ([index.html:1178](../../../public/index.html#L1178)/[1180](../../../public/index.html#L1180)), opening an in-page editor panel exactly like `openWorkoutEdit()` does today (same panel-swap pattern, not a new route/section — consistent with §8's router note).

- Type carousel (add/remove type, min-1 guard) — shared shell.
- Per type: draggable field list (shared drag infra). Each field row: label input (free text, no translations.js entry — same "plain user text" convention as exercise names), a `fieldType` picker (text / number / checkbox segmented control — the one genuinely new UI element, no existing precedent), remove button (hidden/disabled for the fixed date field).
- "+ הוסף שדה" — adds a new row to the template with default `fieldType:'text'`, user adjusts.
- "שמור שינויים" — writes the whole `runningTemplates` doc, same single-doc-write pattern as `saveTemplates()`.

## 7. History page restructure

Two toggle buttons at the top of `#sec-history`: כוח / אירובי, switching which `entriesCollection`+domain descriptor feeds the shared history view (§4). Filters-by-type, month grouping, long-press multi-select, bulk delete, inline edit-in-card, Arm & Confirm single delete, and per-type colors all come from the shared engine — cardio gains edit/delete for the first time (today's `runWorkouts` history has neither, per `docs/product/07-running-cardio.md` §"אין עריכה ואין מחיקה").

Above the cardio history list: a stats block carrying the old dashboard's streak counter, PR card, and the 5 Chart.js lines (`RUN_CHARTS_CONFIG`) — reading from the migrated `fields[]` shape by matching `label` (e.g. the distance chart looks up whichever field has `label === "מרחק"` in each entry, falling back gracefully if a user renamed that field, since renamed labels only affect entries saved *after* the rename per §3.2's denormalization guarantee — pre-rename history keeps its old label and simply won't feed that specific chart line, which is an acceptable, documented consequence of the same design principle applied everywhere else in this app).

## 8. Settings & router impact

- `RUN_ALLOWED` gate ([index.html:1402](../../../public/index.html#L1402)) is deleted; the toggle row is unconditionally visible. The `runningEnabled` on/off toggle itself is unchanged (request §1 only asks to open *visibility*, not force it on).
- New nav row per §6.
- **Router plan interaction:** the unimplemented `2026-08-30-unified-navigation-history` plan's Task 5 (running sub-routes: `/running/add`, `/running/history`, wizard `runStep` sub-state) is obsolete under this redesign — the new cardio page needs no sub-routes, it behaves like strength's in-memory tab switching. If that router plan is executed after this one, Task 5 and the two `/running/*` entries in Task 1's `ROUTES` table need to be dropped/rewritten to just `'/running': { section: 'running' }`. Not fixed in this spec (out of scope), flagged so it isn't silently forgotten.

## 9. Deletion inventory (per the user's "delete only what's relevant" instruction)

**Delete:** the 3-step add wizard (`runShowStep1/2/3`, `runSelectType`'s Elliptical-branch), OCR (`runHandleOcr`, `parseOcrText`, the lazy Tesseract.js loader), the dedicated running `popstate` listener ([4189-4191](../../../public/index.html#L4189-L4191)), `runWorkoutTypes` collection usage, `RUN_CHARTS_CONFIG`'s current dashboard placement (moves, not deleted — §7), `RUN_ALLOWED`.

**Keep as shared infra (do not touch/delete):** `startGenericDrag`, `_toggleSelect`/Arm & Confirm helpers, `escHtml`, month-grouping + long-press-select machinery (generalized, not duplicated), everything in strength's exercise-card renderer.

## 10. Testing impact

`tests/running.spec.ts` — near-total rewrite (dashboard/wizard/OCR assertions no longer apply). `tests/history.spec.ts` — extended for the כוח/אירובי toggle and cardio edit/delete. `tests/settings.spec.ts` — gate-removal + new nav row. `tests/workout.spec.ts` — must keep passing unchanged after the shared-engine extraction (this is the regression canary for §4's risk). New: a migration test seeding old-schema fixtures and asserting the rewritten shape.

## 11. Open points for the user (not blocking, surfaced for a decision)

1. Should the ad-hoc "+ הוסף שדה" on the daily page (§5.4) get a type picker (text/number/checkbox) like the template editor's, or stay free-text-only like strength's ad-hoc exercise?
2. The per-type color scheme in History today is hardcoded for exactly `type A`/`type B` (green/purple by `type.toLowerCase()`). Cardio types are open-ended and user-named — needs a color-assignment strategy (e.g. hash-of-name → palette index) rather than the current 2-color hardcode.
3. `RUN_CHARTS_CONFIG`'s charts currently read fixed keys (`distanceKm`, `avgHeartRate`, etc.); under the dynamic-field model they must resolve by label match (§7) — if a user deletes/renames the "distance"-equivalent field on a type entirely, that chart line for that type has nothing to plot. Acceptable, but worth confirming.
4. Migration is per-user and Firestore-only client-side (no Cloud Functions) — it runs the next time `eitan357@gmail.com`/`test@gmail.com` load the app after this ships. No action needed from you, just confirming the mechanism.
