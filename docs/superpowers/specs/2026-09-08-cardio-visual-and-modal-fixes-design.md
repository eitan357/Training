# Spec: Cardio Visual Fixes + Draft-Modal DOM Restructuring

**Reported:** 2026-09-08, four issues from Eitan testing the APK built from the 2026-09-07 round's fixes, with screenshots.

## Problem

### Issue 1 — cardio input fields invisible in light mode

`.cardio-field-input` ([index.html:391](../../public/index.html#L391)) uses `background: var(--bg)` — the same color as the page's own canvas (`--bg: #f1f5f9` in light mode). Strength's equivalent fields (`.field input`) also use `var(--bg)`, but they sit *inside* a white `.card` (`background: var(--surface)`), giving natural contrast. Cardio's fields render directly on the page body (no card wrapper), so they're the same color as their background — the workout-name field (`.session-name-input`) already correctly uses `var(--surface)` for exactly this reason, which is why Eitan pointed to it as the reference.

### Issue 2 — cardio's clear/copy buttons not spread apart

Strength's equivalent row (`#topActionRow`, [index.html:967](../../public/index.html#L967)) has `justify-content: space-between` ([index.html:254](../../public/index.html#L254)), which pushes "copy last" to the row's start and "clear form" to its end (in RTL: copy-last on the right, clear-form on the left — matching what Eitan wants for cardio). Cardio's row ([index.html:1130](../../public/index.html#L1130)) is a bare `<div style="display:flex;gap:8px;margin:10px 0;">` with no `justify-content` — the two buttons just sit clustered together at the row's start.

### Issue 3 — the "felt tired" toggle switch is invisible (not a "misaligned toggle row", per Eitan's clarification)

`.toggle-switch` ([index.html:308](../../public/index.html#L308)) is a `<label>` with explicit `width: 48px; height: 28px`. Per the CSS spec, explicit width/height on a `display: inline` element (a bare `<label>`'s default) are **ignored** unless the element becomes a flex/grid item or is itself `inline-block`. The toggle's two existing Settings-page usages ([index.html:1236](../../public/index.html#L1236), [index.html:1250](../../public/index.html#L1250)) happen to work because their parent (`.settings-row`) is `display: flex` — flex items aren't subject to that rule. The cardio field-row's checkbox usage ([index.html:1804](../../public/index.html#L1804)) sits inside `.run-form-field` ([index.html:765](../../public/index.html#L765)), a plain block div with only `margin-bottom` — no flex context — so the toggle collapses to a **measured 0×0 box**, completely invisible (confirmed via `boundingBox()`, not guessed).

**Ripple effect found during investigation, not yet reported by Eitan:** the exact same broken pattern exists a second time — the "edit a past cardio session" screen in History (`WORKOUT_DOMAINS.cardio.renderEditRow`, [index.html:2827-2835](../../public/index.html#L2827-L2835)) also renders a checkbox field as `.toggle-switch` inside `.edit-ex-row` ([index.html:556](../../public/index.html#L556)), which is *also* not flex. Same collapse, same invisibility, in a second screen entirely.

### Issue 4 — draft-found modal is architecturally tied to the wrong section (deeper than the 2026-09-07 fix)

The 2026-09-07 round added `_isDomainTypeCurrentlyVisible()` to gate *when* the modal opens, fixing the specific async-race trigger reported at the time. This round's report shows the bug persisting via a **more fundamental, always-present flaw** the earlier fix didn't touch: `#draftModal` is physically a **child of `#sec-main`** in the DOM ([index.html:925](../../public/index.html#L925)), and `.section:not(.active) { display: none }` hides an inactive section's entire subtree — including any descendant with its own `display: flex`. This means: even when the modal is opened *correctly* (the guard passes, the user is genuinely on `/running` at that exact moment), it renders **invisible**, because its parent `#sec-main` isn't active. It only becomes visible later, whenever the user happens to navigate back to Strength for any reason — completely independent of the guard, and reproducible on every single occurrence where a cardio-domain draft modal is legitimately opened while cardio (not strength) is the active section.

**Verified precisely, not inferred:** with a real draft and a genuine, guard-passing open on `/running`, `#draftModal`'s own `style.display` reads `'flex'` while `isVisible()` (which accounts for ancestor display) reads `false` — and flips to `true` the instant the section switches to Strength.

## Design decisions

**Issue 1 fix:** change `.cardio-field-input`'s `background` from `var(--bg)` to `var(--surface)`. Scoped to this one class — doesn't touch `.field input` (strength), which is fine as-is inside its white card.

**Issue 2 fix:** add a new shared class (not reusing `#topActionRow`'s id selector, to avoid touching strength's verified-working behavior at all) — e.g. `.top-action-row { justify-content: space-between; flex-wrap: wrap; }` — applied to cardio's button row alongside its existing inline `display:flex` styling, matching strength's spacing via the same class rather than a duplicated inline rule.

**Issue 3 fix:** add `display: inline-block;` to `.toggle-switch`'s own CSS rule. This fixes the component itself rather than patching every consuming container — correctly renders in both currently-broken locations (daily-entry cardio form, edit-past-session screen) and any future usage, without needing to know or track which containers happen to be flex.

**Issue 4 fix:** move `#draftModal`'s markup out of `#sec-main`'s subtree to a section-independent position — a direct child of `<main id="main-content">`, sibling to every `.section` div, matching how its own CSS (`position: fixed; inset: 0; z-index: 500`) already implies it should behave: a genuinely global overlay, not one accidentally scoped to whichever section it happens to be nested in. The existing `_isDomainTypeCurrentlyVisible` guard (2026-09-07) stays — it's now doing real, necessary work: once the modal is section-independent, a wrongly-timed open would show it immediately and reliably everywhere, not just "sometimes, later, out of place." Both fixes are complementary: the guard prevents opening at the wrong time; the DOM move ensures a correctly-opened modal is actually visible where the user is, and never reappears somewhere else later.

## Testing strategy

Issues 1–3 are pure CSS — verified via computed styles / bounding boxes (not just "looks right"), in both light and dark themes where relevant. Issue 4 is verified by reproducing the exact failure mode from the spec (open on `/running`, assert `isVisible()` true immediately — not just `style.display`), then confirming navigating away no longer causes it to reappear, since it was already resolved before navigating away and closes normally on resume/discard.
