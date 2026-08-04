// scripts/test-parse-target.js
// Run: node scripts/test-parse-target.js

function minOfRange(str) {
  if (!str) return null;
  str = str.trim();
  const m = str.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (m) return Math.min(parseFloat(m[1]), parseFloat(m[2]));
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function parseTargetString(targetStr) {
  if (!targetStr || !targetStr.trim()) return null;
  let t = targetStr.trim();

  // 1. Extract weight
  let weight = null;
  const wm = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|קילו)(?=\s|$)/i);
  if (wm) {
    weight = String(parseFloat(wm[1].replace(',', '.')));
    t = t.replace(wm[0], '').trim();
  }

  // Strip duration tokens
  t = t.replace(/\d+\s*(?:sec|שניות|שניה|min|דקות|\bs\b)/gi, '').trim();

  let repsArr = null;

  // 2. Labeled format: "סטים: 2,2, חזרות: 4-8,8-12" or "sets: 3, reps: 8"
  const setsLabelM = t.match(/(?:סטים|sets)\s*:\s*([\d,\s]+)/i);
  const repsLabelM = t.match(/(?:חזרות|reps)\s*:\s*([\d,\-\s]+)/i);
  if (repsLabelM) {
    const repsParts = repsLabelM[1].split(',').map(s => s.trim()).filter(Boolean);
    if (setsLabelM) {
      const setsCounts = setsLabelM[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      if (setsCounts.length > 0 && repsParts.length > 0) {
        repsArr = [];
        if (repsParts.length === 1) {
          // e.g. sets: 3, reps: 8  →  8,8,8
          const total = setsCounts.reduce((a, b) => a + b, 0);
          const rv = minOfRange(repsParts[0]);
          if (rv !== null) for (let i = 0; i < total; i++) repsArr.push(rv);
        } else {
          // e.g. sets: 2,2, reps: 4-8,8-12  →  4,4,8,8
          setsCounts.forEach((cnt, i) => {
            const rp = repsParts[i] ?? repsParts[repsParts.length - 1];
            const rv = minOfRange(rp);
            if (rv !== null) for (let j = 0; j < cnt; j++) repsArr.push(rv);
          });
        }
        if (repsArr.length === 0) repsArr = null;
      }
    } else {
      // No sets label — just reps: "חזרות: 6,10"
      const arr = repsParts.map(p => minOfRange(p)).filter(v => v !== null);
      if (arr.length === repsParts.length && arr.length > 0) repsArr = arr;
    }
  }

  // 3. Compact "NxM" or multi-group "Nx M + Nx M"
  if (!repsArr) {
    const groups = t.split('+').map(s => s.trim());
    const allReps = [];
    let matched = false;
    for (const grp of groups) {
      const gm = grp.match(/^(\d+)\s*[xX×]\s*([\d\-.]+)/);
      if (gm) {
        matched = true;
        const numSets = parseInt(gm[1]);
        const rv = minOfRange(gm[2]);
        if (rv !== null && numSets > 0 && numSets <= 20) {
          for (let i = 0; i < numSets; i++) allReps.push(rv);
        }
      }
    }
    if (matched && allReps.length > 0) repsArr = allReps;
  }

  // 4. Fallback: comma-separated ranges or single value
  if (!repsArr) {
    // Strip anything that looks like a label word
    const cleaned = t.replace(/[a-zא-ת]+/gi, '').trim();
    const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      const arr = parts.map(p => minOfRange(p)).filter(v => v !== null);
      if (arr.length === parts.length && arr.length > 0) repsArr = arr;
    }
  }

  if (!weight && !repsArr) return null;
  return { weight, reps: repsArr ? repsArr.join(',') : null };
}

// ─── Tests ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function eq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) console.log(`    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(actual)}`);
  ok ? passed++ : failed++;
}

// minOfRange
eq('minOfRange 4-8',  minOfRange('4-8'),  4);
eq('minOfRange 8-4',  minOfRange('8-4'),  4);
eq('minOfRange 8',    minOfRange('8'),    8);
eq('minOfRange null', minOfRange(null),  null);
eq('minOfRange empty',minOfRange(''),    null);

// parseTargetString
eq('null input',   parseTargetString(null), null);
eq('empty string', parseTargetString(''),   null);

eq('4x6-8 30 kg',  parseTargetString('4x6-8 30 kg'),  { weight: '30', reps: '6,6,6,6' });
eq('4×8-12 8 kg',  parseTargetString('4×8-12 8 kg'),  { weight: '8',  reps: '8,8,8,8' });
eq('4x2',          parseTargetString('4x2'),           { weight: null, reps: '2,2,2,2' });
eq('2x1 + 2x4',    parseTargetString('2x1 + 2x4'),    { weight: null, reps: '1,1,4,4' });
eq('4x4 8s',       parseTargetString('4x4 8s'),       { weight: null, reps: '4,4,4,4' });
eq('30 kg only',   parseTargetString('30 kg'),         { weight: '30', reps: null });
eq('8-4 30 kg reversed', parseTargetString('8-4 30 kg'), { weight: '30', reps: '4' });

eq('sets:3 reps:8', parseTargetString('סטים: 3, חזרות: 8'), { weight: null, reps: '8,8,8' });
eq('sets:2,2 reps:4-8,8-12', parseTargetString('סטים: 2,2, חזרות: 4-8,8-12'), { weight: null, reps: '4,4,8,8' });
eq('reps only label', parseTargetString('חזרות: 6,10'), { weight: null, reps: '6,10' });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
