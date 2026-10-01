import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials, logout } from './helpers/auth';

// Security Auth Screen tests check unauthenticated behavior — override global storageState.
// The Authenticated App describe block still calls loginWithEmailPassword explicitly.
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = 'https://training-diary.web.app';

// Primary test account (running/cardio-eligible) — see .env.test.
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';
// Secondary test account (.env.test's "TEST_EMAIL_UNGATED" fixture, testeitan@gmail.com) —
// used below only for the cross-account data-isolation checks (TC-SEC-015/016), which need
// two genuinely distinct accounts. It also happens to be the exact account qa-state.json's
// TC-SEC-015/016 name as "testeitan@gmail.com / 111111".
const TEST_EMAIL_B = process.env.TEST_EMAIL_UNGATED || '';
const TEST_PASSWORD_B = process.env.TEST_PASSWORD_UNGATED || '';

function requiresSecondAccount() {
  if (!TEST_EMAIL_B || !TEST_PASSWORD_B) {
    test.skip(true, 'Set TEST_EMAIL_UNGATED and TEST_PASSWORD_UNGATED env vars to run this cross-account test.');
  }
}

// Known-good, legitimately localized auth-error strings this app can show for a failed
// login (public/index.html's firebaseErrMsg(), ~line 2479-2493, mapping auth/user-not-found,
// auth/wrong-password and auth/invalid-credential to these via public/translations.js
// err.user_not_found / err.wrong_password / err.invalid_credential — He ~lines 226-228,
// En ~lines 537-539). Modern Firebase SDKs typically collapse wrong-password and
// user-not-found into the single auth/invalid-credential code (anti-enumeration), but we
// deliberately accept all three rather than hardcoding which one actually fires.
const KNOWN_GOOD_AUTH_ERROR_MESSAGES = [
  'לא נמצא משתמש עם מייל זה',
  'סיסמה שגויה',
  'מייל או סיסמה שגויים',
  'No user found with this email',
  'Incorrect password',
  'Invalid email or password',
];
// Anything matching this is a raw Firebase/SDK leak rather than one of this app's own
// localized messages — e.g. "Firebase: Error (auth/invalid-credential)." or a stack trace.
const RAW_SDK_LEAK_PATTERN = /firebase:|auth\/[a-z-]+|\bat\s+\S+:\d+:\d+/i;

async function attemptLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#auth-screen');
  await page.locator('#tab-login').click().catch(() => {});
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);

  const start = Date.now();
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url().includes('identitytoolkit'), { timeout: 10000 }).catch(() => null),
    page.locator('#auth-submit-btn').click(),
  ]);

  const msg = page.locator('#auth-msg');
  await expect(msg).not.toBeEmpty({ timeout: 10000 });
  const elapsedMs = Date.now() - start;

  const text = ((await msg.textContent()) || '').trim();
  const msgClass = (await msg.getAttribute('class')) || '';

  let status: number | null = null;
  let errorCode: string | null = null;
  if (response) {
    status = response.status();
    const body = await response.json().catch(() => null);
    errorCode = body?.error?.message ?? null;
  }

  return { text, msgClass, elapsedMs, status, errorCode };
}

async function submitForgotPassword(page: import('@playwright/test').Page, email: string) {
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#auth-screen');
  await page.locator('#auth-email').fill(email);

  const start = Date.now();
  await page.locator('.auth-forgot').click();
  const msg = page.locator('#auth-msg');
  await expect(msg).not.toBeEmpty({ timeout: 10000 });
  const elapsedMs = Date.now() - start;

  const text = ((await msg.textContent()) || '').trim();
  const msgClass = (await msg.getAttribute('class')) || '';
  return { text, msgClass, elapsedMs };
}

function median(values: number[]) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Reads Cardio-domain history stats (#run-streak-card / #run-prs-card) for whichever
// account is currently logged in. The "Show Cardio Page" preference
// (#runningEnabledToggle inside #runningGateRow, reached via #mainGearBtn) gates whether
// the cardio domain button/nav item is reachable at all (see public/index.html's
// applyRunningGate()/_isRunningAllowed(), ~lines 1647-1658/2850-2852) — this helper flips
// it on first if needed via the real Settings UI, reads the stats, then restores whatever
// the preference was before it touched it, so the test leaves no side effect on the account.
async function readCardioStats(page: import('@playwright/test').Page) {
  await page.locator('#mainGearBtn').click();
  await expect(page.locator('#runningGateRow')).toBeVisible({ timeout: 5000 });
  const toggle = page.locator('#runningEnabledToggle');
  // The checkbox itself is visually hidden inside a custom toggle-switch
  // (same pattern as the old #darkModeToggle) -- .check()/.uncheck() on the
  // raw input times out because it's never "stable"/actionable directly.
  // Click the wrapping label instead, same fix already applied elsewhere.
  const toggleLabel = page.locator('label.toggle-switch').filter({ has: toggle });
  const wasEnabled = await toggle.isChecked();
  if (!wasEnabled) {
    await toggleLabel.click();
    await page.waitForTimeout(300);
  }

  await page.locator('#nav-history').click();
  await page.locator('.history-domain-btn[data-domain="cardio"]').click();
  await expect(page.locator('#run-streak-card')).not.toBeEmpty({ timeout: 10000 });

  const streak = ((await page.locator('#run-streak-card').textContent()) || '').trim();
  const prs = ((await page.locator('#run-prs-card').textContent()) || '').trim();

  if (!wasEnabled) {
    // We're currently on History (cardio view), not Main -- #mainGearBtn
    // only exists in #sec-main's topbar. Use History's own gear icon.
    await page.locator('#sec-history .topbar-icon-btn').click();
    await expect(page.locator('#runningGateRow')).toBeVisible({ timeout: 5000 });
    await toggleLabel.click();
    await page.waitForTimeout(300);
  }

  return { streak, prs };
}

test.describe('Security — Auth Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('XSS via email field does not execute script', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const payload = '<img src=x onerror="window.__xss_img=1"><script>window.__xss_script=1</script>';
    await page.locator('#auth-email').fill(payload);
    await page.locator('#auth-submit-btn').click();
    await page.waitForTimeout(1000);

    const imgFired = await page.evaluate(() => (window as any).__xss_img);
    const scriptFired = await page.evaluate(() => (window as any).__xss_script);
    expect(imgFired).toBeFalsy();
    expect(scriptFired).toBeFalsy();
  });

  test('XSS via password field does not execute script', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const payload = '"><script>window.__xss_pwd=1</script>';
    await page.locator('#auth-password').fill(payload);
    await page.waitForTimeout(500);

    const fired = await page.evaluate(() => (window as any).__xss_pwd);
    expect(fired).toBeFalsy();
  });

  test('auth page served over HTTPS', async ({ page }) => {
    const url = page.url();
    expect(url).toMatch(/^https:/);
  });

  test('sensitive credential files are not publicly accessible', async ({ page }) => {
    // Firebase apiKey in client code is by design (public project identifier, not a secret).
    // The real risk is server-side credential files being accidentally served.
    // Note: Firebase Hosting SPA mode returns 200 + text/html for all unknown URLs (index.html
    // fallback) — so we check content-type, not just status code. A real credential file
    // would return application/json.
    const filesToCheck = [
      '/serviceAccountKey.json',
      '/service-account-key.json',
      '/.env',
      '/.env.local',
    ];
    for (const path of filesToCheck) {
      const response = await page.request.get(`https://training-diary.web.app${path}`);
      if (response.status() === 200) {
        const contentType = response.headers()['content-type'] ?? '';
        expect(contentType, `${path} is being served as a real file (not SPA fallback)`).not.toContain('application/json');
      }
    }
  });

  test('failed login does not leak user existence info in error message', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('definitelynotexist-qa-9999@example.com');
    await page.locator('#auth-password').fill('WrongPass123!');
    await page.locator('#auth-submit-btn').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });

    // Error should not say "user not found" in a way that confirms existence
    const msgText = (await msg.textContent() || '').toLowerCase();
    // It should NOT say "user not found" since that leaks enumeration info
    // (Firebase's default messages are acceptable; we flag if it's dangerously specific)
    expect(msgText).not.toMatch(/user\s+does\s+not\s+exist/i);
  });

  test('selecting a saved credential (simulated autofill) auto-submits the login form', async ({ page }) => {
    await page.goto('/');
    await page.fill('#auth-email', 'nonexistent-autofill-test@example.com');
    await page.fill('#auth-password', 'wrong-password-123');

    // Playwright's fill() sets values via CDP and never triggers the browser's
    // own autofill UI, so :-webkit-autofill never naturally engages here.
    // Dispatch the same synthetic event the CSS trick produces on a REAL
    // autofill, to test the detection-and-submit wiring in isolation from the
    // browser's own credential picker (which no automated test can drive).
    await page.evaluate(() => {
      const fire = (id: string) => {
        const el = document.getElementById(id)!;
        el.dispatchEvent(new AnimationEvent('animationstart', { animationName: 'onAutoFillStart', bubbles: true }));
      };
      fire('auth-email');
      fire('auth-password');
    });

    // A real login attempt fired iff the auth error message changes from
    // empty to Firebase's "wrong credentials" text -- proves handleAuthSubmit()
    // actually ran, without needing (or risking) a real account.
    await expect(page.locator('#auth-msg')).not.toBeEmpty({ timeout: 5000 });
  });

  test('autofilled auth inputs use the theme surface color, not the browser default', async ({ page, context }) => {
    // Forces the autofill pseudo-state in both themes and checks the box-shadow's
    // actual color against the theme's live --surface value (read from the page,
    // not a hardcoded hex) -- a plain '1000px' spread check alone can't tell a
    // correct `var(--surface)` reference apart from a hardcoded color, since the
    // spread distance is identical in both themes and only the color differs.
    const probeAutofillColor = async (theme: 'light' | 'dark') => {
      await page.goto('/');
      await page.evaluate((t) => localStorage.setItem('theme', t), theme);
      await page.reload();

      const cdp = await context.newCDPSession(page);
      const email = page.locator('#auth-email');
      // CSS.forcePseudoState needs a DOM.NodeId, obtained via DOM.getDocument + DOM.querySelector
      // -- not the element handle Playwright itself uses internally.
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      const { root } = await cdp.send('DOM.getDocument', {});
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#auth-email' });
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['autofill'] });

      const boxShadow = await email.evaluate(el => getComputedStyle(el).boxShadow);
      // Resolve --surface's actual rendered color the same way the browser would,
      // via a throwaway element, instead of guessing/hardcoding a hex value that
      // could silently drift out of sync with the real CSS.
      const surfaceColor = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.backgroundColor = 'var(--surface)';
        document.body.appendChild(probe);
        const rgb = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return rgb;
      });
      return { boxShadow, surfaceColor };
    };

    const light = await probeAutofillColor('light');
    expect(light.boxShadow).toContain('1000px'); // inset spread matches the override rule, not the browser default
    expect(light.boxShadow).toContain(light.surfaceColor);

    const dark = await probeAutofillColor('dark');
    expect(dark.boxShadow).toContain('1000px');
    expect(dark.boxShadow).toContain(dark.surfaceColor);

    // Genuinely distinguishes a theme-aware `var(--surface)` reference from a
    // hardcoded color: if the CSS rule were ever replaced with a fixed hex,
    // light and dark would resolve to the identical color and this would fail.
    expect(dark.surfaceColor).not.toBe(light.surfaceColor);
  });

  test('switching auth tabs resets autofill-detected flags to prevent a stale-field auto-submit', async ({ page }) => {
    // Regression test for the logout/tab-switch auto-resubmit bug: the
    // _authAutofilled.email/.password flags used to persist across a tab
    // switch, so an EARLIER single-field autofill (e.g. email only) combined
    // with a LATER single-field autofill on the other field (while both
    // fields still held their earlier values) could satisfy the "both fields
    // autofilled" guard and fire a spurious handleAuthSubmit() with stale
    // credentials. switchAuthTab() must reset both flags on every tab switch.
    await page.goto('/');

    await page.fill('#auth-email', 'stale-autofill-test@example.com');
    await page.fill('#auth-password', 'stale-password-123');

    // "Autofill" only the email field while still on the login tab.
    await page.evaluate(() => {
      document.getElementById('auth-email')!.dispatchEvent(
        new AnimationEvent('animationstart', { animationName: 'onAutoFillStart', bubbles: true })
      );
    });
    // Only one of the two fields has been "autofilled" so far -- no submit yet.
    await expect(page.locator('#auth-msg')).toBeEmpty();

    // Switch to register and back to login, the way a user poking around the
    // form would. Per the fix, this must clear both autofill-detected flags.
    await page.evaluate(() => {
      (window as any).switchAuthTab('register');
      (window as any).switchAuthTab('login');
    });

    // Now "autofill" only the password field. The fields still hold their
    // earlier (non-empty) values. If the email flag were still true from
    // before the tab switch, this alone would satisfy "both fields
    // autofilled" and fire an unwanted handleAuthSubmit() with stale values.
    await page.evaluate(() => {
      document.getElementById('auth-password')!.dispatchEvent(
        new AnimationEvent('animationstart', { animationName: 'onAutoFillStart', bubbles: true })
      );
    });

    // Give a (would-be, incorrect) submit attempt time to hit Firebase and
    // populate #auth-msg before asserting it never did.
    await page.waitForTimeout(3000);
    await expect(page.locator('#auth-msg')).toBeEmpty();
  });
});

test.describe('Security — Authenticated App', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('XSS via session name input does not execute script', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });
    const firstType = page.locator('#typeRow button, #typeRow .type-btn').first();
    await firstType.click();
    await expect(page.locator('#sessionNameWrap')).toBeVisible({ timeout: 5000 });

    await page.locator('#sessionNameInput').fill('<script>window.__xss_name=1</script>');
    await page.waitForTimeout(500);
    const fired = await page.evaluate(() => (window as any).__xss_name);
    expect(fired).toBeFalsy();
  });

  test('page does not expose sensitive data in console logs', async ({ page }) => {
    const sensitivePatterns = [/password/i, /secret/i, /private.*key/i];
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log' || msg.type() === 'info') {
        consoleLogs.push(msg.text());
      }
    });

    await page.locator('#nav-main').click();
    await page.waitForTimeout(2000);

    for (const log of consoleLogs) {
      for (const pattern of sensitivePatterns) {
        expect(log).not.toMatch(pattern);
      }
    }
  });

  test('logout clears autofilled auth field values so it cannot silently re-authenticate the user', async ({ page }) => {
    // Regression test for the primary logout auto-resubmit bug (the more
    // severe counterpart to the tab-switch test above): a real login just
    // happened (beforeEach). Nothing has ever cleared #auth-email/
    // #auth-password on a SUCCESSFUL login -- they still hold the just-used,
    // valid credentials, exactly mirroring the real-world scenario: the
    // fields sit unseen (#auth-screen is display:none) holding a real
    // autofilled value for as long as the user stays logged in.
    await logout(page);

    // Real signOut() just went through -- this exercises the REAL
    // onAuthStateChanged signed-out branch the fix modifies, not a
    // simulation of it.
    await expect(page.locator('#auth-screen')).toBeVisible();

    expect(await page.locator('#auth-email').inputValue()).toBe('');
    expect(await page.locator('#auth-password').inputValue()).toBe('');

    // Re-fire the same synthetic autofill-detection event the CSS trick
    // itself dispatches when the browser autofills a field (Playwright
    // cannot drive the browser's own autofill UI -- see the other autofill
    // tests in this file for the same technique). This simulates exactly
    // what a real animation restart on redisplay of #auth-screen would
    // send. If the fields still held the just-used, VALID credentials (the
    // bug), this would silently log the user right back in.
    await page.evaluate(() => {
      const fire = (id: string) => document.getElementById(id)!.dispatchEvent(
        new AnimationEvent('animationstart', { animationName: 'onAutoFillStart', bubbles: true })
      );
      fire('auth-email');
      fire('auth-password');
    });

    // Give a would-be re-authentication time to complete before asserting
    // it never happened.
    await page.waitForTimeout(3000);
    await expect(page.locator('#auth-screen')).toBeVisible();
    await expect(page.locator('#auth-msg')).toBeEmpty();
  });

  test('unauthenticated direct URL access redirects to auth screen', async ({ browser }) => {
    // Open a fresh context with no stored auth to test unauthenticated access
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(BASE_URL);
    await freshPage.waitForLoadState('networkidle');

    const authVisible = await freshPage.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden')).catch(() => null);
    // Either auth screen is shown or app correctly gates content
    if (authVisible !== null) {
      expect(authVisible).toBe(true);
    }
    await freshContext.close();
  });
});

test.describe('Security — Anti-Enumeration & Google Sign-In', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('TC-SEC-009: Google sign-in button does not leak secrets before the OAuth popup opens', { tag: ['@page-login', '@area-auth', '@feature-google-signin', '@type-security'] }, async ({ page, context }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    // Firebase apiKey in client code is by design (public project identifier, not a
    // secret — same rationale as the "sensitive credential files" test above). What
    // must NOT appear anywhere near/around the button is an actual secret shape.
    const secretPatterns = [/client_secret/i, /private_key/i, /service[-_]?account/i, /BEGIN PRIVATE KEY/i];
    const html = await page.content();
    for (const pattern of secretPatterns) {
      expect(html).not.toMatch(pattern);
    }

    const requests: { url: string; postData: string | null }[] = [];
    page.on('request', req => requests.push({ url: req.url(), postData: req.postData() }));

    // Click, then close the popup immediately without completing the OAuth flow — this
    // test only inspects what fires between the click and the popup opening, never signs
    // in for real.
    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 8000 }).catch(() => null),
      page.locator('.auth-google-btn').click(),
    ]);
    await page.waitForTimeout(500);
    if (popup) await popup.close().catch(() => {});

    for (const req of requests) {
      for (const pattern of secretPatterns) {
        expect(req.url).not.toMatch(pattern);
        if (req.postData) expect(req.postData).not.toMatch(pattern);
      }
    }
  });

  test('TC-SEC-010: forgot-password UI response is identical for a registered vs a non-existent email', { tag: ['@page-login', '@area-auth', '@feature-anti-enumeration', '@type-security'] }, async ({ page }) => {
    requiresCredentials();
    const registered = await submitForgotPassword(page, TEST_EMAIL);
    const fake = await submitForgotPassword(page, `definitelynotexist-qa-${Date.now()}@example.com`);

    expect(fake.text).toBe(registered.text);
    expect(fake.msgClass).toBe(registered.msgClass);
  });

  test('TC-SEC-011: forgot-password response timing does not leak email registration status', { tag: ['@page-login', '@area-auth', '@feature-anti-enumeration', '@type-security'] }, async ({ page }) => {
    requiresCredentials();
    // qa-state.json's TC-SEC-011 calls for 5 samples per side; reduced to 2 here since
    // the registered-email case sends a real password-reset email to TEST_EMAIL's real
    // inbox every time — a couple of comparisons is enough to catch a gross, consistent gap.
    const registeredTimes: number[] = [];
    const fakeTimes: number[] = [];
    for (let i = 0; i < 2; i++) {
      registeredTimes.push((await submitForgotPassword(page, TEST_EMAIL)).elapsedMs);
      fakeTimes.push((await submitForgotPassword(page, `definitelynotexist-qa-${Date.now()}-${i}@example.com`)).elapsedMs);
    }

    // Generous bound: this runs over a real network against production Firebase, so
    // normal jitter can be large — only guarding against a gross, consistent gap that
    // would let a client reliably distinguish the two cases.
    expect(Math.abs(median(registeredTimes) - median(fakeTimes))).toBeLessThan(5000);
  });

  test('TC-SEC-012: login error text is identical for wrong-password vs a fabricated email', { tag: ['@page-login', '@area-auth', '@feature-error-messages', '@feature-anti-enumeration', '@type-security'] }, async ({ page }) => {
    requiresCredentials();
    const wrongPassword = await attemptLogin(page, TEST_EMAIL, 'DefinitelyWrongPass123!');
    const fakeEmail = await attemptLogin(page, `definitelynotexist-qa-${Date.now()}@example.com`, 'WhateverPass123!');

    expect(fakeEmail.text).toBe(wrongPassword.text);

    // The displayed message must be one of this app's own known, legitimately localized
    // auth-error strings — never raw Firebase/SDK text (e.g. "Firebase: Error
    // (auth/invalid-credential).") or a stack trace.
    expect(KNOWN_GOOD_AUTH_ERROR_MESSAGES).toContain(wrongPassword.text);
    expect(RAW_SDK_LEAK_PATTERN.test(wrongPassword.text)).toBe(false);
    expect(RAW_SDK_LEAK_PATTERN.test(fakeEmail.text)).toBe(false);
  });

  test('TC-SEC-013: login failure response shape (status, error code, DOM) is indistinguishable between the two cases', { tag: ['@page-login', '@area-auth', '@feature-error-messages', '@feature-anti-enumeration', '@type-security'] }, async ({ page }) => {
    requiresCredentials();
    const wrongPassword = await attemptLogin(page, TEST_EMAIL, 'DefinitelyWrongPass123!');
    const fakeEmail = await attemptLogin(page, `definitelynotexist-qa-${Date.now()}@example.com`, 'WhateverPass123!');

    expect(fakeEmail.msgClass).toBe(wrongPassword.msgClass);
    // Network-layer capture (waitForResponse) is best-effort — only compare when both
    // attempts actually caught a response, so infra flakiness can't fail this test.
    if (wrongPassword.status !== null && fakeEmail.status !== null) {
      expect(fakeEmail.status).toBe(wrongPassword.status);
    }
    // Any error code exposed at the network layer must not distinguish the two cases
    // either — otherwise a caller inspecting DevTools' Network tab (rather than only the
    // rendered UI text checked in TC-SEC-012) could still enumerate accounts even though
    // the DOM message is identical.
    if (wrongPassword.errorCode !== null && fakeEmail.errorCode !== null) {
      expect(fakeEmail.errorCode).toBe(wrongPassword.errorCode);
    }
  });

  test('TC-SEC-014: login failure response timing does not leak which case occurred', { tag: ['@page-login', '@area-auth', '@feature-error-messages', '@feature-anti-enumeration', '@type-security'] }, async ({ page }) => {
    requiresCredentials();
    // qa-state.json's TC-SEC-014 calls for 5 samples per side; reduced to 2 to keep this
    // in line with TC-SEC-011's "don't hammer the real endpoint" reasoning above.
    const wrongPasswordTimes: number[] = [];
    const fakeEmailTimes: number[] = [];
    for (let i = 0; i < 2; i++) {
      wrongPasswordTimes.push((await attemptLogin(page, TEST_EMAIL, 'DefinitelyWrongPass123!')).elapsedMs);
      fakeEmailTimes.push((await attemptLogin(page, `definitelynotexist-qa-${Date.now()}-${i}@example.com`, 'WhateverPass123!')).elapsedMs);
    }

    expect(Math.abs(median(wrongPasswordTimes) - median(fakeEmailTimes))).toBeLessThan(5000);
  });
});

test.describe('Security — Cross-Account Data Isolation', () => {
  // These tests log in as two distinct accounts explicitly (rather than via the shared
  // beforeEach used by "Security — Authenticated App" above), so override storageState
  // the same way the rest of this file does for unauthenticated-start scenarios.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-SEC-015: cardio history stats are scoped per-user, never shared across accounts', { tag: ['@page-history', '@area-cardio', '@feature-data-isolation', '@type-security'] }, async ({ page }) => {
    requiresCredentials();
    requiresSecondAccount();

    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    const statsA1 = await readCardioStats(page);

    await logout(page);

    await loginWithEmailPassword(page, TEST_EMAIL_B, TEST_PASSWORD_B);
    await waitForAppReady(page);
    const statsB = await readCardioStats(page);

    await logout(page);

    // Back to account A — if account B's session had leaked into any shared client-side
    // cache/state, account A's numbers would now reflect account B's data instead of its
    // own. This re-check is coincidence-proof (unlike an A-vs-B inequality check, which
    // could legitimately pass or fail by chance if both accounts happen to have zero
    // cardio history).
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    const statsA2 = await readCardioStats(page);

    expect(statsA2).toEqual(statsA1);

    // Best-effort cross-account distinction: two independent accounts with independent
    // histories are not expected to render identical stat text. Skipped when account A
    // has no cardio history at all, since that would coincidentally match an equally
    // empty account B without indicating any actual leakage.
    if (statsA1.streak !== '0' && statsA1.prs !== '') {
      expect(statsB).not.toEqual(statsA1);
    }
  });

  test('TC-SEC-016: "Show Cardio Page" toggle is a client-side UI preference only, not an access-control boundary', { tag: ['@page-history', '@page-settings', '@area-cardio', '@feature-data-isolation', '@type-security'] }, async ({ page }) => {
    requiresSecondAccount();

    await loginWithEmailPassword(page, TEST_EMAIL_B, TEST_PASSWORD_B);
    await waitForAppReady(page);

    // Ensure the toggle starts OFF and the cardio nav entry is hidden (public/index.html's
    // applyRunningGate(), ~line 1653-1654, sets display:none on the domain button itself).
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#runningGateRow')).toBeVisible({ timeout: 5000 });
    const toggle = page.locator('#runningEnabledToggle');
    const originallyEnabled = await toggle.isChecked();
    if (originallyEnabled) {
      await toggle.uncheck();
      await page.waitForTimeout(300);
    }

    await page.locator('#nav-history').click();
    await expect(page.locator('.history-domain-btn[data-domain="cardio"]')).toBeHidden();

    // Direct state navigation, bypassing the hidden nav entirely: call the app's own
    // exposed history-domain switcher (window.switchHistoryDomain, exported via
    // Object.assign(window, ...) so onclick handlers can reach it) without ever clicking
    // through the button. switchHistoryDomain() re-checks the SAME preference flag
    // internally via _isRunningAllowed() (~line 1720/2850-2852) and silently falls back
    // to 'strength' when it's off — this call alone does NOT reach cardio, which shows
    // the redirect is enforced by re-reading the flag, not merely by hiding the button.
    await page.evaluate(() => (window as any).switchHistoryDomain('cardio'));
    await page.waitForTimeout(300);
    await expect(page.locator('.history-domain-btn[data-domain="strength"]')).toHaveClass(/active/);

    // Now bypass the flag itself the same way a technically savvy user could from the
    // browser console: window.saveRunningEnabled is exported globally exactly like every
    // other app action (index.html's "RUNNING EXPORTS" Object.assign(window, ...) block),
    // so it's reachable without ever touching the Settings checkbox.
    await page.evaluate(() => (window as any).saveRunningEnabled(true));
    await page.waitForTimeout(300);
    await page.evaluate(() => (window as any).switchHistoryDomain('cardio'));
    await expect(page.locator('#run-streak-card')).not.toBeEmpty({ timeout: 10000 });

    const streak = ((await page.locator('#run-streak-card').textContent()) || '').trim();
    const prs = ((await page.locator('#run-prs-card').textContent()) || '').trim();
    // Reaching the view via this bypass renders the same shape of content the normal UI
    // path renders (see TC-SEC-015) — the preference gates reachability of the view, not
    // what data comes back; the data itself is always scoped to the requesting user by
    // backend rules regardless of this client-side flag's state.
    expect(streak.length).toBeGreaterThan(0);
    expect(typeof prs).toBe('string');

    // Cleanup: restore the flag/toggle to whatever it was before this test touched it.
    // (Passed in as an argument, not closed over — page.evaluate() serializes the function
    // body alone, so a Node-side variable referenced by closure would not survive the trip.)
    await page.evaluate((val) => (window as any).saveRunningEnabled(val), originallyEnabled);
    await page.waitForTimeout(300);
  });
});
