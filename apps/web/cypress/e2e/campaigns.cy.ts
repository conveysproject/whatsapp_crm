describe('Campaigns', () => {
  beforeEach(() => {
    cy.visit('/campaigns');
  });

  it('campaigns page heading is visible', () => {
    cy.contains('h1', /campaigns/i).should('be.visible');
  });

  it('create campaign button or empty state is present', () => {
    cy.get('body').then(($body) => {
      const hasButton = $body.find('button').filter(':contains("Create"), :contains("New Campaign")').length > 0;
      const hasEmptyState = /no campaigns|create your first/i.test($body.text());
      expect(hasButton || hasEmptyState).to.be.ok;
    });
  });
});
