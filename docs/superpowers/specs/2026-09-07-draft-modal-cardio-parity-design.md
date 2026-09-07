# Spec: Draft-Modal Cross-Domain Bugs + Cardio Auto-Save Parity

**Reported:** 2026-09-07, screenshot from Eitan's Android device — a "Found draft for Running" modal (0 exercises shown) appeared while on the Strength page ("כוח", type A active).

## Problem

Three real, distinct bugs, all rooted in the same architectural gap: the shared draft-engine (`_draft*` functions, `WORKOUT_DOMAINS` registry) was built strength-first and generalized incompletely when cardio (Phase B) was added. Symptoms only became visible now because cardio's async data-loading gate is slow enough to expose races that strength's synchronous, cache-first path almost never hits.

### Bug 1 — draft modal can appear on the wrong page, for whatever type happened to be selected when the async chain resolves

`showSection('running')` calls `initRunSection()` **without awaiting it** ([index.html:2469](../../public/index.html#L2469)). `initRunSection()` does `await _runDataPromise` (a real Firestore fetch) before calling `selectCardioType(type)` → `_tabRestoreOrDraft('cardio', type)` → potentially `_draftShowModal('cardio', type, draft)`. If the user navigates away (e.g. taps "כוח" in the bottom nav) before that fetch resolves, the pending continuation still runs later and still calls `_draftShowModal`. The modal element (`#draftModal`, [index.html:925](../../public/index.html#L925)) is a **single shared DOM node physically nested inside `#sec-main`** (the Strength section) — so it only ever becomes visually visible when `#sec-main` is the active section. Net effect: a cardio draft-found modal, resolving late, pops up superimposed on whatever page the user has since navigated back to (in the screenshot: Strength).

The same unguarded-async shape also exists in `_backgroundSync`'s cold-boot branch ([index.html:3035-3046](../../public/index.html#L3035-L3046)), which calls `selectType(...)` → `_tabRestoreOrDraft('strength', type)` after an `await loadAllData()`. This is strength's own version of the identical race — much rarer in practice (strength's Phase-1 local cache usually makes this resolve near-instantly), but the same bug class.

**Eitan's point 1** ("the window needs to show for the *relevant* workout, like how Strength distinguishes A vs B") is the same bug from a different angle: once the modal is gated to only show when its domain+type is what the user is *actually* looking at right now, it necessarily only ever shows for the relevant, currently-active type — never a stale one.

### Bug 2 — cardio draft modal always shows "0 [items]", regardless of actual draft content

`_draftShowModal`'s item-count line is hardcoded to the strength draft shape:
```js
const exCount = (draft.exercises || []).filter(e => e.weight || e.sets || e.reps).length;
```
([index.html:3148](../../public/index.html#L3148)). Cardio drafts are shaped `{ workoutName, fields: [...] }` (see `WORKOUT_DOMAINS.cardio.serialize`, [index.html:2656-2666](../../public/index.html#L2656-L2666)) — they never have `.exercises`. So `draft.exercises` is always `undefined` → count is always `0`, for every cardio draft, unconditionally. Also, the label itself (`t('workout.exercises')` → "תרגילים"/"exercises") is strength-specific wording nonsensical for a cardio session.

### Bug 3 (found during investigation, not yet a live symptom) — the "most recent of its type" check for the auto-save badge reads the wrong domain's list

`buildSessionCard(domain, s, i)` is already a shared, domain-generic history-card renderer used by both domains ([index.html:3460](../../public/index.html#L3460)). Its auto-save-badge visibility check:
```js
${s.autoSaved && !allSessions.some(o => o.dateISO > s.dateISO) ? `<span class="auto-save-badge">...` : ''}
```
([index.html:3476](../../public/index.html#L3476)) closes over the **global `allSessions`** (strength-only) regardless of which `domain` is being rendered. `renderHistory()` already computes the correct domain-scoped list (`allRunWorkouts` for cardio, `allSessions` for strength, [index.html:3499](../../public/index.html#L3499)) but never passes it into `buildSessionCard`. This has been silently dead code for cardio because cardio has never had `autoSaved: true` entries before — Task 4 below makes it live, so this must be fixed as a prerequisite, not an afterthought.

### Eitan's point 2 — cardio has no equivalent of `checkAndAutoSavePreviousDrafts()`

`checkAndAutoSavePreviousDrafts()` ([index.html:3053-3117](../../public/index.html#L3053-L3117)) runs once per boot (`_backgroundSync`) and promotes any **previous-day** (not today's) qualifying draft into a real, permanent history entry — strength's safety net against "forgot to hit save." It is explicitly, deliberately strength-only today (its own comment: *"this function is strength-only and must not auto-save cardio drafts as strength workouts"*) — stale cardio drafts just sit forever as orphaned local/Firestore draft docs, never promoted, unlike strength. This is a real, current parity gap, not a hypothetical.

## Design decisions

**Guard placement (Bug 1 fix):** guard inside `_tabRestoreOrDraft`, immediately before the `_draftShowModal` call — NOT by early-returning the whole of `initRunSection()`/`_backgroundSync`'s cold-boot branch. Early-returning the outer function would also skip the DOM re-render work (`renderCardioTypeButtons`/`selectCardioType`'s form render, `selectType`'s exercise-list render), which is harmless to do into a hidden section and, for strength, is exactly what last round's A4 cold-boot fix depends on ([[project-training-diary]] — forcing `selectType` to actually re-render on cold boot). Skipping that render work when the section isn't active would silently reintroduce a variant of the just-fixed A4 dead-end. Scoping the guard to just the modal call avoids that regression entirely while still fixing the actual visible symptom.

**Guard shape:** a new tiny helper, generalized via the registry (matching how every other piece of domain-specific behavior in this file is already dispatched):
```js
function _isDomainTypeCurrentlyVisible(domain, type) {
  const D = WORKOUT_DOMAINS[domain];
  return currentSection === D.sectionName && D.getSelectedType() === type;
}
```
requiring a new `sectionName` field on each domain config (`'main'` / `'running'`, matching the existing `ROUTES` table's own `section` values). The type-equality half is currently always-true-by-construction at this call site (the caller already just set `selectedType`/`cardioSelectedType = type` before calling `_tabRestoreOrDraft`) — kept anyway as a cheap, self-documenting defensive check rather than relying on that invariant silently, in case a future call site doesn't uphold it.

**Item-count generalization (Bug 2 fix):** add `draftItemsSummary: draft => string` to each domain config, reusing each domain's *already-existing* history-card label convention rather than inventing new i18n keys — strength already has `t('workout.exercises')` (used by `renderCardMeta`), cardio already has `t('cardio.fields_count')` (ditto, [index.html:2734](../../public/index.html#L2734)). `_draftShowModal` calls `WORKOUT_DOMAINS[domain].draftItemsSummary(draft)` instead of the hardcoded strength-shaped line.

**Badge fix (Bug 3):** add `getAllEntries: () => allSessions` / `() => allRunWorkouts` to each domain config (mirroring the existing `getSelectedType`/`getTemplates` getter pattern) and have `buildSessionCard` call `WORKOUT_DOMAINS[domain].getAllEntries()` instead of the bare global.

**Auto-save generalization (Eitan's point 2):** generalize `checkAndAutoSavePreviousDrafts()` to loop `Object.keys(WORKOUT_DOMAINS)`, delegating the per-domain "can this draft become a real entry, and what does that entry look like" decision to a new `buildAutoSaveEntry: draft => entryObject | null` config function per domain:
- **strength's `buildAutoSaveEntry`** is the existing inline logic extracted verbatim (dating by `draft.createdAt`, filtering exercises with any of weight/sets/reps/notes) — zero behavior change, pure extraction.
- **cardio's `buildAutoSaveEntry`** mirrors `submitCardioData()`'s own validation exactly (skip empty non-checkbox fields, reject the whole draft on any unnamed field or negative number, require a valid `DD/MM/YYYY` date field — using the *typed* date field's value, not `createdAt`, since cardio — unlike strength — has a real user-facing date field and `submitCardioData` itself always trusts that field). Returns `null` if validation fails.
- A draft that returns `null` from `buildAutoSaveEntry` but still passes the existing loose `qualifies()` check (has *some* content, just not enough to pass strict per-field validation — e.g. a missing date) is **left in place**, not deleted — so real user data is never silently discarded; it naturally resurfaces via the (now correctly-gated) draft-found modal next time that domain+type is actually visited. A draft that doesn't even qualify is deleted, matching strength's existing unconditional-delete behavior for non-qualifying drafts (this is a no-op behavior change for strength, since a qualifying strength draft can never fail `buildAutoSaveEntry` — there's no additional strength-side validation beyond qualifying at all).
- The existing legacy-doc-ID fallback (pre-migration bare-type-name Firestore docs, treated as strength drafts) stays strength-only, exactly as today — cardio never had pre-migration drafts, so it has nothing to be legacy-compatible with.

**Explicitly out of scope, flagged for Eitan to decide separately:** `qualifies()`'s "has content" bar doesn't exclude the cardio date field, which auto-fills to today by default — so a draft where literally *only* the untouched auto-filled date differs from empty can already qualify to show the modal today, independent of any bug fixed here. Not touching this now since it changes existing intentional-looking behavior beyond what was reported; worth a follow-up conversation if it turns out to be why the original screenshot's draft looked so empty.

## Testing strategy

The core race (bug 1) is timing-dependent and not reliably reproducible by racing real network calls in Playwright. Instead, test the **guard function's logic directly** (`_isDomainTypeCurrentlyVisible` via `page.evaluate`, contriving `currentSection`/`cardioSelectedType` state) — deterministic, fast, and tests the actual fix rather than hoping to win a race. Item-count and badge-scoping fixes are tested via normal DOM assertions against real saved/draft data.
