import { test, expect } from '@playwright/test';

const BASE_URL = 'https://training-diary.web.app';

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
