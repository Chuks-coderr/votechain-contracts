import { test, expect } from '@playwright/test';

/**
 * Visual regression tests for key UI states (issue #300).
 *
 * Each test navigates to a page, waits for it to reach a stable state, then
 * captures a screenshot and compares it against a committed baseline stored in
 * `frontend/e2e/snapshots/`.  The comparison threshold is set to 0.1 % maximum
 * pixel-difference ratio (`maxDiffPixelRatio: 0.001`) to catch meaningful
 * visual regressions while tolerating sub-pixel rendering variations across
 * platforms.
 *
 * Baselines are generated on the first run (or when the `--update-snapshots`
 * flag is passed) and must be committed to the repository so CI can compare
 * against them.
 *
 * Run against the local preview server:
 *   npm run build && npx playwright test e2e/visual-regression.spec.ts
 *
 * Update baselines after an intentional UI change:
 *   npx playwright test e2e/visual-regression.spec.ts --update-snapshots
 */

// Shared screenshot options — 0.1 % pixel-diff tolerance.
const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.001 } as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wait for the page to finish loading lazy-loaded React components and settle
 * any in-flight data fetches.  The strategy:
 *   1. Wait for the network to go idle (no requests for 500 ms).
 *   2. Assert the loading spinner / skeleton is no longer visible.
 */
async function waitForPageReady(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  // Dismiss any loading indicators emitted by React.Suspense or the data layer
  const spinner = page.locator(
    '[data-testid="loading"], .loading, [aria-busy="true"]',
  );
  // Not all pages have a spinner; if present, wait for it to disappear.
  if ((await spinner.count()) > 0) {
    await spinner.first().waitFor({ state: 'hidden', timeout: 10_000 });
  }
}

// ── Visual regression tests ───────────────────────────────────────────────────

test.describe('Visual regression — key UI states', () => {
  // ── ProposalList ('/') ──────────────────────────────────────────────────────

  test('ProposalList — default state', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    // Ensure either a proposal list or empty state is rendered before snapping.
    await expect(
      page
        .locator(
          '#proposal-list, [data-testid="proposal-list"], ul.proposal-list, [data-testid="empty-state"]',
        )
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page).toHaveScreenshot('proposal-list.png', SCREENSHOT_OPTS);
  });

  test('ProposalList — Active filter applied', async ({ page }) => {
    await page.goto('/');
    await waitForPageReady(page);

    // Click "Active" filter if it exists; fall back gracefully.
    const activeBtn = page.locator(
      '.filter-btn[data-filter="active"], [data-testid="filter-active"]',
    );
    if ((await activeBtn.count()) > 0) {
      await activeBtn.first().click();
      // Allow the list to re-render before capturing.
      await page.waitForTimeout(200);
    }

    await expect(page).toHaveScreenshot(
      'proposal-list-active-filter.png',
      SCREENSHOT_OPTS,
    );
  });

  // ── ProposalDetail ('/proposals/:id') ───────────────────────────────────────

  test('ProposalDetail — first proposal', async ({ page }) => {
    // Navigate to the first proposal card if available, otherwise use a known
    // sample ID from the fixture data (P-101).
    await page.goto('/');
    await waitForPageReady(page);

    const firstCard = page
      .locator('.proposal-card, [data-testid="proposal-card"]')
      .first();

    if ((await firstCard.count()) > 0) {
      await firstCard.click();
      await waitForPageReady(page);
    } else {
      // Fallback: navigate directly using a known sample fixture ID.
      await page.goto('/proposals/P-101');
      await waitForPageReady(page);
    }

    await expect(page).toHaveScreenshot('proposal-detail.png', SCREENSHOT_OPTS);
  });

  // ── VotingPanel ('/vote/:id') ───────────────────────────────────────────────

  test('VotingPanel — vote form', async ({ page }) => {
    // Use a known sample proposal ID from the fixture data.
    await page.goto('/vote/P-101');
    await waitForPageReady(page);

    await expect(page).toHaveScreenshot('voting-panel.png', SCREENSHOT_OPTS);
  });

  // ── VoteHistory ('/history') ────────────────────────────────────────────────

  test('VoteHistory — default state', async ({ page }) => {
    await page.goto('/history');
    await waitForPageReady(page);

    await expect(page).toHaveScreenshot('vote-history.png', SCREENSHOT_OPTS);
  });

  // ── GovernanceDashboard ('/dashboard') ─────────────────────────────────────

  test('GovernanceDashboard — default state', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForPageReady(page);

    await expect(page).toHaveScreenshot(
      'governance-dashboard.png',
      SCREENSHOT_OPTS,
    );
  });
});
