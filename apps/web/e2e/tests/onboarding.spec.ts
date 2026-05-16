import { test, expect } from '../fixtures/index';
import { OnboardingPage } from '../pages/onboarding.page';

test.describe('Onboarding — Connect WhatsApp', () => {
  let onboardingPage: OnboardingPage;

  test.beforeEach(async ({ page }) => {
    onboardingPage = new OnboardingPage(page);
  });

  test('connect-waba page loads with correct heading', async () => {
    await onboardingPage.gotoConnectWaba();
    await onboardingPage.expectConnectWabaHeading();
  });

  test('"Connect with Meta" button is visible', async ({ page }) => {
    await onboardingPage.gotoConnectWaba();
    await onboardingPage.expectConnectWithMetaButton();
    await expect(
      page.getByRole('button', { name: 'Connect with Meta' })
    ).toBeEnabled({ timeout: 15_000 });
  });

  test('"Skip to checklist" link navigates to /checklist', async ({ page }) => {
    await onboardingPage.gotoConnectWaba();
    await onboardingPage.clickSkipToChecklist();
    await expect(page).toHaveURL(/checklist/);
  });

  test('checklist page loads', async ({ page }) => {
    await onboardingPage.gotoChecklist();
    await expect(page.locator('body')).not.toContainText('Error');
  });
});
