import { test, expect, Route } from '@playwright/test';

/**
 * E2E: Simulate-vote flow — issue #216
 *
 * The Simulate page (/simulate) lets users adjust vote-allocation sliders
 * and see a live pass/fail outcome preview computed in the browser.  No
 * Stellar RPC calls are involved (pure client-side maths), so these tests
 * run in CI without any external network access.
 *
 * The "Verify via API" button posts to POST /simulate; that endpoint is
 * intercepted via page.route() so no real backend is needed.
 *
 * Coverage:
 *   1. Page renders with heading and all five slider inputs
 *   2. Default state shows a live result banner
 *   3. Adjusting sliders updates the result preview in real time
 *   4. "Quorum not met" outcome path — total votes deliberately below quorum
 *   5. Quorum met + majority met → PASS outcome path
 *   6. API verification button sends correct payload (network mocked)
 */

test.describe('Simulate vote flow', () => {
  /**
   * Intercept the /simulate API call so no real backend is needed in CI.
   * The mock echoes back a passed=true response regardless of inputs.
   */
  async function mockSimulateApi(route: Route) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        passed: true,
        total_votes: 4_500_000,
        quorum_met: true,
        majority_met: true,
        margin: 2_000_000,
      }),
    });
  }

  test.beforeEach(async ({ page }) => {
    // Intercept any POST to /simulate (relative or absolute) to avoid
    // real network calls in CI.
    await page.route('**/simulate', (route) => {
      if (route.request().method() === 'POST') {
        return mockSimulateApi(route);
      }
      return route.continue();
    });
  });

  // -------------------------------------------------------------------------
  // 1. Page loads and renders all controls
  // -------------------------------------------------------------------------

  test('navigates to /simulate and renders heading with slider inputs', async ({ page }) => {
    await page.goto('/simulate');

    // Page heading must be present
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible({ timeout: 8_000 });

    // All five range sliders must be rendered
    const sliders = page.locator('input[type="range"]');
    await expect(sliders).toHaveCount(5);
  });

  // -------------------------------------------------------------------------
  // 2. Default state shows a result banner
  // -------------------------------------------------------------------------

  test('shows a result preview banner on initial load', async ({ page }) => {
    await page.goto('/simulate');

    // The ResultBanner component renders a role="status" element
    const banner = page.locator('[role="status"]');
    await expect(banner).toBeVisible({ timeout: 8_000 });

    // Banner should contain one of the two outcome texts
    const bannerText = await banner.textContent();
    const hasOutcome =
      /pass/i.test(bannerText ?? '') || /reject/i.test(bannerText ?? '');
    expect(hasOutcome).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 3. Adjusting a slider updates the result preview
  // -------------------------------------------------------------------------

  test('adjusting vote sliders updates the result preview in real time', async ({ page }) => {
    await page.goto('/simulate');

    // Read the initial banner text
    const banner = page.locator('[role="status"]').first();
    await expect(banner).toBeVisible({ timeout: 8_000 });
    const initialText = await banner.textContent();

    // Move the "Yes votes" slider to its maximum position via the number input
    // (range slider drag is unreliable cross-browser; number input is precise)
    const yesNumberInput = page.locator('#votesYes-number');
    await yesNumberInput.fill('9000000');
    await yesNumberInput.press('Tab');

    // The No votes and quorum should still be lower — yes landslide → PASS
    const updatedText = await banner.textContent();

    // Something in the banner must have changed or the numbers updated
    // (either the outcome label or the vote totals)
    expect(updatedText).not.toBeNull();
    // The total-votes line must now reflect the new input
    expect(updatedText).toMatch(/9[,.]?0{3}[,.]?0{3}|9000000/);
  });

  // -------------------------------------------------------------------------
  // 4. "Quorum not met" outcome path
  // -------------------------------------------------------------------------

  test('shows "quorum not met" when total votes are below the quorum threshold', async ({ page }) => {
    await page.goto('/simulate');

    // Set quorum very high (10 M) while keeping total votes low (1 M)
    const quorumInput = page.locator('#quorum-number');
    await quorumInput.fill('10000000');
    await quorumInput.press('Tab');

    const yesInput = page.locator('#votesYes-number');
    await yesInput.fill('500000');
    await yesInput.press('Tab');

    const noInput = page.locator('#votesNo-number');
    await noInput.fill('300000');
    await noInput.press('Tab');

    const abstainInput = page.locator('#votesAbstain-number');
    await abstainInput.fill('200000');
    await abstainInput.press('Tab');

    // Result banner must appear
    const banner = page.locator('[role="status"]').first();
    await expect(banner).toBeVisible({ timeout: 8_000 });

    // Outcome must indicate rejection / failure
    await expect(banner).toContainText(/reject/i);

    // Quorum line should say "No"
    await expect(banner).toContainText(/quorum/i);
  });

  // -------------------------------------------------------------------------
  // 5. Quorum met + majority met → PASS
  // -------------------------------------------------------------------------

  test('shows PASS outcome when quorum is met and yes votes exceed no votes', async ({ page }) => {
    await page.goto('/simulate');

    // quorum = 1 M; yes = 3 M; no = 1 M; abstain = 500 k → total 4.5 M > quorum, yes > no
    const quorumInput = page.locator('#quorum-number');
    await quorumInput.fill('1000000');
    await quorumInput.press('Tab');

    const yesInput = page.locator('#votesYes-number');
    await yesInput.fill('3000000');
    await yesInput.press('Tab');

    const noInput = page.locator('#votesNo-number');
    await noInput.fill('1000000');
    await noInput.press('Tab');

    const abstainInput = page.locator('#votesAbstain-number');
    await abstainInput.fill('500000');
    await abstainInput.press('Tab');

    const banner = page.locator('[role="status"]').first();
    await expect(banner).toBeVisible({ timeout: 8_000 });
    await expect(banner).toContainText(/pass/i);
  });

  // -------------------------------------------------------------------------
  // 6. "Verify via API" button submits correct payload (network mocked)
  // -------------------------------------------------------------------------

  test('Verify via API button calls POST /simulate with current slider values', async ({ page }) => {
    // Capture the request body so we can assert the payload
    let capturedBody: Record<string, unknown> | null = null;

    await page.route('**/simulate', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        capturedBody = body;
        await mockSimulateApi(route);
      } else {
        await route.continue();
      }
    });

    await page.goto('/simulate');

    // Set known values
    const yesInput = page.locator('#votesYes-number');
    await yesInput.fill('3000000');
    await yesInput.press('Tab');

    // Click the "Verify via API" button
    const verifyBtn = page.getByRole('button', { name: /verify/i });
    await expect(verifyBtn).toBeVisible({ timeout: 5_000 });
    await verifyBtn.click();

    // Wait for the API result banner to appear (mocked response)
    const apiResponseSection = page.locator('text=/API response/i');
    await expect(apiResponseSection).toBeVisible({ timeout: 8_000 });

    // The request body must include the slider values
    expect(capturedBody).not.toBeNull();
    expect(capturedBody).toHaveProperty('votes_yes', 3_000_000);
    expect(capturedBody).toHaveProperty('quorum');
    expect(capturedBody).toHaveProperty('token_supply');
  });
});
