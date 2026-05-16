import { test, expect } from '../fixtures/index';
import { CampaignsPage } from '../pages/campaigns.page';

test.describe('Campaigns', () => {
  let campaignsPage: CampaignsPage;

  test.beforeEach(async ({ page }) => {
    campaignsPage = new CampaignsPage(page);
    await campaignsPage.goto();
  });

  test('campaigns page loads', async ({ page }) => {
    await campaignsPage.expectHeading();
    await expect(page.getByRole('link', { name: 'New Campaign' })).toBeVisible();
  });

  test('active and archived tabs are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'active' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'archived' })).toBeVisible();
  });

  test('navigate to New Campaign page', async ({ page }) => {
    await campaignsPage.clickNewCampaign();
    await expect(page).toHaveURL(/campaigns\/new/);
  });

  test('new campaign form loads required fields', async ({ page }) => {
    await campaignsPage.clickNewCampaign();
    await expect(page.getByRole('heading', { name: /New Campaign|Create Campaign/i })).toBeVisible();
  });
});
