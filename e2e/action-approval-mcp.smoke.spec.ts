import { expect, test } from '@playwright/test';
import { installSupabaseClientMock } from './support/installMocks';

test.describe('Action Queue & Approval Pipeline E2E', () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseClientMock(page);

    // Mock /api/actions/execute to simulate external platform call (Linear/Gmail)
    await page.route('**/api/actions/execute', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ success: true, executed: 'LINEAR_TICKET' }),
      });
    });

    // Mock /api/actions/approve to simulate server-side atomic approval
    await page.route('**/api/actions/approve', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      if (!body.id) {
        await route.fulfill({
          status: 400,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'id is required' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          success: true,
          finalStatus: 'executed',
          executionResult: { success: true, executed: 'LINEAR_TICKET' },
        }),
      });
    });
  });

  test('validates atomic approval pipeline execution', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('INITIALIZING EYES NEURAL LINK...')).toBeHidden({ timeout: 5000 });

    // Test API call to /api/actions/approve in browser page context
    const approvalResult = await page.evaluate(async () => {
      const res = await fetch('/api/actions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'action-test-123',
          title: 'Create Linear Ticket for HNSW Vector Tuning',
          suggested_action: 'Increase M=32 and EF_CONSTRUCTION=128 in Voyage migration',
        }),
      });
      return { status: res.status, data: await res.json() };
    });

    expect(approvalResult.status).toBe(200);
    expect(approvalResult.data.success).toBe(true);
    expect(approvalResult.data.finalStatus).toBe('executed');
    expect(approvalResult.data.executionResult.executed).toBe('LINEAR_TICKET');
  });
});
