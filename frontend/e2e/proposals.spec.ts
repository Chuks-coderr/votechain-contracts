import { test, expect } from '@playwright/test';

/**
 * E2E: Browse proposal list → click proposal → view detail (issue #20)
 */
test.describe('Proposal browsing', () => {
  test('lists proposals on home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/VoteChain/i);
    // Proposal list or empty state should be visible
    const list = page.locator('#proposal-list, [data-testid="proposal-list"], ul.proposal-list');
    const empty = page.locator('#empty-state, [data-testid="empty-state"]');
    await expect(list.or(empty)).toBeVisible({ timeout: 10_000 });
  });

  test('filter buttons change displayed proposals', async ({ page }) => {
    await page.goto('/');
    // The "all" filter button must have aria-pressed="true" on load (issue #14)
    const allBtn = page.locator('.filter-btn[data-filter="all"]');
    if (await allBtn.isVisible()) {
      await expect(allBtn).toHaveAttribute('aria-pressed', 'true');

      // Click "Active" filter
      const activeBtn = page.locator('.filter-btn[data-filter="active"]');
      await activeBtn.click();
      await expect(activeBtn).toHaveAttribute('aria-pressed', 'true');
      await expect(allBtn).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('navigate to proposal detail', async ({ page }) => {
    await page.goto('/');
    // Click the first proposal card if present
    const firstCard = page.locator('.proposal-card, [data-testid="proposal-card"]').first();
    const cardCount = await firstCard.count();
    if (cardCount > 0) {
      await firstCard.click();
      // Should navigate to a detail or voting page
      await expect(page).not.toHaveURL('/');
    }
  });
});
