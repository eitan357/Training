import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

// Security Auth Screen tests check unauthenticated behavior — override global storageState.
// The Authenticated App describe block still calls loginWithEmailPassword explicitly.
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = 'https://training-diary.web.app';

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
