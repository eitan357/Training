/**
 * Copies all workout/run/measurement data from SOURCE_EMAIL → DEST_EMAIL.
 *
 * Usage:
 *   node scripts/migrate-demo-user.js
 *
 * Prerequisites:
 *   - service-account-key.json in the project root
 *   - npm install firebase-admin
 */

const path = require('path');
const KEY_PATH = path.join(__dirname, '..', 'service-account-key.json');

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }              = require('firebase-admin/auth');
const { getFirestore }         = require('firebase-admin/firestore');

const SOURCE_EMAIL = 'eitan357@gmail.com';
const DEST_EMAIL   = 'test@gmail.com';

initializeApp({ credential: cert(require(KEY_PATH)) });

const auth = getAuth();
const db   = getFirestore();

// ─── helpers ────────────────────────────────────────────────────────────────

async function getUid(email) {
  const user = await auth.getUserByEmail(email);
  return user.uid;
}

async function copyCollection(srcUid, dstUid, collName) {
  const snap = await db.collection(`users/${srcUid}/${collName}`).get();
  if (snap.empty) { console.log(`  ${collName}: 0 docs — skipped`); return; }

  const batch = db.batch();
  snap.docs.forEach(doc => {
    const data = { ...doc.data() };
    if (data.notes) data.notes = null; // clear personal notes for demo
    batch.set(db.doc(`users/${dstUid}/${collName}/${doc.id}`), data);
  });
  await batch.commit();
  console.log(`  ${collName}: ${snap.size} docs copied`);
}

async function copyConfigDoc(srcUid, dstUid, docName) {
  const snap = await db.doc(`users/${srcUid}/config/${docName}`).get();
  if (!snap.exists) { console.log(`  config/${docName}: not found — skipped`); return; }
  await db.doc(`users/${dstUid}/config/${docName}`).set(snap.data());
  console.log(`  config/${docName}: copied`);
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nLooking up users...');
  const [srcUid, dstUid] = await Promise.all([getUid(SOURCE_EMAIL), getUid(DEST_EMAIL)]);
  console.log(`  ${SOURCE_EMAIL} → ${srcUid}`);
  console.log(`  ${DEST_EMAIL}   → ${dstUid}`);

  console.log('\nCopying collections...');
  await copyCollection(srcUid, dstUid, 'workouts');
  await copyCollection(srcUid, dstUid, 'runWorkouts');
  await copyCollection(srcUid, dstUid, 'measurements');

  console.log('\nCopying config docs...');
  await copyConfigDoc(srcUid, dstUid, 'templates');
  await copyConfigDoc(srcUid, dstUid, 'measurementTypes');

  console.log('\nDone! All data copied to', DEST_EMAIL);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
