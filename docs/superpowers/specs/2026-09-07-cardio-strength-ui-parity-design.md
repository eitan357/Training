# Cardio/Strength Daily-Form UI Parity — Design Spec

**Date:** 2026-09-07
**Applies to:** `public/index.html` — `#sec-running` (cardio daily entry form) vs. `#sec-main` (strength daily entry form)
**Driven by:** user-reported visual inconsistency between the two daily-entry pages, illustrated with screenshots, after the cardio page was rebuilt (`docs/superpowers/plans/2026-08-31-B-cardio-page-rebuild.md`) onto the shared `WORKOUT_DOMAINS` engine (`docs/superpowers/plans/2026-08-31-A-shared-workout-engine.md`).

## 1. What the rebuild already unified vs. what it left behind

The cardio-page rebuild correctly shared the **data/logic layer** between strength and cardio (draft auto-save, tab-switching, template model) and reused a handful of CSS classes (`type-row`/`type-btn`, `toggle-switch`, `history-preview`). It did **not** carry over the strength page's **visual component classes** for the daily-entry form controls — the cardio page grew its own parallel set (`run-btn`, `run-form-field`, `run-form-label`, `run-form-input`, `cardio-field-input`) left over from the page's pre-rebuild wizard styling, instead of reusing the strength page's established look (`copy-last-btn`, `session-name-input`, `.field`/`.field input`, `btn-ghost`, `btn-primary.green`). This spec closes that gap for the 7 concrete symptoms the user reported, verified against the actual current code (not assumed):

| # | User's report | Verified root cause |
|---|---|---|
| 1 | "אימון אחרון" doesn't show real content | `selectCardioType()` (`index.html:1831-1840`) sets `#cardioHistoryPreview.innerHTML` to a single `<div>` with only date + session name — no field-value table. Strength's `#historyPreview` renders a full collapsible header + `hist-table` of exercise/weight/reps rows (`index.html:882-900`, populated at `:2886-2896` in the nav-history build — see `02-workout-strength.md`). |
| 2 | "העתקת אימון אחרון" button looks wrong | `#cardioCopyLastBtn` (`:1122`) uses `run-btn run-btn-secondary` (plain bordered button). Strength's equivalent (`#copyLastBtn`, `:903`) uses `copy-last-btn` — a dedicated class with an icon, purple text/border, and dark-mode variant (`:245-251`). |
| 3 | "נקה טופס" button looks wrong | Same pattern: cardio's clear button (`:1123`) uses `run-btn run-btn-secondary`; strength's (`:904`) uses `copy-last-btn clear-form-btn` (icon + red). |
| 4 | Session-name field missing its title | `#cardioSessionNameInput`'s wrapper (`:1126-1128`) has no `<label>` at all and uses `run-form-input`. Strength's `#sessionNameWrap` (`:907-910`) has a `<label class="session-name-label-title">שם האימון</label>` above an input styled `session-name-input`. |
| 5 | "+ הוסף שדה" doesn't look like "+ הוסף תרגיל" | Cardio's add-field button (`:1132`) uses `run-btn run-btn-secondary` (solid bordered). Strength's `#addBtn` (`:913`) uses `btn-ghost` — a dashed-border, low-emphasis button, a deliberately different visual weight class for "add another item" actions. |
| 6 | "שמור אימון" doesn't look like strength's save button | Cardio's save button (`:1133`) uses `run-btn run-btn-primary` (purple — `var(--primary)`, `:730`). Strength's `#saveBtn` (`:914`) uses `btn-primary green` (`var(--green)`, `:628`) — the app's established "this is a positive, committing save action" color. |
| 7 | All the field inputs look inconsistent with strength's | **`renderCardioFieldRow()`** (`:1785-1805`) emits every field's input with `class="cardio-field-input"` — **this class has zero CSS rules anywhere in the file** (confirmed: no `.cardio-field-input` selector exists, and there is no bare `input {}` fallback either). Every dynamic cardio field (date/number/checkbox/text) renders with the browser's unstyled native input appearance. This is the single largest visual gap of the seven. |

Confirmed via `git diff`/spec search that this was an oversight, not a documented design decision — none of the cardio-rebuild or shared-engine specs mention `.cardio-field-input` styling at all.

## 2. Design decisions (judgment calls made explicit, not buried in code)

**2.1 — Item 1's rendering: reuse the exact `hist-table` markup, per-field instead of per-exercise.**
Strength's history preview iterates *exercises* (name/weight/reps columns). Cardio's fields are heterogeneous (`date`/`number`/`checkbox`/`text`, arbitrary labels per template) — there's no fixed "weight/reps" column pair to reuse literally. The parity that matters to the user is the *look* (collapsible card, table rows, done in the same visual language), not a literal column-for-column copy. Design: reuse `history-preview-header`/`history-preview-title`/`history-preview-date`/`history-preview-body`/`hist-table` wrapper markup and CSS verbatim; render one table row per field as `label | value` (2 columns, not 3 — there's no natural second value column for a generic field list). Skip empty/unset fields (mirrors strength's `e.notes ? ... : ''` convention of not rendering empty optional content).

**2.2 — Item 7's exact CSS target: fix `.cardio-field-input` to match `.field input`'s look, not force strength's centered/LTR numeric styling onto every field type.**
`.field input` (strength's weight/sets/reps boxes) is `text-align:center; direction:ltr` — correct for short numeric values in a 3-column grid, but wrong for a full-width `text`/`date` field (centering a date string or a sentence of notes reads as broken, not "consistent"). The user's actual ask, read against the screenshots, is "these boxes should look like they belong to the same design system" — border color/width, border-radius, background, padding, focus-state color — not "must be centered." Design: give `.cardio-field-input` the same border/radius/background/padding/focus-color values as `.field input` (`border: 1.5px solid var(--border); border-radius: 8px; background: var(--bg)`, same focus-state background/border-color swap), but keep left-to-right-per-language text alignment (no forced `text-align:center`/`direction:ltr`) — except for `number`-type fields specifically, where centering *does* match the numeric convention used elsewhere (`.field input` itself, and measurement inputs). Checkbox fields are unaffected (they use `.toggle-switch`, already shared).

**2.3 — Icons for items 2-3: reuse the exact SVG symbol IDs already defined and used by strength's buttons.**
`#icon-clipboard` and `#icon-trash` are already defined once in the file's SVG `<symbol>` sprite and consumed by strength's `copy-last-btn`/`clear-form-btn` (`:903-904`). No new icon asset is needed — cardio's buttons reference the same `<use href="#icon-...">`.

**2.4 — Do not touch `#cardioEditPanel` (the cardio template editor).**
Not among the 7 reported items, and `docs/product/07-running-cardio.md` already documents it as "מראה כמעט זהה לעורך תבניות אימוני הכוח" (nearly identical to the strength template editor already) — verified by a quick structural comparison, no `run-btn`/unstyled-input pattern found there. Out of scope for this pass.

**2.5 — Do not touch the cardio template editor's field-type picker, the History page's cardio rendering, or any JS logic.** All 7 items are pure presentation (HTML class attributes + one CSS rule addition + one rendering-content change for item 1). No function signatures, no data model, no Firestore shape changes.

## 3. Out of scope (explicitly, so it's a decision not an oversight)

- `#cardioEditPanel` template editor styling (§2.4).
- History-page (`#sec-history`) rendering of cardio entries — separate page, not reported.
- Any new field types, validation rules, or data-model changes.
- Fixing the pre-existing, unrelated "13 vulnerabilities" `npm audit` noise seen during `npm install` — unrelated to this task.

## 4. Files touched

`public/index.html` only — HTML class-attribute edits in `#sec-running`'s markup (lines ~1119-1133), one new/extended CSS rule (`.cardio-field-input`, near `.field input` at line ~378 or `.run-form-input` at ~755 — implementer's choice, keep it near the class's other cardio-specific siblings for discoverability), and a small addition to `selectCardioType()`'s history-preview rendering (~line 1831-1840) plus (if item 1 needs it) a new small helper for building the field-rows table, following the exact pattern `sessionDisplayDate`/`escHtml` already establish elsewhere in the file.
