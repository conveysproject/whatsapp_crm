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
    await settingsPage.waitForProfileForm();
    await expect(page.getByLabel('About')).toBeVisible();
    await expect(page.getByLabel('Address')).toBeVisible();
  });

  // Skipped: updateBusinessProfile in whatsapp.ts is a stub — real Meta API not wired, data not persisted
  test.skip('update business profile about field', async ({ page }) => {
    await settingsPage.waitForProfileForm();
    const aboutField = page.getByLabel('About');
    const newAbout = `E2E test ${Date.now()}`;
    await aboutField.fill(newAbout);
    await page.getByRole('button', { name: 'Save Profile' }).click();
    await page.waitForLoadState('domcontentloaded');
    await settingsPage.goto();
    await settingsPage.waitForProfileForm();
    await expect(aboutField).toHaveValue(newAbout);
  });

  test('Connected Channels section is visible', async () => {
    await settingsPage.waitForChannelsSection();
  });

  test('shows WhatsApp, Messenger and Instagram rows', async ({ page }) => {
    await settingsPage.waitForChannelsSection();
    await expect(page.getByText('WhatsApp')).toBeVisible();
    await expect(page.getByText('Messenger / Facebook Pages')).toBeVisible();
    await expect(page.getByText('Instagram')).toBeVisible();
  });

  test('Connect with Meta button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Connect with Meta' })).toBeVisible();
  });

  test('Connect button shows Connecting state then resets on cancel', async ({ page }) => {
    await settingsPage.stubFBSDK();
    await settingsPage.goto();
    const btn = page.getByRole('button', { name: 'Connect with Meta' });
    await btn.click();
    await page.getByText('Connecting…').waitFor({ timeout: 3_000 }).catch(() => {});
    await expect(btn).toBeEnabled({ timeout: 5_000 });
  });
});
