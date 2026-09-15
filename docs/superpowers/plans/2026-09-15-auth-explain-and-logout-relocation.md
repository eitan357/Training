# Auth Screen Trust Copy + Logout Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trust-building copy to the login screen explaining why sign-in is required, and relocate the "Sign Out" button out of the main Settings page into the Privacy page as a de-emphasized, non-destructive-styled link (full removal is a deliberate future step, not part of this plan).

**Architecture:** Both changes are presentation-only edits to the single `public/index.html` file (+ matching `public/translations.js` entries) — no new routes, no new Firestore fields, no change to `handleLogout()`'s behavior. Task 2's real complexity is in the ripple effects: two test files and two product docs reference the button's current location/selector and must move with it.

**Tech Stack:** Vanilla JS (no framework/bundler), `public/translations.js` for all user-facing strings (`he`/`en` pairs), Playwright for e2e tests (existing suite runs against live production Firebase — see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-15-auth-explain-and-logout-relocation-design.md` — read it before starting; this plan implements its two decisions and the ripple-effect list verbatim.

## Global Constraints

- Single file `public/index.html` holds all markup/CSS/JS for the live app — every HTML/CSS/JS task below edits this one file at the line ranges given; re-check line numbers before editing since earlier tasks in this plan (and other work on this branch) can shift them.
- All user-facing text goes through `t(key)` — any new string needs both a `he` and an `en` entry in `public/translations.js`, added at the same relative position in both language blocks (existing convention).
- This repo's only test runner is Playwright e2e (`npm test`), and every existing spec file runs against the **live production** Firebase project using long-lived shared accounts (`TEST_EMAIL`/`TEST_PASSWORD` from `.env.test`, never committed). This session/plan does not have those credentials — Task 2's verification is a local static-server structural/visual check, not a full Playwright run against production. That full run is called out explicitly as a follow-up, not silently skipped.
- Don't reuse `.settings-logout-btn` for the relocated button — it's already shared by `#privacyDataBtn`/`#privacyAccountBtn` on the Privacy page; a third same-class element there breaks any unscoped `.settings-logout-btn` Playwright locator (strict-mode violation).

---

## Task 1: Auth screen trust copy (retroactive — implement docs for already-shipped code)

**Status:** The code half of this task (CSS + markup + translations) was already implemented and visually verified (local server + Playwright screenshot, `he`/RTL and `en`/LTR) earlier in this same conversation, before this plan existed. This task's only remaining work is the product-doc update — included here so the plan is a complete, accurate record of what shipped.

**Files:**
- Already modified: `public/index.html` (`.auth-explain` CSS rule near line 81; `<p class="auth-explain" data-i18n="auth.why">` markup at the end of `.auth-card`, after the Google sign-in button)
- Already modified: `public/translations.js` (`auth.why` key, both `he` and `en` blocks, positioned right after `auth.loading`)
- Modify: `docs/product/01-auth-onboarding.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: translation key `auth.why` (already available for Task 2 or any future auth-screen work to reference).

- [x] **Step 1: (already done) Add `.auth-explain` CSS + markup to `public/index.html`**

Verified present:
```css
.auth-explain {
  font-size: 12px; color: var(--sub); line-height: 1.6; text-align: center;
  margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border);
}
```
```html
      <span data-i18n="auth.google">כניסה עם Google</span>
    </button>
    <p class="auth-explain" data-i18n="auth.why">החיבור לחשבון נדרש כדי לשמור את האימונים והמדידות שלך בבטחה בענן — כך שהנתונים שלך מגובים ולא יאבדו אם תחליף מכשיר, תמחק את האפליקציה בטעות, או תנקה את הזיכרון של המכשיר.</p>
  </div>
</div>
```

- [x] **Step 2: (already done) Add `auth.why` to both translation blocks**

`public/translations.js`, Hebrew block (right after `'auth.loading': 'טוען נתונים...',`):
```js
    'auth.why':            'החיבור לחשבון נדרש כדי לשמור את האימונים והמדידות שלך בבטחה בענן — כך שהנתונים שלך מגובים ולא יאבדו אם תחליף מכשיר, תמחק את האפליקציה בטעות, או תנקה את הזיכרון של המכשיר.',
```
English block (right after `'auth.loading': 'Loading data...',`):
```js
    'auth.why':            'Signing in keeps your workouts and measurements safely backed up in the cloud — so your data won\'t be lost if you switch devices, accidentally delete the app, or clear your device storage.',
```

- [x] **Step 3: (already done) Visual verification**

Local static server (`python -m http.server` in `public/`) + Playwright MCP: navigated in English (default), then set `localStorage.lang='he'` and reloaded. Both renders confirmed clean — text wraps correctly, divider visible, no layout breakage, no console errors introduced by the change.

- [ ] **Step 4: Update `docs/product/01-auth-onboarding.md`**

Insert a new bullet after the existing Google sign-in bullet (the one ending "פירוט מלא ב-`11-android-app.md`.") and before "### הודעות שגיאה":

```markdown
### הסבר על הצורך בחיבור (Trust Copy)
- פסקת הסבר קצרה (`auth.why`) מתחת לכפתור Google, מופרדת בקו עליון — מסבירה שהחיבור לחשבון הוא מה ששומר את האימונים/המדידות בגיבוי בענן, כדי שהנתונים לא יאבדו בהחלפת מכשיר/מחיקת האפליקציה בטעות/ניקוי אחסון המכשיר. נוסח מרגיע (מציג תועלת), לא מאיים — וממוקם **אחרי** כל אפשרויות ההתחברות, כך שאינו מוסיף חיכוך לפני ה-CTA הראשי.
```

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/translations.js docs/product/01-auth-onboarding.md docs/superpowers/specs/2026-09-15-auth-explain-and-logout-relocation-design.md docs/superpowers/plans/2026-09-15-auth-explain-and-logout-relocation.md
git commit -m "docs: add auth-screen trust-copy explanation to product docs"
```

---

## Task 2: Relocate + de-emphasize the logout button

**Files:**
- Modify: `public/index.html:138-145` (CSS — add `.privacy-logout-link` next to `.settings-logout-btn`)
- Modify: `public/index.html:1497` (remove the logout button from `#sec-settings`)
- Modify: `public/index.html:1519-1526` (add the relocated button inside `#sec-privacy`, after the delete-actions block)
- Modify: `tests/helpers/auth.ts:63-69` (`logout()` helper)
- Modify: `tests/settings.spec.ts:69-85` (the two logout tests)
- Modify: `docs/product/08-settings.md` (remove standalone "פעולה: יציאה" section, fold into "קבוצה 5: פרטיות")
- Modify: `docs/product/01-auth-onboarding.md` (correct the `handleLogout` location reference in "מעברי מצב")

**Interfaces:**
- Consumes: `handleLogout()` (`public/index.html:2582`, unchanged, already `window`-exported at `public/index.html:6333`).
- Produces: new selector `#privacyLogoutBtn` (and class `.privacy-logout-link`) for any test or future code that needs to find the sign-out control — this replaces `.settings-logout-btn` as the way to reach logout specifically.

- [ ] **Step 1: Update the failing tests first — `tests/settings.spec.ts`**

Replace the two tests at lines 69-85:
```ts
  test('logout button is present', async ({ page }) => {
    // Scoped to #sec-settings: .settings-logout-btn is also reused (by the
    // Privacy page added in this task) for the two red delete buttons in
    // #sec-privacy, which would otherwise make this a strict-mode violation.
    const logoutBtn = page.locator('#sec-settings .settings-logout-btn');
    await expect(logoutBtn).toBeVisible();
  });

  test('logout button triggers sign-out', async ({ page }) => {
    await page.locator('#sec-settings .settings-logout-btn').click();
    // After logout, auth screen should become visible (Firebase removes .hidden class)
    await page.waitForFunction(
      () => !document.getElementById('auth-screen')?.classList.contains('hidden'),
      { timeout: 10000 }
    );
    await expect(page.locator('#auth-screen')).toBeVisible();
  });
```

with:
```ts
  test('logout button is not in the main Settings list', async ({ page }) => {
    // Relocated to the Privacy page (2026-09-15) — de-emphasized, no longer
    // grouped with the primary settings actions.
    const logoutBtn = page.locator('#sec-settings #privacyLogoutBtn');
    await expect(logoutBtn).toHaveCount(0);
  });

  test('logout button is present on the Privacy page, styled as a quiet link', async ({ page }) => {
    await page.evaluate(() => (window as any).openPrivacySettings());
    const logoutBtn = page.locator('#sec-privacy #privacyLogoutBtn');
    await expect(logoutBtn).toBeVisible();
    await expect(logoutBtn).toHaveClass(/privacy-logout-link/);
  });

  test('logout button triggers sign-out from the Privacy page', async ({ page }) => {
    await page.evaluate(() => (window as any).openPrivacySettings());
    await page.locator('#sec-privacy #privacyLogoutBtn').click();
    // After logout, auth screen should become visible (Firebase removes .hidden class)
    await page.waitForFunction(
      () => !document.getElementById('auth-screen')?.classList.contains('hidden'),
      { timeout: 10000 }
    );
    await expect(page.locator('#auth-screen')).toBeVisible();
  });
```

- [ ] **Step 2: Run the updated tests to confirm they fail against current code**

Run (requires `.env.test` credentials — see Global Constraints; if unavailable, skip this step and rely on Step 8's local structural check instead, noting the skip in the commit/report):
```bash
export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/settings.spec.ts -g "logout"
```
Expected: the two new/renamed tests fail — `#sec-settings #privacyLogoutBtn` still has count 0 for the wrong reason (no element by that id exists anywhere yet), and `openPrivacySettings` navigation test fails because `#privacyLogoutBtn` doesn't exist in `#sec-privacy` either.

- [ ] **Step 3: Add the `.privacy-logout-link` CSS rule**

In `public/index.html`, right after the existing `.settings-logout-btn:hover` rule (currently line 145):
```css
    .privacy-logout-link {
      display: block; text-align: center; font-size: 13px; color: var(--sub);
      background: none; border: none; cursor: pointer; padding: 4px; width: 100%;
    }
    .privacy-logout-link:hover { color: var(--text); }
```

- [ ] **Step 4: Remove the logout button from `#sec-settings`**

In `public/index.html`, delete this line (currently line 1497, immediately after the Privacy nav row's closing `</button>`):
```html
    <button class="settings-logout-btn" onclick="handleLogout()" data-i18n="btn.logout">יציאה</button>
```
Leave the blank line and the group's closing `</div></div>` as-is — just remove the button itself.

- [ ] **Step 5: Add the relocated button to `#sec-privacy`**

In `public/index.html`, immediately after the delete-actions block's closing `</div>` (currently line 1525, right before `#sec-privacy`'s own closing `</div></div>`), insert:
```html

    <button id="privacyLogoutBtn" class="privacy-logout-link" style="margin-top:24px;" onclick="handleLogout()" data-i18n="btn.logout">יציאה</button>
```
No `border-top` on this one — deliberate, per spec: a divider would visually group it with the two destructive delete buttons above it, which is the opposite of the intent.

- [ ] **Step 6: Update `tests/helpers/auth.ts`'s `logout()` helper**

Replace:
```ts
export async function logout(page: Page) {
  await page.locator('#nav-main').click().catch(() => {});
  // Navigate to settings and click logout
  await page.evaluate(() => (window as any).showSection('settings'));
  await page.locator('.settings-logout-btn').click();
  await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 10000 });
}
```
with:
```ts
export async function logout(page: Page) {
  await page.locator('#nav-main').click().catch(() => {});
  // Logout now lives on the Privacy page, not the main Settings list (relocated 2026-09-15).
  await page.evaluate(() => (window as any).openPrivacySettings());
  await page.locator('#privacyLogoutBtn').click();
  await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 10000 });
}
```

- [ ] **Step 7: Run the full test suite's affected files to confirm they pass**

Requires `.env.test` credentials (see Global Constraints):
```bash
export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/settings.spec.ts tests/security.spec.ts
```
Expected: all pass, in particular the 3 tests from Step 1 and `security.spec.ts`'s two `logout(page)` call sites (multi-account session-isolation test). **If this session has no `.env.test` credentials, do not skip silently — say so explicitly in the task report, and do Step 8 instead as the best available substitute.**

- [ ] **Step 8: Local structural/visual verification (fallback or supplement to Step 7)**

```bash
cd public && python -m http.server 5502
```
Using Playwright MCP (or any browser), navigate to `http://localhost:5502/index.html` and confirm via `browser_evaluate`:
```js
() => ({
  inSettings: document.querySelectorAll('#sec-settings #privacyLogoutBtn').length,
  inPrivacy: document.querySelectorAll('#sec-privacy #privacyLogoutBtn').length,
  hasHandler: document.querySelector('#sec-privacy #privacyLogoutBtn')?.getAttribute('onclick'),
  classes: document.querySelector('#sec-privacy #privacyLogoutBtn')?.className,
})
```
Expected: `{ inSettings: 0, inPrivacy: 1, hasHandler: "handleLogout()", classes: "privacy-logout-link" }`. Also take a screenshot of the Privacy page (`document.getElementById('sec-privacy').classList.add('active')` won't fully work without the router's other state, so prefer calling `openPrivacySettings()` via `browser_evaluate` if a logged-in session isn't available — otherwise this is a static markup check only, which is sufficient since Task 2 makes no logic change to `handleLogout()` itself). Stop the server after.

- [ ] **Step 9: Update `docs/product/08-settings.md`**

Remove the standalone section (currently lines 41-42):
```markdown
### פעולה: יציאה
- כפתור "יציאה" (`handleLogout`) בתחתית העמוד, בעיצוב מובחן (מסגרת אדומה) כדי לסמן פעולה משמעותית — אך **ללא דיאלוג אישור** (התנתקות מיידית בלחיצה אחת). מפורט מעברי המצב ב-`01-auth-onboarding.md`.
```

Add a new bullet to the end of "קבוצה 5: פרטיות" (currently ending at line 39, right after the "Arm & Confirm" bullet):
```markdown
  - **יציאה (`handleLogout`, הועבר לכאן 2026-09-15):** קישור טקסט שקט (`.privacy-logout-link`, לא כפתור אדום מובלט) בתחתית העמוד, מופרד מרווח בלבד (ללא קו מפריד) משני כפתורי המחיקה שמעליו — במכוון, כדי לא לקבץ אותו חזותית עם פעולות הרסניות: יציאה הפיכה לגמרי (ניתן להתחבר שוב בכל עת), בניגוד למחיקת נתונים/חשבון. **ללא דיאלוג אישור** (התנתקות מיידית בלחיצה אחת), בדיוק כמו קודם. מפורט מעברי המצב ב-`01-auth-onboarding.md`.
```

- [ ] **Step 10: Update `docs/product/01-auth-onboarding.md`**

In "מעברי מצב (State Transitions)", update the existing bullet:
```markdown
- **התנתקות (`handleLogout` → `signOut`):** `onAuthStateChanged` מזהה `null` → איפוס מלא של state בזיכרון (סוג אימון נבחר, מצב טאבים, מסנן היסטוריה, נתוני ריצה) → אם פאנל עריכה היה פתוח, נסגר → הצגת `#auth-screen`.
```
to:
```markdown
- **התנתקות (`handleLogout` → `signOut`):** הכפתור עצמו נמצא בעמוד הגדרות → פרטיות (`#sec-privacy`, ראו `08-settings.md`), כקישור טקסט שקט — לא בעמוד ההגדרות הראשי (הועבר משם 2026-09-15). הלחיצה מפעילה `onAuthStateChanged` שמזהה `null` → איפוס מלא של state בזיכרון (סוג אימון נבחר, מצב טאבים, מסנן היסטוריה, נתוני ריצה) → אם פאנל עריכה היה פתוח, נסגר → הצגת `#auth-screen`.
```

- [ ] **Step 11: Commit**

```bash
git add public/index.html tests/helpers/auth.ts tests/settings.spec.ts docs/product/08-settings.md docs/product/01-auth-onboarding.md
git commit -m "refactor: relocate logout to Privacy page as a de-emphasized link"
```
