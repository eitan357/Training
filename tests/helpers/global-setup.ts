import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://training-diary.web.app';

export default async function globalSetup() {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) return;

  const fixturesDir = path.join(__dirname, '..', 'fixtures');
  fs.mkdirSync(fixturesDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL);

  // Wait for auth state to settle
  await page.waitForFunction(() => {
    const el = document.getElementById('auth-screen');
    if (!el) return false;
    const overlay = document.getElementById('loading-overlay');
    const overlayGone = !overlay || overlay.style.display === 'none' || overlay.classList.contains('fade-out');
    return !el.classList.contains('hidden') || (el.classList.contains('hidden') && overlayGone);
  }, { timeout: 20000 });

  const authVisible = await page.evaluate(
    () => !document.getElementById('auth-screen')?.classList.contains('hidden')
  );

  if (authVisible) {
    await page.locator('#tab-login').click();
    await page.locator('#auth-email').fill(email);
    await page.locator('#auth-password').fill(password);
    await page.locator('#auth-submit-btn').click();
    await page.waitForFunction(
      () => document.getElementById('auth-screen')?.classList.contains('hidden'),
      { timeout: 30000 }
    );
  }

  // Wait for app to be fully loaded
  await page.waitForFunction(() => {
    const overlay = document.getElementById('loading-overlay');
    return !overlay || overlay.style.display === 'none' || overlay.classList.contains('fade-out');
  }, { timeout: 15000 });

  await context.storageState({ path: path.join(fixturesDir, 'auth-state.json') });
  await browser.close();
}
