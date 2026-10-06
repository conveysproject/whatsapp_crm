import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiCredentialsSection } from '../../components/settings/ApiCredentialsSection';
import VendorSettingsPage from '../../app/(dashboard)/settings/vendor-settings/page';

const active = {
  id: 'MAACTIVE0001',
  name: 'Production',
  callbackUrl: 'https://example.com/status',
  inboundUrl: null,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const revoked = { ...active, id: 'MAREVOKED002', name: 'Old key', revokedAt: '2026-02-01T00:00:00.000Z' };

function mountSection(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <QueryClientProvider client={qc}>
      <ApiCredentialsSection />
    </QueryClientProvider>,
  );
}

function stubMe(): void {
  cy.intercept('GET', '/api/v1/users/me', {
    body: { data: { id: 'u1', fullName: 'A', email: 'a@x.com', role: 'admin', permissions: {} } },
  });
}

describe('ApiCredentialsSection', () => {
  beforeEach(() => stubMe());

  it('renders the list including a revoked row without actions', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [active, revoked] } });
    mountSection();
    cy.contains('Production').should('be.visible');
    cy.contains('MAACTIVE0001').should('be.visible');
    cy.contains('Never').should('be.visible');
    cy.contains('a', 'View usage').should('have.attr', 'href', '/settings/api-usage');
    cy.get('[data-revoked="false"]').within(() => {
      cy.contains('button', 'Rotate').should('exist');
      cy.contains('button', 'Revoke').should('exist');
    });
    cy.get('[data-revoked="true"]').within(() => {
      cy.contains('Revoked').should('exist');
      cy.get('button[aria-label^="Edit"], button[aria-label^="Rotate"], button[aria-label^="Revoke"]').should('not.exist');
    });
  });

  it('shows the empty state with a create button', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } });
    mountSection();
    cy.contains('No API credentials yet').should('be.visible');
    cy.contains('button', 'Create credential').should('be.visible');
  });

  it('renders nothing at all on API_NOT_AVAILABLE (orgs without API access never see the section)', () => {
    cy.intercept('GET', '/api/v1/api-credentials', {
      statusCode: 403,
      body: { error: { code: 'API_NOT_AVAILABLE', message: 'API access is not available for this organization.' } },
    }).as('list');
    mountSection();
    cy.wait('@list');
    cy.contains('API Credentials').should('not.exist');
    cy.contains('View usage').should('not.exist');
    cy.contains('not available').should('not.exist');
    cy.contains('button', 'Create credential').should('not.exist');
  });

  it('disables Create and shows "10 of 10 active credentials" at the cap; revoked ones do not count', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...active, id: `MAACT${i}`, name: `Key ${i}` }));
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [...ten, revoked] } });
    mountSection();
    cy.contains('button', 'Create credential').should('be.disabled');
    cy.get('[data-testid="credential-limit"]').should('contain.text', '10 of 10 active credentials');
  });

  it('keeps Create enabled with 9 active credentials plus revoked ones', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...active, id: `MAACT${i}`, name: `Key ${i}` }));
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [...nine, revoked, revoked] } });
    mountSection();
    cy.contains('button', 'Create credential').should('not.be.disabled');
    cy.get('[data-testid="credential-limit"]').should('not.exist');
  });

  it('shows the server message when the create call is rejected with CREDENTIAL_LIMIT', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } });
    cy.intercept('POST', '/api/v1/api-credentials', {
      statusCode: 409,
      body: { error: { code: 'CREDENTIAL_LIMIT', message: 'You can have at most 10 active credentials. Revoke one first.' } },
    });
    mountSection();
    cy.contains('button', 'Create credential').click();
    cy.get('#cred-create-name').type('CI');
    cy.get('[role="dialog"]').contains('button', 'Create credential').click();
    cy.contains('You can have at most 10 active credentials. Revoke one first.').should('be.visible');
  });

  it('does not flash the section while the first request is still loading', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { delay: 1500, body: { data: [] } }).as('delayedList');
    mountSection();
    cy.contains('API Credentials').should('not.exist');
    cy.wait('@delayedList');
    cy.contains('API Credentials').should('be.visible');
  });

  it('shows an inline error with Retry on other errors', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Boom' } } });
    mountSection();
    cy.contains('Boom').should('be.visible');
    cy.contains('button', 'Retry').should('be.visible');
  });

  it('validates the create form, then reveals the token once and removes it from the DOM on close', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } });
    cy.intercept('POST', '/api/v1/api-credentials', {
      statusCode: 201,
      body: { data: { authId: 'MANEW000001', authToken: 'SECRET-TOKEN-XYZ', name: 'CI', createdAt: '2026-01-01T00:00:00.000Z' } },
    }).as('create');
    mountSection();
    cy.contains('button', 'Create credential').click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains('button', 'Create credential').click();
      cy.contains('Name is required.').should('be.visible');
      cy.get('#cred-create-name').type('CI');
      cy.get('#cred-create-callbackUrl').type('http://insecure.example.com');
      cy.contains('button', 'Create credential').click();
      cy.contains('Callback URL must start with https://').should('be.visible');
      cy.get('#cred-create-callbackUrl').clear().type('https://ok.example.com/cb');
      cy.contains('button', 'Create credential').click();
    });
    cy.wait('@create').its('request.body').should('deep.equal', { name: 'CI', callbackUrl: 'https://ok.example.com/cb' });
    cy.contains('This token is shown only once. Store it securely').should('be.visible');
    cy.get('#reveal-auth-token').should('have.value', 'SECRET-TOKEN-XYZ');
    cy.contains('/v1/Account/MANEW000001/Message/').should('be.visible');
    // Escape is blocked until acknowledged
    cy.get('body').type('{esc}');
    cy.get('#reveal-auth-token').should('exist');
    cy.contains('button', "I've saved it").click();
    cy.get('#reveal-auth-token').should('not.exist');
    cy.get('body').should('not.contain.text', 'SECRET-TOKEN-XYZ');
    cy.document().then((doc) => {
      expect(doc.documentElement.innerHTML).not.to.contain('SECRET-TOKEN-XYZ');
    });
  });

  it('shows the server message for INVALID_URL', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } });
    cy.intercept('POST', '/api/v1/api-credentials', {
      statusCode: 400,
      body: { error: { code: 'INVALID_URL', message: 'callbackUrl must be a public https URL' } },
    });
    mountSection();
    cy.contains('button', 'Create credential').click();
    cy.get('#cred-create-name').type('CI');
    cy.get('#cred-create-callbackUrl').type('https://localhost.example.com');
    cy.get('[role="dialog"]').contains('button', 'Create credential').click();
    cy.contains('callbackUrl must be a public https URL').should('be.visible');
  });

  it('edits, sending null for a cleared URL', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [active] } });
    cy.intercept('PATCH', '/api/v1/api-credentials/MAACTIVE0001', { body: { data: active } }).as('patch');
    mountSection();
    cy.get('button[aria-label="Edit Production"]').click();
    cy.get('#cred-edit-callbackUrl').clear();
    cy.contains('button', 'Save changes').click();
    cy.wait('@patch').its('request.body').should('deep.equal', { name: 'Production', callbackUrl: null, inboundUrl: null });
  });

  it('rotate confirms, calls the rotate endpoint and reveals the new token', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [active] } });
    cy.intercept('POST', '/api/v1/api-credentials/MAACTIVE0001/rotate', {
      body: { data: { authId: 'MAACTIVE0001', authToken: 'ROTATED-TOKEN' } },
    }).as('rotate');
    mountSection();
    cy.get('button[aria-label="Rotate token for Production"]').click();
    cy.contains('The current token stops working immediately').should('be.visible');
    cy.get('[role="dialog"]').contains('button', 'Rotate token').click();
    cy.wait('@rotate');
    cy.get('#reveal-auth-token').should('have.value', 'ROTATED-TOKEN');
  });

  it('revoke confirms, calls DELETE and refreshes the list', () => {
    let revokedNow = false;
    cy.intercept('GET', '/api/v1/api-credentials', (req) => {
      req.reply({ body: { data: [revokedNow ? { ...active, revokedAt: '2026-03-01T00:00:00.000Z' } : active] } });
    });
    cy.intercept('DELETE', '/api/v1/api-credentials/MAACTIVE0001', (req) => {
      revokedNow = true;
      req.reply({ statusCode: 204 });
    }).as('del');
    mountSection();
    cy.get('button[aria-label="Revoke Production"]').click();
    cy.contains('Requests using this credential will fail immediately. This cannot be undone.').should('be.visible');
    cy.get('[role="dialog"]').contains('button', 'Revoke').click();
    cy.wait('@del');
    cy.get('[data-revoked="true"]').should('exist');
  });

  it('shows the impersonation read-only message when a write is blocked', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [active] } });
    cy.intercept('DELETE', '/api/v1/api-credentials/MAACTIVE0001', {
      statusCode: 403,
      body: { error: { code: 'IMPERSONATION_READ_ONLY', message: 'This session is read-only.' } },
    });
    mountSection();
    cy.get('button[aria-label="Revoke Production"]').click();
    cy.get('[role="dialog"]').contains('button', 'Revoke').click();
    cy.contains('This session is read-only.').should('be.visible');
  });
});

describe('Vendor settings page', () => {
  it('no longer shows the old API Access Token card or saves vendor_api_access_token', () => {
    stubMe();
    cy.intercept('GET', '/api/v1/vendor-settings', {
      body: { data: { vendor_api_access_token: 'legacy-value', enable_bot_timing_restrictions: 'false' } },
    });
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } });
    cy.intercept('PUT', '/api/v1/vendor-settings', { body: { data: {} } }).as('save');
    const qc = new QueryClient();
    cy.mount(
      <QueryClientProvider client={qc}>
        <VendorSettingsPage />
      </QueryClientProvider>,
    );
    cy.contains('API Access Token').should('not.exist');
    cy.contains('TrustCRM').should('not.exist');
    cy.contains('h2', 'API Credentials').should('be.visible');
    cy.contains('button', 'Save Settings').click();
    cy.wait('@save').then((i) => {
      expect(JSON.stringify(i.request.body)).not.to.contain('vendor_api_access_token');
    });
  });
});
