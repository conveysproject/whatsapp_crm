import { test, expect } from '../fixtures/index';
import { ContactsPage } from '../pages/contacts.page';

const TEST_CONTACT_NAME = `[E2E] Contact ${Date.now()}`;
const TEST_CONTACT_PHONE = '919900000001';

test.describe('Contacts', () => {
  test('contacts page loads', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
    await expect(page.getByPlaceholder('Search contacts…')).toBeVisible();
  });

  test('create a new contact', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.clickAddContact();
    await cp.fillNewContactForm({ name: TEST_CONTACT_NAME, phone: TEST_CONTACT_PHONE });
    await cp.submitNewContactForm();
    await cp.expectContactInList(TEST_CONTACT_NAME);
  });

  test('search for a contact', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.search('[E2E]');
    await expect(page.getByRole('row').filter({ hasText: '[E2E]' }).first()).toBeVisible();
  });

  test('open a contact and add notes', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.search(TEST_CONTACT_NAME);
    await cp.openContact(TEST_CONTACT_NAME);
    const notesField = page.getByLabel('Notes');
    await notesField.fill('E2E test note');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(notesField).toHaveValue('E2E test note');
  });

  test('block and unblock a contact', async ({ page }) => {
    const cp = new ContactsPage(page);
    await cp.goto();
    await cp.search(TEST_CONTACT_NAME);
    await cp.openContact(TEST_CONTACT_NAME);
    await cp.blockContact();
    await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
    await cp.unblockContact();
    await expect(page.getByRole('button', { name: 'Block' })).toBeVisible();
  });
});
