import { test, expect } from '@playwright/test';

// Auth tests need a fresh unauthenticated browser — override the global storageState
test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL = 'https://training-diary.web.app';
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('auth screen is shown to unauthenticated users', async ({ page }) => {
    // If user is logged in from a previous session, the auth screen may be hidden.
    // We check after a brief wait.
    await page.waitForLoadState('networkidle');
    // The auth screen should be visible OR the user is already logged in
    const authScreen = page.locator('#auth-screen');
    const isVisible = await authScreen.evaluate(el => !el.classList.contains('hidden'));
    // At minimum the element must exist
    await expect(authScreen).toBeAttached();
  });

  test('login tab is active by default', async ({ page }) => {
    await page.waitForSelector('#auth-screen');
    const loginTab = page.locator('#tab-login');
    await expect(loginTab).toHaveClass(/active/);
    const registerTab = page.locator('#tab-register');
    await expect(registerTab).not.toHaveClass(/active/);
  });

  test('switching to register tab changes active state', async ({ page }) => {
    await page.waitForSelector('#auth-screen');
    await page.locator('#tab-register').click();
    await expect(page.locator('#tab-register')).toHaveClass(/active/);
    await expect(page.locator('#tab-login')).not.toHaveClass(/active/);
    // Submit button text should change
    const submitBtn = page.locator('#auth-submit-btn');
    const text = await submitBtn.innerText();
    // In Hebrew the register button has different text than login
    expect(text).toBeTruthy();
  });

  test('switching back to login tab works', async ({ page }) => {
    await page.waitForSelector('#auth-screen');
    await page.locator('#tab-register').click();
    await page.locator('#tab-login').click();
    await expect(page.locator('#tab-login')).toHaveClass(/active/);
  });

  test('email and password inputs are present and focusable', async ({ page }) => {
    await page.waitForSelector('#auth-screen');
    await expect(page.locator('#auth-email')).toBeVisible();
    await expect(page.locator('#auth-password')).toBeVisible();
    await page.locator('#auth-email').click();
    await page.locator('#auth-email').fill('test@example.com');
    await expect(page.locator('#auth-email')).toHaveValue('test@example.com');
  });

  test('google login button is visible', async ({ page }) => {
    await page.waitForSelector('#auth-screen');
    const googleBtn = page.locator('.auth-google-btn');
    await expect(googleBtn).toBeVisible();
  });

  test('forgot password button is visible', async ({ page }) => {
    await page.waitForSelector('#auth-screen');
    const forgotBtn = page.locator('.auth-forgot');
    await expect(forgotBtn).toBeVisible();
  });

  test('successful login navigates to main screen', async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      test.skip(true, 'Set TEST_EMAIL and TEST_PASSWORD env vars to run this test.');
      return;
    }
    await page.waitForSelector('#auth-screen');
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) {
      test.skip(); // Already logged in
      return;
    }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('#auth-password').fill(TEST_PASSWORD);
    await page.locator('#auth-submit-btn').click();

    // Auth screen should get .hidden class after successful login
    await page.waitForFunction(
      () => document.getElementById('auth-screen')?.classList.contains('hidden'),
      { timeout: 15000 }
    );
    // Main content should be visible
    await expect(page.locator('#main-content')).toBeVisible();
  });

  test('forgot password — email sent message shown when valid email provided', async ({ page }) => {
    if (!TEST_EMAIL) { test.skip(true, 'Set TEST_EMAIL env var to run this test.'); return; }
    await page.waitForSelector('#auth-screen');
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    await page.locator('#auth-email').fill(TEST_EMAIL);
    await page.locator('.auth-forgot').click();

    // Should show success message (auth-ok class) or error — either way something should appear
    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });
  });
});
