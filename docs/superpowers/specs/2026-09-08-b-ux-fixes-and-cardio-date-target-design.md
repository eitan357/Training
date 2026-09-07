# Spec: UX Fixes + Cardio Target System + Shared Date-Field Subsystem

**Reported:** 2026-09-08 (second round same day), 9 points from Eitan after confirming the earlier draft-modal/visual round is fully fixed.

## Problem summary (investigated via 4 parallel Explore agents, all findings below verified against actual file:line code)

### 1 — Double-back-to-exit
`handleHardwareBack` ([index.html:5023-5041](../../public/index.html#L5023-L5041)) requires two back-presses at the app root within 2 seconds (`_backPressedOnce` + a toast + `setTimeout`) before calling `exitApp()`. Eitan wants a single press to exit. The same function also handles ALL in-app back-navigation via its `history.back()` fallthrough when not at root — the fix must only touch the `atRoot` branch, not the routing fallthrough.

### 2 — Drag-reorder "reverse mid-gesture" bug
`startGenericDrag` ([index.html:4200-4226](../../public/index.html#L4200-L4226)), shared verbatim by strength/cardio/measurements editors. Root cause: `last` (the most-recently-swapped-with row) is set once a swap fires but is **never cleared when the pointer leaves that row's rect** — only when the pointer moves onto a *different* row. So: drag row X down past its immediate neighbor Y → swap fires, `last = Y`. Immediately reverse and drag back up, re-entering Y's rect (the same row) → `last !== c` evaluates `Y !== Y` → `false` → the reverse swap is silently suppressed. This exactly matches the reported repro (single-neighbor swap, immediate reversal in the same gesture).

### 3 — Cardio target system (new feature)
Strength's target system ([index.html:2618-2661](../../public/index.html#L2618-L2661), [index.html:3398-3419](../../public/index.html#L3398-L3419), [index.html:4569-4605](../../public/index.html#L4569-L4605)) is a fixed 3-part shape (targetWeight/targetSets/targetReps) specific to strength's exercise model. Cardio's fields are single-value (text/number/checkbox) — Eitan clarified the cardio target must be **type-aware**: a text field gets a text target, a number field gets a number target, a checkbox field gets no target option at all. This is a different, simpler shape than strength's — not a literal port, an equivalent concept adapted to cardio's per-field model.

### 4 — Dark-mode "clear form" button renders purple, not red
Pure CSS specificity bug. `[data-theme="dark"] .copy-last-btn { color: #9686d1; ... }` ([index.html:251](../../public/index.html#L251)) has specificity (0,2,0); `.clear-form-btn { color: var(--red); ... }` ([index.html:252](../../public/index.html#L252)) has specificity (0,1,0). Since `#clearFormBtn`/cardio's clear button carry both classes, the higher-specificity dark rule wins regardless of source order, painting it the same purple as "copy last" instead of red. `--red` (`#c07070`) is never redefined for dark mode. Computed: `#c07070` against dark `--bg` is 4.92:1 (passes AA) — no new dark-specific shade needed, just needs to actually win the cascade.

### 5 — Cardio placeholder text
`renderCardioFieldRow` ([index.html:1800-1820](../../public/index.html#L1800-L1820)): number and text-type fields both hardcode literal `"--"` as their placeholder. Eitan wants: number fields → single em-dash `"—"` (matching strength's weight/sets/reps convention already in this codebase); text fields → the field's own label text as the placeholder (e.g. a field titled "הערות" gets placeholder "הערות"). `cardioFieldDisplayLabel(field)` ([index.html:1792-1798](../../public/index.html#L1792-L1798)) is already in scope at this exact point and already used for the row's own `<label>` two lines later — directly reusable.

### 6 — No per-session field removal on cardio's daily-entry page
Strength's daily-entry exercise card has a `✕` button ([index.html:3431-3477](../../public/index.html#L3431-L3477), specifically line 3447: `onclick="document.getElementById('card_${id}').remove()"`) — pure DOM removal, no template/Firestore mutation, no counter bookkeeping needed (session-only). Cardio's `renderCardioFieldRow`/`renderCardioFieldList` ([index.html:1800-1828](../../public/index.html#L1800-L1828)) has no equivalent anywhere — confirmed by the investigation, zero removal affordance exists. Need the same pattern, with one adaptation: the **date field must be excluded** from this removal (it's required for `submitCardioData` to succeed) — see the unified design in Issue 7-9 below for why this exclusion becomes moot once date-field visibility is reworked.

### 7, 8, 9 — Unified date-field subsystem (the biggest piece of this round)

These three points are one cohesive redesign, not three separate features:

- **Today:** cardio's date field is always-present, always-required, always a locked `fieldType: 'date'` row with a manual `DD/MM/YYYY` text input (digit-slash auto-format via a delegated input listener, [index.html:4927-4937](../../public/index.html#L4927-L4937)), validated by regex at save time ([index.html:1938-1943](../../public/index.html#L1938-L1943)). Strength has **no date field at all** — every strength workout is dated by `new Date()` at the moment of save ([confirmed absent from `WORKOUT_DOMAINS.strength`'s property list]).
- **Investigation found zero existing calendar/date-picker component anywhere in this codebase** (verified: no matches for "calendar"/"datepicker", no `<input type="date">` usage anywhere). This is a from-scratch UI component.
- **Eitan's ask, unified:** (a) the cardio editor's date-field row should get a show/hide toggle instead of the (currently fully-disabled, non-functional) text/number/checkbox type picker, defaulting to **hidden**; (b) when shown, tapping the daily-entry date field should open a real calendar picker (app-styled), defaulting to today; if cleared without picking another date, it saves as today (or as the draft's original day, per existing draft-auto-save-date logic) — not a validation error; (c) strength should get the exact same optional date field, same picker, same default-hidden behavior.

**Design insight from the investigation:** when the date field is hidden, there's no DOM row for it at all — `submitCardioData`'s field-scanning loop and `buildAutoSaveEntry`'s validation both currently *require* finding a `fieldType === 'date'` row and fail hard if none exists. The unified fix: when no date row is present (hidden), **fall back to today's date at save time** (or `draft.createdAt`'s date, for the previous-day-draft auto-save case) — which is *exactly* how strength already behaves today with zero date field at all. This means: cardio-with-hidden-date becomes behaviorally identical to strength's current default, and cardio-with-shown-date/strength-with-shown-date both go through the *same* new picker component and the *same* fallback-to-today logic when cleared. One coherent design, not two domain-specific hacks.

## Design decisions

**1 (back button):** delete `_backPressedOnce`, the toast, and the `setTimeout` — `atRoot` branch calls `exitApp()` directly. Remove the now-dead `app.press_back_exit` translation key (confirm unused elsewhere first).

**2 (drag):** clear `last` at the top of `move()` once the pointer is confirmed to have left `last`'s current bounding rect, before evaluating any row for a new swap. One-line addition inside the shared `startGenericDrag`, fixes all three editors simultaneously (no per-editor changes needed).

**3 (cardio target):** add `target: ''` to cardio's field shape (`newItem`, `CARDIO_MIGRATION_FIELD_MAP` entries stay untouched — no default target). Editor (`renderItemRow`): add one target input, shown only when `fieldType` is `text` or `number` (not `checkbox`, not `date` — date's row is being redesigned separately per Issue 7-9). Daily entry (`renderCardioFieldRow`): render a clickable pill (reusing the `.ex-target-clickable`-style interaction pattern, adapted to cardio's per-field-row layout — pill sits next to the label, not in a separate exercise-card sub-row like strength) when `field.target` is set; tapping it fills the field's input (respecting overwrite-confirm if the field already has a value, mirroring `copyTargetToCard`'s existing UX).

**4 (dark red button):** add `[data-theme="dark"] .clear-form-btn { color: var(--red); border-color: var(--red); }` **after** the existing `[data-theme="dark"] .copy-last-btn` rule in source order — equal specificity (0,2,0), so cascade order decides, and placing it later makes it win correctly.

**5 (placeholders):** `renderCardioFieldRow`'s number branch: `placeholder="—"`. Text branch: `placeholder="${escHtml(cardioFieldDisplayLabel(field))}"`.

**6 (remove field for session):** add a `✕` button to each cardio field row (both template-seeded and ad-hoc), pure DOM removal (`this.closest('.cardio-field-row').remove()`), excluding the date field's row specifically. Requires restructuring the row's label area into a small flex header (label + remove button side by side), matching strength's `.ex-name-row` pattern conceptually — new CSS class, not a reuse of `.ex-name-row` itself (different context/child structure).

**7-9 (unified date subsystem):**
- New shared component: a lightweight calendar popover (month grid, prev/next nav, today highlighted, tap-a-day-to-select-and-close), styled with the app's existing surface/border/shadow/radius tokens — no new dependency, built with plain DOM/CSS/JS matching the codebase's existing style throughout.
- New per-field property `hidden` (boolean) on the date field's shape, defaulting `true` in `CARDIO_MIGRATION_FIELD_MAP`'s date entry and in a new strength-side equivalent.
- Editor (`renderItemRow` for cardio's date branch): replace the three disabled type-picker buttons with a single toggle bound to `!field.hidden` (checked = shown).
- `collectItemFromRow` (cardio): read the toggle's state into `hidden` instead of relying on the `disabled`-sniffing hack (which was only ever a stand-in for "this is the date row" — `fieldType` stays `'date'` unconditionally now that the picker never needs to guess).
- Daily entry: when `field.hidden` is true, the date row isn't rendered at all (matches the "hidden by default, not shown" ask literally). When shown, render the new date-picker component instead of the raw text input.
- `submitCardioData` / `WORKOUT_DOMAINS.cardio.serialize` / `buildAutoSaveEntry`: when no `fieldType === 'date'` row exists in the DOM (hidden case), fall back to today's date (`new Date()`) for a live submit, or `draft.createdAt`'s date for the auto-save-stale-draft case — instead of failing validation. When a date row DOES exist (shown case) but is empty/cleared, apply the same fallback rather than blocking the save (this is the "if cleared, save as today" behavior Eitan asked for — a real behavior change from today's hard-block-on-missing-date).
- Strength gets the identical optional date field: a new `hidden`-gated date row (default hidden, same picker when shown), plumbed through `WORKOUT_DOMAINS.strength`'s config and `submitData`. Strength's `buildAutoSaveEntry` (currently deriving date purely from `draft.createdAt`) gains the same "prefer a real shown-and-filled date field, else fall back to createdAt" logic, mirroring cardio's.

## Scope note

This is a substantially larger round than prior ones — three genuinely new features (target system, and the date subsystem touching both domains) alongside five smaller fixes. The plan below orders tasks so the small, independent fixes land first (fast wins, easy to verify in isolation), the date-picker component is built once as reusable infrastructure, and the two domain integrations (cardio, then strength) build on it last, in that order, so cardio's integration serves as the proven pattern before it's replicated to strength.
