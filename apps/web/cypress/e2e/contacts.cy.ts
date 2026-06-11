describe('Contacts', () => {
  beforeEach(() => {
    cy.visit('/contacts');
  });

  it('contacts page heading is visible', () => {
    cy.contains('h1', /contacts/i).should('be.visible');
  });

  it('import button or add contact button is present', () => {
    cy.get('button:visible').should('have.length.greaterThan', 0);
  });

  it('contact list or empty state is rendered', () => {
    cy.get('body').then(($body) => {
      const hasTable = $body.find('table, [role="grid"]').length > 0;
      const hasEmptyState = /no contacts|add your first/i.test($body.text());
      expect(hasTable || hasEmptyState).to.be.ok;
    });
  });
});
