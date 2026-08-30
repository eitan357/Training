/**
 * Translates all workout history for test@gmail.com from Hebrew to English.
 * - Exercise names translated via map
 * - "קילו" → "kg", "שניות"/"שניה" → "sec" in target strings
 * - Notes cleared (personal Hebrew text)
 * Usage: node scripts/translate-workouts.js
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');
const { getFirestore }        = require('firebase-admin/firestore');

initializeApp({ credential: cert(require(path.join(__dirname, '..', 'service-account-key.json'))) });
const auth = getAuth();
const db   = getFirestore();

const TARGET_EMAIL = 'test@gmail.com';

// ─── Exercise name translation map ──────────────────────────────────────────
const EXERCISE_NAMES = {
  'מתח':                                    'Pull-ups',
  'מתח אקצנטרי':                           'Eccentric Pull-ups',
  'מקבילים':                               'Dips',
  'מקבילים (דיפס)':                        'Dips',
  'דדליפט':                                'Deadlift',
  'דד-ליפט':                               'Deadlift',
  'כפיפת ירך אחורית':                      'Hamstring Curl',
  'יד אחורית - פולי':                      'Tricep Pulldown',
  'יד אחורית':                             'Tricep Extension',
  'בנצ\' פרנס דמבלים שיפוע חיובי':        'Incline Dumbbell Press',
  'בנצ\' פרנס':                            'Bench Press',
  'לחיצת חזה':                             'Bench Press',
  'באק-סקוואט':                            'Back Squat',
  'סקוואט':                                'Squat',
  'לחיצת כתף בישיבה':                      'Seated Shoulder Press',
  'לחיצת כתפיים':                          'Shoulder Press',
  'יד קדמית בישיבה':                       'Seated Bicep Curl',
  'יד קדמית':                              'Bicep Curl',
  'כפיפות מרפק':                           'Bicep Curl',
  'פשיטת מרפק':                            'Tricep Extension',
  'לחיצת רגליים':                          'Leg Press',
  'כפיפות ברכיים':                         'Leg Curl',
  'פשיטת ברכיים':                          'Leg Extension',
  'הרמות עקב':                             'Calf Raise',
  'כפיפות בטן':                            'Crunches',
  'פלאנק':                                 'Plank',
  'פסיעות':                                'Lunges',
  'חתירה':                                 'Row',
  'חתירה בכבל':                            'Cable Row',
  'משיכה לכתפיים':                         'Lat Pulldown',
  'שכיבות סמיכה':                          'Push-ups',
  'דדליפט רומני':                          'Romanian Deadlift',
  'דדליפט רומניים':                        'Romanian Deadlift',
  'חתירה עם מוט':                          'Barbell Row',
  'הרמת רגליים בתלייה':                    'Hanging Leg Raise',
  'פשיטת רגליים':                          'Leg Extension',
  'ריצה':                                  'Running',
  'אליפטיקל':                              'Elliptical',
};

// ─── Target string translation ───────────────────────────────────────────────
function translateTarget(target) {
  if (!target) return target;
  return target
    .replace(/קילו/g, 'kg')
    .replace(/שניות/g, 'sec')
    .replace(/שניה/g, 'sec')
    .replace(/דקות/g, 'min')
    .replace(/חזרות/g, 'reps');
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const uid = (await auth.getUserByEmail(TARGET_EMAIL)).uid;
  console.log(`UID: ${uid}\n`);

  const snap = await db.collection(`users/${uid}/workouts`).get();
  if (snap.empty) { console.log('No workouts found.'); process.exit(0); }

  console.log(`Found ${snap.size} workouts. Translating...`);

  const unmapped = new Set();
  let updated = 0;

  // Process in batches of 400 (Firestore limit is 500)
  const chunks = [];
  for (let i = 0; i < snap.docs.length; i += 400) chunks.push(snap.docs.slice(i, i + 400));

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const doc of chunk) {
      const data = doc.data();
      const exercises = (data.exercises || []).map(ex => {
        const translated = EXERCISE_NAMES[ex.name];
        if (!translated && ex.name) unmapped.add(ex.name);
        return {
          ...ex,
          name:   translated || ex.name,
          target: translateTarget(ex.target),
          notes:  '',
        };
      });
      batch.update(doc.ref, { exercises, sessionName: '' });
      updated++;
    }
    await batch.commit();
  }

  console.log(`✓ ${updated} workouts updated`);

  if (unmapped.size > 0) {
    console.log('\n⚠ Could not translate these exercise names (update EXERCISE_NAMES map):');
    unmapped.forEach(n => console.log('  -', n));
  } else {
    console.log('✓ All exercise names translated successfully');
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
