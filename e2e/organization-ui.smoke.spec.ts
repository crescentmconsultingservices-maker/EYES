import { expect, test } from '@playwright/test';
import { installSupabaseClientMock } from './support/installMocks';

test.describe('Organization Settings UI Portal E2E', () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseClientMock(page);

    await page.route('**/api/organization/details', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            organization: {
              id: 'org-999',
              name: 'Cyberdyne Systems',
              privacy_shield_enabled: true,
            },
            members: [
              {
                id: 'mem-1',
                user_id: '11111111-1111-4111-8111-111111111111',
                role: 'owner',
                joined_at: new Date().toISOString(),
                profile: { name: 'Playwright User', avatar: 'P' },
              },
            ],
            invitations: [
              {
                id: 'inv-1',
                email: 'sarah.connor@cyberdyne.com',
                role: 'admin',
                token: 'token-abc',
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                accepted_at: null,
              },
            ],
          }),
        });
      } else if (method === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            success: true,
            organization: {
              id: 'org-999',
              name: body.name || 'Cyberdyne Systems',
              privacy_shield_enabled: body.privacyShieldEnabled ?? true,
            },
          }),
        });
      } else {
        await route.continue();
      }
    });
  });

  test('renders organization space tab, displays workspace members, and allows policy updates', async ({ page }) => {
    await page.goto('/settings');

    // 1. Click Organization Space tab
    const orgTabBtn = page.getByRole('button', { name: 'Organization Space' });
    await expect(orgTabBtn).toBeVisible();
    await orgTabBtn.click();

    // 2. Verify Organization Console heading is visible
    await expect(page.getByRole('heading', { name: 'Organization Console' })).toBeVisible();

    // 3. Verify company name input is populated with Cyberdyne Systems
    const orgNameInput = page.getByPlaceholder('Enter organization name...');
    await expect(orgNameInput).toHaveValue('Cyberdyne Systems');

    // 4. Verify workspace members list renders Playwright User
    await expect(page.getByText('Playwright User')).toBeVisible();
    await expect(page.getByText('OWNER', { exact: true })).toBeVisible();

    // 5. Verify pending invite sarah.connor@cyberdyne.com is listed
    await expect(page.getByText('sarah.connor@cyberdyne.com')).toBeVisible();

    // 6. Test updating workspace policy name
    await orgNameInput.fill('Cyberdyne Global');
    const saveBtn = page.getByRole('button', { name: 'Save Workspace Policy' });
    await saveBtn.click();

    // 7. Verify save confirmation status
    await expect(page.getByText('Organization settings saved successfully!')).toBeVisible();
  });
});
