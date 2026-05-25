// ══════════════════════════════════════════════════════════════════
//  translations.js — Single source of truth for all app UI text
//
//  To add a new language:
//    1. Add an entry to LANGUAGES (label shown in selector, dir, locale)
//    2. Copy the entire 'en' block in TRANSLATIONS, rename the key,
//       and translate all values.
//    3. That's it — the language selector in Settings updates automatically.
//
//  Key naming convention:  section.description
//  e.g.  'nav.workout', 'btn.save', 'meas.date_label'
// ══════════════════════════════════════════════════════════════════

export const LANGUAGES = {
  he: { label: 'עברית',  dir: 'rtl', locale: 'he' },
  en: { label: 'English', dir: 'ltr', locale: 'en' },

  // ── To add Arabic, uncomment and add a matching block in TRANSLATIONS:
  // ar: { label: 'عربي', dir: 'rtl', locale: 'ar' },
};

export const TRANSLATIONS = {

  // ────────────────────────────────────────────────────────────────
  //  HEBREW
  // ────────────────────────────────────────────────────────────────
  he: {

    // ── Navigation ────────────────────────────────────────────────
    'nav.workout':        'אימון',
    'nav.timer':          'טיימר',
    'nav.measurements':   'מדידות',
    'nav.history':        'היסטוריה',

    // ── Page titles ───────────────────────────────────────────────
    'title.workout':      'יומן האימון 💪',
    'title.timer':        'טיימר ⏱️',
    'title.measurements': 'מדידות 📏',
    'title.history':      'היסטוריה 📊',
    'title.settings':     'הגדרות ⚙️',

    // ── General buttons ───────────────────────────────────────────
    'btn.logout':         'יציאה',
    'btn.back':           '← חזרה',
    'btn.save':           'שמור',
    'btn.add':            'הוסף',
    'btn.cancel':         'ביטול',
    'btn.delete_confirm': 'מחק?',

    // ── Timer ─────────────────────────────────────────────────────
    'btn.timer_start':   '▶ התחל',
    'btn.timer_pause':   '⏸ השהה',
    'btn.timer_resume':  '▶ המשך',
    'btn.timer_reset':   '↺ איפוס',
    'btn.timer_set':     'הגדר',
    'timer.min':         'דקות',
    'timer.sec':         'שניות',
    'timer.total':       'סה״כ',
    'timer.done_toast':  '⏰ זמן המנוחה הסתיים!',
    'timer.done_notif':  'זמן המנוחה הסתיים! חזור לאימון 💪',
    'timer.allow_notif': 'אפשר התראות לקבל הודעה כשהזמן מסתיים',
    'timer.sound':       'צליל בסוף',

    // ── Workout ───────────────────────────────────────────────────
    'btn.save_workout':        'שמור אימון',
    'btn.add_exercise':        '+ הוסף תרגיל',
    'btn.copy_last':           '📋 העתקת אימון אחרון',
    'workout.name_label':      'שם האימון',
    'workout.name_ph':         'שם האימון',
    'workout.name_last_ph':    'אחרון: ',
    'workout.name_default_ph': 'שם האימון (ראשון, שני, דלואד...)',
    'workout.badge':           'אימון',
    'workout.exercises':       'תרגילים',
    'workout.sessions':        'אימונים',
    'workout.no_results':      'אין אימונים להצגה',
    'workout.saved_ok':        'האימון נשמר בהצלחה!',
    'workout.fill_first':      'מלא נתונים לפני השמירה.',
    'copy.success':            'תרגילים הועתקו מ-',
    'copy.from':               '',

    // ── Exercise card fields ──────────────────────────────────────
    'col.exercise': 'תרגיל',
    'col.weight':   'משקל',
    'col.sets':     'סטים',
    'col.reps':     'חזרות',
    'col.notes':    'הערות',
    'ex.notes_ph':  'הוסף הערה...',
    'filter.all':   'הכל',

    // ── History preview ───────────────────────────────────────────
    'preview.last': '📋 אימון אחרון',

    // ── Session inline edit ───────────────────────────────────────
    'sess.name_label': 'שם האימון',
    'sess.name_ph':    'שם האימון',
    'sess.save_btn':   'שמור שינויים',
    'sess.cancel_btn': 'ביטול',
    'sess.saved_ok':   'האימון עודכן בהצלחה',
    'sess.deleted_ok': 'האימון נמחק',
    'sess.notes_ph':   'הערות...',

    // ── Workout template editor ───────────────────────────────────
    'edit.save':         '💾 שמור שינויים',
    'edit.add_exercise': '+ הוסף תרגיל',
    'edit.add_type_ph':  'שם האימון (C, D, כוח...)',
    'edit.no_exercises': 'אין תרגילים. לחץ "+ הוסף תרגיל".',
    'edit.ex_name_ph':   'שם תרגיל',
    'edit.ex_target_ph': 'יעד (3 X 8-10)',
    'edit.type_exists':  'סוג אימון זה כבר קיים',
    'edit.type_added':   'סוג אימון נוסף',
    'edit.type_removed': 'סוג הוסר — שמור כדי לשמר את השינוי',
    'edit.min_one_type': 'חייב להישאר לפחות סוג אימון אחד',
    'edit.saved_ok':     'תבניות האימון נשמרו בהצלחה',
    'edit.no_items':     'אין תרגילים לשמור.',

    // ── Measurements ──────────────────────────────────────────────
    'meas.add_title':     'הוסף מדידה חדשה',
    'meas.add_sub':       'מלא רק את השדות שרצית למדוד',
    'meas.date_label':    'תאריך',
    'meas.date_field':    'תאריך המדידה',
    'meas.save':          'שמור מדידה',
    'meas.history':       'היסטוריית מדידות',
    'meas.types_label':   'סוגי מדידות',
    'meas.circumferences':'היקפים',
    'meas.no_circ':       'אין היקפים נרשמו',
    'meas.empty':         'עדיין אין מדידות',
    'meas.count':         'מדידות',
    'meas.date_required': 'הזן תאריך בפורמט DD/MM/YYYY.',
    'meas.fill_one':      'מלא לפחות שדה אחד.',
    'meas.saved_ok':      'המדידה נשמרה בהצלחה',
    'meas.deleted_ok':    'המדידה נמחקה',
    'meas.name_ph':       'שם המדידה',
    'meas.unit_ph':       'יחידה',
    'meas.default_unit':  'ס"מ',

    // ── Measurement types editor ──────────────────────────────────
    'types.save':     '💾 שמור סוגי מדידות',
    'types.add':      '+ הוסף סוג מדידה',
    'types.min_one':  'הוסף לפחות סוג מדידה אחד.',
    'types.unique':   'שמות חייבים להיות ייחודיים.',
    'types.saved_ok': 'סוגי המדידות נשמרו בהצלחה',

    // ── Bulk delete ───────────────────────────────────────────────
    'bulk.selected':   'נבחרו',
    'bulk.delete_btn': 'מחק נבחרים',
    'bulk.edit_btn':   'ערוך',
    'bulk.deleted':    'נמחקו',

    // ── Settings ──────────────────────────────────────────────────
    'settings.section.edit':      'עריכה',
    'settings.section.profile':   'פרופיל',
    'settings.section.appearance':'מראה',
    'settings.section.timer':     'טיימר',
    'settings.timer_sound':       'צליל בסוף טיימר',
    'settings.timer_sound_sub':   'השמע צליל כאשר הטיימר מסתיים',
    'settings.workout_edit':      'עריכת תוכנית אימונים',
    'settings.workout_edit_sub':  'הוסף, הסר וערוך סוגי אימון ותרגילים',
    'settings.meas_edit':         'עריכת סוגי מדידות',
    'settings.meas_edit_sub':     'הוסף והסר סוגי מדידה',
    'settings.display_name':      'שם תצוגה',
    'settings.display_name_ph':   'יופיע בכותרת...',
    'settings.dark_mode':         'מצב לילה',
    'settings.language':          'שפה',
    'display_name_saved':         'שם תצוגה עודכן',

    // ── Auth screen ───────────────────────────────────────────────
    'auth.title':          'יומן האימון 💪',
    'auth.sub':            'התחבר כדי לגשת לנתונים שלך',
    'auth.tab_login':      'התחברות',
    'auth.tab_register':   'הרשמה',
    'auth.email_ph':       'כתובת מייל',
    'auth.pass_ph':        'סיסמה (לפחות 6 תווים)',
    'auth.submit_login':   'כניסה',
    'auth.submit_register':'הרשמה',
    'auth.forgot':         'שכחתי סיסמה',
    'auth.or':             'או',
    'auth.google':         'כניסה עם Google',
    'auth.reset_sent':     '✓ קישור איפוס נשלח למייל!',
    'auth.fill_email_pass':'נא למלא מייל וסיסמה',
    'auth.fill_email':     'הזן מייל לאיפוס הסיסמה',
    'auth.loading':        'טוען נתונים...',

    // ── Firebase errors ───────────────────────────────────────────
    'err.user_not_found':     'לא נמצא משתמש עם מייל זה',
    'err.wrong_password':     'סיסמה שגויה',
    'err.invalid_credential': 'מייל או סיסמה שגויים',
    'err.email_in_use':       'מייל זה כבר רשום',
    'err.weak_password':      'סיסמה חלשה מדי (לפחות 6 תווים)',
    'err.invalid_email':      'כתובת מייל לא תקינה',
    'err.too_many':           'יותר מדי ניסיונות — נסה שוב מאוחר יותר',
    'err.popup_closed':       'החלון נסגר לפני השלמת הכניסה',
    'err.network':            'בעיית חיבור לאינטרנט',
    'err.unauth_domain':      'הדומיין לא מורשה ב-Firebase Console',
    'err.prefix':             'שגיאה: ',

    // ── General ───────────────────────────────────────────────────
    'loading':      'טוען...',
    'saving':       'שומר...',
    'app.loading':  'טוען נתונים...',
    'error.load':   'שגיאה בטעינת הנתונים: ',
    'error.update': 'שגיאה בעדכון הנתונים: ',
    'error.save':   'שגיאה: ',
  },

  // ────────────────────────────────────────────────────────────────
  //  ENGLISH
  // ────────────────────────────────────────────────────────────────
  en: {

    // ── Navigation ────────────────────────────────────────────────
    'nav.workout':        'Workout',
    'nav.timer':          'Timer',
    'nav.measurements':   'Measures',
    'nav.history':        'History',

    // ── Page titles ───────────────────────────────────────────────
    'title.workout':      'Training Diary 💪',
    'title.timer':        'Timer ⏱️',
    'title.measurements': 'Measurements 📏',
    'title.history':      'History 📊',
    'title.settings':     'Settings ⚙️',

    // ── General buttons ───────────────────────────────────────────
    'btn.logout':         'Sign out',
    'btn.back':           'Back →',
    'btn.save':           'Save',
    'btn.add':            'Add',
    'btn.cancel':         'Cancel',
    'btn.delete_confirm': 'Delete?',

    // ── Timer ─────────────────────────────────────────────────────
    'btn.timer_start':   '▶ Start',
    'btn.timer_pause':   '⏸ Pause',
    'btn.timer_resume':  '▶ Resume',
    'btn.timer_reset':   '↺ Reset',
    'btn.timer_set':     'Set',
    'timer.min':         'Minutes',
    'timer.sec':         'Seconds',
    'timer.total':       'Total',
    'timer.done_toast':  '⏰ Rest time is over!',
    'timer.done_notif':  'Rest time is over! Back to training 💪',
    'timer.allow_notif': 'Allow notifications to be alerted when time is up',
    'timer.sound':       'Sound at end',

    // ── Workout ───────────────────────────────────────────────────
    'btn.save_workout':        'Save Workout',
    'btn.add_exercise':        '+ Add Exercise',
    'btn.copy_last':           '📋 Copy last workout',
    'workout.name_label':      'Workout Name',
    'workout.name_ph':         'Workout Name',
    'workout.name_last_ph':    'Last: ',
    'workout.name_default_ph': 'Workout name (Push, Pull, Deload...)',
    'workout.badge':           'Workout',
    'workout.exercises':       'exercises',
    'workout.sessions':        'workouts',
    'workout.no_results':      'No workouts to display',
    'workout.saved_ok':        'Workout saved!',
    'workout.fill_first':      'Fill in data before saving.',
    'copy.success':            'exercises copied from',
    'copy.from':               '',

    // ── Exercise card fields ──────────────────────────────────────
    'col.exercise': 'Exercise',
    'col.weight':   'Weight',
    'col.sets':     'Sets',
    'col.reps':     'Reps',
    'col.notes':    'Notes',
    'ex.notes_ph':  'Add note...',
    'filter.all':   'All',

    // ── History preview ───────────────────────────────────────────
    'preview.last': '📋 Last Workout',

    // ── Session inline edit ───────────────────────────────────────
    'sess.name_label': 'Workout Name',
    'sess.name_ph':    'Workout Name',
    'sess.save_btn':   'Save Changes',
    'sess.cancel_btn': 'Cancel',
    'sess.saved_ok':   'Workout updated',
    'sess.deleted_ok': 'Workout deleted',
    'sess.notes_ph':   'Notes...',

    // ── Workout template editor ───────────────────────────────────
    'edit.save':         '💾 Save Changes',
    'edit.add_exercise': '+ Add Exercise',
    'edit.add_type_ph':  'Workout name (C, D, Strength...)',
    'edit.no_exercises': 'No exercises. Tap "+ Add Exercise".',
    'edit.ex_name_ph':   'Exercise name',
    'edit.ex_target_ph': 'Target (3 X 8-10)',
    'edit.type_exists':  'This workout type already exists',
    'edit.type_added':   'Workout type added',
    'edit.type_removed': 'Type removed — save to keep',
    'edit.min_one_type': 'Must keep at least one workout type',
    'edit.saved_ok':     'Workout templates saved',
    'edit.no_items':     'No exercises to save.',

    // ── Measurements ──────────────────────────────────────────────
    'meas.add_title':     'Add New Measurement',
    'meas.add_sub':       'Fill only the fields you want to measure',
    'meas.date_label':    'Date',
    'meas.date_field':    'Measurement Date',
    'meas.save':          'Save Measurement',
    'meas.history':       'Measurement History',
    'meas.types_label':   'Measurement Types',
    'meas.circumferences':'Circumferences',
    'meas.no_circ':       'No circumferences recorded',
    'meas.empty':         'No measurements yet',
    'meas.count':         'measurements',
    'meas.date_required': 'Enter date in DD/MM/YYYY format.',
    'meas.fill_one':      'Fill at least one field.',
    'meas.saved_ok':      'Measurement saved',
    'meas.deleted_ok':    'Measurement deleted',
    'meas.name_ph':       'Measurement name',
    'meas.unit_ph':       'Unit',
    'meas.default_unit':  'cm',

    // ── Measurement types editor ──────────────────────────────────
    'types.save':     '💾 Save Types',
    'types.add':      '+ Add Measurement Type',
    'types.min_one':  'Add at least one measurement type.',
    'types.unique':   'Names must be unique.',
    'types.saved_ok': 'Measurement types saved',

    // ── Bulk delete ───────────────────────────────────────────────
    'bulk.selected':   'selected',
    'bulk.delete_btn': 'Delete selected',
    'bulk.edit_btn':   'Edit',
    'bulk.deleted':    'deleted',

    // ── Settings ──────────────────────────────────────────────────
    'settings.section.edit':      'Edit',
    'settings.section.profile':   'Profile',
    'settings.section.appearance':'Appearance',
    'settings.section.timer':     'Timer',
    'settings.timer_sound':       'Sound at end of timer',
    'settings.timer_sound_sub':   'Play a sound when the timer finishes',
    'settings.workout_edit':      'Edit Workout Plan',
    'settings.workout_edit_sub':  'Add, remove and edit workout types and exercises',
    'settings.meas_edit':         'Edit Measurement Types',
    'settings.meas_edit_sub':     'Add and remove measurement types',
    'settings.display_name':      'Display Name',
    'settings.display_name_ph':   'Shown in header...',
    'settings.dark_mode':         'Dark Mode',
    'settings.language':          'Language',
    'display_name_saved':         'Display name updated',

    // ── Auth screen ───────────────────────────────────────────────
    'auth.title':          'Training Diary 💪',
    'auth.sub':            'Sign in to access your data',
    'auth.tab_login':      'Sign In',
    'auth.tab_register':   'Register',
    'auth.email_ph':       'Email address',
    'auth.pass_ph':        'Password (at least 6 chars)',
    'auth.submit_login':   'Sign In',
    'auth.submit_register':'Register',
    'auth.forgot':         'Forgot password',
    'auth.or':             'or',
    'auth.google':         'Sign in with Google',
    'auth.reset_sent':     '✓ Reset link sent to email!',
    'auth.fill_email_pass':'Please fill in email and password',
    'auth.fill_email':     'Enter email to reset password',
    'auth.loading':        'Loading data...',

    // ── Firebase errors ───────────────────────────────────────────
    'err.user_not_found':     'No user found with this email',
    'err.wrong_password':     'Incorrect password',
    'err.invalid_credential': 'Invalid email or password',
    'err.email_in_use':       'Email already registered',
    'err.weak_password':      'Password too weak (min 6 chars)',
    'err.invalid_email':      'Invalid email address',
    'err.too_many':           'Too many attempts — try again later',
    'err.popup_closed':       'Window closed before sign in completed',
    'err.network':            'Network connection error',
    'err.unauth_domain':      'Domain not authorized in Firebase Console',
    'err.prefix':             'Error: ',

    // ── General ───────────────────────────────────────────────────
    'loading':      'Loading...',
    'saving':       'Saving...',
    'app.loading':  'Loading data...',
    'error.load':   'Error loading data: ',
    'error.update': 'Error updating data: ',
    'error.save':   'Error: ',
  },

  // ────────────────────────────────────────────────────────────────
  //  ADD NEW LANGUAGE BELOW
  //  1. Add entry in LANGUAGES above
  //  2. Copy 'en' block, rename key, translate values
  // ────────────────────────────────────────────────────────────────
};
