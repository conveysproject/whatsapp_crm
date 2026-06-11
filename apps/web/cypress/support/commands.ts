export {};

declare global {
  namespace Cypress {
    interface Chainable {
      stubFBLogin(opts?: { cancel?: boolean; code?: string }): Chainable;
    }
  }
}

Cypress.Commands.add('stubFBLogin', (opts: { cancel?: boolean; code?: string } = {}) => {
  cy.window().then((win) => {
    (win as unknown as Record<string, unknown>)['FB'] = {
      init: () => {},
      login: (cb: (r: Record<string, unknown>) => void) => {
        if (opts.cancel) {
          cb({ authResponse: null, status: 'unknown' });
        } else {
          cb({ authResponse: { code: opts.code ?? 'test-code-123' }, status: 'connected' });
        }
      },
    };
  });
});
