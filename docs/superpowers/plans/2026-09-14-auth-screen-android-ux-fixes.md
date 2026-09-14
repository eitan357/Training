# Auth-Screen Android UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Android app's first-tap keyboard bug, make credential autofill on the login screen visually correct in dark mode and auto-submit the form, and set up two-way Digital Asset Links so saved website passwords can be shared into the app's WebView.

**Architecture:** Three independent fixes sharing one root cause category (the login screen's interaction with the platform's input/credential systems): (1) a native Android lifecycle-timing fix in `MainActivity.java`, (2) a pure CSS/JS fix in the single-source-of-truth `public/index.html` that already ships identically to web and app, (3) a two-sided Digital Asset Links declaration (website `.well-known/assetlinks.json` + Android manifest/string resource). No shared code between them — they can be implemented and reviewed independently, in any order, but are grouped in one plan because they were investigated together and touch the same screen.

**Tech Stack:** Vanilla JS/HTML/CSS (`public/index.html`), Java (Capacitor `BridgeActivity` subclass), Android resource XML, Firebase Hosting config (`firebase.json`), Digital Asset Links JSON.

**Spec:** `docs/superpowers/specs/2026-09-14-auth-screen-android-ux-design.md`

## Global Constraints

- Single source of truth: `public/index.html` serves both the website and the Capacitor Android app unchanged — never fork behavior with a `window.Capacitor` check unless a task explicitly calls for it (none here do).
- No new user-facing strings are introduced anywhere in this plan — do not touch `public/translations.js`.
- The autofill auto-submit logic must only ever act when `authMode === 'login'` — never on the register tab.
- `MainActivity.java`'s existing null-guard (`getBridge() != null && getBridge().getWebView() != null`) must be preserved in whatever lifecycle method ends up calling `requestFocus()` — removing it reintroduces the NPE-on-missing-WebView crash the 2026-09-09 whole-branch review fixed.
- `sha256_cert_fingerprints` in `assetlinks.json` is an array — only ever add entries to it in the future, never replace the debug key's entry while debug builds are still in use for testing.
- Every task ends by updating the one product doc under `docs/product/` that documents the affected page/topic — do this in the same task, not deferred to a final pass.

---

### Task 1: Fix Android WebView window-focus timing (first-tap keyboard bug)

**Files:**
- Modify: `android/app/src/main/java/com/eitanmonsa/trainingdiary/MainActivity.java` (currently 29 lines, single `onResume()` override)
- Docs: `docs/product/11-android-app.md`

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing other tasks depend on — fully independent.

- [ ] **Step 1: Replace `onResume()` with `onWindowFocusChanged()`**

Replace the entire class body with:

```java
package com.eitanmonsa.trainingdiary;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The very first tap on a text input after a cold app start would only
    // focus the DOM element inside the WebView -- the Android *window*
    // itself hadn't yet been granted input focus by the OS at that point,
    // so the on-screen keyboard never received the request to appear. A
    // second tap worked because the first tap's side effect already
    // granted window focus by then.
    //
    // A 2026-09-09 fix requested focus from onResume(), but onResume()
    // fires when the *Activity* reaches the resumed lifecycle state, which
    // is not the same moment the *window* actually receives OS-level input
    // focus -- that arrives separately, via onWindowFocusChanged(true),
    // typically a frame or more later. Calling requestFocus() from
    // onResume() could run before the window had focus, in which case the
    // call was a silent no-op and the bug still reproduced. This override
    // requests focus from the one lifecycle callback Android actually uses
    // to report "the window now has input focus" -- the reliable fix.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().requestFocus();
        }
    }
}
```

- [ ] **Step 2: Build the debug APK**

Run: `cd android && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`, produces `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 3: Install on an emulator and force-stop to guarantee a real cold start**

Run:
```bash
$ANDROID_HOME/platform-tools/adb install -r android/app/build/outputs/apk/debug/app-debug.apk
$ANDROID_HOME/platform-tools/adb shell am force-stop com.eitanmonsa.trainingdiary
$ANDROID_HOME/platform-tools/adb shell monkey -p com.eitanmonsa.trainingdiary -c android.intent.category.LAUNCHER 1
```
(If no emulator is currently booted, start one first: `$ANDROID_HOME/emulator/emulator -avd Pixel_8` and wait for `adb devices` to list it as `device`, not `offline`.)

- [ ] **Step 4: Verify the fix live — first tap opens the keyboard**

Tap the email field on the login screen as the very first interaction after the cold start from Step 3 (a single tap, not two). Confirm the on-screen keyboard appears immediately. This is the literal reported symptom — a code read is not sufficient proof here, since the previous (ineffective) fix also looked correct on paper.
Expected: keyboard opens on the first tap. If it doesn't, the fix did not work — do not proceed to Step 5 until it does.

- [ ] **Step 5: Update `docs/product/11-android-app.md`**

Add a new subsection right after "כפתור החזרה הפיזי (Hardware Back Button)" (search for that heading), before "מודל הפצה":

```markdown
## פוקוס מקלדת בטעינה קרה (Cold-Start Keyboard Focus)

עד 2026-09-14, לחיצה ראשונה על שדה טקסט כלשהו מיד אחרי עליית אפליקציה קרה (cold start) הייתה ממקדת (focus) רק את האלמנט בתוך ה-WebView, בלי לפתוח את מקלדת המכשיר בפועל — לחיצה שנייה הייתה עובדת. הסיבה: ה-*חלון* של אנדרואיד עצמו מקבל פוקוס קלט מה-OS **אחרי** ש-Activity מגיע למצב `onResume` (לא באותו רגע) — ניסיון תיקון קודם (2026-09-09) קרא ל-`requestFocus()` מתוך `onResume()`, לפני שהחלון בפועל קיבל פוקוס, ולכן לא עבד בפועל.

**התיקון (`MainActivity.java`):** `requestFocus()` על ה-WebView נקרא כעת מתוך `onWindowFocusChanged(hasFocus)`, ורק כש-`hasFocus == true` — זהו ה-callback האמיתי שאנדרואיד משתמש בו כדי לדווח שהחלון קיבל פוקוס קלט. משפיע על **כל** שדה טקסט באפליקציה, לא רק מסך ההתחברות (אותו mechanism חל בכל מקום שממתין לפוקוס מקלדת אחרי חזרה לאפליקציה, למשל אחרי Custom Tab של Google Sign-In).
```

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/eitanmonsa/trainingdiary/MainActivity.java docs/product/11-android-app.md
git commit -m "fix(android): request WebView focus from onWindowFocusChanged, not onResume, to fix first-tap keyboard bug"
```

---

### Task 2: Autofill dark-mode styling + auto-submit wiring test

**Files:**
- Modify: `public/index.html` (CSS block near `.auth-input`, currently lines 90-101; JS block "AUTOFILL AUTO-SUBMIT", currently lines 2386-2407 — line numbers will shift once Task 1's docs edits and other tasks land, locate by the `.auth-input` / `_authAutofillDetect` identifiers, not the line numbers)
- Test: `tests/security.spec.ts` (existing file — confirm by reading it first; if it doesn't exist under this name, use `tests/auth.spec.ts` if that exists instead, matching whichever file already covers `#auth-email`/`#auth-password`)
- Docs: `docs/product/01-auth-onboarding.md`

**Interfaces:**
- Consumes: nothing from Task 1 or Task 3.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Add the dark-mode-safe autofill override CSS**

In `public/index.html`, immediately after the existing `.auth-input:-webkit-autofill { animation-name: onAutoFillStart; animation-duration: .001s; }` rule, add:

```css
    .auth-input:-webkit-autofill,
    .auth-input:-webkit-autofill:focus {
      -webkit-text-fill-color: var(--text);
      box-shadow: 0 0 0 1000px var(--surface) inset;
      transition: background-color 9999s ease-in-out 0s;
    }
```

- [ ] **Step 2: Write the failing test for auto-submit wiring**

First read `tests/security.spec.ts` in full to match its existing style (imports, `test.describe` structure, how it navigates to the auth screen) before adding to it — do not guess the boilerplate. Add a new test:

```typescript
test('selecting a saved credential (simulated autofill) auto-submits the login form', async ({ page }) => {
  await page.goto('/');
  await page.fill('#auth-email', 'nonexistent-autofill-test@example.com');
  await page.fill('#auth-password', 'wrong-password-123');

  // Playwright's fill() sets values via CDP and never triggers the browser's
  // own autofill UI, so :-webkit-autofill never naturally engages here.
  // Dispatch the same synthetic event the CSS trick produces on a REAL
  // autofill, to test the detection-and-submit wiring in isolation from the
  // browser's own credential picker (which no automated test can drive).
  await page.evaluate(() => {
    const fire = (id: string) => {
      const el = document.getElementById(id)!;
      el.dispatchEvent(new AnimationEvent('animationstart', { animationName: 'onAutoFillStart', bubbles: true }));
    };
    fire('auth-email');
    fire('auth-password');
  });

  // A real login attempt fired iff the auth error message changes from
  // empty to Firebase's "wrong credentials" text -- proves handleAuthSubmit()
  // actually ran, without needing (or risking) a real account.
  await expect(page.locator('#auth-msg')).not.toBeEmpty({ timeout: 5000 });
});
```

- [ ] **Step 3: Run the test to verify it currently passes (this logic already shipped earlier this session)**

Run: `npx playwright test tests/security.spec.ts -g "auto-submits the login form"`
Expected: PASS. If it fails, the existing `_authAutofillDetect` wiring in `public/index.html` regressed — stop and investigate before continuing; do not weaken the test to make it pass.

- [ ] **Step 4: Verify the dark-mode CSS fix via forced pseudo-state**

Add a second test in the same file:

```typescript
test('autofilled auth inputs use the theme surface color, not the browser default', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.reload();

  const cdp = await context.newCDPSession(page);
  const email = page.locator('#auth-email');
  // CSS.forcePseudoState needs a DOM.NodeId, obtained via DOM.getDocument + DOM.querySelector
  // -- not the element handle Playwright itself uses internally.
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', {});
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#auth-email' });
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });

  const boxShadow = await email.evaluate(el => getComputedStyle(el).boxShadow);
  expect(boxShadow).toContain('1000px'); // inset spread matches the override rule, not the browser default
});
```

- [ ] **Step 5: Run it**

Run: `npx playwright test tests/security.spec.ts -g "theme surface color"`
Expected: PASS. If `CSS.forcePseudoState` isn't supported by the installed Playwright/Chromium version, the test will error clearly on that call — in that case, skip this automated check and instead verify manually via Chrome DevTools (Elements panel → `:hov` button → check `autofill` → inspect computed `box-shadow`) in both themes, and note in the commit message that this one check was done manually, not automated.

- [ ] **Step 6: Update `docs/product/01-auth-onboarding.md`**

Add a new subsection right after the "כניסה עם Google" section, before "הודעות שגיאה":

```markdown
### כניסה אוטומטית מסיסמה שמורה (Autofill Auto-Submit)

בחירת סיסמה שמורה מתוך רשימת ה-autofill של הדפדפן/מערכת ההפעלה ממלאת את שני השדות בפעולה אחת, אך אינה לוחצת בעצמה על כפתור הכניסה. כדי לחסוך למשתמש לחיצה נוספת, האפליקציה מזהה מתי הדפדפן/OS מילאו את השדות בפועל (לא הקלדה ידנית — ראו הבחנה למטה) ומפעילה כניסה אוטומטית.

**זיהוי autofill אמיתי (ולא הקלדה):** משתמש בטריק CSS מוכר — פסאדו-קלאס `:-webkit-autofill` מקושר ל-`@keyframes` ריק, שגורם לאירוע `animationstart` להיורות **רק** כשהדפדפן/OS ממלאים שדה, לעולם לא בהקלדה. כשהאירוע הזה קרה גם בשדה המייל וגם בשדה הסיסמה — ורק במצב "התחברות" (לא "הרשמה") — נקרא `handleAuthSubmit()` אוטומטית.

**עיצוב תואם ערכת נושא לשדה שמולא אוטומטית:** ל-`:-webkit-autofill` יש עיצוב ברירת מחדל כפוי של הדפדפן (בד"כ רקע צהבהב) שאי אפשר לעקוף עם `background` רגיל — נפתר עם דריסת `box-shadow: inset` הסטנדרטית, המשתמשת ב-`var(--surface)`/`var(--text)` הקיימים כך שהיא תואמת אוטומטית גם למצב כהה.

**מגבלה ידועה:** זה קוד משותף (`public/index.html`), כך שהוא רץ גם באתר וגם באפליקציה — אך הפעלה בפועל של הבורר עצמו ("Use saved password?") בתוך ה-WebView של האפליקציה תלויה בשיתוף Digital Asset Links, ראו `11-android-app.md`.
```

- [ ] **Step 7: Commit**

```bash
git add public/index.html tests/security.spec.ts docs/product/01-auth-onboarding.md
git commit -m "fix: dark-mode-safe autofill styling + regression test for autofill auto-submit"
```

---

### Task 3: Two-way Digital Asset Links (share saved website passwords into the app)

**Files:**
- Modify: `public/.well-known/assetlinks.json` (created earlier this session with only an incomplete `android_app` statement)
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/res/values/strings.xml`
- Docs: `docs/product/11-android-app.md`, `docs/product/12-security-and-privacy.md`

**Interfaces:**
- Consumes: nothing from Task 1 or Task 2.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Rewrite `assetlinks.json` to include both statements**

```json
[
  {
    "relation": ["delegate_permission/common.get_login_creds"],
    "target": {
      "namespace": "web",
      "site": "https://training-diary.web.app"
    }
  },
  {
    "relation": ["delegate_permission/common.get_login_creds"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.eitanmonsa.trainingdiary",
      "sha256_cert_fingerprints": [
        "D0:BB:9E:4F:49:54:92:0A:BF:80:82:75:51:75:37:4B:87:38:4D:93:08:3B:01:84:6B:9F:59:C0:C2:89:3E:3F"
      ]
    }
  }
]
```

- [ ] **Step 2: Add the string resource in `strings.xml`**

In `android/app/src/main/res/values/strings.xml`, add before `</resources>`:

```xml
    <string name="asset_statements" translatable="false">
        [{\"include\": \"https://training-diary.web.app/.well-known/assetlinks.json\"}]
    </string>
```

- [ ] **Step 3: Add the manifest meta-data**

In `android/app/src/main/AndroidManifest.xml`, inside `<application ...>`, immediately after the `android:theme="@style/AppTheme"` attribute line (before the first `<activity>` tag):

```xml
        <meta-data android:name="asset_statements" android:resource="@string/asset_statements" />
```

- [ ] **Step 4: Verify the manifest merges cleanly**

Run: `cd android && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL` — a malformed `meta-data`/string reference would fail the manifest merger step specifically, so a successful build is real evidence, not just a syntax eyeball-check.

- [ ] **Step 5: Verify the hosting file is actually servable (not swallowed by `ignore`, not shadowed by the SPA rewrite)**

Run: `firebase emulators:start --only hosting` in one terminal, then in another:
```bash
curl -s http://localhost:5000/.well-known/assetlinks.json
```
Expected: the exact JSON from Step 1 comes back — not the `index.html` SPA fallback. If it returns HTML instead, the `firebase.json` `ignore`/`rewrites` interaction is still wrong — fix it before proceeding (check the `"!.well-known/**"` negation added earlier this session is present and ordered after `"**/.*"` in the `ignore` array).

- [ ] **Step 6: Update `docs/product/11-android-app.md`**

Add a new subsection right after "שיתוף Backend מלא", before "Service Worker באפליקציה":

```markdown
## שיתוף סיסמאות שמורות בין האתר לאפליקציה (Cross-Surface Credential Sharing)

כדי שסיסמה שנשמרה על ידי המשתמש באתר (`training-diary.web.app`) תוצע כאוטופיל גם בתוך ה-WebView של האפליקציה, אנדרואיד דורש הצהרה **דו-כיוונית** של Digital Asset Links — לא מספיק צד אחד:

1. **צד האתר** — `public/.well-known/assetlinks.json` מכיל שתי הצהרות עם relation `delegate_permission/common.get_login_creds`: אחת עבור `namespace: "web"` (האתר עצמו) ואחת עבור `namespace: "android_app"` (חבילת האפליקציה + טביעת אצבע SHA-256 של מפתח החתימה).
2. **צד האפליקציה** — `AndroidManifest.xml` מכיל `<meta-data android:name="asset_statements" ...>` המצביע (`"include"`) בחזרה לכתובת ה-`assetlinks.json` באתר, דרך `strings.xml`.

**מגבלה ידועה, מכוונת:** ה-SHA-256 הרשום היום הוא **רק** של מפתח ה-debug (`~/.android/debug.keystore`) — אין עדיין מפתח release בפרויקט (ראו `01-auth-onboarding.md`'s הערת Google Sign-In). ברגע שייווצר מפתח release אמיתי או שתופעל Play App Signing, יש **להוסיף** את ה-SHA-256 שלו למערך `sha256_cert_fingerprints` (הוא תומך בכמה ערכים בו-זמנית) — לא להחליף את ערך ה-debug כל עוד עדיין נעשה שימוש ב-build-ים של debug לבדיקות.

**לא ניתן לאמת קצה-לקצה בסביבת הפיתוח:** בדיקה אמיתית שסיסמה שמורה באתר אכן מוצעת בתוך האפליקציה דורשת מכשיר/אמולטור עם חשבון Google מחובר שבו "Autofill with Google" הוא שירות ה-autofill הפעיל, וסיסמה שמורה בפועל ל-`training-diary.web.app` — לא ניתן להקים את זה קצה-לקצה בסביבת הפיתוח האוטומטית. מה שכן אומת: הקובץ מוגש נכון מה-hosting (לא נבלע ע"י ה-`ignore`, לא מוסתר ע"י ה-SPA rewrite), וה-manifest מתמזג בהצלחה עם ה-meta-data החדש.
```

- [ ] **Step 7: Update `docs/product/12-security-and-privacy.md`**

Add one sentence to the end of the "בקרת גישה" section (after the existing bullet about the running-page toggle not being a security control):

```markdown
- **החל מ-2026-09-14:** האפליקציה משתפת גם סיסמאות שמורות בין האתר לגרסת ה-Android (Digital Asset Links, `delegate_permission/common.get_login_creds`) — ראו `11-android-app.md` לפירוט המלא. זהו שיתוף בין שתי המשטחים **של אותו** מוצר/מפתח (לא צד שלישי), מאושר ע"י Android רק כי שני הצדדים מוכיחים בעלות הדדית (טביעת אצבע החתימה מול קובץ מאושר באתר) — אינו פותח שום חשיפה חדשה של נתוני משתמשים לצד חיצוני.
```

- [ ] **Step 8: Commit**

```bash
git add public/.well-known/assetlinks.json android/app/src/main/AndroidManifest.xml android/app/src/main/res/values/strings.xml docs/product/11-android-app.md docs/product/12-security-and-privacy.md
git commit -m "feat(android): two-way Digital Asset Links so saved website passwords can be shared into the app's WebView"
```

---

### Task 4: Whole-round review, full regression pass, feature summary

**Files:** none created — this task verifies Tasks 1-3 together and produces a summary; it may touch any file the review turns up a real bug in.

**Interfaces:**
- Consumes: the finished state of Tasks 1, 2, and 3.
- Produces: nothing — this is the plan's closing task.

- [ ] **Step 1: Run the full Playwright suite**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test`
(The `export` prefix is required in this repo — without real `TEST_EMAIL`/`TEST_PASSWORD`, `requiresCredentials()` silently skips ~280+ real tests and a misleadingly-clean "0 failures" result is all you get. Confirm the skip count in the output is small, not in the hundreds.)
Expected: no new failures beyond this repo's already-documented pre-existing baseline (the exercise-card timing race and `#darkModeToggle`-related failures — see the project's own test-suite notes; do not treat these as caused by this plan).

- [ ] **Step 2: Fresh cross-task consistency check**

Confirm, by reading the actual current files (not by trusting each task's own "done" claim):
- `MainActivity.java` still has the null-guard (`getBridge() != null && getBridge().getWebView() != null`) inside `onWindowFocusChanged`.
- `assetlinks.json`'s `android_app` statement's `sha256_cert_fingerprints` array is untouched/correct after Task 3's edits.
- The autofill auto-submit guard (`authMode !== 'login'` early-return) in `public/index.html` is still present and wasn't accidentally touched by Task 2's CSS-only change.
- Rebuild once more (`cd android && ./gradlew assembleDebug`) to confirm all three tasks' native/resource changes coexist in a single successful build — a manifest or resource conflict between Task 1's Java change and Task 3's XML changes would only surface here, not in either task's own isolated build.

- [ ] **Step 3: Write the feature summary**

Produce a short summary (for Eitan, in the same reply that closes this plan) covering, per feature: what changed, what was live-verified vs. what has a stated, honest limitation (per the spec's "Testing strategy" section — especially Task 3's end-to-end limitation), and the exact commands used for each verification so they're reproducible later.

- [ ] **Step 4: Final commit (only if Step 2 found and fixed anything)**

```bash
git add -A
git commit -m "fix: whole-round review fixes for auth-screen Android UX plan"
```
If Step 2 found nothing to fix, skip this commit — do not create an empty one.
