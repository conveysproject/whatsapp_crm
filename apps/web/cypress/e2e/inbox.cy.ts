describe('Inbox', () => {
  beforeEach(() => {
    cy.visit('/inbox');
  });

  it('inbox page loads without error', () => {
    cy.get('body').should('be.visible');
    cy.contains(/something went wrong|error/i).should('not.exist');
  });

  it('conversation list or empty state is visible', () => {
    cy.get('body').then(($body) => {
      const hasConvList = $body.find('[data-testid="conversation-list"], aside, nav').length > 0;
      const hasEmptyState = /no conversations|start a conversation/i.test($body.text());
      expect(hasConvList || hasEmptyState).to.be.ok;
    });
  });
});
