# דוח תהליך QA מלא — Training Diary
**תאריך:** 13–14 בספטמבר 2026
**כלי:** qa-plugin (Claude Code)
**היקף:** בדיקת רגרסיה + הרחבה על שינויים שנכנסו לאפליקציה מאז ה-5.9.2026

---

## 0. מצב פתיחה

כשהתחלתי, `qa-state.json` כבר הכיל פרויקט QA מלא שהושלם באוגוסט: exploration + test design + automation + execution, עם **292 סקריפטי Playwright**, 97.6% הצלחה (285 עברו, 0 נכשלו, 6 flaky, 1 skipped). קובץ המצב עצמו לא עודכן מאז ה-5.9.2026, אבל ב-git log של האפליקציה היו הרבה קומיטים אחרי התאריך הזה (מסך auth, Google sign-in, הודעות שגיאה מתורגמות, מסך טעינה, cardio/strength UI parity).

**החלטה:** לא setup מלא מאפס (מיותר, רוב האפליקציה לא השתנתה) ולא execution בלבד (יפספס פיצ'רים חדשים) — **INCREMENTAL**: לסרוק מחדש רק את מה שהשתנה, לעדכן את תוכנית הבדיקות, ואז להריץ הכל.

---

## 1. Exploration מחדש (סריקה חלקית)

### 1.1 ניסיון ראשון — נכשל
הרצתי sub-agent (`qa-explorer`, דרך Playwright MCP) לסרוק מחדש login/register/settings/history. **הניסיון הראשון נכשל** — הודעת שגיאה על "Playwright browser instance is locked by a parallel session". זו תקלה ידועה בפלאגין: כמה sessions של Claude Code שרצות במקביל (ראיתי ברשימת ה-agents שהיו עוד כמה sessions פעילות באותו זמן) חולקות דפדפן Playwright-MCP אחד, ומתנגשות.
**פתרון:** ניסיתי שוב אחרי כמה דקות — הפעם עבד.

### 1.2 מה נמצא בסריקה
- מסך login: שדה email/password, כפתור "Sign in with Google" (`button.auth-google-btn`), קישור "שכחתי סיסמה" (`.auth-forgot`) — שניהם גלויים ישירות במסך, לא רק flows פנימיים.
- הודעת שגיאה על סיסמה שגויה: הודעה כללית מתורגמת ("Invalid email or password" / "מייל או סיסמה שגויים"), **לא** טקסט גולמי של Firebase.
- Settings: בורר theme הפך מ-toggle בינארי (Dark Mode) לקבוצת 3 כפתורים (Light/Dark/Auto).
- History: פוצל ל-2 domains — Strength/Cardio, עם סטטיסטיקות cardio (streak, best distance/pace, lowest HR) ופילטר טווח תקופה (Month/Year/All).

### 1.3 באג אמיתי שנתפס באמצע העבודה
בזמן ניסיון למזג את תוצאות הסריקה לתוך `qa-state.json`, קיבלתי שגיאת JSON לא-תקין. הסיבה: שדה קיים בקובץ (`TC-NEG-011`) הכיל את הביטוי `"A".repeat(500)` **כטקסט קוד JS גולמי בתוך string ב-JSON**, במקום מחרוזת בפועל — קובץ ה-state היה שבור עוד לפני שהתחלתי. תיקנתי את השדה הבודד (במקום לפסול את כל הפרויקט ולהתחיל setup מאפס, לפי ה-hard-gate של הפלאגין).

### 1.4 בדיקת הנחות — פס סריקה שני
לפני שהמשכתי, שאלת המשתמש "האם כל העמודים נבדקים?" חשפה שהנחתי (בלי לבדוק) ש-Timer/Measurements/Running לא השתנו. הרצתי pass שני של exploration ספציפית על העמודים האלה, ומצאתי:
- Timer ו-Measurements — אכן ללא שינוי (מאומת, לא רק מונח).
- "Running" — עדיין קיים כעמוד נפרד ללוגינג אימונים (`/running`), רק שהתפריט התחתון עכשיו קורא לו "Cardio". ה-domain "Cardio" בתוך History הוא ה-**צפייה** בנתונים, לא ה-**קלט**. זו טעות שהייתי עושה אם לא הייתי בודק.
- אושר: "Show Cardio Page" הוא בדיוק אותו toggle ישן "Show Running Page", רק שם שונה.

---

## 2. Test Design — עדכון תוכנית הבדיקות

### 2.1 סבב ראשון — Functional / Negative / UI בלבד
הרצתי agents (`qa-functional`, `qa-negative`) במקביל, וכתבתי בעצמי מקרי UI, על בסיס השינויים שנמצאו. תוצאה: 21 functional + 15 negative + 9 UI חדשים/מתוקנים. עדכנתי מקרים ישנים שהפכו לא-נכונים (TC-NEG-004/005 ציפו לטקסט Firebase גולמי — עודכנו לטקסט המתורגם בפועל; המקרה של Edit Workout Plan פוצל לשני מקרים).

הצגתי את זה למשתמש כ-diff עם הנחות מסומנות ("Show Cardio Page = שינוי שם, לא בטוח"; onboarding למשתמש חדש לא נבדק). המשתמש בחר לראות את הרשימה המלאה לפני אישור.

### 2.2 הפער שהמשתמש תפס
המשתמש שאל: **"האם אלו כל הטסטים? האם כל סוגי הבדיקה (אבטחה, נגישות וכו') מכוסים?"**
התשובה הכנה הייתה **לא** — הסבב הראשון כיסה רק 3 מתוך 8 סוגי הבדיקה שהוגדרו ב-`project.qa.yaml`. security / accessibility / usability / performance / i18n נשארו זהים למה שהיה לפני השינויים.

### 2.3 סבב שני — סגירת הפער
הרצתי במקביל: `qa-security`, `qa-accessibility`, `qa-ux` (usability), ו-agent משולב ל-`accessibility+performance+i18n`, ועוד agent נפרד ל-performance. (טעות קטנה בדרך: קראתי בהתחלה ל-agent type שגוי בשם `qa-usability` — לא קיים, השם הנכון הוא `qa-ux`; תוקן בסבב הבא.)

תוצאה סופית: **174 מקרי בדיקה** בכל 8 הקטגוריות:

| קטגוריה | סה"כ |
|---|---|
| functional | 48 |
| negative | 44 |
| ui | 23 |
| security | 16 |
| accessibility | 13 |
| usability | 11 |
| performance | 6 |
| i18n | 13 |

---

## 3. קטלוג HTML של כל הטסטים (Artifact)

לפי בקשת המשתמש, נבנה עמוד HTML (RTL, פונטי Heebo + IBM Plex Mono, חיפוש וסינון לפי קטגוריה) שמציג את כל 174 המקרים. פורסם כ-Artifact ב-claude.ai.

### באגים אמיתיים שנתקלנו בהם ותוקנו (לפי סדר גילוי):

1. **`</script>` גולמי שובר את התג** — כמה ממקרי הבדיקה מכילים payload אמיתי של XSS (`<script>alert('xss')</script>`) בתוך שדה `input`. כשזה הוטבע כ-JSON גולמי בתוך תג `<script>` של העמוד, הדפדפן זיהה את ה-`</script>` הפנימי כסוף התג האמיתי — והתוכן שאחריו נשפך כטקסט גלוי בעמוד. **פתרון:** קידוד base64 לכל ה-JSON, כך שאין אף מחרוזת דמוית-תג בקוד המקור של העמוד בכלל.
2. **תזמון init תלוי ב-DOMContentLoaded** — בתיקון הראשון השתמשתי במנגנון decode ישן (`escape`/`decodeURIComponent`) ועטפתי את קוד הרינדור ב-`DOMContentLoaded`. זה כשל בשקט (בלי שגיאה נראית) — כי ה-viewer של Artifacts כנראה מזריק את העמוד למסמך שכבר "נטען", וה-event הזה לא נורה שוב. **פתרון:** מעבר ל-`TextDecoder` (יציב יותר), והרצת האתחול **מיידית** (אין תלות ב-event), עם הצגת שגיאה גלויה בעמוד אם משהו עדיין נכשל.
3. **שגיאת regex אמיתית** — רק כששלח המשתמש צילום מסך של ה-console נחשפה השגיאה המדויקת: `Invalid regular expression: ... Range out of order in character class`. הסיבה: כתבתי `\\-` (בקסלאש כפול) במקום `\-` בתוך regex literal — זה הפך ל"בקסלאש ליטרלי + מקף לא-מוסתר", שיצר טווח לא-חוקי בין תו לתו. תוקן, ונבדק עם `node --check` על כל הסקריפט לפני פרסום חוזר.

לאחר התיקונים, בהוראת המשתמש, נוספו **תרגומים לעברית** לכל 174 המקרים (6 agents ברקע, אחד לכל קטגוריה/צירוף קטגוריות), עם בלוק "תרגום לעברית" בכל כרטיס.

---

## 4. הפער השני שהמשתמש תפס — התוכנית לא הייתה קוד

המשתמש שאל: **"האם כל הטסטים האלו כתובים בפועל בקבצי הבדיקה? איפה?"**
בדקתי לפי timestamp ותוכן בפועל של `tests/*.spec.ts` — התשובה הכנה: **לא**. 174 מקרי הבדיקה היו רק תכנון (JSON + הקטלוג), ואף אחד מ-76 המקרים החדשים לא נכתב כקוד Playwright. זה תואם את ה-hard-gate של הפלאגין: כתיבת קוד בדיקה דורשת אישור מפורש מהמשתמש על התוכנית — ולא קיבלתי אישור כזה עד כה (עברנו ישר לבניית הקטלוג).

המשתמש אישר ("כן") לעבור ל-automation, וביקש תיוג (tags) לפי עמוד/אזור/פיצ'ר/סוג בדיקה.

---

## 5. Automation — כתיבת קוד Playwright בפועל

### 5.1 אימות selectors לפני כתיבת קוד
לפני שהתחלתי, בדקתי את קובץ המקור האמיתי של האפליקציה (`public/index.html`, `public/translations.js`) מול ההנחות שנאספו ב-exploration. נמצאו כמה **פערים אמיתיים**:

| הנחה מה-exploration | המציאות בקוד |
|---|---|
| `openStrengthEdit()` | הפונקציה בפועל: `openWorkoutEdit()` |
| Edit Cardio Plan נפתח כ-modal | בפועל: ניווט SPA (`navigateTo('/settings/cardio-plan')`), לא modal |
| `#darkModeToggle` (טסט קיים) | האלמנט לא קיים יותר — הטסט הקיים כבר שבור |
| דפי דשבורד עם סטטיסטיקות cardio ב-"/" | לא קיים דף כזה — הסטטיסטיקות חיות בתוך History → Cardio |
| הודעת שגיאה אחת גנרית | בקוד יש מיפוי ל-3 קודי שגיאה נפרדים של Firebase (אבל בפועל, ה-SDK כנראה מחזיר תמיד את הקוד המאוחד `invalid-credential`) |

### 5.2 כתיבת הקוד
הרצתי 7 agents ברקע (Read/Write, בלי דפדפן — בטוח להריץ במקביל), כל אחד קיבל: selectors מאומתים, את מקרי הבדיקה הרלוונטיים מ-`qa-state.json`, והוראה מפורשת **לאמת בעצמו** מול המקור לפני כתיבה, ולא לסמוך על ההנחות בתוכנית.

קבצים שעודכנו: `auth.spec.ts` (+6), `settings.spec.ts` (+13, ותיקון טסט ישן שבור), `history.spec.ts` (+13), `negative.spec.ts` (+15), `ui.spec.ts` (+9), `security.spec.ts` (+8), `accessibility.spec.ts` (+7), `i18n.spec.ts` (+9), `performance.spec.ts` (+4).

כל הטסטים החדשים כוללים תיוג Playwright native (`{ tag: [...] }`), למשל:
```typescript
test('TC-FUNC-038: ...', { tag: ['@page-settings', '@area-settings', '@feature-show-cardio-toggle', '@type-functional'] }, async ({ page }) => { ... });
```
שימוש: `npx playwright test --grep @feature-theme-selector`.

### 5.3 ממצאים אמיתיים נוספים שנתפסו בזמן הכתיבה (על ידי ה-agents, לא הונחו מראש)
- אין שום `aria-pressed`/`aria-selected`/`role="tab"` בכל האפליקציה — בורר ה-theme ומעברי ה-domain ב-History מסמנים מצב פעיל רק דרך class `.active`. זה נרשם כפער נגישות אמיתי, לא "תוקן" בשקט.
- `axe-core` לא מותקן בפרויקט בכלל, אף ש-`qa-state.json` תיאר כמה מקרים כ-`tool: axe-core`. הבדיקות נכתבו כבדיקות DOM/ARIA ידניות במקום זה.
- אין מנגנון query-param ב-URL לפילטר התקופה בהיסטוריית cardio — המקרה שתכנן לבדוק הזרקת ערך לא-חוקי דרך ה-URL נכתב כ-`test.fixme(...)` עם הסבר, במקום לבדוק מנגנון שלא קיים.
- כפילות: TC-NEG-041 עד 044 נכתבו **פעמיים** — גם ב-`history.spec.ts` וגם ב-`negative.spec.ts` (שני agents קיבלו הוראה חופפת בטעות שלי). תוקן: הוסר הכפול מ-`negative.spec.ts`, נשאר ב-`history.spec.ts`.

### 5.4 בדיקת שפיות סופית
```
npx playwright test --list
Total: 540 tests in 15 files   (exit code 0, אין שגיאות)
```
זו רק בדיקת **פרסור/רישום** — לא הרצה אמיתית. `qa-state.json` עודכן לשקף ש-automation הושלם.

---

## 6. מה עדיין לא נעשה (במכוון)

1. **אף טסט לא הורץ בפועל** נגד האתר החי. כל מה שנבדק הוא ש-540 הטסטים נטענים/מתפענחים נכון (`--list`), לא שהם עוברים. הרצה אמיתית (`npx playwright test`) פועלת נגד production (`https://training-diary.web.app`, ברירת המחדל ב-`playwright.config.ts`) ותיצור/תשנה נתונים אמיתיים בחשבונות הבדיקה (אימונים, מדידות, הגדרות) — זה פעולה עם תוצאות בעולם האמיתי, לא רק בדיקה "יבשה".
2. **בדיקות ידניות** (`requires_manual: true`) — לא ניתנות לאוטומציה כלל:
   - השלמת התחברות Google בפועל (OAuth popup אמיתי) — TC-FUNC-031/032/033 בודקים רק שהכפתור גלוי ולחיץ, לא את ההשלמה.
   - "שכחתי סיסמה" בפועל (דורש תיבת מייל אמיתית) — TC-FUNC-028/029/030 בודקים רק נראות/עקביות.
   - העלאת תמונה לאימון אליפטיקל (דורש מצלמה/גלריה על מכשיר פיזי).
   - ברירות מחדל למשתמש חדש (onboarding) — לא אומת בשום סריקה, כדי לא ליצור חשבון אמיתי בפרודקשן בלי אישור.

---

## נספח: קבצים שהשתנו

- `qa-state.json` — כל השדות: map, test_cases (8 קטגוריות), status, automation_pass_2026_09_14
- `tests/auth.spec.ts`, `tests/settings.spec.ts`, `tests/history.spec.ts`, `tests/negative.spec.ts`, `tests/ui.spec.ts`, `tests/security.spec.ts`, `tests/accessibility.spec.ts`, `tests/i18n.spec.ts`, `tests/performance.spec.ts`
- קטלוג HTML (Artifact, לא בריפו) — כל 174 המקרים עם תרגום לעברית, חיפוש וסינון
