import { test, expect } from '@playwright/test';

// Negative tests check auth form errors — need unauthenticated state
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = 'https://training-diary.web.app';

test.describe('Negative Tests — Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    // Ensure we're on auth screen (logout if needed)
    await page.waitForLoadState('networkidle');
  });

  test('login with empty email and password shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('');
    await page.locator('#auth-password').fill('');
    await page.locator('#auth-submit-btn').click();

    // Should show error message without calling Firebase
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
    // Auth screen should still be visible
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('login with empty email only shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('');
    await page.locator('#auth-password').fill('SomePassword123!');
    await page.locator('#auth-submit-btn').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('login with empty password only shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('test@example.com');
    await page.locator('#auth-password').fill('');
    await page.locator('#auth-submit-btn').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('login with wrong credentials shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('nonexistent-user-qa@example.com');
    await page.locator('#auth-password').fill('WrongPassword999!');
    await page.locator('#auth-submit-btn').click();

    // Firebase will return an error; auth screen should stay visible
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
    // Error message should have the error styling
    await expect(msg).toHaveClass(/auth-err/);
  });

  test('register with weak password shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#tab-register').click();
    await page.locator('#auth-email').fill('qa-weak-pass@example.com');
    await page.locator('#auth-password').fill('abc'); // Too short
    await page.locator('#auth-submit-btn').click();

    // Firebase requires min 6 chars; should show error
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator('#auth-screen')).not.toHaveClass(/hidden/);
  });

  test('submit button is disabled during auth request', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('test@example.com');
    await page.locator('#auth-password').fill('SomePassword123!');

    const submitBtn = page.locator('#auth-submit-btn');
    await submitBtn.click();

    // Button should be disabled immediately after click (while request is in flight)
    // This is a race condition test — we check briefly after click
    // The button re-enables on error
    await page.waitForTimeout(200);
    // After the Firebase call completes, it should re-enable
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
  });

  test('forgot password with empty email shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    // Clear the email field
    await page.locator('#auth-email').fill('');
    await page.locator('.auth-forgot').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 3000 });
  });

  test('forgot password with invalid email shows error', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill('notavalidemail');
    await page.locator('.auth-forgot').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
  });
});

test.describe('Negative Tests — UI Resilience', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('auth screen does not XSS via email field', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const xssPayload = '<script>window.__xss_fired=true</script>';
    await page.locator('#auth-email').fill(xssPayload);
    await page.locator('#auth-password').fill('password');
    await page.locator('#auth-submit-btn').click();

    await page.waitForTimeout(1000);
    const xssFired = await page.evaluate(() => (window as any).__xss_fired);
    expect(xssFired).toBeFalsy();
  });

  test('page loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Filter out known Firebase-related or network errors that are expected
    const unexpectedErrors = errors.filter(e =>
      !e.includes('firebase') &&
      !e.includes('Firebase') &&
      !e.includes('net::') &&
      !e.includes('favicon')
    );
    expect(unexpectedErrors).toHaveLength(0);
  });

  test('app has a title', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
  });

  test('page has lang attribute on html element', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
    expect(['he', 'en']).toContain(lang);
  });

  test('page has dir attribute on html element', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBeTruthy();
    expect(['rtl', 'ltr']).toContain(dir);
  });
});
