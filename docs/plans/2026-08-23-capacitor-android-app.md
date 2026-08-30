# תוכנית: המרת Training Diary לאפליקציה Android עם Capacitor

**תאריך:** 23.08.2026  
**מטרה:** הפצת האפליקציה ב-Google Play Store כ-APK נפרד, בו-זמנית עם האתר הקיים  
**גישה:** Capacitor Bundled — קבצי HTML מוטמעים בתוך ה-APK; כל עדכון דורש build ו-release נפרד  

---

## ארכיטקטורה כללית

```
מחסן git אחד (traning/)
│
├── public/                              ← מקור אחד לכל הקוד (HTML/JS/CSS)
│   └── index.html                         מכיל גם את האתר וגם את בסיס האפליקציה
│
├── android/                             ← נוצר על ידי Capacitor (לא לערוך ידנית)
│   └── app/src/main/assets/public/        עותק של public/ שנוצר ע"י `cap sync`
│
├── package.json                         ← חדש — npm project
├── capacitor.config.json                ← חדש — הגדרות Capacitor
├── firebase.json                        ← קיים — לא משתנה
└── .firebaserc                          ← קיים — לא משתנה

Firebase Project: אחד — האתר והאפליקציה משתמשים באותו Auth ו-Firestore
```

**עקרון מרכזי:** `public/` הוא המקור היחיד. `cap sync` מעתיק ממנו ל-android. לא לשנות קבצים ישירות בתוך `android/`.

**הערה על Firebase SDK:** האפליקציה טוענת את Firebase מ-CDN של Google (`gstatic.com`). זה תקין ב-Capacitor — ה-WebView האנדרואידי תומך ב-ESM modules מ-HTTPS. האפליקציה ממילא דורשת אינטרנט לכל פעולה, כך שאין חיסרון.

---

## דרישות מוקדמות

לפני תחילת הפיתוח, ודא שהכל מותקן ומוגדר:

| כלי | גרסה מינימלית | בדיקה |
|---|---|---|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Android Studio | Hedgehog (2023.1) ומעלה | פתח Android Studio |
| JDK | 17 | `java -version` |
| Android SDK | API 24+ (Android 7.0) | Android Studio → SDK Manager |

**חשבונות נדרשים:**
- Google Play Developer Account — תשלום חד-פעמי $25 בכתובת play.google.com/console
- אותו חשבון Google שמנהל את Firebase Project

---

## שלב 1: יצירת npm Project

**מדוע:** Capacitor דורש `package.json` — הפרוייקט כרגע הוא HTML פשוט ללא npm.

```bash
# בתיקיית traning/
npm init -y
```

ערוך את `package.json` שנוצר:

```json
{
  "name": "training-diary",
  "version": "1.0.0",
  "description": "Training Diary Android App",
  "private": true,
  "scripts": {
    "cap:sync":   "npx cap sync android",
    "cap:open":   "npx cap open android",
    "deploy:web": "firebase deploy --only hosting"
  }
}
```

---

## שלב 2: התקנת Capacitor

```bash
npm install @capacitor/core @capacitor/android @capacitor/cli
npm install @capacitor-firebase/authentication
npm install --save-dev @capacitor/assets
```

אתחול Capacitor:

```bash
npx cap init
```

תשובות לשאלות האתחול:
- **App name:** `Training Diary`
- **App ID:** `com.eitanmonsa.trainingdiary`  
  ← שם חבילה ייחודי ב-Play Store. **לא ניתן לשינוי לאחר פרסום.**
- **Web asset directory:** `public`

זה יוצר `capacitor.config.json`. ודא שנראה כך:

```json
{
  "appId": "com.eitanmonsa.trainingdiary",
  "appName": "Training Diary",
  "webDir": "public",
  "plugins": {
    "FirebaseAuthentication": {
      "skipNativeAuth": false,
      "providers": ["google.com"]
    }
  }
}
```

---

## שלב 3: הוספת פלטפורמת Android

```bash
npx cap add android
```

פקודה זו יוצרת את תיקיית `android/` עם פרוייקט Android Studio מלא.

**בדיקה:** ודא שנוצרו:
```
android/
android/app/
android/app/src/main/AndroidManifest.xml
android/app/build.gradle
```

---

## שלב 4: הגדרת Firebase באנדרואיד

### 4.1 — קבלת SHA-1 לdebug

```bash
cd android
./gradlew signingReport
```

העתק את ה-**SHA-1** מתחת לשורה `Variant: debug, Config: debug`.

### 4.2 — רישום Android App ב-Firebase Console

1. פתח Firebase Console → הפרוייקט הקיים
2. Project Settings (⚙️) → "Add app" → Android (אייקון Android)
3. **Android package name:** `com.eitanmonsa.trainingdiary`
4. **App nickname:** Training Diary Android
5. **Debug signing certificate SHA-1:** הדבק את ה-SHA-1 מהשלב הקודם
6. הורד את `google-services.json` שנוצר

### 4.3 — מיקום google-services.json

```bash
# העתק ל:
android/app/google-services.json
```

**חשוב — אל תעלה לgit:**

הוסף ל-`.gitignore`:
```
android/app/google-services.json
*.keystore
*.jks
```

### 4.4 — הפעלת Google Sign-In ב-Firebase Console

Firebase Console → Authentication → Sign-in method → Google → Enable  
הוסף את domain של האתר ל-Authorized domains אם לא קיים כבר.

---

## שלב 5: שינוי Firebase Auth בקוד

### הבעיה

Google חוסמת OAuth redirect בתוך WebViews — זו מדיניות Google נגד phishing. כאשר `handleGoogleLogin()` קוראת ל-`signInWithPopup`, Google מזהה WebView וחוסמת.

### הפתרון — window.Capacitor.Plugins

`@capacitor-firebase/authentication` מרשם את עצמו על `window.Capacitor.Plugins` אוטומטית כשהאפליקציה רצה. לא נדרש bundler — הglobal זמין ישירות.

### השינוי בקוד

מצא ב-`public/index.html` את הפונקציה `handleGoogleLogin` (כרגע בשורה ~1885) והחלף:

**לפני:**
```javascript
async function handleGoogleLogin() {
  try {
    const provider = new GoogleAuthProvider();
    const result   = await signInWithPopup(auth, provider);
    const snap     = await getDoc(doc(db, 'users', result.user.uid, 'config', 'templates'));
    if (!snap.exists()) await initNewUser(result.user.uid);
```

**אחרי:**
```javascript
async function handleGoogleLogin() {
  try {
    let uid;

    if (window.Capacitor?.isNativePlatform()) {
      // ── מסלול אפליקציה (Android) ──────────────────────────────────
      // פותח Chrome Custom Tab נפרד — לא WebView — ולכן Google מאשרת
      const { FirebaseAuthentication } = window.Capacitor.Plugins;
      const result     = await FirebaseAuthentication.signInWithGoogle();
      const idToken    = result.credential?.idToken;
      const credential = GoogleAuthProvider.credential(idToken);
      const fbResult   = await signInWithCredential(auth, credential);
      uid = fbResult.user.uid;
    } else {
      // ── מסלול אתר (web) — קוד מקורי, ללא שינוי ────────────────────
      const provider = new GoogleAuthProvider();
      const result   = await signInWithPopup(auth, provider);
      uid = result.user.uid;
    }

    const snap = await getDoc(doc(db, 'users', uid, 'config', 'templates'));
    if (!snap.exists()) await initNewUser(uid);
```

**השפעה על האתר:** אפס. `window.Capacitor` אינו מוגדר בדפדפן רגיל — הקוד תמיד נכנס למסלול `else`.

**Import נוסף נדרש:** הוסף `signInWithCredential` לשורת ה-import של firebase-auth בראש הקובץ:

```javascript
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
         createUserWithEmailAndPassword, GoogleAuthProvider,
         signInWithPopup, signInWithCredential,   // ← הוסף signInWithCredential
         signOut, sendPasswordResetEmail }
  from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
```

### הגדרת AndroidManifest.xml

פתח `android/app/src/main/AndroidManifest.xml` והוסף בתוך `<activity>`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="com.eitanmonsa.trainingdiary" />
</intent-filter>
```

### הערה על Service Worker

`public/index.html` רושם `sw.js`:
```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
```

ב-Capacitor, Service Workers לא רצים (אין HTTPS origin מקומי). הרישום ייכשל בשקט בגלל `.catch(() => {})`. **לא נדרש שינוי** — ה-SW מיועד לPWA caching ואינו קריטי לאפליקציה.

---

## שלב 6: הכנת Icons ו-Splash Screen

### הכן את קבצי המקור

```
resources/
  icon.png        ← 1024×1024 px, PNG עם רקע (לא שקוף)
  splash.png      ← 2732×2732 px, PNG (רקע + לוגו מרכזי)
```

### הרץ את הgenerator

```bash
npx capacitor-assets generate --android
```

הפקודה מייצרת אוטומטית את כל הגדלים ומניחה אותם ב-`android/`.

---

## שלב 7: הגדרת Build

### 7.1 — android/app/build.gradle

ודא שהשדות הבאים נכונים ב-`defaultConfig`:

```gradle
android {
  defaultConfig {
    applicationId "com.eitanmonsa.trainingdiary"
    minSdkVersion 24        // Android 7.0 — תומך ב-97% מהמכשירים
    targetSdkVersion 34
    versionCode 1           // מספר שלם — עולה ב-1 לכל Play Store release
    versionName "1.0.0"     // גרסה שהמשתמש רואה
  }
}
```

### 7.2 — יצירת Keystore לחתימה (הכי קריטי)

**הKeystore הוא המפתח הפרטי של האפליקציה. אם אובד — לא ניתן לעדכן לעולם.**

```bash
# הרץ מחוץ לתיקיית הפרוייקט (לא בתוך git)
keytool -genkey -v \
  -keystore ~/training-diary-release.keystore \
  -alias training-diary \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

שמור את הפרטים הבאים במקום מאובטח (מנהל סיסמאות / Google Drive):
- נתיב הקובץ
- store password
- key password
- key alias

### 7.3 — הגדרת חתימה בלי hardcode

**לא לכתוב סיסמאות ישירות ב-build.gradle.** במקום, הוסף ל-`~/.gradle/gradle.properties`:

```properties
TRAINING_DIARY_STORE_FILE=/Users/<username>/training-diary-release.keystore
TRAINING_DIARY_STORE_PASSWORD=הסיסמה_שהגדרת
TRAINING_DIARY_KEY_ALIAS=training-diary
TRAINING_DIARY_KEY_PASSWORD=הסיסמה_שהגדרת
```

ב-`android/app/build.gradle`:

```gradle
android {
  signingConfigs {
    release {
      storeFile     file(TRAINING_DIARY_STORE_FILE)
      storePassword TRAINING_DIARY_STORE_PASSWORD
      keyAlias      TRAINING_DIARY_KEY_ALIAS
      keyPassword   TRAINING_DIARY_KEY_PASSWORD
    }
  }
  buildTypes {
    release {
      signingConfig   signingConfigs.release
      minifyEnabled   false
    }
  }
}
```

### 7.4 — הוספת SHA-1 של Release Keystore לFirebase

```bash
keytool -list -v \
  -keystore ~/training-diary-release.keystore \
  -alias training-diary
```

העתק את ה-SHA-1 → Firebase Console → Project Settings → Android App → Add fingerprint.

**מדוע:** Firebase Auth מאמת את חתימת ה-APK. בלי זה, Google Sign-In ייכשל בbuild הrelease.

---

## שלב 8: סנכרון Capacitor

**חשוב: השתמש ב-`sync` (לא `copy`).**  
`cap copy` מעתיק רק web assets.  
`cap sync` מעתיק web assets + מעדכן plugins נייטיביים (כולל `@capacitor-firebase/authentication`).

```bash
npx cap sync android
```

---

## שלב 9: Build ראשון לבדיקה (Debug)

```bash
npx cap open android
```

ב-Android Studio:
1. המתן ל-Gradle sync לסיים (~2 דקות)
2. חבר מכשיר Android (API 24+) או פתח emulator
3. לחץ **Run** (▶)

**רשימת בדיקות חובה:**

- [ ] האפליקציה נפתחת ומציגה מסך login
- [ ] Google Sign-In פותח **Chrome Custom Tab** (חלון Chrome נפרד — לא WebView)
- [ ] לאחר login, ניווט ל-dashboard עובד
- [ ] עמוד אימון — נתונים מוצגים ללא טעינה נראית
- [ ] עמוד ריצה — הפרה-פץ' עובד (מהיר בכניסה)
- [ ] Timer wheel — גלילה חלקה ואינסופית
- [ ] שמירת אימון חדש — מתעדכן בFirestore ובdashboard
- [ ] logout ו-login חוזר עובדים

---

## שלב 10: Build לפרסום (Release AAB)

Android Studio → **Build → Generate Signed Bundle / APK**:

1. בחר **Android App Bundle** (פורמט AAB — חובה ב-Play Store)
2. בחר את הKeystore
3. הזן סיסמאות (או אמת שהן ב-gradle.properties)
4. בחר `release` variant
5. לחץ **Finish**

הקובץ נוצר ב:
```
android/app/release/app-release.aab
```

---

## שלב 11: העלאה ל-Google Play Store

### 11.1 — יצירת App ב-Play Console

1. [play.google.com/console](https://play.google.com/console) → **Create app**
2. App name: `Training Diary`
3. Default language: Hebrew (iw)
4. App or game: **App**
5. Free or paid: **Free**

### 11.2 — Store Listing

| קטגוריה | נדרש |
|---|---|
| App name | Training Diary |
| Short description | עד 80 תווים |
| Full description | עד 4000 תווים |
| Icon | 512×512 PNG |
| Feature graphic | 1024×500 PNG |
| Screenshots | מינימום 2 (phone) |
| Category | Health & Fitness |

### 11.3 — Privacy Policy (חובה)

כיוון שהאפליקציה מבצעת login ושומרת נתונים אישיים, Google מחייבת דף Privacy Policy.

**פתרון:** צור `public/privacy.html` בסיסי והפעל עם Firebase Hosting:
```
https://training-diary.web.app/privacy
```

### 11.4 — Data Safety Section

הצהרת נתונים הנדרשת לplay store:

| נתון | מאסוף? | מוצפן? | ניתן למחיקה? |
|---|---|---|---|
| Account info (email, name) | כן | כן (Firebase) | כן |
| Fitness data (workouts) | כן | כן (Firestore) | כן |
| Device or other IDs | לא | — | — |

### 11.5 — Content Rating

Play Console → Content rating → שאלון → Submit.  
האפליקציה תקבל דירוג **Everyone**.

### 11.6 — העלאת AAB ו-Submit

Play Console → Production → Create new release → Upload AAB → Review and Publish

**זמן review:** 1-3 ימי עסקים בפעם הראשונה.

---

## תהליך עדכון שוטף (לאחר הפרסום)

### עדכון לאתר בלבד
```bash
# ערוך public/index.html
firebase deploy --only hosting
# האתר חי מיידית. האפליקציה לא מושפעת.
```

### עדכון לאפליקציה (ולאתר)
```bash
# 1. ערוך public/index.html

# 2. העלה גרסת אתר
firebase deploy --only hosting

# 3. עדכן versionCode ו-versionName ב-android/app/build.gradle
#    versionCode X+1    ← חובה, ייכשל בלי זה
#    versionName "X.Y.Z"

# 4. סנכרן assets ל-Android
npx cap sync android

# 5. Build AAB ב-Android Studio
#    Build → Generate Signed Bundle → release

# 6. העלה ל-Play Console
#    Production → Create new release → Upload AAB
#    Submit → Google review (1-3 ימים)
```

---

## אבטחה — סיכום כללים

| נושא | כלל |
|---|---|
| `google-services.json` | לא ב-git. שמור בנפרד. |
| `*.keystore` | לא ב-git. גיבוי ב-2 מקומות (Google Drive + דיסק חיצוני). |
| סיסמאות Keystore | ב-`~/.gradle/gradle.properties` — לא ב-`build.gradle`. |
| App ID / Package name | `com.eitanmonsa.trainingdiary` — לא ניתן לשינוי אחרי פרסום. |
| versionCode | רק עולה, לעולם לא יורד. |
| SHA-1 | הוסף גם SHA-1 של release keystore לFirebase Console (שלב 7.4). |

---

## שאלות פתוחות

1. **App ID:** `com.eitanmonsa.trainingdiary` — מתאים?
2. **Icon:** יש PNG ב-1024×1024 מוכן?
3. **Privacy Policy:** היכן להציב? (המלצה: `public/privacy.html` עם Firebase Hosting)

---

## סדר ביצוע מלא

```
שלב 1  ─ npm init + package.json
שלב 2  ─ npm install capacitor + @capacitor-firebase/authentication
שלב 3  ─ npx cap add android
שלב 4  ─ Firebase Console: רישום Android + google-services.json + SHA-1 debug
שלב 5  ─ שינוי handleGoogleLogin() + import signInWithCredential + AndroidManifest.xml
שלב 6  ─ icons: resources/icon.png + npx capacitor-assets generate
שלב 7  ─ build.gradle (versionCode) + יצירת keystore + gradle.properties + SHA-1 release לFirebase
שלב 8  ─ npx cap sync android
שלב 9  ─ Android Studio: build debug + בדיקה על מכשיר
שלב 10 ─ Android Studio: build release AAB
שלב 11 ─ Play Console: listing + privacy policy + data safety + submit
```

**הערכת זמן:** 1-2 ימים עד APK עובד על מכשיר; יום נוסף לPlay Store listing; 1-3 ימים לאישור Google.
