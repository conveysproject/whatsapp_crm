import { test, expect } from '../fixtures/index';
import { SettingsWaPage } from '../pages/settings-wa.page';

test.describe('WhatsApp Account Settings', () => {
  let settingsPage: SettingsWaPage;

  test.beforeEach(async ({ page }) => {
    settingsPage = new SettingsWaPage(page);
    await settingsPage.goto();
  });

  test('WhatsApp Account page loads', async () => {
    await settingsPage.expectHeading();
  });

  test('connection status section is visible', async ({ page }) => {
    await expect(page.getByText(/connected|disconnected|checking/i).first()).toBeVisible();
  });

  test('Sync from Meta button is visible and clickable', async ({ page }) => {
    const syncBtn = page.getByRole('button', { name: 'Sync from Meta' });
    await expect(syncBtn).toBeVisible();
    await settingsPage.syncPhoneNumbers();
    await expect(syncBtn).toBeVisible();
  });

  test('business profile form fields are visible', async ({ page }) => {
    await expect(page.getByLabel('About')).toBeVisible();
    await expect(page.getByLabel('Address')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Profile' })).toBeVisible();
  });

  test('update business profile about field', async ({ page }) => {
    const aboutField = page.getByLabel('About');
    const newAbout = `E2E test ${Date.now()}`;
    await aboutField.fill(newAbout);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await page.waitForLoadState('networkidle');
    await settingsPage.goto();
    await expect(aboutField).toHaveValue(newAbout);
  });
});
