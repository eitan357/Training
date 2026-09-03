# נושא-רוחב: מודל נתונים מאוחד (Backend / Firestore)

מסמך זה מרכז במקום אחד את כל מבנה הנתונים ב-Firestore, שבמסמכים 01–08 מפוזר לפי הקשר עמוד. שימושי כרפרנס מהיר למפתח/מוצרן שצריך להבין את כל ה-Backend בלי לעבור על כל הקבצים.

## עיקרון מבני

**אין Backend מותאם אישית (no custom server).** כל הלוגיקה העסקית — חישובים, ולידציות, החלטות מתי לעדכן יעד וכו' — רצה בצד הלקוח (`public/index.html`) וכותבת ישירות ל-Firestore דרך ה-SDK של הדפדפן. Firestore הוא גם מסד הנתונים וגם ה-"API" היחיד. כל המסמכים חיים תחת `users/{uid}/...` — אין נתון גלובלי משותף בין משתמשים.

## מפת אוספים (Collections) מלאה

| נתיב Firestore | סוג | נוצר על ידי | שדות עיקריים | מסמך מוצר קשור |
|---|---|---|---|---|
| `users/{uid}/config/templates` | מסמך יחיד | `initNewUser`, `saveTemplates`, עדכון יעד אוטומטי ב-`submitData` | `types: string[]`, ולכל סוג: מערך `{id, name, targetWeight, targetSets, targetReps, target?}` | `02`, `03` |
| `users/{uid}/config/measurementTypes` | מסמך יחיד | `initNewUser`, `saveTypesEditor` | `types: {id, name, unit}[]` | `06` |
| `users/{uid}/config/profile` | מסמך יחיד | `saveDisplayName` | `displayName: string` | `08` |
| `users/{uid}/config/settings` | מסמך יחיד | `saveRunningEnabled`, `migrateCardioDataV2` | `runningEnabled: boolean`, `cardioMigratedV2: boolean` (דגל מיגרציה חד-פעמי, ראו `07`) | `07`, `08` |
| `users/{uid}/workouts` | אוסף (מסמך לכל אימון) | `submitData`, `checkAndAutoSavePreviousDrafts`, `migrate.html` | `date`, `dateISO`, `type`, `sessionName`, `exercises: {id,name,target,weight,sets,reps,notes}[]`, `autoSaved?`, `createdAt` | `02`, `04` |
| `users/{uid}/measurements` | אוסף (מסמך לכל מדידה) | `saveMeasurement`, `migrate.html` | `date`, `dateISO`, `createdAt`, ושדה דינמי לכל סוג מדידה (למשל `"משקל": "78.5"`) | `06` |
| `users/{uid}/drafts/{domain}_{type}` | מסמך לכל סוג אימון פעיל (כוח **או** אירובי) | `_draftSaveFirestore` | לכוח: `workoutName`, `exercises: {name,target,weight,sets,reps,notes}[]`; לאירובי: `workoutName`, `fields: {id,label,fieldType,value}[]`; בשניהם: `createdAt`, `lastModified` | `02`, `07` |
| `users/{uid}/config/runningTemplates` | מסמך יחיד | `confirmAddCardioType`, `saveCardioTemplates`, `migrateCardioDataV2` | `types: string[]` (רשימת שמות סוגי אימון אירובי) + שדה נוסף לכל סוג ששמו הוא מפתח, עם מערך `{id, label, fieldType}[]` (`fieldType`: `text`\|`number`\|`checkbox`\|`date`) — מקביל מבנית ל-`config/templates` של הכוח, אבל לשדות דינמיים במקום תרגילים | `07` |
| `users/{uid}/runWorkouts` | אוסף (מסמך לכל אימון אירובי) | `submitCardioData`, `migrateCardioDataV2` | `date` (DD/MM/YYYY), `dateISO` (YYYY-MM-DD), `workoutType: string`, `sessionName: string`, `fields: {id,label,fieldType,value}[]`, `createdAt` | `04`, `07` |

## הערות עיצוב נתונים חשובות

- **שדות "כפולים" לתאריך** (`date` בפורמט `DD/MM/YYYY` לתצוגה + `dateISO` בפורמט `YYYY-MM-DD` למיון/סינון) — דפוס חוזר בכל האוספים עם תאריך, כי Firestore אינו תומך במיון לקסיקוגרפי נכון על תאריכים בפורמט ישראלי רגיל.
- **תרגילים בתוך אימון נשמרים "שטוחים" (denormalized)** — כל תרגיל בהיסטוריה מכיל עותק מלא של שם התרגיל והיעד **בזמן השמירה**, לא הפניה (reference) לתרגיל בתבנית. המשמעות: שינוי מאוחר בתבנית (`03`) לא משנה רטרואקטיבית היסטוריה קיימת — יתרון (שימור נאמן של מה שבאמת קרה) וגם מגבלה (אי אפשר "לתקן" שם תרגיל בכל ההיסטוריה בבת אחת).
- **מעבר סכימה הדרגתי ליעד תרגיל** — קיימים שני דורות של ייצוג יעד תרגיל: ישן (`target`, מחרוזת חופשית כמו `"4x6-8 30 kg"`) וחדש (`targetWeight`/`targetSets`/`targetReps`, שדות נפרדים). התבנית תומכת בשניהם בו-זמנית לפי תרגיל (ראו `02`, `03`) — אין סקריפט הגירה גורף שממיר את כל התרגילים הישנים בבת אחת; ההמרה קורית "עצלנית" (lazy) בכל פעם שמשתמש עורך תרגיל ומוסיף ולו שדה חדש אחד.
- **שדות אירובי (`runWorkouts.fields[]`) גם הם "שטוחים" (denormalized), כמו תרגילי כוח** — כל שדה ברשומה שמור עם `label` משלו **בזמן השמירה**, לא הפניה למזהה בתבנית (`config/runningTemplates`). שינוי מאוחר בתווית שדה דרך עורך התבניות לא משנה רטרואקטיבית איך רשומות ישנות מוצגות בהיסטוריה. מסך ההיסטוריה (`04`) גם מזהה שיאים אישיים לפי **תווית** השדה (למשל "מרחק"), לא לפי `id` — כדי לעבוד גם עם שדות מותאמים-אישית ולא רק שדות ברירת המחדל.
- **אין שדה `updatedAt`** על מסמכי אימון/מדידה — רק `createdAt` (חותמת שרת, `serverTimestamp()`). עריכה (`updateDoc`) לא מתעדת מתי בוצע השינוי.
- **טיפוסי נתונים "רופפים" במתכוון:** משקל/סטים/חזרות/מדידות נשמרים כמחרוזות טקסט (`string`), לא כמספרים — כדי לתמוך בערכים מורכבים כמו `"14+14"` (משקל דו-צדדי) או `"6,6,6,6"` (חזרות משתנות לכל סט). כל חישוב מספרי (למשל בדיקת חריגה מיעד) מבצע `parseFloat`/פירוק בצד הלקוח בזמן הצורך, לא נשען על טיפוס נתונים קבוע ב-DB.

## מה חסר (מבחינת Backend) שכדאי לדעת

- אין Cloud Functions / טריגרים בצד שרת — כל אכיפת חוקים עסקיים (כמו "חייב להישאר סוג אימון אחד") קיימת רק בצד הלקוח ולכן ניתנת לעקיפה טכנית (למשל קריאה ישירה ל-Firestore REST API עם טוקן תקף, מחוץ לאפליקציה).
- אין endpoint אחיד ל"מחיקת כל הנתונים של משתמש" (Right to Erasure) — ראו הערה מקבילה ב-`12-security-and-privacy.md`.
- אין גיבוי/ייצוא נתונים יזום למשתמש (למעט זרימת ההגירה החד-כיוונית מהגרסה הישנה ב-`migrate.html`).
