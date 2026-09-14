// scripts/force-delete-test-user.js
//
// Test-only safety net for tests/settings.spec.ts's destructive
// round-trip test (Task 6 of docs/superpowers/plans/
// 2026-09-14-privacy-data-deletion.md). That test registers a brand-new
// disposable account and deletes it through the real in-app UI — this
// script is the belt-and-braces cleanup that guarantees the disposable
// account never survives as orphaned junk in production if the in-app
// deletion path itself is what's broken. No-ops (exit 0) if the account
// is already gone, since that's the expected outcome on a passing test.
//
// Usage: node scripts/force-delete-test-user.js <email>
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth }             = require('firebase-admin/auth');

const email = process.argv[2];
if (!email) { console.error('Usage: node scripts/force-delete-test-user.js <email>'); process.exit(1); }

initializeApp({ credential: cert(require(path.join(__dirname, '..', 'service-account-key.json.json'))) });

getAuth().getUserByEmail(email)
  .then(user => getAuth().deleteUser(user.uid))
  .then(() => { console.log(`Deleted ${email}`); process.exit(0); })
  .catch(err => {
    if (err.code === 'auth/user-not-found') { console.log(`${email} already gone`); process.exit(0); }
    console.error(err);
    process.exit(1);
  });
