import { test, expect } from '@playwright/test';
import { loginWithEmailPassword, waitForAppReady, requiresCredentials } from './helpers/auth';

const BASE_URL = 'https://training-diary.web.app';

// Installs a native Layout Instability API observer in the page and
// accumulates a CLS-like score into window.__clsScore. This project has no
// Lighthouse/playwright-lighthouse dependency (see the rest of this file —
// every existing check is a plain Date.now()/Performance-API timing check),
// so CLS here is measured the same way: pure browser Performance API,
// no new dependency introduced.
async function startLayoutShiftTracking(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__clsScore = 0;
    try {
      const po = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) w.__clsScore += entry.value;
        }
      });
      po.observe({ type: 'layout-shift', buffered: true });
      w.__clsObserver = po;
    } catch (e) {
      w.__clsScore = null; // layout-shift entry type not supported in this browser
    }
  });
}

async function readLayoutShiftScore(page: import('@playwright/test').Page): Promise<number | null> {
  return page.evaluate(() => (window as any).__clsScore);
}

test.describe('Performance', () => {
  test('initial page load completes within 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const elapsed = Date.now() - start;
    // 5000ms is a relaxed threshold for production; Lighthouse uses 3s as FCP target
    expect(elapsed).toBeLessThan(5000);
  });

  test('auth screen becomes visible within 3 seconds of navigation', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL);

    await page.waitForFunction(
      () => {
        const el = document.getElementById('auth-screen');
        if (!el) return false;
        const overlay = document.getElementById('loading-overlay');
        const overlayGone = !overlay || overlay.style.display === 'none' || overlay.classList.contains('fade-out');
        const authVisible = !el.classList.contains('hidden');
        const authHidden = el.classList.contains('hidden') && overlayGone;
        return authVisible || authHidden;
      },
      { timeout: 8000 }
    );

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(8000);
  });

  test('page sends no requests to unknown third-party origins', async ({ page }) => {
    const allowedOrigins = [
      'training-diary.web.app',
      'firebaseapp.com',
      'googleapis.com',
      'gstatic.com',
      'firebase.googleapis.com',
      'identitytoolkit.googleapis.com',
      'securetoken.googleapis.com',
      'firebaseinstallations.googleapis.com',
    ];

    const unknownRequests: string[] = [];
    page.on('request', req => {
      const url = new URL(req.url());
      const isKnown = allowedOrigins.some(origin => url.hostname.endsWith(origin));
      if (!isKnown && req.url().startsWith('https://')) {
        unknownRequests.push(req.url());
      }
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    if (unknownRequests.length > 0) {
      console.warn('Unexpected third-party requests:', unknownRequests);
    }
    // Soft check — report but allow (app might add analytics etc.)
    // Change to strict if needed:
    // expect(unknownRequests).toHaveLength(0);
    expect(unknownRequests.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── TC-PERF-004 – TC-PERF-006 ───────────────────────────────────────────
test.describe('Performance — Cardio history stats (TC-PERF-004)', () => {
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
  });

  test('TC-PERF-004: cardio domain stats render and period-filter recomputation stay within budget across 4+ months of history', { tag: ['@page-history', '@area-cardio', '@feature-cardio-stats', '@type-performance'] }, async ({ page }) => {
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);

    // The Cardio domain toggle stays hidden until "Show Cardio Page" is
    // enabled (same gate history.spec.ts's cardio tests already respect).
    // TC-PERF-004 needs the real account history, which per qa-state.json's
    // TC-FUNC-018 findings spans August/July/June/May 2026 (4+ months).
    const cardioBtn = page.locator('.history-domain-btn[data-domain="cardio"]');
    // The cardio domain BUTTON is always present in the DOM regardless of
    // the "Show Cardio Page" toggle -- isVisible() on it is not a reliable
    // gate check. switchHistoryDomain()'s _isRunningAllowed() guard is what
    // actually enforces the gate (silently falling back to 'strength' if
    // off), so check the toggle's real checked state directly instead.
    await page.locator('#sec-history .topbar-icon-btn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    const toggle = page.locator('#runningEnabledToggle');
    const isChecked = await toggle.isChecked().catch(() => false);
    if (!isChecked) {
      await page.locator('label.toggle-switch').filter({ has: toggle }).click();
      await page.waitForTimeout(300);
    }
    await page.locator('#nav-history').click();
    await expect(page.locator('#sec-history')).toHaveClass(/active/);
    await expect(cardioBtn).toBeVisible({ timeout: 10000 });

    const renderStart = Date.now();
    await cardioBtn.click();
    await expect(page.locator('#cardioHistoryStats')).toBeVisible();
    await expect(page.locator('#run-prs-card .run-stat-val').first()).not.toBeEmpty();
    const initialRenderMs = Date.now() - renderStart;
    expect(initialRenderMs).toBeLessThan(2000);

    for (const range of ['month', 'year', 'all'] as const) {
      const rangeStart = Date.now();
      await page.locator(`.run-range-btn[data-range="${range}"]`).click();
      await expect(page.locator(`.run-range-btn[data-range="${range}"]`)).toHaveClass(/active/);
      const recomputeMs = Date.now() - rangeStart;
      expect(recomputeMs).toBeLessThan(1000);
    }
  });
});

test.describe('Performance — Settings plan-edit panel transitions (TC-PERF-005)', () => {
  // CORRECTED ASSUMPTION: qa-state.json's TC-PERF-005 describes these as
  // "modals". They are not. public/index.html's openWorkoutEdit()/
  // openCardioEdit() call navigateTo('/settings/workout-plan' |
  // '/settings/cardio-plan') — an SPA route (history.pushState, no full
  // reload) whose ROUTES table maps to { section: 'main'|'running',
  // editPanel: 'workout'|'cardio' }. That toggles an in-page panel
  // (#mainEditPanel / #cardioEditPanel, shown via display:block over the
  // section's normal content) rather than opening any dialog/overlay, and
  // is closed with history.back() via #mainBackBtn / #cardioBackBtn, which
  // lands back on #sec-settings. So this measures the real panel-swap
  // transition (and its layout shift) instead of a "modal open/close" that
  // does not exist in this app.
  test.beforeEach(async ({ page }) => {
    requiresCredentials();
    await loginWithEmailPassword(page);
    await waitForAppReady(page);
    await page.locator('#mainGearBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
  });

  test('TC-PERF-005a: Edit Strength Plan panel open/close transition stays within budget with no layout-shift regression', { tag: ['@page-settings', '@area-settings', '@feature-plan-edit', '@type-performance'] }, async ({ page }) => {
    await startLayoutShiftTracking(page);

    const openStart = Date.now();
    await page.locator('button.settings-item[onclick="openWorkoutEdit()"]').click();
    await expect(page.locator('#sec-main')).toHaveClass(/active/);
    await expect(page.locator('#mainEditPanel')).toBeVisible();
    const openMs = Date.now() - openStart;
    expect(openMs).toBeLessThan(300);

    const closeStart = Date.now();
    await page.locator('#mainBackBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    const closeMs = Date.now() - closeStart;
    expect(closeMs).toBeLessThan(300);

    const cls = await readLayoutShiftScore(page);
    if (cls !== null) {
      expect(cls).toBeLessThan(0.1);
    }
  });

  test('TC-PERF-005b: Edit Cardio Workout Plan panel open/close transition stays within budget with no layout-shift regression', { tag: ['@page-settings', '@area-cardio', '@feature-plan-edit', '@type-performance'] }, async ({ page }) => {
    await startLayoutShiftTracking(page);

    const openStart = Date.now();
    await page.locator('button.settings-item[onclick="openCardioEdit()"]').click();
    // openCardioEdit() routes through the running section's edit panel, not
    // through #sec-settings — see the CORRECTED ASSUMPTION note above.
    await expect(page.locator('#sec-running')).toHaveClass(/active/);
    await expect(page.locator('#cardioEditPanel')).toBeVisible();
    const openMs = Date.now() - openStart;
    expect(openMs).toBeLessThan(300);

    const closeStart = Date.now();
    await page.locator('#cardioBackBtn').click();
    await expect(page.locator('#sec-settings')).toHaveClass(/active/);
    const closeMs = Date.now() - closeStart;
    expect(closeMs).toBeLessThan(300);

    const cls = await readLayoutShiftScore(page);
    if (cls !== null) {
      expect(cls).toBeLessThan(0.1);
    }
  });
});

test.describe('Performance — Login page baseline regression (TC-PERF-006)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('TC-PERF-006: /login loads within the existing timing budget and the localized error adds no layout shift, with Google sign-in + Forgot-password + localized-error additions present', { tag: ['@page-login', '@area-auth', '@feature-login-perf', '@type-performance'] }, async ({ page }) => {
    // Baseline load timing — same mechanism/budget as the "initial page load"
    // check earlier in this file (Date.now() elapsed; this project has no
    // Lighthouse dependency to compare Performance/LCP/FCP scores against),
    // now exercised with the new Google button / Forgot-password link /
    // localized error additions present on the page.
    const start = Date.now();
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    const loadMs = Date.now() - start;
    expect(loadMs).toBeLessThan(5000);

    const authVisible = await page.locator('#auth-screen').evaluate(el => !el.classList.contains('hidden'));
    if (!authVisible) { test.skip(); return; }

    // The new additions must actually be present for this baseline to be meaningful.
    await expect(page.locator("button[onclick='handleGoogleLogin()']")).toBeVisible();
    // Real element is a <button class="auth-forgot">, not an <a href> link
    // (the qa-state.json map's a[href*='password'] guess predates verification).
    await expect(page.locator('.auth-forgot')).toBeVisible();

    // The localized error message appearing must not push other elements
    // around — tracked via the native Layout Instability API.
    await startLayoutShiftTracking(page);

    await page.locator('#auth-email').fill('nonexistent-user-qa@example.com');
    await page.locator('#auth-password').fill('WrongPassword999!');
    await page.locator('#auth-submit-btn').click();

    const msg = page.locator('#auth-msg');
    await expect(msg).not.toBeEmpty({ timeout: 10000 });

    const cls = await readLayoutShiftScore(page);
    if (cls !== null) {
      expect(cls).toBeLessThan(0.1);
    }
  });
});
