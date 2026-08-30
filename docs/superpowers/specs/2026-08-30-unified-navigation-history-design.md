# Unified Navigation & URL Routing — Design Spec

**Date:** 2026-08-30
**Applies to:** `public/index.html` (single source for web + Android/Capacitor)
**Driven by:** three user requests in one thread —
1. Android hardware back button / OS back-gesture must behave exactly like the in-app "← back" buttons.
2. A reported bug: from Settings, "← back" returns to the wrong screen after visiting an edit panel (workout plan / measurement types).
3. Real, bookmarkable URLs per page, without breaking the "single HTML file, no bundler" architecture.

## 1. Current state (verified by reading the code, not assumed)

- **Section switching:** `showSection(name)` ([index.html:2379](../../../public/index.html#L2379)) swaps `.section` visibility and updates `currentSection`/`prevSection`. `prevSection` is a **single overwritten variable**, not a stack.
- **The reported bug's root cause:** every call to `showSection` — including the ones fired internally by `openWorkoutEdit()`/`closeWorkoutEdit()`/`openMeasurementsEdit()`/`closeMeasurementsEdit()` ([index.html:3731-3751](../../../public/index.html#L3731-L3751)) — overwrites `prevSection`. Sequence `timer → settings → (open workout edit) → main → (close) → settings → (back)` ends up with `prevSection = 'main'` instead of `'timer'`, because the intermediate `settings → main` hop clobbered the earlier `timer` memory. `goBack()` is just `showSection(prevSection)` — a single-slot memory can't represent a multi-hop history.
- **No client-side URL routing exists at all.** `location.pathname` is never read anywhere in the file. The only place `history.pushState` is used is the running section's wizard ([index.html:1578](../../../public/index.html#L1578), [1586](../../../public/index.html#L1586)), and it pushes an **empty path** (`pushState(state, '')`) — it changes internal state for its own dedicated `popstate` listener ([index.html:4189-4191](../../../public/index.html#L4189-L4191)) but never touches the visible URL.
- **No Android hardware back button handling exists.** `package.json` has no `@capacitor/app` dependency, and no `backButton` listener exists anywhere. Today, pressing the hardware back button on Android hits Capacitor's WebView default: no in-app history to walk (this is a pure SPA), so the **app exits or backgrounds immediately**, from anywhere in the UI.
- **Hosting already supports arbitrary paths.** `firebase.json` already has a catch-all rewrite (`"**" → "/index.html"`), proven in production by `/migrate`. No server-side change is needed for real URLs — only client-side code needs to read/write them.

## 2. Inventory of every navigation touchpoint (exhaustive)

| Touchpoint | Location | Current behavior |
|---|---|---|
| Bottom nav (5 buttons) | [index.html:1243-1255](../../../public/index.html#L1243-L1255) | `onclick="showSection('main'\|'timer'\|'measurements'\|'running'\|'history')"` |
| Gear icon → settings (5 places) | [index.html:865,938,952,1003,1037](../../../public/index.html#L865) | `onclick="showSection('settings')"` |
| Settings "← back" | [index.html:1149](../../../public/index.html#L1149) | `onclick="goBack()"` → `showSection(prevSection)` **(buggy)** |
| Workout-plan editor open/close | [index.html:1154](../../../public/index.html#L1154), [3733-3741](../../../public/index.html#L3733-L3741) | `openWorkoutEdit()`/`closeWorkoutEdit()` + `toggleEditPanel()` boolean |
| Measurement-types editor open/close | [index.html:1162](../../../public/index.html#L1162), [3743-3751](../../../public/index.html#L3743-L3751) | `openMeasurementsEdit()`/`closeMeasurementsEdit()` + `toggleTypesEditor()` boolean |
| Running dashboard/add/history | [index.html:1569-1591](../../../public/index.html#L1569-L1591) | `runShowDashboard/runShowAdd/runShowHistory` — only `add`/`history` push anonymous state |
| Running wizard steps 1/2/3 | [index.html:1723-1764](../../../public/index.html#L1723-L1764) | Pure DOM show/hide, **no history entries at all** — mid-wizard back (browser/OS) already skips straight to dashboard today |
| Running wizard back buttons | [index.html:1063,1081,1126,1135](../../../public/index.html#L1063) | `runGoBack()` / `runShowStep1()` / `runBackFromForm()` — three different mechanisms for "go back one step" |
| Logout | [index.html:2066](../../../public/index.html#L2066) (called from [index.html:1234](../../../public/index.html#L1234)) | Resets in-memory state; **does not touch history/URL** |
| Auth gate | [index.html:1970-1997](../../../public/index.html#L1970-L1997) | `onAuthStateChanged` toggles `#auth-screen`; no concept of "resume intended page after login" |
| Draft modal | [index.html:869](../../../public/index.html#L869) | Explicitly no backdrop-dismiss (data-loss protection); not wired to back at all today |
| Bulk-select mode (history/measurements) | [index.html:1445](../../../public/index.html#L1445), [4122](../../../public/index.html#L4122) | Own toggle, not wired to back at all today |

## 3. Architecture

One router, three concerns, one rule: **every "go back" action — the settings back button, the workout-edit back button, the Android hardware back button, and the browser/OS back gesture — call the exact same underlying mechanism (`history.back()`), and a single `popstate` listener is the only place that re-renders the screen.** This is what makes "the physical back button behaves like the in-app back buttons" literally true, not just visually similar, and it is what fixes the reported bug as a side effect (a real stack has no single slot to overwrite).

### 3.1 Route table (real URLs)

```js
const ROUTES = {
  '/':                           { section: 'main' },
  '/timer':                      { section: 'timer' },
  '/measurements':               { section: 'measurements' },
  '/running':                    { section: 'running', runSubView: null },
  '/history':                    { section: 'history' },
  '/settings':                   { section: 'settings' },
  '/settings/workout-plan':      { section: 'main', editPanel: 'workout' },
  '/settings/measurement-types': { section: 'measurements', editPanel: 'measurementTypes' },
  '/running/add':                { section: 'running', runSubView: 'add', runStep: 1 },
  '/running/history':            { section: 'running', runSubView: 'history' },
};
```

Every reachable screen gets a real path — including the two edit panels and the two running sub-views — so the address bar always matches what's on screen (no "URL says `/settings` while a template editor is shown" mismatch). The 3-step running wizard (`runStep`) stays **within** `/running/add` as a sub-state (see 3.3) — a wizard step isn't an independent bookmarkable page, and giving it a path would let a bookmarked/refreshed mid-wizard URL resurrect a stale OCR draft, which is not useful.

### 3.2 Three functions, one render path

- **`showSection(name)`** — unchanged responsibility: the pure DOM primitive that swaps `.section` visibility, updates nav highlighting, and runs per-section init (`initRunSection`, `initSettingsUI`, timer view sync). It **never touches history**. Kept exactly under this name because two existing Playwright tests call `window.showSection(...)` directly.
- **`navigateTo(path, opts)`** — the **only** place that pushes/replaces a *new* history entry with a *new URL*. Looks up `ROUTES[path]`, builds a full state object, calls `history.pushState`/`replaceState`, then renders.
- **`pushSubState(patch)`** — layers a sub-screen on the **current** URL (used only for the running wizard's step 1→2→3, which intentionally does not change the path). Merges `patch` over `history.state`, pushes with the *same* `location.pathname`, then renders.
- **`_renderRoute(state)`** — the single function that makes the DOM match a state object. Called from `navigateTo`, `pushSubState`, the global `popstate` listener, and app boot. This is the piece that guarantees the physical back button, the browser back button, and a direct click all produce identical results — they all end up calling this one function with a state object that came from `history.state`.

```js
function navigateTo(path, opts = {}) {
  const { replace = false, isRoot = false } = opts;
  const route = ROUTES[path];
  if (!route) { if (!replace) navigateTo('/', { replace: true, isRoot: true }); return; }
  const state = { editPanel: null, runSubView: null, runStep: null, ...route, isRoot };
  if (replace) history.replaceState(state, '', path);
  else         history.pushState(state, '', path);
  _renderRoute(state);
}

function pushSubState(patch) {
  const state = { ...(history.state || {}), ...patch, isRoot: false };
  history.pushState(state, '', location.pathname);
  _renderRoute(state);
}

function _renderRoute(state) {
  showSection(state.section);
  _setWorkoutEditPanel(state.section === 'main' && state.editPanel === 'workout');
  _setMeasurementTypesPanel(state.section === 'measurements' && state.editPanel === 'measurementTypes');
  if (state.section === 'running') _renderRunState(state.runSubView, state.runStep);
}

function goBack() { history.back(); }

window.addEventListener('popstate', e => {
  _renderRoute(e.state || ROUTES[location.pathname] || ROUTES['/']);
});
```

**Why this fixes the bug:** `timer → settings → workout-plan → settings → timer` (two backs) is now four *distinct* real history entries (`/timer`, `/settings`, `/settings/workout-plan`, and back to the same `/settings` entry via `history.back()`, then back again to `/timer`). Nothing is ever overwritten — that's the entire difference from `prevSection`.

**"Root" detection (for the Android exit behavior, §3.4):** `navigateTo` accepts `isRoot`. Boot resolution (§3.5) is the only caller that passes `isRoot:true`. Because the browser hands back the *exact* state object on every `popstate`, walking back all the way to that original entry makes `history.state.isRoot` true again automatically — no manual bookkeeping needed.

### 3.3 Running wizard as sub-states

Today, wizard steps 1/2/3 are plain DOM show/hide with zero history involvement — a real, pre-existing rough edge: browser/OS back mid-wizard already skips straight to the dashboard, regardless of step. Folding wizard steps into `pushSubState` fixes this as part of the same change: `runShowStep1/2/3` render the step, then `pushSubState({runStep: n})`; `runBackFromForm`'s hand-rolled "guess which step to return to" logic is deleted entirely and replaced with `history.back()` — the real stack already knows the answer (elliptical pushed a step-2 entry before step-3; non-elliptical never did, so back from step-3 lands on step-1 automatically).

### 3.4 Android hardware back button

New dependency: `@capacitor/app`. Accessed the same way the codebase already accesses `@capacitor-firebase/authentication` — via `window.Capacitor.Plugins`, no ESM import (there's no bundler, so a bare-specifier `import` from `@capacitor/app` would not resolve in a plain `<script type="module">`; this matches the existing pattern at [index.html:2035](../../../public/index.html#L2035)).

```js
function handleHardwareBack() {
  const draftModal = document.getElementById('draftModal');
  if (draftModal && draftModal.style.display !== 'none') return; // never dismiss via back — same rule as backdrop click

  const authVisible = !document.getElementById('auth-screen').classList.contains('hidden');
  const atRoot = authVisible || history.state?.isRoot === true;

  if (atRoot) {
    if (_backPressedOnce) { window.Capacitor.Plugins.App.exitApp(); return; }
    _backPressedOnce = true;
    toast(t('app.press_back_exit'));
    setTimeout(() => { _backPressedOnce = false; }, 2000);
    return;
  }
  history.back();
}

if (window.Capacitor?.isNativePlatform()) {
  window.Capacitor.Plugins.App.addListener('backButton', handleHardwareBack);
}
```

**Decision: double-press-to-exit**, not immediate exit. This is the standard Android pattern users already expect, and it prevents an accidental exit from the app's root screen (today's behavior is the *worse* version of immediate-exit-from-anywhere, so this is a strict improvement even before considering the rest of the feature).

**Decision: hardware back ignores the draft modal**, matching its existing "no backdrop dismiss" rule (explicitly designed to prevent data loss). This guard only covers the hardware button, which we intercept *before* anything happens. A browser/OS swipe-back gesture during the modal is not preventable without re-pushing a cancelled history entry (a known fragile pattern); this is called out as an accepted minor gap in §5, not silently dropped.

### 3.5 Boot-time route resolution + deep link after login

Today `initApp()` always lands on `main` regardless of URL. New behavior, wired into the existing `onAuthStateChanged` callback ([index.html:1970](../../../public/index.html#L1970)) — **never before** the `user` truthy branch, so no protected content can flash before auth resolves:

```js
let _pendingPath = null; // set only while the auth screen is visible

// inside onAuthStateChanged(auth, async user => { if (user) { ... } else { ... } }):
// if (user) branch, after currentUser = user, before initApp():
const requested = _pendingPath;
_pendingPath = null;
await initApp();
const bootPath = (requested && ROUTES[requested]) ? requested : location.pathname;
navigateTo(ROUTES[bootPath] ? bootPath : '/', { replace: true, isRoot: true });
```

```js
// else branch (logged out), replacing the URL so back-navigation
// after logout can't step through the previous session's screens:
_pendingPath = ROUTES[location.pathname] ? location.pathname : null;
history.replaceState(null, '', '/');
```

**Security constraint (explicit allowlist, not raw trust):** `_pendingPath` and the boot path are only ever used as a **lookup key into the static `ROUTES` object** — never concatenated into HTML, never used to build a Firestore path, never passed to `eval`/`Function`. Any value not present in `ROUTES` falls back to `/`. This closes the obvious "open redirect"-shaped risk of trusting `location.pathname` (a user-controllable value — anyone can type any path into the address bar) as if it were validated input.

### 3.6 Feature-gate re-check for `/running`

`/running`, `/running/add`, `/running/history` must re-verify the existing gate (`currentUser.email` in the hard-coded allow-list **and** `runningEnabled === true`, exactly as `initSettingsUI` already checks) at the moment a route resolves — both at boot and inside `navigateTo` — falling back to `/` if not authorized. This is UI-only gating (documented in `docs/product/12-security-and-privacy.md` as *not* a real security boundary — actual data access stays uid-scoped in Firestore regardless), so this check exists for correct UX, not as a security control; it must not be read as one.

### 3.7 Logout

Add one line to the existing per-user in-memory reset block ([index.html:1979-1996](../../../public/index.html#L1979-L1996)): `history.replaceState(null, '', '/')`. Prevents the browser back button, after logout on a shared device, from stepping back through the previous user's screen sequence (defense-in-depth; no data is exposed either way since the client re-renders from scratch, but the navigation trail itself is part of what a shared-device user could otherwise page through).

## 4. Security review (explicit, as requested)

| Concern | Analysis |
|---|---|
| **Content exposure before auth** | Unchanged and re-verified: `_renderRoute`/`navigateTo` are only ever called from inside the `if (user)` branch of `onAuthStateChanged` (boot) or from user-triggered clicks that are only reachable once that branch has already run (nav bar, buttons — all inside sections gated behind the auth screen). No route is rendered speculatively before auth resolves. |
| **URL as trusted input** | `location.pathname`/`_pendingPath` are used exclusively as an **allowlist lookup key** (`ROUTES[path]`) — never interpolated into `innerHTML`, never used to construct a Firestore document path, never passed to a dynamic evaluator. An unrecognized path always falls back to `/`. This is the standard defense against a crafted/typo'd deep link doing anything unexpected. |
| **Open-redirect-shaped risk (deep-link-after-login)** | Same allowlist rule applies to `_pendingPath` before it's used to navigate post-login — it can only ever resolve to one of the fixed `ROUTES` keys, never an arbitrary attacker-supplied string. |
| **Feature-gate bypass via direct URL** | `/running` re-checks the existing email-allowlist + `runningEnabled` flag at render time, not just at nav-bar-visibility time — hitting the URL directly cannot show the section to an ungated user. As already documented, this gate is client-side UI convenience, not a security boundary; actual Firestore reads remain scoped to the caller's own `uid` regardless of what the client UI shows. |
| **XSS** | No new `innerHTML`/`outerHTML` writes are introduced by the router. No new user-controlled string reaches the DOM. |
| **Backend / Firestore rules / hosting** | No changes. This is a 100% client-side routing feature; `firebase.json`'s existing catch-all rewrite already serves any path as `index.html`, and no Firestore document shape, query, or security rule is touched. |
| **Post-logout history trail** | Mitigated via `history.replaceState(null, '', '/')` on logout (§3.7). |
| **Android AndroidManifest.xml** | No change required — `@capacitor/app`'s `backButton` event is a JS-level API, unlike the Google Sign-In custom-tab intent filter which did require a manifest entry. |

## 5. UX decisions (explicit, as requested)

1. **Direction-aware slide animation is preserved unchanged.** `showSection` keeps computing `goingForward` from `SECTION_ORDER` exactly as today — this happens naturally since `_renderRoute` always calls `showSection`, whether triggered by a click or by `popstate`. Navigating backward will correctly slide in the "back" direction.
2. **Android: double-press-to-exit**, not immediate exit (§3.4) — matches platform convention, and is a strict improvement over today's immediate-exit-from-anywhere.
3. **Draft modal cannot be dismissed by the hardware back button** — consistent with its existing no-backdrop-dismiss rule. *Known accepted gap:* an OS swipe-back gesture during the modal is not intercepted (see §3.4) — flagged, not silently dropped.
4. **Running wizard back buttons are unified** — all three existing mechanisms (`runGoBack`, direct `runShowStep1()`, `runBackFromForm`'s guessing logic) become the same `history.back()` call, and as a side effect mid-wizard back now steps one screen at a time instead of jumping straight to the dashboard (a genuine fix, not just a refactor — see §3.3).
5. **Out of scope for this iteration** (documented here so it's a visible decision, not an oversight):
   - Bulk-select mode (history/measurements) is **not** wired to the back button. Making the browser/OS back gesture "cancel" bulk-select instead of navigating away requires re-pushing an already-committed `popstate` transition, which is fragile and easy to get wrong (flicker, double-back-then-nothing). Given the user did not ask for this specifically, it's left for a future iteration using the same `ROUTES`/`_renderRoute` foundation, not a parallel mechanism.
   - Per-record deep links (a specific workout/measurement's inline edit) are not given their own URL — same reasoning as the running wizard steps (§3.1): a bookmarked/refreshed mid-edit URL would resurrect a stale, possibly-conflicting edit form rather than being useful.

## 6. Extensibility (the user's explicit "add pages later" requirement)

Adding a future page becomes exactly two changes: one entry in `ROUTES` (`'/new-page': { section: 'newthing' }`), and one `<div id="sec-newthing" class="section">` in the HTML, following the existing pattern. No other function needs to change — `showSection`, `navigateTo`, `_renderRoute`, and the `popstate` listener are all written generically against the `ROUTES` table, not against a hardcoded list of section names in multiple places (which is the exact problem being removed from `openWorkoutEdit`/`closeWorkoutEdit`/`openMeasurementsEdit`/`closeMeasurementsEdit` today).

## 7. Test-compatibility constraints (verified against the actual test files, not assumed)

- `window.showSection(name)` must remain callable directly and must keep doing a pure DOM swap with no history side effect — `tests/navigation.spec.ts:38` and `tests/running.spec.ts:21` call it this way.
- `window.toggleTypesEditor()` must remain callable directly as a raw open/close toggle, independent of history — `tests/measurements.spec.ts:90,94` calls it twice (open, then close) via `page.evaluate`.
- `#mainBackBtn` click must still result in `#sec-settings` becoming active and `#mainEditPanel` becoming hidden — `tests/workout.spec.ts:121-126`. Verified against the router design in §3.2: `main → settings → /settings/workout-plan → history.back()` lands back on the `/settings` entry, which has no `editPanel`, so the panel closes. ✅.
- The onclick attribute strings `runGoBack()`, `runShowAdd()`, `runShowHistory()`, `runShowStep3({})` must not change (selected by exact attribute string in `tests/running.spec.ts`). Their **bodies** may change internally.
- New/updated Playwright coverage for this feature is specified in the implementation plan.
