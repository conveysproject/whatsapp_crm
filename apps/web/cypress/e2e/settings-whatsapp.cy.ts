describe('WhatsApp Account Settings', () => {
  beforeEach(() => {
    cy.visit('/settings/whatsapp-account');
  });

  it('page heading is visible', () => {
    cy.contains('h1', 'WhatsApp Account').should('be.visible');
  });

  it('Connected Channels section renders all three rows', () => {
    cy.contains('h2', 'Connected Channels').should('be.visible');
    cy.contains('WhatsApp').should('be.visible');
    cy.contains('Messenger / Facebook Pages').should('be.visible');
    cy.contains('Instagram').should('be.visible');
  });

  it('each channel shows a Connected or Not connected badge', () => {
    cy.contains('h2', 'Connected Channels').should('be.visible');
    cy.get('section')
      .contains('Connected Channels')
      .closest('section')
      .find('span')
      .filter(':contains("Connected"), :contains("Not connected")')
      .should('have.length', 3);
  });

  it('Connect with Meta button is visible', () => {
    cy.contains('button', 'Connect with Meta').should('be.visible');
  });

  it('clicking Connect with Meta shows Connecting state then resets on cancel', () => {
    cy.stubFBLogin({ cancel: true });
    cy.contains('button', 'Connect with Meta').click();
    cy.contains('Connecting…').should('exist');
    cy.contains('button', 'Connect with Meta').should('be.visible').and('not.be.disabled');
  });

  it('WA_EMBEDDED_SIGNUP postMessage from facebook.com domain is handled', () => {
    cy.fixture('wa-session-event').then((evt: Record<string, unknown>) => {
      cy.window().then((win) => {
        win.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify(evt),
            origin: 'https://www.facebook.com',
          }),
        );
      });
    });
    cy.contains('h1', 'WhatsApp Account').should('be.visible');
  });

  it('Disconnect Account button is in the Danger Zone', () => {
    cy.contains('h2', 'Danger Zone').should('be.visible');
    cy.contains('button', 'Disconnect Account').should('be.visible');
  });

  it('Sync from Meta button is visible', () => {
    cy.contains('button', 'Sync from Meta').should('be.visible');
  });
});
