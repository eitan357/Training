# Auth Screen Trust Copy + Logout Relocation — Design Spec

## Context

Eitan considered (and explicitly rejected) building a "no-account guest mode" for this
app — see conversation 2026-09-14/15. Decision: **keep login mandatory**, but (1) explain
*why* it's mandatory right on the login screen, and (2) start treating the existing
email/Google sign-in as what it now conceptually is — **a backup mechanism for a
single-user app**, not a multi-account gate. Step one of that shift: stop giving "sign out"
the same visual weight as a normal settings action, and get it out of the main Settings
list entirely. Full removal is an explicit *future* step, not part of this spec — Eitan
wants it relocated and demoted first, deleted later once he's comfortable.

## Decision 1 — Auth screen trust copy

A short, static (non-`t()`-driven-layout, but fully translated) paragraph explaining that
signing in is what backs up the user's workouts/measurements to the cloud, so data survives
a device switch, accidental app deletion, or cleared device storage.

- **Placement:** bottom of `.auth-card`, below the Google button, separated by a `border-top`
  divider — a footnote, not a blocker above the form. It must not add friction before the
  primary CTA (email/password fields, Sign In button) — those stay exactly where they are.
- **Copy tone:** reassurance, not a warning. Explains the *benefit* (backup) rather than
  threatening data loss.
- New translation key: `auth.why` (both `he` and `en` blocks in `translations.js`, same
  relative position as `auth.loading`).
- New CSS class: `.auth-explain` (12px, `var(--sub)`, centered, `border-top: 1px solid
  var(--border)`) — visually matches the muted, secondary tone of `.auth-sub`, not the bold
  primary CTA styling.

**Status: already implemented and visually verified** (local static server + Playwright
screenshot, both `he`/RTL and `en`/LTR) during the same conversation that produced this
spec, before this plan existed. Task 1 below documents it formally and closes the one
remaining gap: the product doc never got updated.

## Decision 2 — Relocate + de-emphasize the logout button

- **Move** the logout button (`handleLogout()`, unchanged — still just `signOut(auth)`) out
  of `#sec-settings` into `#sec-privacy`, positioned **after** the two destructive delete
  actions (`#privacyDataBtn` / `#privacyAccountBtn`), separated from them by whitespace only
  (**no** `border-top` divider) — a border would visually group it with the destructive
  actions, which is the opposite of the intent. Logout is fully reversible (sign back in
  any time); it does not belong in the same visual category as permanent data/account
  deletion.
- **Restyle** from the bordered, red, pill-shaped `.settings-logout-btn` (a "look important,
  this is destructive" style, appropriate for the two delete buttons it's currently shared
  with, not for logout) to a new plain-text link style, `.privacy-logout-link` — same
  pattern already established by `.auth-forgot` on the auth screen (no border/background,
  small font, centered), but using `var(--sub)` instead of `var(--primary)` so it reads as
  even quieter/more secondary than a normal text link.
- **Copy unchanged** — same `btn.logout` translation key, same visible text ("יציאה"/"Sign
  Out"). Only position and visual weight change in this spec.
- **New id:** `#privacyLogoutBtn`, **new class:** `.privacy-logout-link` — deliberately NOT
  reusing `.settings-logout-btn`, for a reason documented under Ripple Effects below.
- Out of scope (explicitly deferred by Eitan): removing the button entirely. This spec only
  covers relocating + demoting it.

## Ripple Effects Found During Investigation

This is presentation-only — `handleLogout()`'s body, its `window` export, Firestore/auth
behavior, and the hardware-back-button handling in `11-android-app.md` are all untouched.
The real blast radius is **test selectors and two product docs**:

1. **Class collision if the relocated button reused `.settings-logout-btn`:** that class is
   already shared by `#privacyDataBtn` and `#privacyAccountBtn` on the Privacy page. Adding
   a third same-class button to the same page would make any unscoped
   `page.locator('.settings-logout-btn')` a Playwright strict-mode violation (matches 3
   elements, `.click()` throws). This is exactly why the relocated button gets its own
   unique id/class instead of reusing the old one.
2. **`tests/helpers/auth.ts`'s `logout()` helper** (lines 63-69) navigates to the `settings`
   section and clicks unscoped `.settings-logout-btn`. Used by `tests/security.spec.ts`
   (2 call sites, multi-account session-isolation test). Must be updated to open the Privacy
   page and click the new selector.
3. **`tests/settings.spec.ts`'s two logout tests** (lines 69-85, "logout button is present" /
   "logout button triggers sign-out") are *already* explicitly scoped to
   `#sec-settings .settings-logout-btn` — with a comment (added 2026-09-14, when the Privacy
   page was first built) anticipating exactly the collision described in point 1. Both tests
   assume the button lives in `#sec-settings`; after this change it doesn't, so both need to
   navigate to the Privacy page first and assert against the new selector.
4. **`docs/product/08-settings.md`** documents the button under its own standalone
   "### פעולה: יציאה" section (end of file) — that section no longer describes reality once
   the button leaves Settings; it needs to move into the existing "קבוצה 5: פרטיות" section
   as a bullet.
5. **`docs/product/01-auth-onboarding.md`**'s "מעברי מצב (State Transitions)" bullet
   references `handleLogout` and needs its location reference corrected, plus a new bullet
   for the auth-screen trust copy from Decision 1.
6. **Not affected, checked and ruled out:** `_openPrivacyConfirm()` and the rest of the
   Privacy page's delete-confirmation logic (`public/index.html` ~5040-5070) address
   `#privacyDataBtn`/`#privacyAccountBtn` by id, never by counting `.settings-logout-btn`
   elements — adding a third button with a different class next to them changes nothing
   there. `14-data-model-backend.md` — no data model touched.

## Verification Constraints

This repo's only test runner is Playwright e2e, and (per the existing
`docs/superpowers/plans/2026-09-14-privacy-data-deletion.md` Global Constraints, still true)
every spec file runs against the **live production** Firebase project using long-lived
shared credentials (`TEST_EMAIL`/`TEST_PASSWORD` from `.env.test`, never committed). Task 2
does not have those credentials available in this session — verification here is a local
static-server + Playwright visual/structural check (button gone from `#sec-settings`, present
and correctly styled/wired in `#sec-privacy`, no console errors), **not** a full run of the
updated `tests/settings.spec.ts`/`security.spec.ts` against production. That full run must
happen in a session with `.env.test` credentials before this ships — flagged explicitly in
the plan's final task, not silently skipped.
