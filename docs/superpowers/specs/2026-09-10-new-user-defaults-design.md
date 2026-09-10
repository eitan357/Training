# Spec: New-User Onboarding Defaults + Two Related Settings Bugfixes

**Requested:** 2026-09-10, by Eitan. Brainstormed and approved over several rounds (bounded-path, per superpowers:brainstorming) including a full bilingual glossary review — see "Approved glossary" below.

## Problem

New users get an incomplete, Hebrew-only, inconsistent onboarding today (all in `public/index.html`, `initNewUser(uid)`, ~2444-2480):

1. **Cardio has zero defaults.** `initNewUser` never writes `config/runningTemplates`. A brand-new user who enables the cardio tab starts with no workout type at all and must build one field-by-field before they can log a single cardio session.
2. **Strength defaults are the developer's personal split**, not a neutral starter template: two 7-8 exercise days with prescribed `target` rep ranges (e.g. `"3 X 4-6 + 1 X 15-20"`) that only make sense for one specific program.
3. **Everything is hardcoded Hebrew**, regardless of the new user's device language — `docs/product/01-auth-onboarding.md:54` already flags this as a known i18n gap.
4. **No display name is ever set** for a new account — `config/profile` isn't written by `initNewUser` at all, so `_updateTopbarName()` falls back to the raw email address until the user manually visits Settings.
5. **The detected device-language default isn't persisted.** `currentLang`'s fallback (`navigator.language`-based, `index.html:1477`) is recomputed fresh on every load and never written to `localStorage`, so it isn't a real "sticky" default — it can silently flip if the OS language changes later.

Two unrelated pre-existing bugs surfaced during investigation, and Eitan asked to fix both as part of this same pass:

6. **`saveRunningEnabled`** (`index.html:1596-1602`) shows a hardcoded Hebrew-only, non-localized error toast (`'שגיאה בשמירת הגדרות'`) on Firestore failure — an English-language user would see Hebrew text.
7. **`saveDisplayName`** (`index.html:1560-1567`) writes to Firestore fire-and-forget with `.catch(() => {})` — a failure is completely swallowed while the UI still claims success (`toast(t('display_name_saved'), 'success')` fires unconditionally). The user has no way to know their display name didn't actually save to their account.

## Design decisions

### New-user defaults (`initNewUser`)

`initNewUser(uid)` becomes `initNewUser(uid, email)`. On every fresh registration (email/password) or first-ever Google sign-in, it writes **four** Firestore config docs instead of two, all worded in Hebrew or English based on `currentLang` at the moment of account creation (not live-retranslated later — see "Known limitation" below):

- `config/templates` — strength, unchanged shape (`{ types: ['A','B'], A: [...], B: [...] }`), but new exercise lists and **no `target` value** (empty string) per exercise — see glossary.
- `config/measurementTypes` — same 8 Hebrew names as today (unchanged, already matched what Eitan wants), plus a matching English set.
- `config/runningTemplates` — **new**. One default cardio type, name = `t('run.default_type')` (reuses the existing translation key so it never drifts out of sync with it), containing 8 fields per the glossary below. This is a **separate, dedicated label set — it deliberately does NOT reuse the existing `CARDIO_MIGRATION_FIELD_MAP`** (whose wording is "דופק ממוצע"/"הרגשתי עייפות" etc.) because Eitan explicitly wants shorter wording for new-user defaults ("דופק"/"עייפות") that differs from what's already live on his own account.
- `config/profile` — **new**. `{ displayName: email ? email.split('@')[0] : '' }`.

### Approved glossary (Hebrew → English)

**Cardio fields** (id, fieldType, hidden — `date` is created but hidden, matching "the date field is inactive"):

| id | fieldType | he | en |
|---|---|---|---|
| date | date (hidden) | תאריך | Date |
| distanceKm | number | מרחק | Distance |
| durationMinutes | number | זמן | Time |
| calories | number | קלוריות | Calories |
| avgStridesPerMin | number | צעדים | Steps |
| avgHeartRate | number | דופק | Heart Rate |
| feltTired | checkbox | עייפות | Tired |
| notes | text | הערות | Notes |

Default cardio type name: `t('run.default_type')` → "אימון" / "Workout".

**Strength exercises** (types A and B, both real workout days per Eitan — not a single-type default):

| Type A (he → en) | Type B (he → en) |
|---|---|
| מתח → Pull-up | בנץ' פרס → Bench Press |
| שכיבות סמיכה → Push-up | כפיפת ירך → Hip Flexion |
| סקוואט → Squat | מקבילים → Dips |
| כפיפות בטן → Sit-up | יד קדמית → Biceps Curl |
| דדליפט → Deadlift | יד אחורית → Triceps Extension |

(Eitan confirmed the Hebrew "בנצ' פרנס" was a typo for "בנץ' פרס".) Every exercise gets `target: ''` (no prescribed target — Eitan explicitly said targets aren't needed for the defaults).

**Measurement types** (he unchanged, en added):

| he | unit he | en | unit en |
|---|---|---|---|
| משקל | ק"ג | Weight | kg |
| חזה | ס"מ | Chest | cm |
| כתפיים | ס"מ | Shoulders | cm |
| זרוע | ס"מ | Arm | cm |
| ירך | ס"מ | Thigh | cm |
| שוק | ס"מ | Calf | cm |
| מותניים | ס"מ | Waist | cm |
| ישבן | ס"מ | Glutes | cm |

**Known limitation, explicitly accepted by Eitan:** the strength and measurement defaults never live-retranslate if the user later switches app language — they're written once, in whichever language was detected at account-creation time, and stay that way until the user manually edits them (identical behavior to how those defaults already worked before this change). **Correction (2026-09-10, post-implementation):** the cardio defaults turned out to be a partial exception, not a full one — `cardioFieldDisplayLabel`'s translate-on-view check is a byte-exact match against `CARDIO_MIGRATION_FIELD_MAP`'s canonical label, and 6 of the 8 Hebrew default labels (`תאריך`/`מרחק`/`זמן`/`קלוריות`/`צעדים`/`הערות`) happen to equal that canonical wording exactly — so those DO live-retranslate on a language switch. Only the 2 fields deliberately given different wording (`דופק` vs. canonical `דופק ממוצע`; `עייפות` vs. canonical `הרגשתי עייפות`) are actually frozen. A Hebrew-registered user who switches to English therefore sees a mixed-language cardio form for those two fields specifically, not a fully-frozen one. See `docs/product/07-running-cardio.md` for the full breakdown.

### Already-correct behavior (verified, no code change)

- Theme already defaults to `'auto'` (inline boot script, `index.html:13`).
- Timer sound already defaults to on (`localStorage.getItem('timerSound') !== 'false'`, `index.html:5249`).
- The "show cardio page" toggle (`#runningEnabledToggle` / `runningGateRow`) is already unconditionally visible to every user in Settings — the old email-allowlist gate was already removed (comment at `index.html:2701-2704`).

### Language-default persistence (item ה)

`currentLang`'s init (`index.html:1477`) is changed so that when it falls back to device-language detection (no stored preference yet), it immediately writes that choice into `localStorage['lang']` — turning a recomputed-every-load fallback into a real, sticky, one-time default. Explicitly scoped to `localStorage` only (not synced to Firestore) per Eitan's instruction.

### Bugfix: `saveRunningEnabled` (item 6)

Change the bare `catch { toast('שגיאה בשמירת הגדרות', 'error'); }` to `catch (err) { toast(t('error.save') + firestoreErrMsg(err), 'error'); }` — the exact pattern already used at the 13 other Firestore-write call sites fixed in the previous session (`firestoreErrMsg` already exists at `index.html:2429-2441`).

### Bugfix: `saveDisplayName` (item 7) — retry-on-next-sync, not an error toast

Per Eitan's explicit direction: **do not show the user an error for this.** Instead:
1. `saveDisplayName` still updates `localStorage` and the topbar instantly (unchanged), and still shows the "saved" success toast immediately (unchanged) — the local save genuinely always succeeds.
2. The Firestore write becomes a small helper, `_syncDisplayName(name)`, still fire-and-forget from the caller's perspective, but on failure it sets a `displayNamePending_<uid>` flag in `localStorage` instead of swallowing the error silently with no trace.
3. A new `_retryPendingDisplayNameSync()` checks that flag (cheap `localStorage` read, no network call if unset) and, if set, retries the same write. It's called from two places that are already-existing "we're talking to Firestore right now anyway" moments, per Eitan's instruction to piggyback on other traffic rather than build a dedicated retry scheduler:
   - `reloadAppData()` — runs after every manual save/delete across the whole app.
   - the draft auto-save timer tick (`_draftStartFirestoreTimer`'s `setInterval` callback, every 30s) — covers the "auto-save" case Eitan named explicitly.

This means a failed display-name sync resolves itself, silently, the next time the user saves anything or the 30-second auto-save timer fires — without the user ever seeing an error message for it.

## Testing strategy

This codebase has no unit-test framework and no Firestore emulator — the existing Playwright suite (`tests/*.spec.ts`) runs end-to-end against a real, already-provisioned production Firebase account, and never exercises a fresh-registration flow (confirmed by investigation: zero references to the `newUser` fixture in `tests/fixtures/test-data.json`). Writing a new automated spec that performs real account registration against production Firebase on every CI run is undesirable (it would create real accounts/data every run with no cleanup mechanism in this repo).

Verification is therefore **manual, via the Playwright browser tool**, once per language:
- Register a disposable test account with the browser's language/locale forced to Hebrew — inspect the resulting `config/templates`, `config/measurementTypes`, `config/runningTemplates`, `config/profile` docs (or their rendered UI equivalents) match the Hebrew column of the glossary, confirm the cardio type/fields render correctly with the date field hidden, confirm display name shows the email prefix, confirm `localStorage['lang']` got persisted as `'he'`.
- Repeat with the browser forced to English, confirming the English column and `localStorage['lang'] === 'en'`.
- Confirm the pre-existing defaults (theme `auto`, timer sound on, cardio toggle visible) are unaffected.
- For the two bugfixes: trigger `saveRunningEnabled` and `saveDisplayName` failures via DevTools (offline mode / blocked Firestore request) and confirm the new behavior (localized toast for the first; silent local success + later automatic resync for the second, once connectivity returns and any save/auto-save fires).
- Run the existing Playwright suite's `settings.spec.ts` and `auth.spec.ts` afterward to confirm no regression against the already-provisioned test account (whose existing data this change never touches).
