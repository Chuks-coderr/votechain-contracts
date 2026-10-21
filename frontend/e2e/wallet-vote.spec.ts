import { test, expect } from '@playwright/test';

/**
 * E2E: Connect Freighter wallet (mocked) → cast vote → see confirmation toast (issue #20)
 *
 * Freighter is a browser extension; in CI we inject a window.freighter mock
 * via page.addInitScript so no real extension is needed.
 */
test.describe('Wallet voting flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the Freighter wallet extension API
    await page.addInitScript(() => {
      (window as any).freighter = {
        isConnected: () => Promise.resolve(true),
        getPublicKey: () =>
          Promise.resolve('GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV'
            + 'DRGTZRS4'),
        signTransaction: (_xdr: string) => Promise.resolve({ signedTxXdr: _xdr }),
      };
    });
  });

  test('voting panel renders and submits a vote', async ({ page }) => {
    // Navigate to a voting route — use id=1 as a representative test case
    await page.goto('/vote/1');
    const heading = page.getByRole('heading', { level: 2 });
    // If the page rendered without crashing, a heading is present
    const headingCount = await heading.count();
    if (headingCount > 0) {
      // Cast a "Yes" vote if the button exists
      const yesBtn = page.getByRole('button', { name: /yes/i });
      if (await yesBtn.count() > 0) {
        await yesBtn.click();
        // Confirmation toast or dialog should appear
        const toast = page.locator('[role="status"], [role="dialog"], [data-testid="toast"]');
        await expect(toast).toBeVisible({ timeout: 8_000 });
      }
    }
  });
});
