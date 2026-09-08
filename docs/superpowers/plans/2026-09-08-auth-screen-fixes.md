# Auth Screen Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three real, reported bugs on the login/auth screen — (1) the "Sign in with Google" button is unreadable in dark mode, (2) Google sign-in fails in the Android app (works on web) with an unhelpful "Error: undefined", (3) the email/password sign-in button gets permanently stuck disabled after a successful login until the app is fully closed and reopened — plus normalize two other functions found during investigation that share bug (3)'s exact code pattern (currently safe only by accident, not by correct design).

**Architecture:** Three independent, narrowly-scoped fixes to `public/index.html`/`public/translations.js`. No new abstractions, no shared new code between them — each fix touches only the specific function/CSS rule it's about. Task 3 also normalizes two structurally-identical latent bugs found during investigation (not user-reported, currently masked by an unrelated full-DOM-rebuild side effect) to the same safe pattern the codebase already uses correctly in five other save functions.

**Tech Stack:** Vanilla JS, CSS custom properties (`--bg`/`--surface`/`--text`/`--sub`/`--border`, theme-scoped via `[data-theme="dark"]`), Firebase Auth (`signInWithEmailAndPassword`/`signInWithPopup`/`signInWithCredential`), `@capacitor-firebase/authentication` (native Google sign-in on Android).

**Spec:** None — this is a bounded bug-fix plan, not a new feature; investigated and scoped directly against the live `public/index.html`/`public/translations.js`.

## Global Constraints

- No new CSS custom properties — reuse the existing theme variables (`--surface`, `--text`, etc.) exactly as every other themed element in the file already does.
- No behavior change to any of the three standard Firebase-error call sites (`handleAuthSubmit`, `handleForgotPassword`) that already work correctly — Task 2 only touches `handleGoogleLogin`'s own catch block.
- The "disable → operation → re-enable" pattern for a save/submit button must always place the re-enable **unconditionally after the try/catch block** (not only inside `catch`), matching the already-correct pattern in `submitCardioData`, `submitData`, `saveTemplates`, `saveCardioTemplates`, `saveMeasurement`, and `saveTypesEditor`. Every task in this plan that touches a disable/enable pair must follow this exact convention.
- Commit after every task.

---

## Task 1: Fix the Google sign-in button's dark-mode contrast

**Files:**
- Modify: `public/index.html:111` (`.auth-google-btn` CSS rule)

**Interfaces:** None — pure CSS, no JS/markup change.

**Root cause:** `.auth-google-btn` hardcodes `background: white` while its text uses `color: var(--text)`, which resolves to `#f1f5f9` (near-white) in dark mode — near-white text on a hardcoded white background is unreadable. Every other themed surface in the app (inputs, cards, panels) uses `var(--surface)` instead of a hardcoded color, which resolves to `#ffffff` in light mode and `#1e293b` in dark mode — this is the fix the user explicitly asked for: match the button to the app's general theme, not just patch contrast on a fixed white background.

- [ ] **Step 1: Change the hardcoded background to the theme variable**

Find (`public/index.html:109-115`):

```css
    .auth-google-btn {
      width: 100%; padding: 12px; border: 1.5px solid var(--border);
      border-radius: var(--radius); background: white; color: var(--text);
      font-size: 14px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      transition: border-color .15s; margin-bottom: 10px;
    }
```

replace with:

```css
    .auth-google-btn {
      width: 100%; padding: 12px; border: 1.5px solid var(--border);
      border-radius: var(--radius); background: var(--surface); color: var(--text);
      font-size: 14px; font-weight: 700; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 10px;
      transition: border-color .15s; margin-bottom: 10px;
    }
```

(One-word change: `white` → `var(--surface)`. The multi-color Google "G" logo SVG inside the button, lines 995-999, is untouched — Google's own branding guidelines require the full-color logo regardless of surrounding theme, so this is correct to leave as-is.)

- [ ] **Step 2: Manual visual check**

Open the app locally in a browser, go to the login screen. Toggle dark mode (the toggle lives in Settings, but the auth screen is pre-login — if dark mode is a `localStorage`-persisted preference applied before login, verify by setting it once via Settings while logged in, then logging out to see the auth screen in dark mode; otherwise toggle via whatever mechanism applies theme pre-login). Confirm: in light mode the Google button still looks the same as before (white-ish surface, dark text, clearly readable) — in dark mode the button surface is now dark (matching e.g. the auth input fields' background) with light, clearly readable text, and the border still lightens on hover exactly as before.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "fix(auth): make the Google sign-in button follow the app's theme instead of a hardcoded white background"
```

---

## Task 2: Fix Google sign-in failing in the Android app + improve the error message

**Files:**
- Modify: `public/index.html:2338-2340` (`handleGoogleLogin`'s catch block)
- Modify: `public/translations.js:234`, `:532` (add one new i18n key, both languages)
- Informational only, no code: Firebase Console configuration step (cannot be performed by an agent — requires the project owner's Firebase account access)

**Interfaces:** None new — `handleGoogleLogin` keeps its existing signature and call site (`onclick="handleGoogleLogin()"` at `public/index.html:994`).

**Root cause (config, not code):** `android/app/google-services.json` currently has exactly one OAuth client entry, `client_type: 3` (a "web" client — the one `@capacitor-firebase/authentication`'s native Google sign-in flow uses as its required default-web-client-id). There is no `client_type: 1` (Android) entry. That entry only gets generated once the app's signing-certificate SHA-1 fingerprint is registered against this Android app in the Firebase Console — without it, the native Google Sign-In flow reliably fails on-device with a non-standard error object (no `.code` property), which is why `handleGoogleLogin`'s catch block — which assumes every error has a Firebase `.code` — falls through to `firebaseErrMsg(undefined)`, producing the literal, unhelpful "Error: undefined" the user saw. The web flow (`signInWithPopup`) never touches this Android-specific client entry, which is exactly why it already works.

Investigated for other affected locations: `handleGoogleLogin` (`public/index.html:2317-2341`) is confirmed to be the **only** place in the entire file with a native-vs-web Capacitor branch that calls a native auth plugin before ever touching the Firebase JS SDK — the other two `firebaseErrMsg()` call sites (`handleAuthSubmit`, `handleForgotPassword`) only ever call standard Firebase SDK functions directly and always receive a real `FirebaseError` with a `.code`, so they are correctly left untouched. No other Google-branded button or native-auth call site exists anywhere in the app (confirmed via full-file search).

- [ ] **Step 1 (informational, not this task's code — hand to the project owner): register the app's signing certificate with Firebase**

The SHA-1 fingerprint of the local debug keystore (`~/.android/debug.keystore`, the one the debug APK is currently signed with) is:

```
D2:45:A3:9B:CD:53:DD:D7:21:CF:B4:E8:34:48:52:21:63:4C:22:50
```

Steps for the project owner (cannot be done by an agent — requires Firebase Console access):
1. Go to the [Firebase Console](https://console.firebase.google.com) → the `training-3f519` project → Project Settings → the Android app (`com.eitanmonsa.trainingdiary`).
2. Under "SHA certificate fingerprints", click "Add fingerprint" and paste the SHA-1 above.
3. If a release keystore is ever used to sign a release build (as opposed to the debug build used during development), that keystore's own SHA-1 must be added too, separately, whenever release signing is set up.
4. Click "Download google-services.json" and replace `android/app/google-services.json` in this repo with the freshly downloaded file (it will now include a `client_type: 1` entry).
5. Run `npx cap sync android` and rebuild the APK (`./gradlew assembleDebug`) so the new config is bundled.

This step is **not part of this task's code changes** — Step 2 below (the error-message improvement) proceeds independently of whether this configuration step has been done yet, so the app degrades gracefully (a real, readable error message) even before the Firebase Console fix lands.

- [ ] **Step 2: Add a new translation key for the fallback message**

Find (`public/translations.js:234`, inside the Hebrew block, right after `'err.prefix'`):

```js
    'err.prefix':             'שגיאה: ',
```

Add immediately after it:

```js
    'err.prefix':             'שגיאה: ',
    'err.google_signin_failed': 'שגיאה בהתחברות עם Google. נסה שוב.',
```

Find (`public/translations.js:532`, inside the English block, right after `'err.prefix'`):

```js
    'err.prefix':             'Error: ',
```

Add immediately after it:

```js
    'err.prefix':             'Error: ',
    'err.google_signin_failed': 'Google sign-in failed. Please try again.',
```

- [ ] **Step 3: Make `handleGoogleLogin`'s catch block show the real error when one is available**

Find (`public/index.html:2338-2340`):

```js
  } catch (e) {
    setAuthMsg(firebaseErrMsg(e.code));
  }
}
```

replace with:

```js
  } catch (e) {
    // Unlike handleAuthSubmit/handleForgotPassword (which only ever call the
    // Firebase SDK directly and always get a real FirebaseError with a
    // `.code`), the native branch above can throw a plain Capacitor-plugin
    // rejection with no `.code` at all — falling through to
    // firebaseErrMsg(undefined) silently produced the literal, useless
    // string "Error: undefined". Surface whatever real information the
    // error actually carries instead.
    if (e.code) setAuthMsg(firebaseErrMsg(e.code));
    else if (e.message) setAuthMsg(t('err.prefix') + e.message);
    else setAuthMsg(t('err.google_signin_failed'));
  }
}
```

- [ ] **Step 4: Manual check**

Since reproducing the native failure requires an actual Android device/emulator build, this step is verification-by-reasoning plus a syntax/regression check rather than a live repro:
- Run `node --check` on the extracted `<script type="module">` body to confirm no syntax error was introduced.
- Confirm via code reading that `handleAuthSubmit`'s and `handleForgotPassword`'s own `firebaseErrMsg(e.code)` call sites are byte-for-byte unchanged (this task must not touch them).
- If a real Android build is available to test against (with or without Step 1's Firebase Console fix applied), attempt Google sign-in and confirm the displayed error message is no longer the literal string "Error: undefined" — either a real Firebase error, the underlying native error's own message, or the new generic fallback string, depending on what actually gets thrown.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "fix(auth): surface the real error when native Google sign-in fails instead of the literal string 'Error: undefined'"
```

(Note: this commit does not fix the underlying Android sign-in failure itself — that requires the Firebase Console step in Step 1, which only the project owner can perform. This commit ensures that once that step is done, or if a different underlying error occurs in the future, the user sees something diagnosable instead of a dead-end message.)

---

## Task 3: Fix the permanently-stuck sign-in button after logout, and normalize the same pattern elsewhere

**Files:**
- Modify: `public/index.html:2298-2315` (`handleAuthSubmit`)
- Modify: `public/index.html:4299-4329` (`saveSessionEdit`)
- Modify: `public/index.html:4925-4940` (`saveMeasureEdit`)

**Interfaces:** None — all three functions keep their existing signatures and call sites.

**Root cause:** `handleAuthSubmit` sets `btn.disabled = true` unconditionally at the start, but only resets it back to `false` inside the `catch` block — never on the success path. On a successful login, `onAuthStateChanged` hides the auth screen (`classList.add('hidden')`) rather than destroying/rebuilding it, so the exact same `#auth-submit-btn` DOM element — now permanently `disabled` — reappears untouched the next time the auth screen is shown (i.e., after a subsequent logout, in the same tab, with no page reload). This matches the reported symptom exactly: only closing and reopening the app (a fresh page load, a fresh DOM) clears it.

**Investigated for other affected locations:** grepped every `.disabled = true` assignment in the file (8 total). Five of them (`submitCardioData`, `submitData`, `saveTemplates`, `saveCardioTemplates`, `saveMeasurement`, `saveTypesEditor` — six, not five, on closer count) already place the re-enable **unconditionally after** the try/catch block, which is the correct pattern and is not touched by this task. Two more — `saveSessionEdit` (History inline edit save, generalized for both strength and cardio) and `saveMeasureEdit` (measurement inline edit save) — share `handleAuthSubmit`'s exact bug shape (reset only in `catch`), but are **not currently user-visibly broken**: on success, both call `reloadAppData()`, which triggers `renderHistory()`/`renderMeasurements()` respectively, and both of those functions fully replace their list container's `innerHTML` — which destroys the disabled button element entirely rather than leaving it sitting around with a stale `disabled` flag, since the next time a user opens that card's edit view, it's a brand new (enabled) button. This makes them safe today, but only as an indirect side effect of an unrelated function (`renderHistory`/`renderMeasurements`) always doing a full rebuild — a future change to either of those toward a more targeted/partial DOM update (a normal kind of performance optimization) would silently reintroduce this exact same "stuck disabled button" bug class in two more places. Fixing all three now to the same explicit, correct pattern removes that latent risk and makes the codebase internally consistent (matching the six functions that already do it right).

- [ ] **Step 1: Fix `handleAuthSubmit`**

Find (`public/index.html:2298-2315`):

```js
async function handleAuthSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn      = document.getElementById('auth-submit-btn');
  if (!email || !password) { setAuthMsg(t('auth.fill_email_pass')); return; }
  btn.disabled = true;
  try {
    if (authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await initNewUser(cred.user.uid);
    }
  } catch (e) {
    setAuthMsg(firebaseErrMsg(e.code));
    btn.disabled = false;
  }
}
```

replace with:

```js
async function handleAuthSubmit() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn      = document.getElementById('auth-submit-btn');
  if (!email || !password) { setAuthMsg(t('auth.fill_email_pass')); return; }
  btn.disabled = true;
  try {
    if (authMode === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await initNewUser(cred.user.uid);
    }
  } catch (e) {
    setAuthMsg(firebaseErrMsg(e.code));
  } finally {
    // Unlike the save-button functions elsewhere in this file, this
    // element is never destroyed/rebuilt on success (onAuthStateChanged
    // only hides #auth-screen, it doesn't re-render it) — so the reset
    // MUST happen unconditionally here, not only in the catch branch, or
    // the very same disabled button reappears, permanently stuck, the
    // next time the auth screen is shown (e.g. after a later logout).
    btn.disabled = false;
  }
}
```

- [ ] **Step 2: Fix `saveSessionEdit`**

Find (`public/index.html:4320-4328`):

```js
  saveBtn.disabled = true; saveBtn.innerText = t('saving');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, collection_, sessionId), payload);
    toast(t('sess.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
    saveBtn.disabled = false; saveBtn.innerText = t('sess.save_btn');
  }
}
```

replace with:

```js
  saveBtn.disabled = true; saveBtn.innerText = t('saving');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, collection_, sessionId), payload);
    toast(t('sess.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
    saveBtn.disabled = false; saveBtn.innerText = t('sess.save_btn');
    return;
  }
  // Success path deliberately does NOT touch saveBtn here — reloadAppData()
  // -> renderHistory() replaces this card's entire innerHTML, so the old
  // (disabled) button element is already gone by the time this line would
  // run. Left the failure-path reset as an explicit early return instead of
  // a shared finally, since the success path has nothing left to reset.
}
```

(This task deliberately does NOT change `saveSessionEdit`'s functional behavior on success — it was already safe there. This step exists purely to make the code's own correctness independent of `renderHistory()`'s implementation detail, per the Global Constraint, and to leave a clear comment so a future editor of `renderHistory()` doesn't unknowingly reintroduce the bug. If you determine while implementing this that a true `finally`-based reset — matching Task 3 Step 1's `handleAuthSubmit` shape exactly — is cleaner than the early-return shown above, use that instead; the goal is "unconditional reset on every path," not this exact syntax.)

- [ ] **Step 3: Fix `saveMeasureEdit`**

Find (`public/index.html:4931-4939`):

```js
  saveBtn.disabled = true; saveBtn.innerText = t('saving');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'measurements', measureId), fields);
    toast(t('sess.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
    saveBtn.disabled = false; saveBtn.innerText = t('sess.save_btn');
  }
}
```

replace with the same pattern as Step 2 (same reasoning: `reloadAppData()` → `renderMeasurements()` fully replaces this card's `innerHTML` on success):

```js
  saveBtn.disabled = true; saveBtn.innerText = t('saving');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'measurements', measureId), fields);
    toast(t('sess.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + err.message, 'error');
    saveBtn.disabled = false; saveBtn.innerText = t('sess.save_btn');
    return;
  }
  // Success path deliberately does NOT touch saveBtn here — reloadAppData()
  // -> renderMeasurements() replaces this card's entire innerHTML, so the
  // old (disabled) button element is already gone by the time this line
  // would run. See saveSessionEdit for the identical reasoning.
}
```

- [ ] **Step 4: Manual verification of the actual reported bug (the important one)**

Log in with `test@gmail.com`/`111111` at the login screen. Log in successfully. Log out. **Without closing/reloading the app or tab**, immediately try to log in again (same or different credentials) — confirm the sign-in button responds to the click and the login attempt actually proceeds (button is not stuck disabled). This is the exact repro the user reported; it must pass.

- [ ] **Step 5: Regression check for Steps 2/3**

Manually: open History, long-press a strength session, edit a value, save — confirm it saves correctly, the card updates, and (this is the part that matters) editing and saving a **second** entry immediately after still works (the button on the new edit form is not stuck). Repeat for a cardio session if the account has one, and for a measurement entry in the Measurements section. None of these should behave any differently than before this task — this step exists to confirm the refactor didn't change real behavior, not to test new behavior.

Run the automated suite: `npx playwright test tests/history.spec.ts tests/measurements.spec.ts --project=chromium` (adjust `TEST_EMAIL`/`TEST_PASSWORD`/`PLAYWRIGHT_TEST_BASE_URL` env vars per the project's established convention) — confirm no new failures beyond the project's already-known pre-existing categories (exercise-card timing race, dark-mode toggle).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "fix(auth): reset the sign-in button's disabled state on success, not only on failure; normalize the same pattern in saveSessionEdit/saveMeasureEdit"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Coverage:** all three user-reported bugs have a task each. Task 2 explicitly separates the code-side improvement (Steps 2-3, doable now) from the config-side actual root-cause fix (Step 1, requires the project owner's Firebase Console access — cannot be automated by an agent).
- **Investigation-driven additions:** Task 3 extends beyond the single reported symptom to two structurally-identical latent bugs found by grepping every `.disabled = true` site in the file, per the user's explicit request to find and fix all affected locations, not just patch the one that was noticed.
- **No placeholders:** every step has exact before/after code. Task 2 Step 1 is explicitly informational (not code) because it is genuinely outside what any coding agent can perform — flagged clearly as such rather than glossed over.
- **Type/signature consistency:** none of the three tasks change any function's signature or any call site — every fix is internal to the function body or a CSS rule value.
