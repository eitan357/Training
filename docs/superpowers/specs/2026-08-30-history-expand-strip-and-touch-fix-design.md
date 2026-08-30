# History Row: Touch Double-Fire Fix + Bottom Expand Strip — Design Spec

**Date:** 2026-08-30
**Applies to:** `public/index.html`
**Supersedes/extends:** `docs/superpowers/specs/2026-08-30-ui-polish-settings-history-charts-design.md` §2, which shipped the initial long-press-select feature. This spec covers a bug found testing that feature on a real device, plus a new UI request that came out of the same conversation.

**Driven by:** user testing the shipped `training-diary-debug.apk` build and reporting two problems, plus a new feature request:
1. Short-tap doesn't reliably open a row's details.
2. Once one row is selected via long-press, short-tap on other rows doesn't reliably select them either.
3. New: move the expand/collapse chevron out of the row header into a dedicated full-width strip at the bottom of each card, with a more visually prominent (tinted) background so it reads as its own distinct tap target, and keep the existing rotate animation.

## 1. Root cause of the two reported bugs

Both symptoms were verified as **working correctly** in the shipped code when tested with mouse-simulated Playwright interactions (`page.mouse.down()`/`up()`) — see the previous spec's verification log. They were NOT verified with real touch events, which is the gap: the reporter tested via the actual Android APK (a touch device), not a desktop browser.

**Diagnosis:** `_histPressStart`/`_histPressMove`/`_histPressEnd` (`public/index.html`, "HISTORY LONG-PRESS SELECT" block) never call `preventDefault()` on any touch event. Per the DOM spec, after a `touchend` with no `preventDefault()` called anywhere in that touch's event sequence, the browser fires a **synthetic compatibility `mousedown`→`mouseup`→`click` sequence** on the same element, roughly 300ms later (a decades-old touch-to-mouse compatibility shim, still present in mobile WebViews including Android Chrome/Capacitor's WebView). Because `_attachHistLongPress()` listens for `mousedown`/`mouseup` on `#historyList` too (to support desktop mouse users), that synthetic sequence **re-enters the exact same press-start/press-end logic a second time** for what the user experienced as one single tap:

- Real tap: `touchstart` → `touchend` fires quickly (short press) → `_histPressEnd` correctly calls `toggleSess(...)`, opening the row.
- ~300ms later, unprompted: synthetic `mousedown` → `_histPressStart` runs again (sets up a **new** press state) → synthetic `mouseup` fires essentially immediately → `_histPressEnd` runs again → `toggleSess(...)` fires a **second** time, immediately closing the row that had just opened.

Net visible effect: the row appears not to open at all (opens then instantly closes) — matching bug #1 exactly. The same double-fire explains bug #2: a short-tap-to-select while in selection mode selects, then the synthetic second call immediately deselects it again.

**Fix:** call `e.preventDefault()` inside `_histPressEnd` when `e.type === 'touchend'`. Per spec, `preventDefault()` on `touchend` suppresses the browser's subsequent synthetic mouse/click event sequence for that touch. This is the standard, long-established fix for this exact class of bug (the same technique used by libraries like FastClick). It is scoped to `touchend` only — `touchstart`/`touchmove` stay untouched (still registered `{ passive: true }`), so **scrolling the history list is unaffected**: scroll gestures are governed by `touchmove`'s default action, which this fix never calls `preventDdefault()` on. `_histPressEnd` currently takes no parameter; it needs the event object to check `e.type` and call `preventDefault()`.

**Test-compatibility check:** the previous spec's Playwright tests were written using `page.mouse` (desktop mouse simulation), which never exercises this touch-only code path — they will keep passing unchanged after this fix (mouse events aren't affected by a touch-scoped preventDefault). This spec adds a **new test run against the `mobile-android` Playwright project** (already configured in `playwright.config.ts`, using `devices['Pixel 5']`, which simulates real touch events) specifically to close this coverage gap going forward.

## 2. New feature — bottom expand strip

**Current state:** the expand/collapse chevron (`<span class="chevron">▼</span>`) sits inline in the top-right corner of `.session-header`, next to the type badge (`public/index.html`, `buildSessionCard()`). It is purely decorative today — no dedicated click handling of its own; the entire header row shares one tap target.

**New design** (mocked up and approved by the user — see the published design canvas from this conversation): a new `.expand-strip` element, a full-width bar as the **last child of `.session-card`** (sibling to `.session-header` and `.session-body`, not nested inside either), containing the chevron icon, centered. Exact values from the approved mockup:

- Height: 30px, full card width, `border-top: 1px solid var(--border)`.
- Background: `#ede9fe` at rest, `#ddd6fe` on hover, `#e0dbfa` when the row is open — reusing the same light-purple family already used elsewhere in the app for tinted/highlighted UI (`.m-field.weight-field` background `#ede9fe`, target-pill background `#ede9fe`/border `#c4b5fd`) rather than inventing a new color, so it reads as "on-brand accent," not an arbitrary new hue. Dark-mode equivalents follow the same escalation on the app's existing dark tinted-purple precedent (`[data-theme="dark"] .m-field.weight-field input { background: #1e1a38 }`): `#241f42` / `#2d2650` / `#332a5c`.
- Chevron: reuses the app's existing `.chevron`/`.chevron.open { transform: rotate(180deg) }` rule (the SAME rotate-in-place animation already used for the month-group-header chevron and (previously) this one — the user asked explicitly to keep the rotation, just relocate and restyle the surrounding element) — moved from a 12px text glyph (`▼`) to an 18×18 inline stroke SVG chevron (per house style: no unicode glyphs as icons), colored `var(--primary)` so it visually reads as the accent-colored control against the tinted strip.
- The row body/header keeps a much subtler affordance of its own — a faint neutral hover tint (`rgba(100,116,139,.06)`) — so the two tap zones are clearly different in visual weight, per the user's explicit ask ("the arrow element should be in a slightly more prominent color so the user can tell apart clicking the arrow vs. clicking the row").

**Interaction model (confirmed with the user):**
- Clicking/tapping the strip **always** opens/closes the row via a plain `onclick="toggleSess(${i}, this)"` — no long-press, no selection-mode branching, works identically whether or not other rows are currently selected.
- The row body (header) keeps exactly the long-press-select behavior from the previous round: long-press selects; short-tap opens when nothing is selected; short-tap selects/deselects when something is already selected.
- **The strip is automatically excluded from the long-press-select gesture with zero extra code**, because `_histPressStart` looks for `e.target.closest('.session-header')` — since `.expand-strip` is a sibling of `.session-header`, not a descendant, a press starting on the strip never matches and `_histPressStart` returns immediately without arming a timer. This was the confirmed design ("the strip is fully excluded from the selection gesture, dedicated purely to open/close").

**Shared-code impact:** `_toggleBody(prefix, i, header)` (used by both `toggleSess`/history and `toggleMeasure`/measurements) currently finds the chevron via `header?.querySelector('.chevron')` — a lookup **scoped to descendants of the header element**. Since the chevron is moving OUT of `.session-header` into a sibling `.expand-strip`, that lookup would break for history (return null, chevron never gets its `.open` class, animation stops working) while remaining correct for measurements (whose chevron stays inside `.measure-header`, unchanged — the user only asked for the History page). Fix: change the lookup to search from `header.closest('.session-card, .measure-card')` instead of `header` itself — this resolves to the same card wrapper either way, so it finds the chevron in the strip for history and in the header for measurements, without needing two code paths. The same fix must also add strip-open-state toggling (`.expand-strip.open`) alongside the chevron, and the analogous one-time "open the first card on load" code in `renderHistory()` needs the same scope correction.

**Out of scope (explicit):** Measurements page's chevron/header stays exactly as-is (still inline, still inside `.measure-header`) — this request was scoped to History only, matching the previous round's scoping.

## 3. Files touched

- `public/index.html` — `_histPressEnd` (add preventDefault), `buildSessionCard()` (remove inline chevron, add expand-strip), `_toggleBody()` (scope fix, +strip toggling), `renderHistory()`'s first-card-open block (scope fix, +strip), new CSS rules (`.expand-strip`, dark-mode override, `.session-header:hover`).
- `tests/history.spec.ts` — new test(s) run against the `mobile-android` Playwright project to cover the touch-specific fix; assertions for the new strip's presence/click behavior.
- `docs/product/04-history.md` — doc sync for the new strip.

## 4. Security / risk review

No new user-controlled strings, no new `innerHTML` writes of dynamic content (the SVG markup is static, same treatment as the existing static "▼" glyph it replaces), no auth/Firestore changes. `preventDefault()` on `touchend` is a well-understood, narrowly-scoped browser API call with no security implication.
