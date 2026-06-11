import React from 'react';
import { EmbeddedSignupButton } from '../../components/whatsapp/EmbeddedSignupButton';

describe('EmbeddedSignupButton', () => {
  it('renders Connect with Meta button', () => {
    cy.mount(
      <EmbeddedSignupButton
        flow="reconnect"
        onSuccess={cy.stub()}
        onError={cy.stub()}
      />,
    );
    cy.contains('button', 'Connect with Meta').should('be.visible').and('not.be.disabled');
  });

  it('shows Connecting… when clicked', () => {
    cy.mount(
      <EmbeddedSignupButton
        flow="reconnect"
        onSuccess={cy.stub()}
        onError={cy.stub()}
      />,
    );
    cy.window().then((win) => {
      (win as unknown as Record<string, unknown>)['FB'] = {
        init: () => {},
        login: () => {
          // Popup that never closes — loading state persists
        },
      };
    });
    cy.contains('button', 'Connect with Meta').click();
    cy.contains('Connecting…').should('be.visible');
  });

  it('calls onError with "Connection was cancelled." when FB returns no authResponse', () => {
    const onError = cy.stub();
    cy.mount(
      <EmbeddedSignupButton
        flow="reconnect"
        onSuccess={cy.stub()}
        onError={onError}
      />,
    );
    cy.window().then((win) => {
      (win as unknown as Record<string, unknown>)['FB'] = {
        init: () => {},
        login: (cb: (r: Record<string, unknown>) => void) => {
          cb({ authResponse: null, status: 'unknown' });
        },
      };
    });
    cy.contains('button', 'Connect with Meta').click();
    cy.wrap(onError).should('have.been.calledWith', 'Connection was cancelled.');
  });

  it('calls onSuccess after receiving WA_EMBEDDED_SIGNUP + auth code', () => {
    const onSuccess = cy.stub();
    cy.intercept('POST', '**/v1/whatsapp-account/connect', {
      statusCode: 200,
      body: {
        data: {
          wabaId: 'waba-1',
          wabaName: 'Test',
          phoneNumberId: 'pn-1',
          displayPhoneNumber: '+91 99999 00001',
          metaBusinessId: 'biz-1',
          facebookPageIds: [],
          instagramAccountIds: [],
        },
      },
    }).as('connectApi');

    cy.mount(
      <EmbeddedSignupButton
        flow="reconnect"
        onSuccess={onSuccess}
        onError={cy.stub()}
      />,
    );

    cy.fixture('wa-session-event').then((evt: Record<string, unknown>) => {
      cy.window().then((win) => {
        (win as unknown as Record<string, unknown>)['FB'] = {
          init: () => {},
          login: (cb: (r: Record<string, unknown>) => void) => {
            win.dispatchEvent(
              new MessageEvent('message', {
                data: JSON.stringify(evt),
                origin: 'https://www.facebook.com',
              }),
            );
            setTimeout(() => cb({ authResponse: { code: 'auth-code-xyz' }, status: 'connected' }), 50);
          },
        };
      });
    });

    cy.contains('button', 'Connect with Meta').click();
    cy.wait('@connectApi');
    cy.wrap(onSuccess).should('have.been.called');
  });
});
