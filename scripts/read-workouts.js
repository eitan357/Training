/**
 * Prints the first 2 workout documents from test@gmail.com to see the structure.
 * Usage: node scripts/read-workouts.js
 */

const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');
const { getFirestore }        = require('firebase-admin/firestore');

initializeApp({ credential: cert(require(path.join(__dirname, '..', 'service-account-key.json'))) });
const auth = getAuth();
const db   = getFirestore();

async function main() {
  const uid = (await auth.getUserByEmail('test@gmail.com')).uid;
  const snap = await db.collection(`users/${uid}/workouts`).limit(2).get();
  snap.docs.forEach(d => console.log(JSON.stringify({ id: d.id, ...d.data() }, null, 2)));
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
