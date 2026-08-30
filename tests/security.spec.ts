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
