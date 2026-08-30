/**
 * Reads and prints all translatable text fields from test@gmail.com
 * Usage: node scripts/read-demo-data.js
 */

const path = require('path');
const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');
const { getFirestore }        = require('firebase-admin/firestore');

const TARGET_EMAIL = 'test@gmail.com';

initializeApp({ credential: cert(require(KEY_PATH)) });
const auth = getAuth();
const db   = getFirestore();

async function main() {
  const user = await auth.getUserByEmail(TARGET_EMAIL);
  const uid  = user.uid;
  console.log(`\nUID: ${uid}\n`);

  // ── Templates (exercises) ──────────────────────────────────
  const tmplSnap = await db.doc(`users/${uid}/config/templates`).get();
  if (tmplSnap.exists) {
    const data = tmplSnap.data();
    console.log('=== config/templates ===');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('config/templates: not found');
  }

  // ── Measurement types ──────────────────────────────────────
  const mtSnap = await db.doc(`users/${uid}/config/measurementTypes`).get();
  if (mtSnap.exists) {
    const data = mtSnap.data();
    console.log('\n=== config/measurementTypes ===');
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log('config/measurementTypes: not found');
  }

  // ── Run workout types ──────────────────────────────────────
  const runTypesSnap = await db.collection(`users/${uid}/runWorkoutTypes`).get();
  if (!runTypesSnap.empty) {
    console.log('\n=== runWorkoutTypes ===');
    runTypesSnap.docs.forEach(d => console.log(JSON.stringify({ id: d.id, ...d.data() })));
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
