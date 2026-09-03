import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

const BASE_URL = 'https://training-diary.web.app';

test.describe('Accessibility — Auth Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('email input has associated label or aria-label', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const emailInput = page.locator('#auth-email');
    const hasLabel = await emailInput.evaluate(el => {
      const id = el.id;
      const labelEl = document.querySelector(`label[for="${id}"]`);
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      return !!(labelEl || ariaLabel || ariaLabelledBy || (el as HTMLInputElement).placeholder);
    });
    expect(hasLabel).toBe(true);
  });

  test('password input has associated label or aria-label', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const pwInput = page.locator('#auth-password');
    const hasLabel = await pwInput.evaluate(el => {
      const id = el.id;
      const labelEl = document.querySelector(`label[for="${id}"]`);
      const ariaLabel = el.getAttribute('aria-label');
      return !!(labelEl || ariaLabel || (el as HTMLInputElement).placeholder);
    });
    expect(hasLabel).toBe(true);
  });

  test('submit button has accessible text', async ({ page }) => {
    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    const submitBtn = page.locator('#auth-submit-btn');
    const text = await submitBtn.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('html element has lang attribute', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });

  test('page has a meaningful title', async ({ page }) => {
    const title = await page.title();
    expect(title.trim().length).toBeGreaterThan(0);
    expect(title).not.toBe('Document');
  });
});

test.describe('Accessibility — Authenticated App', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('all navigation buttons have discernible text or aria-label', async ({ page }) => {
    const navItems = page.locator('.bottomnav .nav-item, .nav-item');
    const count = await navItems.count();
    expect(count).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < count; i++) {
      const item = navItems.nth(i);
      const isVisible = await item.isVisible();
      if (!isVisible) continue;

      const text = await item.textContent();
      const ariaLabel = await item.getAttribute('aria-label');
      const title = await item.getAttribute('title');
      expect(!!(text?.trim() || ariaLabel || title)).toBe(true);
    }
  });

  test('topbar gear buttons have title attributes', async ({ page }) => {
    await page.locator('#nav-main').click();
    const gearBtn = page.locator('#mainGearBtn');
    await expect(gearBtn).toBeVisible();
    const title = await gearBtn.getAttribute('title');
    expect(title).toBeTruthy();
  });

  test('exercise card inputs have some form of labeling', async ({ page }) => {
    await page.locator('#nav-main').click();
    await page.waitForFunction(() => {
      const row = document.getElementById('typeRow');
      return row && row.children.length > 0;
    }, { timeout: 10000 });

    // Clicking an already-active type button is a no-op (selectType()
    // early-returns when unchanged) — on a fresh boot with no local cache
    // yet, the initially-active type can render zero exercise cards with
    // nothing to trigger a render until a REAL type change happens (a
    // pre-existing, documented baseline flake in this suite's helpers).
    // Click whichever button isn't already active to guarantee one.
    const typeButtons = page.locator('#typeRow button, #typeRow .type-btn');
    const typeCount = await typeButtons.count();
    let firstType = typeButtons.first();
    for (let i = 0; i < typeCount; i++) {
      const isActive = await typeButtons.nth(i).evaluate(el => el.classList.contains('active'));
      if (!isActive) { firstType = typeButtons.nth(i); break; }
    }
    await firstType.click();
    const firstCard = page.locator('#exerciseList .card').first();
    await expect(firstCard).toBeVisible({ timeout: 8000 });

    const weightInput = firstCard.locator('.ex-weight');
    const accessible = await weightInput.evaluate(el => {
      const label = el.closest('.card')?.querySelector('label');
      const ariaLabel = el.getAttribute('aria-label');
      const title = el.getAttribute('title');
      const placeholder = (el as HTMLInputElement).placeholder;
      return !!(label || ariaLabel || title || placeholder);
    });
    expect(accessible).toBe(true);
  });

  test('draft modal has aria-modal and role attributes', async ({ page }) => {
    const modal = page.locator('#draftModal');
    const role = await modal.getAttribute('role');
    const ariaModal = await modal.getAttribute('aria-modal');
    expect(role).toBe('dialog');
    expect(ariaModal).toBe('true');
  });
});
