/**
 * Translates test@gmail.com Firestore data from Hebrew to English.
 * Usage: node scripts/translate-to-english.js
 */

const path = require('path');
const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');
const { getFirestore }        = require('firebase-admin/firestore');

initializeApp({ credential: cert(require(KEY_PATH)) });
const auth = getAuth();
const db   = getFirestore();

const TARGET_EMAIL = 'test@gmail.com';

// ─── Translation maps ────────────────────────────────────────────────────────

const TEMPLATES = {
  B: [
    { name: 'Eccentric Pull-ups',        target: '4x4 8s',            id: '940A17FB8C5D' },
    { name: 'Dips',                       target: '2x1 + 2x4 8 sec',   id: '88D27FE2F40E' },
    { name: 'Deadlift',                   target: '4x6-8 40 kg',       id: 'F1FC01E34717' },
    { name: 'Hamstring Curl',             target: '2×10-12',           id: 'A44F615AD48F' },
    { name: 'Tricep Pulldown',            target: '4x8-12',            id: '5554100F0702' },
  ],
  A: [
    { name: 'Pull-ups',                   target: '4x2',               id: '68DD2C4CFDEF' },
    { name: 'Incline Dumbbell Press',     target: '4x6-8 14 kg',       id: 'C8687C249DE2' },
    { name: 'Back Squat',                 target: '4x6-8 30 kg',       id: '8737066DEBB4' },
    { name: 'Seated Shoulder Press',      target: '4x10-12 12 kg',     id: '5802048497E0' },
    { name: 'Seated Bicep Curl',          target: '4×8-12 8 kg',       id: '8461438BBCCA' },
  ],
  types: ['A', 'B'],
};

const MEASUREMENT_TYPES = {
  types: [
    { id: '4753D7D4A55B', name: 'Weight',    unit: 'kg' },
    { id: '5C2889167DCA', name: 'Chest',     unit: 'cm' },
    { id: 'A3EE3BF40913', name: 'Shoulders', unit: 'cm' },
    { id: 'F91FE88C170B', name: 'Arms',      unit: 'cm' },
    { id: 'C3C6B578DC5A', name: 'Thighs',   unit: 'cm' },
    { id: '7F8E109CD393', name: 'Calves',    unit: 'cm' },
    { id: '16D866CBF087', name: 'Waist',     unit: 'cm' },
    { id: 'C8EB918DB1F9', name: 'Glutes',    unit: 'cm' },
  ],
};

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const user = await auth.getUserByEmail(TARGET_EMAIL);
  const uid  = user.uid;
  console.log(`UID: ${uid}`);

  await db.doc(`users/${uid}/config/templates`).set(TEMPLATES);
  console.log('✓ templates updated');

  await db.doc(`users/${uid}/config/measurementTypes`).set(MEASUREMENT_TYPES);
  console.log('✓ measurementTypes updated');

  // Update running workout types if they exist
  const runTypesSnap = await db.collection(`users/${uid}/runWorkoutTypes`).get();
  if (!runTypesSnap.empty) {
    const nameMap = { 'ריצה': 'Running', 'אליפטיקל': 'Elliptical', 'Running': 'Running', 'Elliptical': 'Elliptical' };
    for (const doc of runTypesSnap.docs) {
      const current = doc.data().name;
      const english = nameMap[current];
      if (english && english !== current) {
        await doc.ref.update({ name: english });
        console.log(`✓ runWorkoutType: ${current} → ${english}`);
      }
    }
  }

  console.log('\nDone!');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
