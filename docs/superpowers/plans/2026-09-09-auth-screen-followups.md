# Auth Screen Follow-Up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs surfaced by Eitan after testing the previous auth-screen-fixes round's APK — (1) the on-screen keyboard doesn't open on the first tap of the email/password fields in the Android app (only on the second tap), and (2) native Google sign-in failures (cancellation, no account, etc.) show a raw, unlocalized English message mixed with a Hebrew "שגיאה:" prefix, instead of a real translated message in the app's currently-selected language.

**Architecture:** Two independent, narrowly-scoped fixes. Task 1 is a native Android change (`MainActivity.java`) — the standard, documented fix for a well-known Capacitor/WebView cold-start focus bug. Task 2 replaces `handleGoogleLogin`'s raw-message fallback with a small keyword-based classifier that maps the native plugin's known failure shapes to real, always-correctly-localized translation keys, keeping a translated (never raw-English) generic fallback for anything unrecognized.

**Tech Stack:** Java (`BridgeActivity`/`MainActivity.java`, Capacitor Android), vanilla JS (`public/index.html`), `public/translations.js`.

**Spec:** None — bounded bug-fix plan, investigated directly against the live app and the `@capacitor-firebase/authentication` plugin's actual native source (`node_modules/@capacitor-firebase/authentication/android/.../GoogleAuthProviderHandler.java`, `FirebaseAuthenticationHelper.java`).

## Global Constraints

- Task 2 must never display a raw, un-translated string to the user — every user-facing message must route through `t()` with a real key, for both languages. A generic-but-translated fallback is required for any error shape not explicitly recognized.
- No new CSS, no new markup elements, no signature changes to any existing function in either task.
- Commit after every task.

---

## Task 1: Fix the on-screen keyboard not opening on the first tap (Android)

**Files:**
- Modify: `android/app/src/main/java/com/eitanmonsa/trainingdiary/MainActivity.java`

**Interfaces:** None — `MainActivity` keeps its existing `BridgeActivity` extension, no new public methods called from anywhere else.

**Root cause:** `MainActivity.java` is the bare Capacitor default (`public class MainActivity extends BridgeActivity {}`) with no focus handling of its own. This is a well-known, well-documented Capacitor/Android WebView bug: on cold app start, the very first tap on a text input only focuses the DOM element inside the WebView, but the Android *window* itself hasn't yet been granted input focus by the OS — so the IME (keyboard) never receives the request to appear. The second tap works because by then the window already has focus from the first tap's side effect. `AndroidManifest.xml`'s `<activity>` tag has no `windowSoftInputMode` override, which is unrelated to this specific symptom (that setting affects layout resize/pan behavior when the keyboard *is* shown, not whether it appears at all) — not touched by this task.

**Investigated for other affected locations:** this is not a per-input, per-screen bug — it is a one-time, whole-app symptom tied to the very first focus attempt after the Activity resumes, wherever that happens to land (today, almost always the login screen's email field, since it's the first screen shown). No `autofocus` attribute or other JS/CSS is fighting for focus on the auth inputs (confirmed by reading the markup) — this rules out a JS-side contributing cause. The fix belongs entirely in native code, once, and covers every text input in the app, not just the auth screen.

- [ ] **Step 1: Add an explicit WebView focus request on resume**

Find (`android/app/src/main/java/com/eitanmonsa/trainingdiary/MainActivity.java`, the entire file):

```java
package com.eitanmonsa.trainingdiary;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

replace with:

```java
package com.eitanmonsa.trainingdiary;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Without this, the very first tap on a text input after a cold app
    // start only focuses the DOM element inside the WebView -- the Android
    // *window* itself hasn't yet been granted input focus by the OS at that
    // point, so the on-screen keyboard never receives the request to
    // appear. A second tap works because the first tap's side effect
    // already granted window focus by then. Requesting focus on the
    // WebView explicitly once the Activity resumes closes that gap for
    // every text input in the app, not just whichever screen loads first.
    @Override
    public void onResume() {
        super.onResume();
        getBridge().getWebView().requestFocus();
    }
}
```

- [ ] **Step 2: Rebuild and manually verify on-device**

This cannot be verified by an automated test (it's a real-device/emulator OS-level input-focus behavior, not something Playwright or a headless environment can reproduce) — it requires a human to install the rebuilt APK and test by hand:

1. Fully close the app (not just background it — a cold start is required to reproduce the original bug).
2. Reopen it, land on the login screen.
3. Tap the email field once, immediately (no second tap).
4. Confirm the on-screen keyboard opens on that first tap.
5. Repeat once more with a full close/reopen to confirm it's not a fluke.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/eitanmonsa/trainingdiary/MainActivity.java
git commit -m "fix(android): request WebView focus on resume so the first tap on a text input opens the keyboard"
```

---

## Task 2: Classify native Google sign-in failures into real, always-correctly-localized messages

**Files:**
- Modify: `public/index.html:2345-2356` (`handleGoogleLogin`'s catch block)
- Modify: `public/translations.js` (one new key, both language blocks)

**Interfaces:** None — `handleGoogleLogin` keeps its existing signature and call site.

**Root cause investigated at the native plugin source level** (`node_modules/@capacitor-firebase/authentication/android/src/main/java/io/capawesome/capacitorjs/plugins/firebase/authentication/`):
- `GoogleAuthProviderHandler.java`'s native Google sign-in path uses Android's `androidx.credentials.CredentialManager` API (`credentialManager.getCredentialAsync(...)`), which throws a `GetCredentialException` (or one of its several subclasses — cancellation, no-credential-found, provider-misconfiguration, interrupted, unknown) on any failure.
- `FirebaseAuthentication.java`'s `handleFailedSignIn` converts this via `FirebaseAuthenticationHelper.createErrorCode(exception)` — which **only** returns a real code (`auth/xxx`) when the exception is specifically a `FirebaseAuthException`. For every `GetCredentialException` subclass (i.e. every realistic native-flow failure — cancellation, no account, misconfiguration, anything), `createErrorCode` returns `null`.
- This means the JS side genuinely has no structured way to distinguish these failure types — `e.code` is always absent for all of them. The **only** signal available at all is the exception's raw `.message` string, which the Android Credentials library populates in English regardless of the app's or device's language.

The previous round's Task 2 fix (`if (e.code) ... else if (e.message) setAuthMsg(t('err.prefix') + e.message); else ...`) correctly stopped showing the useless literal string "Error: undefined", but its `e.message` fallback branch shows raw English text next to a Hebrew "שגיאה:" prefix when the app is in Hebrew — a real, user-visible language inconsistency Eitan caught by testing (the message he saw: "שגיאה: User cancelled the selector").

**Investigated for other affected locations:** re-confirmed `handleGoogleLogin` (`public/index.html:2324-2357`) is still the sole call site in the entire file with a native-vs-web branch that calls a native auth plugin before ever touching the Firebase JS SDK (grepped every `isNativePlatform()`/`Capacitor.Plugins.*` use in the file — the other four are unrelated: theme/lang boot detection, a native-loading-overlay timer, the hardware back-button listener). This is genuinely the only place this specific bug class can occur. (A separate, much larger, explicitly out-of-scope pattern was found and disclosed to Eitan separately: 13 other functions show raw Firestore SDK error messages the same way — not part of this plan.)

**Design:** replace the raw-`e.message` fallback with a small classifier that recognizes the realistic native failure shapes by keyword and maps each to an already-correctly-localized message; keep a translated (never raw) generic fallback for anything unrecognized.

- [ ] **Step 1: Add one new translation key**

Find (`public/translations.js`, Hebrew block, right after `err.google_signin_failed`):

```js
    'err.google_signin_failed': 'שגיאה בהתחברות עם Google. נסה שוב.',
```

Add immediately after it:

```js
    'err.google_signin_failed': 'שגיאה בהתחברות עם Google. נסה שוב.',
    'err.google_no_account':    'לא נמצא חשבון Google במכשיר',
```

Find (`public/translations.js`, English block, right after `err.google_signin_failed`):

```js
    'err.google_signin_failed': 'Google sign-in failed. Please try again.',
```

Add immediately after it:

```js
    'err.google_signin_failed': 'Google sign-in failed. Please try again.',
    'err.google_no_account':    'No Google account found on this device',
```

- [ ] **Step 2: Replace the raw-message fallback with a keyword classifier**

Find (`public/index.html:2345-2356`):

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

replace with:

```js
  } catch (e) {
    // Unlike handleAuthSubmit/handleForgotPassword (which only ever call the
    // Firebase SDK directly and always get a real FirebaseError with a
    // `.code`), the native branch above can throw a plain Capacitor-plugin
    // rejection with no `.code` at all. Investigated at the native plugin
    // source level (@capacitor-firebase/authentication's
    // GoogleAuthProviderHandler.java + FirebaseAuthenticationHelper.java):
    // createErrorCode() only ever returns a real code for a genuine
    // FirebaseAuthException — every realistic native-flow failure
    // (cancellation, no Google account on the device, provider
    // misconfiguration, anything else Android's CredentialManager API can
    // throw) comes back with `.code` completely absent, and the ONLY
    // signal available at all is the exception's raw `.message` string —
    // which Android populates in English regardless of the app's
    // currently-selected language. Never show that raw string directly
    // (it previously produced a Hebrew "שגיאה:" prefix glued to an English
    // sentence) — classify the known shapes by keyword into real,
    // correctly-localized messages, and fall back to an already-translated
    // generic message (never raw text) for anything unrecognized.
    if (e.code) {
      setAuthMsg(firebaseErrMsg(e.code));
    } else {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('cancel')) setAuthMsg(t('err.popup_closed'));
      else if (msg.includes('no credential') || msg.includes('not available')) setAuthMsg(t('err.google_no_account'));
      else setAuthMsg(t('err.google_signin_failed'));
    }
  }
}
```

(Reuses `err.popup_closed` — the existing "sign-in window closed before completing" message already shown for the web popup-cancellation case — for native cancellation too, since both describe the same user action; no new key needed for that case.)

- [ ] **Step 3: Manual verification**

Automated reproduction of each native failure shape isn't practical (requires triggering real Android Credential Manager error paths, which need a real device in specific states — no Google account present, mid-flow interruption, etc.) — verify by code reading plus what's actually reproducible:
- `node --check` the extracted module script and `public/translations.js` for syntax correctness.
- Confirm the new key exists in both language blocks, doesn't collide with any existing key.
- Confirm `handleAuthSubmit`/`handleForgotPassword`'s own `firebaseErrMsg(e.code)` call sites are completely unchanged.
- If practical on a real device: trigger the cancellation case again (tap Google sign-in, dismiss the account picker) — with the app in Hebrew, confirm the message now reads the existing `err.popup_closed` Hebrew text (no raw English, no mixed-language sentence); switch the app to English and repeat, confirm the English `err.popup_closed` text shows correctly localized.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/translations.js
git commit -m "fix(auth): classify native Google sign-in failures into localized messages instead of raw device-language text"
```

---

## Self-Review Notes (per superpowers:writing-plans)

- **Coverage:** both of Eitan's reported bugs have a task each, both root-caused at the actual source level (native Android focus semantics for Task 1; the actual `@capacitor-firebase/authentication` plugin source for Task 2) rather than guessed at.
- **Investigation-driven scoping:** Task 1 confirmed as a one-time, whole-app native fix (not a per-input JS fix) by checking for any JS/markup-side focus-fighting first. Task 2 confirmed as narrowly single-call-site by re-sweeping every native-plugin call in the file; the much larger 13-site raw-Firestore-message pattern was investigated, disclosed to Eitan, and explicitly excluded from this plan's scope per his own instruction to return to the login-screen bugs specifically.
- **No placeholders:** every step has exact before/after code. Task 1's verification step is explicitly manual/on-device since no automated environment can exercise real Android window-focus behavior — stated plainly rather than glossed over.
- **Global Constraint compliance:** Task 2's classifier's every branch resolves to a `t()`-wrapped key; the generic fallback (`err.google_signin_failed`) is itself a translated string, not raw text — no code path in the new catch block can show untranslated content.
