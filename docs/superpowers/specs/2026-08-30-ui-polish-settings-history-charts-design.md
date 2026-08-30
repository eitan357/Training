# Settings Copy, History Long-Press Select, Chart Color Muting — Design Spec

**Date:** 2026-08-30
**Applies to:** `public/index.html` (single source for web + Android/Capacitor), `public/translations.js`
**Driven by:** three independent UI requests in one thread:
1. Settings: the workout-plan-editor link text has a grammatically odd leading "ל" ("לעריכת תוכנית אימוני כוח" → should read "עריכת תוכנית אימוני כוח").
2. History: replace the per-row selection circle with long-press-to-select, keeping short-tap as expand/collapse.
3. Running dashboard: audit whether the 5 chart line colors match the rest of the app's muted/pastel palette, and fix if not — plus a full-app sweep for any other saturation mismatches.

This spec covers all three because each is small and none touches the other's files/functions — bundled as one plan per the "several small changes in one session" framing of the request, not because they're related subsystems.

## 1. Item 1 — Settings copy fix

**Current state (verified in code):** `public/translations.js:170` — `'settings.workout_edit': 'לעריכת תוכנית אימוני כוח'`, rendered at `public/index.html:1157` via `data-i18n="settings.workout_edit"`. This is the **only** occurrence of the string in the codebase (confirmed via full-repo grep — no duplicate hardcoded copy anywhere else, e.g. `migrate.html` or the legacy `Index.html`/`Edit.html` don't reference this key).

**Change:** value becomes `'עריכת תוכנית אימוני כוח'` (drop the leading "ל"). The English value (`'Edit Strength Plan'`, `translations.js:438`) is already correct and untouched — the user only flagged the Hebrew copy.

**Test-compatibility check:** `tests/workout.spec.ts:86` does `page.locator('button.settings-item', { hasText: 'עריכת תוכנית' }).click()` — Playwright's `hasText` with a plain string is a **substring** match, and `'עריכת תוכנית'` is a substring of both the old and new copy, so this existing test is unaffected either way.

## 2. Item 2 — History: long-press to select instead of a selection circle

**Current state (verified in code):**
- `buildSessionCard()` (`public/index.html:2990-3029`) renders each history row as `.session-card > .session-header` (short-tap target, wired via `onclick="toggleSess(${i}, this)"`) containing a `.sel-check` circle (`onclick="event.stopPropagation();toggleSessionSelect('${s.id}')"`, line 2997) as the **only** current entry point into multi-select.
- Multi-select state (`selectedSessions` Set, `public/index.html:1445`), the bulk-action bar (`#histBulkBar`, `public/index.html:4195-4201`), and the helper functions `toggleSessionSelect`/`_toggleSelect`/`_updateBulkBar`/`updateHistBulkBar`/`_bulkDelete`/`bulkDeleteSessions`/`editSelectedSession` (`public/index.html:4117-4159`) are **shared** with the Measurements page (`toggleMeasureSelect`, `#measBulkBar`, same generic `_toggleSelect`/`_updateBulkBar`/`_bulkDelete` helpers). The user asked to change **History only** — Measurements keeps its `.sel-check` circle unchanged. This spec touches only `buildSessionCard()` and adds new History-only long-press functions; it does not touch the shared generic helpers or `buildMeasureCard()`.
- **Dead-code finding:** `deleteSession()`/`armDelete()` (`public/index.html:3175-3203`) implement a single-row "Arm & Confirm" delete, and are exported to `window`, but **no template currently calls them** — `buildSessionCard()` has no delete button of its own. Confirmed via full-file grep for `onclick="deleteSession` (zero matches) and `tests/history.spec.ts` (no test exercises it). The only live way to delete/edit a session today is: select via the circle → bulk bar → "ערוך" (single selection only) or "מחק נבחרים" (any count, no confirmation). This spec does not touch `deleteSession`/`armDelete` — they stay as unused-but-harmless code, out of scope for this change (the user didn't ask to remove them, and removing dead code they didn't flag is scope creep).
- No existing Playwright test references `.sel-check`, `.session-header`, `toggleSessionSelect`, or `toggleSess` for the History page (confirmed via grep across `tests/`) — this change has zero existing regression risk from that angle, but also zero existing coverage, so new tests are added (spec §5, plan Task 4).

**New interaction model:**
- **Long-press (≥500ms, <10px movement) anywhere inside `.session-header`** (the date, name, exercise count, dot, badge, chevron — all of it, since they're all descendants of `.session-header` and the press handler is delegated from the row) → toggles that row into `selectedSessions` (same `toggleSessionSelect()` used today), triggers a short haptic pulse (`navigator.vibrate(30)`, feature-detected, matching the existing pattern at the timer's completion — `public/index.html` TIMER section) and does **not** also expand/collapse the row.
- **Short-tap while NOT in selection mode** (`selectedSessions.size === 0`) → unchanged: expands/collapses via `toggleSess(idx, header)`.
- **Short-tap while IN selection mode** (`selectedSessions.size > 0`, i.e. after a prior long-press) → toggles that row's selection instead of expanding. This is the standard mobile selection-mode pattern (Gmail, Google Photos, Files apps, WhatsApp: long-press starts selection, subsequent taps add/remove from the selection, removing the last selected item exits selection mode). It is the natural reading of "short-tap should keep working to expand" — that capability is preserved whenever the user isn't mid-selection; it doesn't apply *during* an active multi-select, exactly like it didn't in the old circle-based design (tapping the row body while an item was checked never closed the checkmark either — only the circle did, and short-tap-elsewhere-on-the-row still opened/closed the card). This is a design decision made without a blocking question because it's the well-established convention rather than a coin-flip; call it out explicitly during plan review if a different behavior is wanted.
- Exiting selection mode: deselect every row (tap each selected row once more) — same as exiting today by unchecking every circle. No new "cancel selection" affordance is added (none exists today for Measurements either — keeping parity, not scope creep).

**Implementation approach:** mirrors the codebase's own existing gesture-handling idiom (`startGenericDrag`, `public/index.html:3374-3400`) — plain `mousedown`/`touchstart` to begin, `document`-level `mousemove`/`touchmove` to detect cancel-by-movement, `document`-level `mouseup`/`touchend`/`touchcancel` to end and clean up, added on press-start and removed on press-end/cancel (not left permanently attached to `document`). Delegated from the `#historyList` container (attached once, guarded by a `dataset` flag) rather than per-card, so it survives `renderHistory()`'s `list.innerHTML = html` re-renders without needing re-attachment.

`buildSessionCard()` gains a `data-idx="${i}"` attribute on `.session-header` (replacing the removed inline `onclick="toggleSess(${i}, this)"`) so the press-end handler can recover the same index `toggleSess` already expects, without a DOM-order lookup.

CSS: `.session-header` gains `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;` so a long-press doesn't trigger native text selection or (on iOS Safari/WebView) a callout menu — and a `contextmenu` listener guard suppresses the desktop right-click-and-hold context menu during an active press.

**Out of scope (explicit):** Measurements page selection circle (unchanged, user didn't ask); adding a dedicated "cancel selection" button to the bulk bar (doesn't exist today for either page, not requested); wiring long-press into the expanded `.session-body` table area (the request is about "the row," i.e. the header, matching where the old circle lived).

## 3. Item 3 — Running chart color audit

**Finding:** the app's core palette (`public/index.html:16-25`, CSS custom properties) is deliberately muted/"dusty" — `--primary #6d64a8` (HSL 248°, 28%, 53%), `--green #52a270` (143°, 33%, 48%), `--green-d #3c7a54` (143°, 34%, 36%), `--red #c07070` (0°, 39%, 60%) all sit in a **~S 27–39%** band. Every other colored UI element in the app (session-type dots/badges, delta text, buttons, borders — full-file grep for hex/rgba performed) draws from these same CSS variables, so the "muted" look is consistent everywhere **except** the running dashboard's 5 Chart.js line colors (`RUN_CHARTS_CONFIG`, `public/index.html:1646-1652`):

| Series | Current | Current HSL | Muted? |
|---|---|---|---|
| Distance (`distanceKm`) | `#2563eb` | 221°, **83%**, 53% | ❌ vivid saturated blue |
| Avg. heart rate (`avgHeartRate`) | `#a05555` | 0°, 31%, 48% | ✅ already matches palette family |
| Pace (`paceMinPerKm`) | `#3c7a54` | 143°, 34%, 36% | ✅ literally reuses `--green-d` |
| Calories (`calories`) | `#d97706` | 32°, **95%**, 44% | ❌ vivid saturated amber |
| Steps/min (`avgStridesPerMin`) | `#7c3aed` | 262°, **83%**, 58% | ❌ vivid saturated violet |

So **the answer to the user's question is no** — 3 of the 5 chart line colors are roughly 2.5× more saturated than the rest of the app, standing out visually against the otherwise consistently muted UI.

**Full-app sweep (as requested):** grepped every `#[0-9a-fA-F]{6}` / `#[0-9a-fA-F]{3}` / `rgba(...)` literal in `public/index.html` (there is no other CSS/JS file with color values besides `translations.js`, which has none). No other saturation mismatch found. Two categories of vivid colors exist elsewhere and are **intentionally out of scope**, not overlooked:
- The official 4-color Google "G" logo on the Google Sign-In button (`#EA4335`/`#4285F4`/`#FBBC05`/`#34A853`, `public/index.html:841-844`) — these are Google's mandated brand colors for the sign-in button asset, not app-controlled UI, must stay exact.
- The bolt-icon logo gradient (`#e9d5ff → #a78bfa → #38bdf8`, `public/index.html:823,853`) — a decorative brand/logo gradient (used in exactly two places, both branding, not data), not a functional "muted palette" element like a chart series or status color. Left unchanged; flag for the user if they'd like the brand mark itself restyled, but that's a different kind of decision than data-viz color consistency.

**Proposed muted replacements** (computed to land in the same ~S 30–45%, keeping each series' original hue family so "blue/orange/purple" still reads correctly per `docs/product/07-running-cardio.md`'s existing description, while staying visually distinct from each other and from `--primary`/`--green`/`--red` already on screen):

| Series | Old | New | New HSL |
|---|---|---|---|
| Distance | `#2563eb` | `#536fac` | 221°, 35%, 50% |
| Calories | `#d97706` | `#aa7941` | 32°, 45%, 46% |
| Steps/min | `#7c3aed` | `#9b5aaf` | 286°, 35%, 52% (shifted from 262°→286° so it reads as a distinct muted magenta-violet rather than nearly overlapping `--primary`'s 248° hue once desaturated) |
| Avg. heart rate | `#a05555` | *(unchanged)* | — |
| Pace | `#3c7a54` | *(unchanged)* | — |

`backgroundColor: cfg.color + '22'` (the translucent fill under each line, `public/index.html:1692`) derives from `cfg.color` automatically — no separate change needed there.

**Test-compatibility check:** no test asserts any of these hex values (confirmed via grep across `tests/`) — `tests/running.spec.ts:66` only checks `#run-charts-card` is attached, not colors. Zero regression risk.

## 4. Summary of files touched

- `public/translations.js` — 1 value change (item 1).
- `public/index.html` — `buildSessionCard()` + new long-press functions + 1 CSS rule (item 2); `RUN_CHARTS_CONFIG` 3 value changes (item 3).
- `tests/settings.spec.ts` — 1 new test (item 1).
- `tests/history.spec.ts` — new tests for long-press select + short-tap-still-expands (item 2).
- `docs/product/04-history.md`, `docs/product/08-settings.md` — doc sync (existing project convention — see `docs/superpowers/plans/2026-08-30-unified-navigation-history.md` Task 9 for precedent).

## 5. Security / risk review

None of the three changes touch auth, Firestore reads/writes, `escHtml()`-guarded user input paths, or introduce new user-controlled strings into `innerHTML`. Item 2's new functions read only `event.clientX/clientY`/`event.touches` (numeric, browser-supplied) and existing `data-sid`/`data-idx` attributes the app itself already writes (not user input) — no new XSS surface. Item 3 is pure constant-value substitution. Item 1 is a static translation-string edit.
