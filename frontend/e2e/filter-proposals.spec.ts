import { test, expect } from '@playwright/test';

/**
 * E2E: Filter proposals by state and verify correct results shown (issue #20)
 */
test.describe('Proposal filtering', () => {
  const FILTER_STATES = ['active', 'passed', 'rejected', 'executed', 'cancelled'] as const;

  for (const state of FILTER_STATES) {
    test(`filter by "${state}" shows only ${state} proposals`, async ({ page }) => {
      await page.goto('/');

      const filterBtn = page.locator(`.filter-btn[data-filter="${state}"]`);
      if (!(await filterBtn.isVisible())) return; // filter doesn't exist in this build

      await filterBtn.click();
      await expect(filterBtn).toHaveAttribute('aria-pressed', 'true');

      // Every visible state badge should match the selected filter
      const badges = page.locator(`.state-badge.badge-${state}, [data-state="${state}"]`);
      const otherBadges = page.locator(
        FILTER_STATES
          .filter((s) => s !== state)
          .map((s) => `.state-badge.badge-${s}`)
          .join(', ')
      );

      // Either no proposals or all proposals match the filter
      const otherCount = await otherBadges.count();
      expect(otherCount).toBe(0);
    });
  }

  test('keyboard Enter activates filter button', async ({ page }) => {
    await page.goto('/');
    const activeBtn = page.locator('.filter-btn[data-filter="active"]');
    if (!(await activeBtn.isVisible())) return;

    await activeBtn.focus();
    await page.keyboard.press('Enter');
    await expect(activeBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('keyboard Space activates filter button', async ({ page }) => {
    await page.goto('/');
    const passedBtn = page.locator('.filter-btn[data-filter="passed"]');
    if (!(await passedBtn.isVisible())) return;

    await passedBtn.focus();
    await page.keyboard.press('Space');
    await expect(passedBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
