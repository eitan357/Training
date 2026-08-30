import { Page, test } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

export function requiresCredentials() {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    test.skip(true, 'Set TEST_EMAIL and TEST_PASSWORD env vars to run this test. E.g.: TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass npx playwright test');
  }
}

export async function loginWithEmailPassword(page: Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  if (!email || !password) {
    test.skip(true, 'Set TEST_EMAIL and TEST_PASSWORD env vars to run this test.');
    return;
  }

  await page.goto('/');

  // Wait for Firebase auth state to settle: either auth screen is shown (not logged in)
  // or auth screen gets hidden (already logged in). Start with hidden by default.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('auth-screen');
      if (!el) return false;
      // If auth screen is NOT hidden → user is not logged in, need to login
      // If auth screen IS hidden → user is already logged in, done
      // We wait until the auth screen state is definitively set (not the initial hidden state)
      // Firebase fires onAuthStateChanged which either shows or keeps auth screen hidden.
      // We need to wait until the loading overlay is dismissed OR auth screen is shown.
      const overlay = document.getElementById('loading-overlay');
      const overlayGone = !overlay || overlay.style.display === 'none' || overlay.classList.contains('fade-out');
      const authVisible = !el.classList.contains('hidden');
      const authHidden = el.classList.contains('hidden') && overlayGone;
      return authVisible || authHidden;
    },
    { timeout: 20000 }
  );

  const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
  if (!authVisible) return; // Already logged in (Firebase restored session)

  await page.locator('#tab-login').click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.locator('#auth-submit-btn').click();

  // Wait for auth screen to get .hidden class (login succeeded)
  await page.waitForFunction(
    () => document.getElementById('auth-screen')?.classList.contains('hidden'),
    { timeout: 20000 }
  );
}

export async function waitForAppReady(page: Page) {
  // Wait for loading overlay to disappear
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    return !overlay || overlay.style.display === 'none' || overlay.classList.contains('fade-out');
  }, { timeout: 15000 });
}

export async function logout(page: Page) {
  await page.locator('#nav-main').click().catch(() => {});
  // Navigate to settings and click logout
  await page.evaluate(() => (window as any).showSection('settings'));
  await page.locator('.settings-logout-btn').click();
  await page.waitForSelector('#auth-screen:not(.hidden)', { timeout: 10000 });
}
