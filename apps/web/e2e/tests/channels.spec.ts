import { test, expect } from '../fixtures/index';

test.describe('Multi-channel settings (whole-system smoke)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings/whatsapp-account');
    await page.getByRole('heading', { name: 'WhatsApp Account' }).waitFor({ timeout: 10_000 });
  });

  test('Connected Channels section renders three channel rows', async ({ page }) => {
    await page.getByRole('heading', { name: 'Connected Channels' }).waitFor({ timeout: 10_000 });
    const rows = page.locator('section').filter({ hasText: 'Connected Channels' });
    await expect(rows.getByText('WhatsApp')).toBeVisible();
    await expect(rows.getByText('Messenger / Facebook Pages')).toBeVisible();
    await expect(rows.getByText('Instagram')).toBeVisible();
  });

  test('channel badge is either "Connected" or "Not connected"', async ({ page }) => {
    await page.getByRole('heading', { name: 'Connected Channels' }).waitFor({ timeout: 10_000 });
    const badges = page
      .locator('section')
      .filter({ hasText: 'Connected Channels' })
      .locator('span')
      .filter({ hasText: /^(Connected|Not connected)$/i });
    await expect(badges).toHaveCount(3);
  });

  test('WhatsApp QR Code section is present', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'WhatsApp QR Code' })).toBeVisible();
  });

  test('Marketing Messages section is present', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Marketing Messages' })).toBeVisible();
  });

  test('Danger Zone disconnect button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Disconnect Account' })).toBeVisible();
  });
});
