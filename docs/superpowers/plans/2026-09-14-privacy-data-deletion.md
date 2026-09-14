# Privacy & Data Deletion Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Privacy" settings page that explains what data the app stores and lets the user either wipe all their data (keeping the account) or permanently delete their account (data + Firebase Auth user).

**Architecture:** A new full-width `#sec-privacy` section (same tier as `#sec-settings`, reached via a new Settings row → `/settings/privacy` route), a shared type-to-confirm modal reused for both destructive actions, and two new async functions (`deleteAllUserData()`, `deleteUserAccountFully()`) that wipe every Firestore collection/doc and uid-scoped `localStorage` key listed in the data model doc, following the codebase's existing `Promise.all(deleteDoc(...))` pattern (no `writeBatch` is used anywhere in this file today — don't introduce it here either).

**Tech Stack:** Vanilla JS (no framework/bundler), Firebase Auth + Firestore modular SDK v12.13.0 (loaded via `<script type="module">` from gstatic CDN), Playwright for e2e tests (runs against the **live production** project — see Global Constraints), `firebase-admin` (already a devDependency) for test-only cleanup.

**Spec:** `docs/superpowers/specs/2026-09-14-privacy-data-deletion-design.md` — read it before starting; this plan implements its decisions verbatim (type-to-confirm modal, catch-and-reauth, no reseed after data deletion, static explanation copy).

## Global Constraints

- Single file `public/index.html` holds all markup/CSS/JS for the live app — every HTML/CSS/JS task below edits this one file at the line ranges given (re-check line numbers before editing if earlier tasks shifted them).
- All user-facing text goes through `t(key)` — every new string needs both a `he` and an `en` entry in `public/translations.js`, added at the **same relative position** in both language blocks (existing convention, see `docs/product/13-performance-and-accessibility.md`'s i18n-as-NFR note).
- No unit-test framework exists in this repo — the only test runner is Playwright e2e (`npm test`), and **every existing spec file runs against the live production Firebase project** (`https://training-diary.web.app`) using long-lived shared accounts (`TEST_EMAIL`/`TEST_PASSWORD` from `.env.test`, never committed). No test added by this plan may call the real delete-data or delete-account path against those shared accounts — see Task 6.
- New window-exposed functions (anything called from an `onclick="..."` attribute) must be added to the `Object.assign(window, {...})` block at `public/index.html:5918-5935` — a missing export throws `ReferenceError` at click time, not at load time, so this is easy to silently get wrong.
- Follow the existing `Promise.all(ids.map(id => deleteDoc(...)))` bulk-delete pattern already used by `_bulkDelete()` (`public/index.html:5899-5911`) — don't add a new deletion primitive.
- Firestore collection/doc names for the wipe come straight from `docs/product/14-data-model-backend.md`'s collection map: config docs `templates`, `measurementTypes`, `profile`, `settings`, `runningTemplates`; entry collections `workouts`, `measurements`, `runWorkouts`, `drafts`.

---

## Task 1: Translations + new icon

**Files:**
- Modify: `public/translations.js:205` (Hebrew block, right after `'settings.language': 'שפה',`)
- Modify: `public/translations.js:516` (English block, right after `'settings.language': 'Language',` — same relative offset as the Hebrew insertion)
- Modify: `public/index.html:923` (after the `icon-ruler` symbol, before `icon-runner`)

**Interfaces:**
- Produces: translation keys `settings.privacy`, `settings.privacy_sub`, `title.privacy`, `privacy.intro`, `privacy.category_account`, `privacy.category_strength`, `privacy.category_cardio`, `privacy.category_measurements`, `privacy.category_drafts`, `privacy.data_btn`, `privacy.data_btn_sub`, `privacy.account_btn`, `privacy.account_btn_sub`, `privacy.confirm_word`, `privacy.confirm_data_title`, `privacy.confirm_data_details`, `privacy.confirm_data_btn`, `privacy.confirm_account_title`, `privacy.confirm_account_details`, `privacy.confirm_account_btn`, `privacy.data_deleted_ok`, `privacy.account_deleted_ok`, `privacy.reauth_title`, `privacy.reauth_details`, `privacy.reauth_password_ph`, `privacy.reauth_confirm_btn`, `privacy.reauth_google_btn`, `err.requires_recent_login` — every later task's HTML/JS calls `t()` with these exact keys.
- Produces: SVG symbol `#icon-shield`, referenced by `<use href="#icon-shield"/>` in Task 2's markup.

- [ ] **Step 1: Add the Hebrew translation block**

Insert immediately after `public/translations.js:205` (`'settings.language': 'שפה',`):

```js
    // ── Settings: Privacy & Data Deletion ───────────────────────────
    'settings.privacy':               'פרטיות ומחיקת נתונים',
    'settings.privacy_sub':           'צפה בנתונים שנשמרים ומחק אותם או את החשבון',
    'title.privacy':                  'פרטיות',
    'privacy.intro':                  'האפליקציה שומרת את הנתונים הבאים תחת החשבון שלך ב-Firebase. הנתונים אינם משותפים עם משתמשים אחרים ואינם נמכרים לצד שלישי.',
    'privacy.category_account':       'פרטי חשבון — כתובת מייל, שם תצוגה',
    'privacy.category_strength':      'אימוני כוח — תוכניות אימון, תרגילים, והיסטוריית כל אימון שנשמר',
    'privacy.category_cardio':        'אימוני אירובי — תוכניות אימון ושדות, והיסטוריית כל אימון שנשמר',
    'privacy.category_measurements':  'מדידות גוף — סוגי מדידה והיסטוריית כל מדידה שנשמרה',
    'privacy.category_drafts':        'טיוטות שמורות — אימונים שהתחלת להקליד ועדיין לא שמרת',
    'privacy.data_btn':               'מחיקת נתונים',
    'privacy.data_btn_sub':           'מוחק את כל האימונים, המדידות, התוכניות והטיוטות שלך לצמיתות. החשבון עצמו נשאר קיים ותוכל להתחיל להזין נתונים מחדש.',
    'privacy.account_btn':            'מחיקה מלאה של הפרופיל',
    'privacy.account_btn_sub':        'מוחק את כל הנתונים שלך וגם את החשבון עצמו לצמיתות. לא תוכל להתחבר שוב עם המייל הזה בלי להירשם מחדש מאפס.',
    'privacy.confirm_word':           'מחק',
    'privacy.confirm_data_title':     'מחיקת כל הנתונים?',
    'privacy.confirm_data_details':   'פעולה זו תמחק לצמיתות את כל האימונים, המדידות, התוכניות והטיוטות שלך. אי אפשר לבטל. הקלד/י "מחק" כדי לאשר.',
    'privacy.confirm_data_btn':       'מחק את כל הנתונים',
    'privacy.confirm_account_title':  'מחיקת החשבון לצמיתות?',
    'privacy.confirm_account_details':'פעולה זו תמחק לצמיתות את כל הנתונים שלך ואת החשבון עצמו. לא תוכל/י להתחבר שוב עם המייל הזה. אי אפשר לבטל. הקלד/י "מחק" כדי לאשר.',
    'privacy.confirm_account_btn':    'מחק את החשבון לצמיתות',
    'privacy.data_deleted_ok':        'כל הנתונים נמחקו',
    'privacy.account_deleted_ok':     'החשבון נמחק לצמיתות',
    'privacy.reauth_title':           'נדרש אימות מחדש',
    'privacy.reauth_details':         'מטעמי אבטחה, מחיקת חשבון דורשת התחברות טרייה. אמת/י את הזהות שלך כדי להמשיך.',
    'privacy.reauth_password_ph':     'הזן סיסמה נוכחית',
    'privacy.reauth_confirm_btn':     'אמת ומחק חשבון',
    'privacy.reauth_google_btn':      'התחבר עם Google שוב',
    'err.requires_recent_login':      'נדרש אימות מחדש לפני מחיקת החשבון',
```

- [ ] **Step 2: Add the matching English translation block**

Insert immediately after `public/translations.js:516` (`'settings.language': 'Language',`) — count forward the same number of lines this file's `en` block already sits behind `he` for every other key pair (e.g. `settings.language` is `he:205`/`en:516`, an offset of 311 lines; verify against the actual file before inserting rather than trusting this number, since earlier edits in this plan shift it):

```js
    // ── Settings: Privacy & Data Deletion ───────────────────────────
    'settings.privacy':               'Privacy & Data Deletion',
    'settings.privacy_sub':           'View what data is stored and delete it or your account',
    'title.privacy':                  'Privacy',
    'privacy.intro':                  'The app stores the following data under your Firebase account. This data is not shared with other users and is not sold to third parties.',
    'privacy.category_account':       'Account details — email address, display name',
    'privacy.category_strength':      'Strength workouts — workout plans, exercises, and the history of every saved workout',
    'privacy.category_cardio':        'Cardio workouts — workout plans and fields, and the history of every saved workout',
    'privacy.category_measurements':  'Body measurements — measurement types and the history of every saved measurement',
    'privacy.category_drafts':        'Saved drafts — workouts you started entering but have not saved yet',
    'privacy.data_btn':               'Delete Data',
    'privacy.data_btn_sub':           'Permanently deletes all your workouts, measurements, plans, and drafts. Your account itself stays active and you can start entering data again.',
    'privacy.account_btn':            'Delete Account Permanently',
    'privacy.account_btn_sub':        'Permanently deletes all your data and the account itself. You will not be able to sign in with this email again without registering from scratch.',
    'privacy.confirm_word':           'DELETE',
    'privacy.confirm_data_title':     'Delete all data?',
    'privacy.confirm_data_details':   'This permanently deletes all your workouts, measurements, plans, and drafts. This cannot be undone. Type "DELETE" to confirm.',
    'privacy.confirm_data_btn':       'Delete all data',
    'privacy.confirm_account_title':  'Delete account permanently?',
    'privacy.confirm_account_details':'This permanently deletes all your data and the account itself. You will not be able to sign in with this email again. This cannot be undone. Type "DELETE" to confirm.',
    'privacy.confirm_account_btn':    'Delete account permanently',
    'privacy.data_deleted_ok':        'All data deleted',
    'privacy.account_deleted_ok':     'Account permanently deleted',
    'privacy.reauth_title':           'Re-authentication required',
    'privacy.reauth_details':         'For security, deleting your account requires a fresh sign-in. Verify your identity to continue.',
    'privacy.reauth_password_ph':     'Enter current password',
    'privacy.reauth_confirm_btn':     'Verify & delete account',
    'privacy.reauth_google_btn':      'Sign in with Google again',
    'err.requires_recent_login':      'Re-authentication required before deleting the account',
```

- [ ] **Step 3: Add the `icon-shield` SVG symbol**

Insert immediately after `public/index.html:923` (the closing `</symbol>` of `icon-ruler`), matching the existing stroke-icon style used by `icon-ruler`/`icon-runner`:

```html
  <symbol id="icon-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/>
    <path d="M9.5 12l1.8 1.8L14.8 10"/>
  </symbol>
```

- [ ] **Step 4: Manual check**

Open `public/index.html` directly in a browser (or via `firebase serve`/any static server) and confirm no console error about a duplicate `<symbol id>` or malformed SVG path — this step has no automated test since nothing references these keys/icon yet.

- [ ] **Step 5: Commit**

```bash
git add public/translations.js public/index.html
git commit -m "feat: add translations and icon for privacy/data-deletion page"
```

---

## Task 2: `#sec-privacy` page markup, routing, and Settings entry point

**Files:**
- Modify: `public/index.html:1411-1425` (insert new Settings group between the "Timer" group and the sign-out button)
- Modify: `public/index.html:1428` (insert the new `#sec-privacy` section immediately after `</div>` that closes `#sec-settings`, before `<div id="toast">`)
- Modify: `public/index.html:2938` (`SECTION_ORDER`)
- Modify: `public/index.html:2944-2954` (`ROUTES`)
- Modify: `public/index.html:5918-5935` (window exports)

**Interfaces:**
- Consumes: `t(key)`, `navigateTo(path)`, `showSection(name)`, `escHtml()` — all already defined earlier in the file.
- Produces: `openPrivacySettings()` (global), route `/settings/privacy`, section name `'privacy'` — Task 3 and Task 4/5 attach behavior to elements defined here (`#privacyDataBtn`, `#privacyAccountBtn`).

- [ ] **Step 1: Add the Settings entry point**

Insert immediately after `public/index.html:1423` (closing `</div>` of the "Timer" `.settings-card`) and before line 1425 (`<button class="settings-logout-btn"...>`):

```html
    <div class="settings-group-label" style="margin-top:8px;" data-i18n="settings.section.privacy">פרטיות</div>
    <button class="settings-item" onclick="openPrivacySettings()">
      <span class="settings-item-icon"><svg class="icon" style="width:28px;height:28px" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-shield"/></svg></span>
      <div class="settings-item-text">
        <div class="settings-item-title" data-i18n="settings.privacy">פרטיות ומחיקת נתונים</div>
        <div class="settings-item-sub" data-i18n="settings.privacy_sub">צפה בנתונים שנשמרים ומחק אותם או את החשבון</div>
      </div>
      <span class="settings-item-arrow">›</span>
    </button>
```

Also add `'settings.section.privacy': 'פרטיות'` (he) / `'Privacy'` (en) to `public/translations.js` next to the other `settings.section.*` keys (`public/translations.js:187-190` he, `public/translations.js:498-501` en) — this was missed in Task 1 because it's a section label, not a `privacy.*`-prefixed key; add it now alongside its siblings.

- [ ] **Step 2: Add the `#sec-privacy` section**

Insert immediately after `public/index.html:1428` (the `</div>` that closes `#sec-settings`) and before `<div id="toast"></div>`:

```html
<div id="sec-privacy" class="section">
  <div class="topbar">
    <div><div class="topbar-title" data-i18n="title.privacy">פרטיות</div></div>
    <button class="topbar-back-btn" onclick="goBack()" data-i18n="btn.back">← חזרה</button>
  </div>
  <div style="padding:16px; display:flex; flex-direction:column; gap:16px;">
    <p style="font-size:13px; color:var(--sub); line-height:1.6; margin:0;" data-i18n="privacy.intro">
      האפליקציה שומרת את הנתונים הבאים תחת החשבון שלך ב-Firebase. הנתונים אינם משותפים עם משתמשים אחרים ואינם נמכרים לצד שלישי.
    </p>
    <ul style="margin:0; padding-inline-start:20px; font-size:13px; color:var(--text); line-height:1.9;">
      <li data-i18n="privacy.category_account">פרטי חשבון — כתובת מייל, שם תצוגה</li>
      <li data-i18n="privacy.category_strength">אימוני כוח — תוכניות אימון, תרגילים, והיסטוריית כל אימון שנשמר</li>
      <li data-i18n="privacy.category_cardio">אימוני אירובי — תוכניות אימון ושדות, והיסטוריית כל אימון שנשמר</li>
      <li data-i18n="privacy.category_measurements">מדידות גוף — סוגי מדידה והיסטוריית כל מדידה שנשמרה</li>
      <li data-i18n="privacy.category_drafts">טיוטות שמורות — אימונים שהתחלת להקליד ועדיין לא שמרת</li>
    </ul>

    <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:16px; display:flex; flex-direction:column; gap:12px;">
      <button id="privacyDataBtn" class="settings-logout-btn" style="margin:0; width:100%;" onclick="_openPrivacyConfirm('data')" data-i18n="privacy.data_btn">מחיקת נתונים</button>
      <p style="font-size:12px; color:var(--sub); line-height:1.5; margin:0;" data-i18n="privacy.data_btn_sub">מוחק את כל האימונים, המדידות, התוכניות והטיוטות שלך לצמיתות. החשבון עצמו נשאר קיים ותוכל להתחיל להזין נתונים מחדש.</p>

      <button id="privacyAccountBtn" class="settings-logout-btn" style="margin:0; width:100%;" onclick="_openPrivacyConfirm('account')" data-i18n="privacy.account_btn">מחיקה מלאה של הפרופיל</button>
      <p style="font-size:12px; color:var(--sub); line-height:1.5; margin:0;" data-i18n="privacy.account_btn_sub">מוחק את כל הנתונים שלך וגם את החשבון עצמו לצמיתות. לא תוכל להתחבר שוב עם המייל הזה בלי להירשם מחדש מאפס.</p>
    </div>
  </div>
</div>
```

`.settings-logout-btn` already renders as a full-width-capable red-outline button (`border: 1.5px solid var(--red); color: var(--red)`, `public/index.html:134-141`) — reused as-is via inline `width:100%` rather than adding a new CSS class, since the existing rule already has everything these two buttons need.

- [ ] **Step 3: Wire the route and section order**

In `public/index.html:2938`, change:

```js
const SECTION_ORDER = { main: 0, timer: 1, running: 2, measurements: 2, history: 3, settings: 4 };
```

to:

```js
const SECTION_ORDER = { main: 0, timer: 1, running: 2, measurements: 2, history: 3, settings: 4, privacy: 5 };
```

In `public/index.html:2944-2954`, add one line inside the `ROUTES` object (order doesn't matter, but keep it grouped with the other `/settings/*` entries):

```js
  '/settings/privacy':           { section: 'privacy' },
```

- [ ] **Step 4: Add `openPrivacySettings()`**

Add near the other `open*Edit()` navigation one-liners, e.g. directly after `function openMeasurementsEdit()  { navigateTo('/settings/measurement-types'); }` at `public/index.html:5490`:

```js
function openPrivacySettings() { navigateTo('/settings/privacy'); }
```

- [ ] **Step 5: Export the new function**

In the `Object.assign(window, {...})` block at `public/index.html:5925-5926`, add `openPrivacySettings` next to the other `open*`/navigation exports:

```js
  navigateTo, goBack, setTheme, setLang, renderLangSelector, saveDisplayName,
  toggleEditPanel, openWorkoutEdit, closeWorkoutEdit, openMeasurementsEdit, closeMeasurementsEdit, openPrivacySettings,
```

- [ ] **Step 6: Write the Playwright test for reachability**

Add to `tests/settings.spec.ts`, inside the existing `test.describe('Settings Section', ...)` block (after the `TC-FUNC-036` test at line 188, so it sits with the other plan-editor navigation tests):

```ts
  test('privacy page is reachable from Settings and lists data categories', async ({ page }) => {
    const privacyBtn = page.locator('.settings-item', { hasText: 'פרטיות ומחיקת נתונים' });
    await privacyBtn.click();

    await expect(page).toHaveURL(/\/settings\/privacy$/);
    await expect(page.locator('#sec-privacy')).toHaveClass(/active/);
    await expect(page.locator('#sec-privacy')).toContainText('פרטי חשבון');
    await expect(page.locator('#privacyDataBtn')).toBeVisible();
    await expect(page.locator('#privacyAccountBtn')).toBeVisible();

    await page.goBack();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });
```

- [ ] **Step 7: Run the test**

```bash
TEST_EMAIL=<real> TEST_PASSWORD=<real> npx playwright test tests/settings.spec.ts -g "privacy page is reachable"
```

Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add public/index.html public/translations.js tests/settings.spec.ts
git commit -m "feat: add Privacy settings page (data explanation, no delete actions wired yet)"
```

---

## Task 3: Shared type-to-confirm modal (UI only, no deletion logic)

**Files:**
- Modify: `public/index.html:289` (CSS — insert new danger-button rule after the `.draft-modal-btn-discard` block)
- Modify: `public/index.html:1051` (HTML — insert new modal markup immediately after `#draftModal`'s closing `</div>`)
- Modify: `public/index.html:4708-4724` (JS — insert new modal-control functions near `armDelete()`, the file's other delete-confirmation primitive)
- Modify: `public/index.html:5918-5935` (window exports)

**Interfaces:**
- Consumes: `t(key)` for `privacy.confirm_word`, `privacy.confirm_{data,account}_{title,details,btn}`.
- Produces: `_openPrivacyConfirm(kind)` where `kind` is `'data'` or `'account'` (called by Task 2's two buttons), `_closePrivacyConfirm()`, `_privacyConfirmInputChanged()`. Also produces a global `_privacyConfirmKind` variable and calls `_privacyConfirmProceed()` on confirm — Task 4/5 implement what `_privacyConfirmProceed()` actually does; this task stubs it to just log the kind so the modal is independently testable first.

- [ ] **Step 1: Add the danger-button CSS**

Insert immediately after `public/index.html:289` (the closing `}` of `.draft-modal-btn-discard`):

```css
    .privacy-confirm-btn {
      width: 100%; padding: 13px; border: none; border-radius: var(--radius);
      background: var(--red); color: white; font-size: 15px; font-weight: 700; cursor: pointer;
    }
    .privacy-confirm-btn:disabled { opacity: .4; cursor: not-allowed; }
    .privacy-confirm-input {
      width: 100%; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: 10px;
      font-size: 14px; background: var(--bg); color: var(--text); outline: none; box-sizing: border-box;
    }
    .privacy-confirm-input:focus { border-color: var(--red); }
```

- [ ] **Step 2: Add the modal markup**

Insert immediately after `public/index.html:1051` (the `</div>` closing `#draftModal`'s `.draft-modal-card`, i.e. right before the comment `<!-- ... rationale as #draftModal above ...` at line 1056 — insert as its own block, not inside `#draftModal`):

```html
<div id="privacyConfirmModal" class="draft-modal-overlay" style="display:none;" aria-modal="true" role="dialog" aria-labelledby="privacyConfirmTitle">
  <div class="draft-modal-card">
    <div id="privacyConfirmTitle" class="draft-modal-title"></div>
    <div id="privacyConfirmDetails" class="draft-modal-details"></div>
    <input type="text" id="privacyConfirmInput" class="privacy-confirm-input" autocomplete="off" oninput="_privacyConfirmInputChanged()">
    <button id="privacyConfirmBtn" class="privacy-confirm-btn" disabled onclick="_privacyConfirmProceed()"></button>
    <button class="draft-modal-btn-discard" onclick="_closePrivacyConfirm()" data-i18n="btn.cancel">ביטול</button>
  </div>
</div>
```

This modal is deliberately **not** wired into `handleHardwareBack()` (`public/index.html:5956-5967`) the way `#draftModal` is — `#draftModal` blocks hardware-back to prevent silent data loss, but this modal is a plain confirmation the user is free to back out of, so Android's physical back button should just close it like any other `history.back()` would. No change needed there; this is a deliberate omission, not a gap.

- [ ] **Step 3: Add the modal-control functions**

Insert immediately after `public/index.html:4724` (closing `}` of `armDelete()`), before the `// ─── EDIT TEMPLATES ───` comment:

```js
// ─── PRIVACY CONFIRM MODAL ─────────────────────────────────────
// Shared by both destructive actions on the Privacy page (Task 2's
// #privacyDataBtn/#privacyAccountBtn). Unlike armDelete()'s tap-twice
// pattern used for single history/measurement rows, these two actions
// are far more destructive (all data / the whole account) — see the
// design spec's "Confirmation UX" section for why a typed-word modal
// was chosen instead.
let _privacyConfirmKind = null; // 'data' | 'account' | null

function _openPrivacyConfirm(kind) {
  _privacyConfirmKind = kind;
  const isData = kind === 'data';
  document.getElementById('privacyConfirmTitle').textContent   = t(isData ? 'privacy.confirm_data_title'   : 'privacy.confirm_account_title');
  document.getElementById('privacyConfirmDetails').textContent = t(isData ? 'privacy.confirm_data_details' : 'privacy.confirm_account_details');
  const input = document.getElementById('privacyConfirmInput');
  input.value = '';
  input.placeholder = t('privacy.confirm_word');
  const btn = document.getElementById('privacyConfirmBtn');
  btn.textContent = t(isData ? 'privacy.confirm_data_btn' : 'privacy.confirm_account_btn');
  btn.disabled = true;
  document.getElementById('privacyConfirmModal').style.display = 'flex';
}

function _closePrivacyConfirm() {
  document.getElementById('privacyConfirmModal').style.display = 'none';
  _privacyConfirmKind = null;
}

function _privacyConfirmInputChanged() {
  const typed = document.getElementById('privacyConfirmInput').value.trim();
  document.getElementById('privacyConfirmBtn').disabled = typed !== t('privacy.confirm_word');
}

// Task 4/5 replace this body with the real deleteAllUserData()/
// deleteUserAccountFully() dispatch — stubbed here so the modal's
// open/type/enable/cancel behavior is independently testable first.
async function _privacyConfirmProceed() {
  const kind = _privacyConfirmKind;
  _closePrivacyConfirm();
  console.log('[privacy] confirmed:', kind);
}
```

- [ ] **Step 4: Export the new functions**

In the `Object.assign(window, {...})` block, add a new line near the other modal-control exports (next to `_draftModalResume, _draftModalDiscard,` at `public/index.html:5923`):

```js
  _draftModalResume, _draftModalDiscard,
  _openPrivacyConfirm, _closePrivacyConfirm, _privacyConfirmInputChanged, _privacyConfirmProceed,
```

- [ ] **Step 5: Write the Playwright test for modal behavior**

Add to `tests/settings.spec.ts`, directly after the test added in Task 2 Step 6:

```ts
  test('privacy confirm modal requires typing the exact confirm word before enabling', async ({ page }) => {
    await page.locator('.settings-item', { hasText: 'פרטיות ומחיקת נתונים' }).click();
    await expect(page.locator('#sec-privacy')).toHaveClass(/active/);

    await page.locator('#privacyDataBtn').click();
    const modal = page.locator('#privacyConfirmModal');
    await expect(modal).toBeVisible();
    const confirmBtn = page.locator('#privacyConfirmBtn');
    await expect(confirmBtn).toBeDisabled();

    const input = page.locator('#privacyConfirmInput');
    await input.fill('wrong');
    await expect(confirmBtn).toBeDisabled();

    await input.fill('מחק');
    await expect(confirmBtn).toBeEnabled();

    // Cancel instead of confirming — must not fire any deletion.
    await page.locator('.draft-modal-btn-discard').click();
    await expect(modal).toBeHidden();

    // The account/page must be completely unaffected by opening+cancelling.
    await expect(page.locator('#sec-privacy')).toHaveClass(/active/);
    await expect(page.locator('#privacyDataBtn')).toBeVisible();
  });

  test('privacy confirm modal shows distinct copy for the account-deletion action', async ({ page }) => {
    await page.locator('.settings-item', { hasText: 'פרטיות ומחיקת נתונים' }).click();
    await page.locator('#privacyAccountBtn').click();

    await expect(page.locator('#privacyConfirmModal')).toBeVisible();
    const title = await page.locator('#privacyConfirmTitle').textContent();
    expect(title).toContain('חשבון');

    await page.locator('.draft-modal-btn-discard').click();
  });
```

- [ ] **Step 6: Run the tests**

```bash
TEST_EMAIL=<real> TEST_PASSWORD=<real> npx playwright test tests/settings.spec.ts -g "privacy confirm modal"
```

Expected: PASS (2 tests). Since Step 3's `_privacyConfirmProceed()` is still a stub, no real account is ever touched by these two tests even if "cancel" were accidentally left out of one of them.

- [ ] **Step 7: Commit**

```bash
git add public/index.html tests/settings.spec.ts
git commit -m "feat: add shared type-to-confirm modal for privacy page (stubbed, no deletion yet)"
```

---

## Task 4: "Delete Data" — wipe Firestore + localStorage, keep the account

**Files:**
- Modify: `public/index.html:4643-4724` (JS — insert the wipe helpers near `_bulkDelete()`/`armDelete()`, this file's existing deletion primitives)
- Modify: `public/index.html:5918-5935` (window exports; also replace the Task 3 stub body of `_privacyConfirmProceed()`)

**Interfaces:**
- Consumes: `db`, `doc`, `deleteDoc`, `collection`, `getDocs` (already imported at `public/index.html:1458-1461`), `currentUser`, `reloadAppData()`, `navigateTo()`, `toast()`, `firestoreErrMsg()`.
- Produces: `deleteAllUserData()` (global), called from the real (non-stub) `_privacyConfirmProceed()` when `_privacyConfirmKind === 'data'`.

- [ ] **Step 1: Add the wipe helpers**

Insert immediately after `public/index.html:4724` (same insertion point as Task 3 Step 3 — place this block directly above the `_privacyConfirmProceed()` stub Task 3 just added, so both live under the same `// ─── PRIVACY ...` comment):

```js
// ─── PRIVACY: DATA WIPE ─────────────────────────────────────────
// Every Firestore path a user's account can have data under, per
// docs/product/14-data-model-backend.md's collection map. Both
// deleteAllUserData() and deleteUserAccountFully() (Task 5) call
// _wipeUserFirestoreData() — full-account deletion is "wipe data,
// then also delete the Auth user."
const PRIVACY_CONFIG_DOCS        = ['templates', 'measurementTypes', 'profile', 'settings', 'runningTemplates'];
const PRIVACY_ENTRY_COLLECTIONS  = ['workouts', 'measurements', 'runWorkouts', 'drafts'];

async function _wipeUserFirestoreData(uid) {
  for (const collName of PRIVACY_ENTRY_COLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, collName));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  }
  await Promise.all(PRIVACY_CONFIG_DOCS.map(name => deleteDoc(doc(db, 'users', uid, 'config', name))));
}

// Every localStorage key this app writes is either a bare device-only
// setting (theme/lang/timer sound — not uid-scoped, left alone) or
// contains the uid as a substring (displayName_<uid>, templates_<uid>,
// lastWorkout_<uid>_<type>, running_enabled_<uid>, runningTemplates_<uid>,
// draft_<uid>_<domain>_<type> — see docs/superpowers/specs/
// 2026-09-14-privacy-data-deletion-design.md's "Data footprint" section
// for the full enumeration this substring match is standing in for).
function _clearUserLocalStorage(uid) {
  Object.keys(localStorage)
    .filter(k => k.includes(uid))
    .forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
}

async function deleteAllUserData() {
  const uid = currentUser?.uid;
  if (!uid) return;
  try {
    await _wipeUserFirestoreData(uid);
    _clearUserLocalStorage(uid);
    toast(t('privacy.data_deleted_ok'), 'success');
    await reloadAppData();
    navigateTo('/', { replace: true, isRoot: true });
  } catch (err) {
    toast(t('error.save') + firestoreErrMsg(err), 'error');
  }
}
```

- [ ] **Step 2: Replace the `_privacyConfirmProceed()` stub**

Change the Task 3 stub:

```js
async function _privacyConfirmProceed() {
  const kind = _privacyConfirmKind;
  _closePrivacyConfirm();
  console.log('[privacy] confirmed:', kind);
}
```

to:

```js
async function _privacyConfirmProceed() {
  const kind = _privacyConfirmKind;
  _closePrivacyConfirm();
  if (kind === 'data') await deleteAllUserData();
  // kind === 'account' is wired in Task 5.
}
```

- [ ] **Step 3: Export `deleteAllUserData`**

Add to the `Object.assign(window, {...})` block, next to `bulkDeleteSessions`/`bulkDeleteMeasures` at `public/index.html:5929`:

```js
  toggleSessionSelect, bulkDeleteSessions, toggleMeasureSelect, bulkDeleteMeasures, deleteAllUserData,
```

- [ ] **Step 4: Manual check before writing the automated round-trip test**

Run the app locally against a **disposable** account you register just for this check (never `TEST_EMAIL`): add one workout, open Privacy, run "Delete Data" with the correct confirm word, and verify in the Firebase console that `users/{uid}/workouts`, `config/templates`, etc. are gone, the app lands back on the Main page, shows no console error, and the account is still logged in (can still open Settings). This confirms the "leave empty, no crash" assumption from the design spec before Task 6 automates it.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: wire Delete Data button to wipe Firestore + localStorage, keep account"
```

---

## Task 5: "Delete Account Permanently" — wipe + `deleteUser()` + catch-and-reauth

**Files:**
- Modify: `public/index.html:1454-1457` (Firebase Auth SDK imports)
- Modify: `public/index.html:1051` (HTML — reauth modal markup, alongside `#privacyConfirmModal`)
- Modify: `public/index.html:4724` area (JS — `deleteUserAccountFully()` + reauth flow)
- Modify: `public/index.html:5918-5935` (window exports)

**Interfaces:**
- Consumes: `currentUser`, `auth`, `_wipeUserFirestoreData()`/`_clearUserLocalStorage()` (Task 4), `setAuthMsg()` (`public/index.html:2473-2477`), `t()`.
- Produces: `deleteUserAccountFully()` (global), called from `_privacyConfirmProceed()` when `_privacyConfirmKind === 'account'`. Also produces `_privacyReauthWithPassword()`, `_privacyReauthWithGoogle()`, `_closePrivacyReauth()`.

- [ ] **Step 1: Add the new Auth SDK imports**

Change `public/index.html:1454-1457` from:

```js
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, GoogleAuthProvider,
         signInWithPopup, signInWithCredential,
         signOut, sendPasswordResetEmail }                        from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
```

to:

```js
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, GoogleAuthProvider,
         signInWithPopup, signInWithCredential,
         signOut, sendPasswordResetEmail,
         deleteUser, reauthenticateWithCredential, reauthenticateWithPopup,
         EmailAuthProvider }                                              from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
```

**Correction (post-review, ruling recorded in the SDD ledger):** the original version of this step's `_privacyReauthWithGoogle()` used `signInWithPopup` + manually-extracted credential for the web branch. Task review caught a Critical bug in that shape: `signInWithPopup` is a sign-IN, not a reauth — if the browser's Google account chooser returns a different account than the one being deleted, `onAuthStateChanged` reassigns `currentUser` to the new account before `reauthenticateWithCredential` runs, silently defeating Firebase's own `auth/user-mismatch` guard and permanently deleting the wrong account. The code below has already been corrected to use `reauthenticateWithPopup(currentUser, provider)` instead, which never reassigns the signed-in user and enforces the account match at the SDK level. `reauthenticateWithPopup` is added to the import above for this reason.

- [ ] **Step 2: Add the reauth modal markup**

Insert immediately after Task 3's `#privacyConfirmModal` closing `</div>`:

```html
<div id="privacyReauthModal" class="draft-modal-overlay" style="display:none;" aria-modal="true" role="dialog" aria-labelledby="privacyReauthTitle">
  <div class="draft-modal-card">
    <div id="privacyReauthTitle" class="draft-modal-title" data-i18n="privacy.reauth_title">נדרש אימות מחדש</div>
    <div class="draft-modal-details" data-i18n="privacy.reauth_details">מטעמי אבטחה, מחיקת חשבון דורשת התחברות טרייה. אמת/י את הזהות שלך כדי להמשיך.</div>
    <input type="password" id="privacyReauthPassword" class="privacy-confirm-input" autocomplete="current-password" data-i18n-ph="privacy.reauth_password_ph" placeholder="הזן סיסמה נוכחית">
    <button id="privacyReauthPasswordBtn" class="privacy-confirm-btn" onclick="_privacyReauthWithPassword()" data-i18n="privacy.reauth_confirm_btn">אמת ומחק חשבון</button>
    <button id="privacyReauthGoogleBtn" class="draft-modal-btn-resume" onclick="_privacyReauthWithGoogle()" data-i18n="privacy.reauth_google_btn" style="display:none;">התחבר עם Google שוב</button>
    <button class="draft-modal-btn-discard" onclick="_closePrivacyReauth()" data-i18n="btn.cancel">ביטול</button>
  </div>
</div>
```

Password and Google sign-in are mutually exclusive per Firebase user (`currentUser.providerData[0].providerId` is either `'password'` or `'google.com'` — this app only offers those two, per `docs/product/01-auth-onboarding.md`), so the JS in Step 3 toggles which of `#privacyReauthPasswordBtn`+`#privacyReauthPassword` vs `#privacyReauthGoogleBtn` is visible; both start present in the DOM to keep the markup static.

- [ ] **Step 3: Add `deleteUserAccountFully()` and the reauth flow**

Insert directly after `deleteAllUserData()` (Task 4 Step 1):

```js
// ─── PRIVACY: FULL ACCOUNT DELETION ─────────────────────────────
async function deleteUserAccountFully() {
  const uid = currentUser?.uid;
  if (!uid) return;
  try {
    await _wipeUserFirestoreData(uid);
    _clearUserLocalStorage(uid);
    await deleteUser(currentUser);
    // onAuthStateChanged(auth, ...) (public/index.html:2269) fires with
    // user=null right after this resolves, which already hides all
    // content and shows #auth-screen — no navigation call needed here.
    // setAuthMsg() writes into #auth-msg, which that null-user branch
    // never touches, so this message survives the transition and is
    // visible the moment the auth screen appears.
    setAuthMsg(t('privacy.account_deleted_ok'), true);
  } catch (err) {
    if (err.code === 'auth/requires-recent-login') {
      _openPrivacyReauth();
    } else {
      toast(t('error.save') + firestoreErrMsg(err), 'error');
    }
  }
}

function _openPrivacyReauth() {
  const isGoogle = currentUser?.providerData?.[0]?.providerId === 'google.com';
  document.getElementById('privacyReauthPassword').style.display    = isGoogle ? 'none' : 'block';
  document.getElementById('privacyReauthPasswordBtn').style.display = isGoogle ? 'none' : 'block';
  document.getElementById('privacyReauthGoogleBtn').style.display   = isGoogle ? 'block' : 'none';
  document.getElementById('privacyReauthPassword').value = '';
  document.getElementById('privacyReauthModal').style.display = 'flex';
}

function _closePrivacyReauth() {
  document.getElementById('privacyReauthModal').style.display = 'none';
}

// Retries the exact same delete after a successful reauth — deleteUser()
// only fails with auth/requires-recent-login on a stale session; once
// reauthenticateWithCredential() succeeds, the SDK's session is fresh
// again and the original call succeeds.
async function _privacyReauthWithPassword() {
  const password = document.getElementById('privacyReauthPassword').value;
  if (!password) return;
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    _closePrivacyReauth();
    await deleteUserAccountFully();
  } catch (err) {
    toast(firebaseErrMsg(err?.code), 'error');
  }
}

// Native branch still needs the manual signInWithGoogle()+credential dance
// (Google blocks OAuth inside a WebView, so the native Custom-Tab flow
// handleGoogleLogin() already uses, public/index.html:2385-2393, only
// signs in at the native layer — reauthenticateWithPopup has no native
// equivalent). The web branch uses reauthenticateWithPopup instead of
// signInWithPopup + a manually-extracted credential — see this step's
// "Correction" note above for why: signInWithPopup reassigns currentUser
// to whatever account the chooser returns, defeating the SDK's own
// auth/user-mismatch check; reauthenticateWithPopup never does that.
async function _privacyReauthWithGoogle() {
  try {
    if (window.Capacitor?.isNativePlatform()) {
      const { FirebaseAuthentication } = window.Capacitor.Plugins;
      const result     = await FirebaseAuthentication.signInWithGoogle();
      const credential = GoogleAuthProvider.credential(result.credential?.idToken);
      await reauthenticateWithCredential(currentUser, credential);
    } else {
      const provider = new GoogleAuthProvider();
      await reauthenticateWithPopup(currentUser, provider);
    }
    _closePrivacyReauth();
    await deleteUserAccountFully();
  } catch (err) {
    // auth/user-mismatch fires if the popup/native flow authenticated a
    // DIFFERENT Google account than the one being deleted — firebaseErrMsg()
    // needs a mapped entry for it (t('err.user_mismatch'), new translation
    // key) so this shows a specific, correctly-localized message instead of
    // the generic Google-failure string, which would tell the user to
    // "try again" without explaining they picked the wrong account.
    if (err?.code === 'auth/user-mismatch') {
      toast(firebaseErrMsg(err.code), 'error');
    } else {
      toast(t('err.google_signin_failed'), 'error');
    }
  }
}
```

**Also from task review (Important, both addressed in the same fix round as the Critical above):**
- By the time `_openPrivacyReauth()` opens (the `requires-recent-login` catch branch), `_wipeUserFirestoreData`/`_clearUserLocalStorage` have already run — correct order (reversing it would risk orphaned Firestore data with no Auth user left to own it), but it means a cancelled/abandoned reauth leaves the user signed in with an intact account and all data already, permanently gone, with no explanation. Minimal fix (no reorder): `_closePrivacyReauth()` shows `toast(t('privacy.data_deleted_ok'), 'success')` when closing a reauth flow that was opened mid-deletion (i.e., don't toast on a reauth modal the user never actually triggered a delete through) — reuses the existing Task 1 translation key, no new i18n entry needed.
- `firebaseErrMsg()` (existing function, `public/index.html`, not otherwise touched by this task) needs one new mapped entry for `auth/user-mismatch` — add the translation key `err.user_mismatch` (he/en) and its mapping, analogous to the existing `auth/wrong-password`/`auth/invalid-credential` entries already in that function.

- [ ] **Step 4: Wire `_privacyConfirmProceed()`'s account branch**

Change the Task 4 Step 2 version:

```js
async function _privacyConfirmProceed() {
  const kind = _privacyConfirmKind;
  _closePrivacyConfirm();
  if (kind === 'data') await deleteAllUserData();
  // kind === 'account' is wired in Task 5.
}
```

to:

```js
async function _privacyConfirmProceed() {
  const kind = _privacyConfirmKind;
  _closePrivacyConfirm();
  if (kind === 'data') await deleteAllUserData();
  else if (kind === 'account') await deleteUserAccountFully();
}
```

- [ ] **Step 5: Export the new functions**

Add to the `Object.assign(window, {...})` block, next to `deleteAllUserData` (Task 4 Step 3):

```js
  toggleSessionSelect, bulkDeleteSessions, toggleMeasureSelect, bulkDeleteMeasures, deleteAllUserData,
  deleteUserAccountFully, _openPrivacyReauth, _closePrivacyReauth, _privacyReauthWithPassword, _privacyReauthWithGoogle,
```

- [ ] **Step 6: Manual check**

Using the **same disposable account** from Task 4 Step 4 (already wiped of data, still logged in), open Privacy again and run "Delete Account Permanently" with the correct confirm word. Verify: the app redirects to the auth screen, `#auth-msg` shows the green "account deleted" message, and attempting to log back in with that email/password fails with a "user not found"-style error. Then verify in the Firebase console that the Auth user itself is gone (Authentication tab), not just its Firestore data.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: wire Delete Account Permanently button, with catch-and-reauth on stale sessions"
```

---

## Task 6: Automated destructive round-trip test (disposable account only)

**Files:**
- Create: `scripts/force-delete-test-user.js`
- Modify: `tests/settings.spec.ts` (add the round-trip test)

**Interfaces:**
- Consumes: `firebase-admin` (already a devDependency, per `package.json:21`), the real on-disk `service-account-key.json.json` (confirmed present and gitignored — see `docs/product/12-security-and-privacy.md`'s "ממצא לתשומת לב" note; **do not** copy `scripts/read-workouts.js:11`'s path verbatim, it points at the wrong filename `service-account-key.json` — one `.json` short of the real file).
- Produces: a Node CLI helper `node scripts/force-delete-test-user.js <email>` used as the test's cleanup safety net, and a new Playwright test that is the only place in this repo allowed to call `deleteAllUserData()`/`deleteUserAccountFully()` for real.

- [ ] **Step 1: Write the admin cleanup helper**

```js
// scripts/force-delete-test-user.js
//
// Test-only safety net for tests/settings.spec.ts's destructive
// round-trip test (Task 6 of docs/superpowers/plans/
// 2026-09-14-privacy-data-deletion.md). That test registers a brand-new
// disposable account and deletes it through the real in-app UI — this
// script is the belt-and-braces cleanup that guarantees the disposable
// account never survives as orphaned junk in production if the in-app
// deletion path itself is what's broken. No-ops (exit 0) if the account
// is already gone, since that's the expected outcome on a passing test.
//
// Usage: node scripts/force-delete-test-user.js <email>
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');

const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/force-delete-test-user.js <email>'); process.exit(1); }

initializeApp({ credential: cert(require(path.join(__dirname, '..', 'service-account-key.json.json'))) });

getAuth().getUserByEmail(email)
  .then(user => getAuth().deleteUser(user.uid))
  .then(() => { console.log(`Deleted ${email}`); process.exit(0); })
  .catch(err => {
    if (err.code === 'auth/user-not-found') { console.log(`${email} already gone`); process.exit(0); }
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Write the round-trip test**

Add to `tests/settings.spec.ts`, as a new top-level `test.describe` block (separate from the main one, since it needs its own throwaway credentials and an unauthenticated start, matching the pattern `tests/security.spec.ts`'s `Security — Cross-Account Data Isolation` block already uses):

```ts
test.describe('Privacy page — destructive round trip (disposable account only)', () => {
  // Never reuses TEST_EMAIL/TEST_PASSWORD — registers and destroys its
  // own throwaway account so this test can never touch the shared
  // accounts every other spec file in this repo depends on.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Delete Data wipes Firestore but keeps the account; Delete Account Permanently removes it entirely', async ({ page }) => {
    const email = `qa-privacy-delete-${Date.now()}@example.com`;
    const password = 'QaPrivacyDelete123!';

    try {
      // ── Register a fresh disposable account ──
      await page.goto('/');
      await page.waitForSelector('#auth-screen');
      await page.locator('#tab-register').click();
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-password').fill(password);
      await page.locator('#auth-submit-btn').click();
      await page.waitForFunction(() => document.getElementById('auth-screen')?.classList.contains('hidden'), { timeout: 20000 });
      await expect(page.locator('#main-content')).toBeVisible();

      // ── Add one throwaway workout so Delete Data has something real to remove ──
      await page.waitForFunction(() => {
        const row = document.getElementById('typeRow');
        return row && row.children.length > 0;
      }, { timeout: 10000 });
      await page.locator('#typeRow button, #typeRow .type-btn').first().click();
      await page.locator('.ex-weight').first().fill('10');
      await page.locator('#saveBtn').click();
      await expect(page.locator('#toast')).toHaveClass(/success/, { timeout: 10000 });

      // ── Delete Data: account must survive, data must not ──
      await page.evaluate(() => (window as any).navigateTo('/settings/privacy'));
      await expect(page.locator('#sec-privacy')).toHaveClass(/active/);
      await page.locator('#privacyDataBtn').click();
      await page.locator('#privacyConfirmInput').fill('מחק');
      await page.locator('#privacyConfirmBtn').click();
      await expect(page.locator('#toast')).toContainText('נמחקו', { timeout: 10000 });
      // Still logged in — the auth screen must stay hidden.
      await expect(page.locator('#auth-screen')).toHaveClass(/hidden/);

      // ── Delete Account Permanently: fresh login, so no reauth branch fires ──
      await page.evaluate(() => (window as any).navigateTo('/settings/privacy'));
      await page.locator('#privacyAccountBtn').click();
      await page.locator('#privacyConfirmInput').fill('מחק');
      await page.locator('#privacyConfirmBtn').click();
      await page.waitForFunction(() => !document.getElementById('auth-screen')?.classList.contains('hidden'), { timeout: 15000 });
      await expect(page.locator('#auth-msg')).toContainText('נמחק');

      // ── The account must be genuinely gone, not just signed out ──
      await page.locator('#tab-login').click();
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-password').fill(password);
      await page.locator('#auth-submit-btn').click();
      await expect(page.locator('#auth-msg')).not.toBeEmpty({ timeout: 10000 });
      const loginFailed = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
      expect(loginFailed).toBe(true);
    } finally {
      // Belt-and-braces: guarantees no disposable account survives in
      // production even if an assertion above failed mid-test.
      const { execSync } = require('child_process');
      try { execSync(`node scripts/force-delete-test-user.js ${email}`, { cwd: process.cwd(), stdio: 'inherit' }); } catch (e) {}
    }
  });
});
```

- [ ] **Step 3: Run the round-trip test**

```bash
npx playwright test tests/settings.spec.ts -g "destructive round trip"
```

Expected: PASS (1 test). This test needs no `TEST_EMAIL`/`TEST_PASSWORD` env vars at all (it creates its own account), so it runs even in environments where `requiresCredentials()`-gated tests skip.

- [ ] **Step 4: Run the full settings + security suites to confirm nothing else broke**

```bash
TEST_EMAIL=<real> TEST_PASSWORD=<real> npx playwright test tests/settings.spec.ts tests/security.spec.ts tests/navigation.spec.ts
```

Expected: all PASS — in particular `tests/navigation.spec.ts` (unified back-stack behavior) should be unaffected since Task 2 followed the existing `ROUTES`/`navigateTo()` pattern exactly, and `tests/security.spec.ts`'s existing tests never touch the Privacy page.

- [ ] **Step 5: Commit**

```bash
git add scripts/force-delete-test-user.js tests/settings.spec.ts
git commit -m "test: add disposable-account round-trip test for the privacy delete flow"
```

---

## Task 7: Update product documentation

**Files:**
- Modify: `docs/product/08-settings.md` (add the new Settings group to the group list)
- Modify: `docs/product/12-security-and-privacy.md` (remove the now-resolved "no delete button" gap note; document the new page)
- Modify: `docs/product/14-data-model-backend.md` (note that `users/{uid}` is now fully erasable in-product)
- Modify: `docs/product/README.md` (add a new numbered entry `16-privacy-and-data-deletion.md` OR fold into `08`/`12` — see Step 1 for the decision this step makes)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — this is the last task, purely descriptive.

- [ ] **Step 1: Decide placement and update `docs/product/README.md`**

This feature is page-specific content reachable only from Settings (like the workout/cardio/measurement editors documented inside `08-settings.md` already are), not a cross-cutting topic like `09`-`15`. Add a short new subsection to `docs/product/08-settings.md` (Step 2) rather than a new top-level numbered doc — no change to `docs/product/README.md`'s numbered list is needed since no new top-level file is being created.

- [ ] **Step 2: Update `docs/product/08-settings.md`**

Add a new subsection after the existing "קבוצה 4: טיימר" section and before "אתחול המסך" (`docs/product/08-settings.md:32-36`):

```markdown
### קבוצה 5: פרטיות (חדש, 2026-09-14)
- **"פרטיות ומחיקת נתונים"** (`openPrivacySettings`) → מנווט ל-`/settings/privacy`, עמוד עליון-רמה נפרד (לא פאנל עריכה) המפרט אילו קטגוריות נתונים נשמרות (פרטי חשבון, אימוני כוח, אימוני אירובי, מדידות, טיוטות) ומציע שני כפתורים אדומים:
  - **מחיקת נתונים** — מוחק את כל אוספי/מסמכי Firestore תחת `users/{uid}/...` (ראו `14-data-model-backend.md`) וכל מפתח `localStorage` הממותג לפי `uid`, אך משאיר את חשבון ה-Auth קיים. שום ברירת מחדל אינה נזרעת מחדש — החשבון חוזר למצב "ריק לגמרי" (דומה למצב הזמני של משתמש חדש רגע לפני ש-`initNewUser` מסיים לכתוב).
  - **מחיקה מלאה של הפרופיל** — מבצע את אותה מחיקת נתונים ולאחריה `deleteUser()` על חשבון ה-Auth עצמו. אם ההתחברות אינה "טרייה" מספיק (`auth/requires-recent-login`), מוצג דיאלוג אימות-מחדש (סיסמה או Google, לפי ספק ההתחברות המקורי) ולאחריו המחיקה מנוסה שוב אוטומטית.
  - שני הכפתורים דורשים הקלדת מילת אישור מפורשת ("מחק"/"DELETE") בדיאלוג ייעודי — **לא** דפוס "Arm & Confirm" הרגיל של האפליקציה (ראו `00-overview.md`) — כי מדובר בפעולות הרסניות בהרבה מסדר-גודל ממחיקת רשומה בודדת.
```

- [ ] **Step 3: Update `docs/product/12-security-and-privacy.md`**

Replace the final sentence of the "פרטיות" section (currently: `"אין כיום בממשק המוצר עצמו כפתור 'מחק את החשבון שלי' / 'ייצא את הנתונים שלי' (מחיקה כרגע אפשרית רק ברמת רשומה בודדת/קבוצתית, לא ברמת כל חשבון המשתמש). זו פער מוצרי אם וכאשר יידרש עמידה מלאה ברגולציות פרטיות (כגון GDPR 'זכות למחיקה')."`) with:

```markdown
**עודכן 2026-09-14:** נוסף עמוד "פרטיות" (`08-settings.md`, קבוצה 5) עם שני כפתורי מחיקה — מחיקת כל הנתונים (החשבון נשאר) ומחיקה מלאה של החשבון (נתונים + Auth user). זהו מימוש בפועל של "זכות למחיקה" (GDPR). עדיין **אין** כפתור "ייצא את הנתונים שלי" (זכות ניידות/portability) — זה נשאר פער מוצרי פתוח, מחוץ להיקף התכונה הזו.
```

- [ ] **Step 4: Update `docs/product/14-data-model-backend.md`**

Add a bullet to the "מה חסר" section, right after the existing "אין endpoint אחיד ל'מחיקת כל הנתונים של משתמש'" line — replace that line (since it's now resolved) with:

```markdown
- **עודכן 2026-09-14:** קיים כעת endpoint בצד-לקוח למחיקת כל הנתונים/החשבון של משתמש — ראו עמוד "פרטיות" ב-`08-settings.md`. אין עדיין גיבוי/ייצוא נתונים יזום למשתמש (למעט זרימת ההגירה החד-כיוונית מהגרסה הישנה ב-`migrate.html`) — "זכות ניידות" (data portability) נשארת מחוץ להיקף.
```

- [ ] **Step 5: Commit**

```bash
git add docs/product/08-settings.md docs/product/12-security-and-privacy.md docs/product/14-data-model-backend.md
git commit -m "docs: document the new privacy/data-deletion page in the product docs"
```

---

## Self-Review Notes (per writing-plans skill)

- **Spec coverage:** page reachable from Settings (Task 2) ✓; data explanation copy (Task 2) ✓; two red buttons with captions (Task 2) ✓; type-to-confirm modal for both (Task 3) ✓; Delete Data wipes Firestore+localStorage, keeps account, no reseed (Task 4) ✓; Delete Account wipes + `deleteUser()` + catch-and-reauth (Task 5) ✓; testing strategy that never touches shared test accounts (Task 6) ✓; docs updated (Task 7) ✓.
- **Known gap, by design (see spec):** the `auth/requires-recent-login` → reauth-modal branch itself has no automated test — only manually verifiable, since simulating a stale Firebase session isn't practical in Playwright. Task 6's round-trip test only exercises the direct-success path.
- **Type consistency check:** `_privacyConfirmKind` values (`'data'`/`'account'`) are used identically in Task 3's `_openPrivacyConfirm(kind)`, Task 3/4/5's `_privacyConfirmProceed()`, and nowhere else — no drift between tasks.
