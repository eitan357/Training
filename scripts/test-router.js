// scripts/test-router.js
// Run: node scripts/test-router.js
//
// ROUTES is duplicated here (not imported) — public/index.html has no
// module boundary a plain Node script can import from. Keep this table
// in sync with the ROUTES constant in public/index.html by hand; a
// mismatch here would only catch itself if the app's own Playwright
// suite (tests/navigation.spec.ts) also fails, which is the real source
// of truth for behavior. This script exists to pin the routing contract
// down cheaply, the same way scripts/test-parse-target.js pins parsing.

const ROUTES = {
  '/':                           { section: 'main' },
  '/timer':                      { section: 'timer' },
  '/measurements':               { section: 'measurements' },
  '/running':                    { section: 'running', runSubView: null },
  '/history':                    { section: 'history' },
  '/settings':                   { section: 'settings' },
  '/settings/workout-plan':      { section: 'main', editPanel: 'workout' },
  '/settings/measurement-types': { section: 'measurements', editPanel: 'measurementTypes' },
  '/running/add':                { section: 'running', runSubView: 'add', runStep: 1 },
  '/running/history':            { section: 'running', runSubView: 'history' },
};

function resolveRoute(path) {
  return ROUTES[path] || null;
}

// ─── Tests ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
  ok ? passed++ : failed++;
}

eq('root resolves to main',                 resolveRoute('/'),                           { section: 'main' });
eq('unknown path resolves to null',         resolveRoute('/nope'),                       null);
eq('workout-plan carries editPanel',        resolveRoute('/settings/workout-plan'),      { section: 'main', editPanel: 'workout' });
eq('measurement-types carries editPanel',   resolveRoute('/settings/measurement-types'), { section: 'measurements', editPanel: 'measurementTypes' });
eq('running/add carries wizard defaults',   resolveRoute('/running/add'),                { section: 'running', runSubView: 'add', runStep: 1 });
eq('running/history carries subview',       resolveRoute('/running/history'),            { section: 'running', runSubView: 'history' });
eq('trailing slash is NOT normalized (documents current strictness)', resolveRoute('/timer/'), null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
