# Spec: Auth-Screen Android UX Fixes (Keyboard Focus, Autofill Auto-Submit, Cross-Surface Credential Sharing)

**Reported:** 2026-09-14, Eitan (1) reported the Android app's first tap on a login field doesn't open the keyboard, (2) shared a screenshot of Chrome's "Use saved password?" picker and asked whether it can appear in the app too, and whether picking a saved credential can also submit the form automatically.

## Problem

### Issue 1 — first tap after cold start doesn't open the keyboard (Android app only)

A fix for this exact symptom already exists, committed 2026-09-09 (`968b0b6`, reviewed further in `ef40320`), in [`MainActivity.java`](../../android/app/src/main/java/com/eitanmonsa/trainingdiary/MainActivity.java):

```java
@Override
public void onResume() {
    super.onResume();
    if (getBridge() != null && getBridge().getWebView() != null) {
        getBridge().getWebView().requestFocus();
    }
}
```

This is pushed and in the current debug APK, yet Eitan reproduced the bug again. Root cause of why the existing fix doesn't work: `onResume()` fires when the *Activity* enters the resumed lifecycle state, which is not the same moment the *window* actually receives OS-level input focus — that signal arrives separately, via `onWindowFocusChanged(true)`, generally a frame or more later. Calling `requestFocus()` inside `onResume()` can run before the window has focus, in which case the call is a no-op and the original bug (first tap only focuses the DOM node, not the OS-level input session that would raise the IME) still reproduces. Verified via Google's own Android documentation on window focus lifecycle: `onWindowFocusChanged` is the documented, reliable signal for "the window now has input focus," not `onResume`.

No other lifecycle override exists in this codebase (`MainActivity.java` has exactly one). No JS-side counterpart is needed or exists (grepped `public/index.html` for `appStateChange`/`Capacitor.Plugins.App` — the only usage is the unrelated `backButton` listener for hardware back, per `11-android-app.md`).

### Issue 2 — Chrome's saved-password picker doesn't submit the form after filling it (web + app)

Confirmed via code read: `#auth-email`/`#auth-password` ([index.html:990-991](../../public/index.html#L990-L991)) already carry correct `autocomplete="email"`/`autocomplete="current-password"` hints — nothing wrong there. Picking a saved credential from the browser's/OS's picker fills both fields but never invokes `handleAuthSubmit()` ([index.html:2347](../../public/index.html#L2347)), which only runs on the submit button's `onclick` ([index.html:987](../../public/index.html#L987)). Grepped every `autocomplete=` attribute in the file — the only two real credential-type fields in the whole app are these two; every other input (`sessionNameInput`, `m-date`, `displayNameInput`, exercise fields, etc.) is explicitly `autocomplete="off"`, so this fix's blast radius is exactly the auth screen and nowhere else.

**A second, related gap found during investigation, not reported by Eitan:** `.auth-input` ([index.html:90-96](../../public/index.html#L90-L96)) has no rule for the autofilled state at all. Chromium forces its own background/text color on an autofilled `<input>` via an internal user-agent style that `background: ...` cannot override (a `!important` on `background` still loses to it) — normally a pale yellow box. There is currently no light/dark-aware override, so an autofilled field will render with Chrome's stock yellow box instead of this app's `var(--surface)` background, clashing hard with the dark theme (`--surface` in dark mode is a near-black tone per `09-i18n-and-theming.md`/`08-settings.md`'s theming description). This is squarely inside "autofill," so it belongs in this same round rather than as a separately-flagged gap.

### Issue 3 — sharing saved website passwords into the app's WebView (app only)

This requires Android's Digital Asset Links credential-sharing mechanism (`delegate_permission/common.get_login_creds`), which needs **both sides declared**, not just one — confirmed by fetching Android's own developer documentation directly (`developer.android.com/identity/autofill/autofill-optimize` → `developers.google.com/identity/smartlock-passwords/android/associate-apps-and-sites`) rather than assumed:

1. **Website side** — `https://training-diary.web.app/.well-known/assetlinks.json` must declare **two** statements: one `namespace: "web"` statement for the site itself, and one `namespace: "android_app"` statement naming the package + signing certificate's SHA-256. A prior in-conversation attempt this session created only the `android_app` statement — incomplete, would not have worked as shipped.
2. **App side** — `AndroidManifest.xml` needs a new `<meta-data android:name="asset_statements" android:resource="@string/asset_statements" />` under `<application>`, with a matching string resource in `strings.xml` that `"include"`s the site's `assetlinks.json` URL. **This half did not exist at all** before this plan — without it, the website-side file alone does nothing.

Current file states, confirmed by reading them directly:
- `public/.well-known/assetlinks.json` — exists (created this session), has only the incomplete `android_app`-only statement.
- `android/app/src/main/AndroidManifest.xml` — has no `asset_statements` meta-data, no autofill-disabling attributes either (so nothing is blocking this at the manifest level once added).
- `android/app/src/main/res/values/strings.xml` — 4 existing entries (`app_name`, `title_activity_main`, `package_name`, `custom_url_scheme`), no `asset_statements` entry.
- `firebase.json` — the hosting `ignore` list's `"**/.*"` glob silently drops any dotfile/dotfolder from every deploy, including `.well-known` — fixed this session with a `"!.well-known/**"` negation, needs re-verification once the file's final content is set.
- **Signing key:** confirmed no release keystore exists yet (`TRAINING_DIARY_STORE_PASSWORD` in the global `gradle.properties` is still the placeholder `REPLACE_WITH_YOUR_PASSWORD`, and the keystore file itself isn't present on disk) — the app has only ever been built and distributed as a debug APK. The only real signing key today is the debug keystore (`~/.android/debug.keystore`), SHA-256 `D0:BB:9E:4F:49:54:92:0A:BF:80:82:75:51:75:37:4B:87:38:4D:93:08:3B:01:84:6B:9F:59:C0:C2:89:3E:3F` (matches the SHA-1 already on file from the earlier Google Sign-In fix, `01-auth-onboarding.md`'s Android section). **Known, accepted limitation:** once a real release keystore or Play App Signing certificate exists, its SHA-256 must be *added* to the `sha256_cert_fingerprints` array (it accepts multiple entries) — this plan does not block on that not existing yet, since debug-key sharing is still useful for local/development verification.

## Design decisions

**Issue 1 fix:** replace `onResume()` with `onWindowFocusChanged(boolean hasFocus)`, calling `requestFocus()` only when `hasFocus == true`, keeping the same null-guard (`getBridge() != null && getBridge().getWebView() != null`) that the whole-branch review already established is required for the WebView-missing fallback case. One method replaces the other — no reason to keep both, since `onResume`'s call is the ineffective one being replaced, not a complementary case.

**Issue 2 fix (auto-submit):** already implemented this session — the `:-webkit-autofill` + `@keyframes`/`animationstart` detection trick plus a guarded `_authAutofillDetect` listener that calls `handleAuthSubmit()` only when both fields show a real autofill event and `authMode === 'login'`. This spec's job is to (a) confirm that implementation is correct (it is, re-verified during this investigation) and (b) close the newly-found dark-mode gap by adding the standard box-shadow-inset override, reusing the existing `var(--surface)`/`var(--text)` tokens so it stays theme-correct automatically in both modes without new tokens:

```css
.auth-input:-webkit-autofill,
.auth-input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text);
  box-shadow: 0 0 0 1000px var(--surface) inset;
  transition: background-color 9999s ease-in-out 0s;
}
```

The `9999s` transition is the standard, widely-used technique to permanently defeat Chromium's own delayed re-application of its autofill background — not an arbitrary magic number picked here, it's the known idiom for this exact override.

**Issue 3 fix (two-way asset link):** rewrite `public/.well-known/assetlinks.json` to carry both statements (web + android_app), and add the manifest half that's currently entirely missing (`asset_statements` meta-data in `AndroidManifest.xml` + the matching `strings.xml` entry using the `"include"` form, pointing at the production URL — not inlining the raw statement twice in two places that could drift out of sync).

## Testing strategy

- **Issue 1:** live-verifiable in this environment — an Android emulator is present (`Medium_Phone_API_36.1`, `Pixel_8`). Plan includes building the debug APK, installing on the emulator, force-stopping the app (to guarantee a genuine cold start, not a resumed process), and tapping the email field on the very first interaction, confirming the on-screen keyboard opens without a second tap — the actual reported symptom, not just a code read.
- **Issue 2 (auto-submit logic):** the real trigger (an actual OS/browser credential picker) can't be driven from an automated test — Playwright's `fill()` sets values via CDP and never touches the browser's own autofill UI, so `:-webkit-autofill` never engages that way. Verifiable instead by dispatching a genuine synthetic `AnimationEvent` (`animationName: 'onAutoFillStart'`) at both fields after populating their values, then asserting `handleAuthSubmit()` actually ran (observable via the auth error message changing when deliberately using bogus credentials — proves the Firebase call fired, without touching a real account). This is a legitimate test of the detection-and-trigger wiring, distinct from the browser's own picker UI which is outside what any web test can drive.
- **Issue 2 (dark-mode CSS):** verified via `CSS.forcePseudoState` (Chrome DevTools Protocol, supports `"autofill"` as a forced state since Chrome 90+) through Playwright's CDP session, checked in both light and dark theme — computed styles, not eyeballing.
- **Issue 3:** the JSON file and manifest/string-resource changes are fully verifiable locally without a device: `firebase emulators:start --only hosting` + `curl` confirms the file is actually served (not swallowed by the `ignore` glob or shadowed by the SPA catch-all rewrite) with the right content, and `./gradlew assembleDebug` confirms the manifest merger accepts the new meta-data without error. **Honest limitation, to be stated plainly in the final summary, not glossed over:** confirming Android's Autofill Framework actually offers a *real* saved website password inside the app's WebView requires a device/emulator signed into a Google account that has both "Autofill with Google" selected as the system autofill service and an actual saved password for `training-diary.web.app` — not something this environment can set up end-to-end. That last mile needs verification by Eitan on his own phone after the next real Play-distributed (or at least properly-signed) build.
