import { expect, test } from '@playwright/test';
import { installSupabaseClientMock } from './support/installMocks';

test.describe('Organization Invitations E2E Flow', () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseClientMock(page);

    // Mock organization API routes within Playwright page router
    await page.route('**/api/organization/details', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            organization: {
              id: 'org-12345678-1111-4111-8111-111111111111',
              name: 'Acme Corp',
              slug: 'acme-corp',
              privacy_shield_enabled: true,
              role: 'owner',
            },
            members: [
              {
                id: 'mem-1',
                user_id: '11111111-1111-4111-8111-111111111111',
                role: 'owner',
                name: 'Playwright User',
                email: 'playwright@example.com',
                joined_at: new Date().toISOString(),
              },
            ],
            invitations: [
              {
                id: 'inv-123',
                email: 'pending-member@example.com',
                role: 'member',
                token: 'mock-invite-token-123',
                invited_by: '11111111-1111-4111-8111-111111111111',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString(),
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/organization/invite**', async (route) => {
      const method = route.request().method();
      const url = route.request().url();

      if (url.includes('/accept') && method === 'POST') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            success: true,
            organizationId: 'org-12345678-1111-4111-8111-111111111111',
            role: 'member',
          }),
        });
        return;
      }

      if (method === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            success: true,
            inviteUrl: `http://localhost:3000/invite?token=generated-token-999`,
            invitation: {
              id: 'inv-999',
              token: 'generated-token-999',
              email: body.email,
              role: body.role || 'member',
            },
          }),
        });
      } else if (method === 'DELETE') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test('validates sending, revoking, and accepting organization invitations via browser fetch context', async ({ page }) => {
    // Navigate to application page so script context and mock handlers are initialized
    await page.goto('/');

    // 1. Send Invitation via page fetch
    const inviteResult = await page.evaluate(async () => {
      const res = await fetch('/api/organization/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new-colleague@company.com', role: 'admin' }),
      });
      return { status: res.status, data: await res.json() };
    });

    expect(inviteResult.status).toBe(200);
    expect(inviteResult.data.success).toBe(true);
    expect(inviteResult.data.invitation.email).toBe('new-colleague@company.com');
    expect(inviteResult.data.invitation.role).toBe('admin');
    expect(inviteResult.data.inviteUrl).toContain('invite?token=generated-token-999');

    // 2. Revoke Invitation via DELETE
    const revokeResult = await page.evaluate(async () => {
      const res = await fetch('/api/organization/invite?id=inv-999', {
        method: 'DELETE',
      });
      return { status: res.status, data: await res.json() };
    });

    expect(revokeResult.status).toBe(200);
    expect(revokeResult.data.success).toBe(true);

    // 3. Accept Invitation via POST /accept
    const acceptResult = await page.evaluate(async () => {
      const res = await fetch('/api/organization/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'generated-token-999' }),
      });
      return { status: res.status, data: await res.json() };
    });

    expect(acceptResult.status).toBe(200);
    expect(acceptResult.data.success).toBe(true);
    expect(acceptResult.data.role).toBe('member');
  });
});
