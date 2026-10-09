import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RequestHistory } from '../../components/settings/api-usage/RequestHistory';
import { CallbackAttempts } from '../../components/settings/api-usage/CallbackAttempts';

const MSG = '11111111-1111-4111-8111-111111111111';

const payloadRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, createdAt: '2026-10-08T10:11:36.000Z', method: 'POST', endpoint: 'message.send', statusCode: 400,
  outcome: 'client_error', errorClass: 'validation', errorCode: 'TEMPLATE_PARAMS_MISMATCH', durationMs: 66, apiKeyId: 'k1', ...over,
});

const detail = (id: string, over: Record<string, unknown> = {}) => ({
  id, requestBody: '{"dst":"1"}', responseBody: '{"error":"template parameters not matched"}',
  requestTruncated: false, responseTruncated: false, queryString: null, clientIp: null, userAgent: null, ...over,
});

const attempt = (id: string, over: Record<string, unknown> = {}) => ({
  id, createdAt: '2026-10-08T10:12:00.000Z', messageId: MSG, url: 'https://c.example.com/cb', method: 'POST', attempt: 1,
  outcome: 'http_error', httpStatus: 500, reason: null, durationMs: 80, fields: { Status: 'sent' }, ...over,
});

function mountHistory(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <QueryClientProvider client={qc}>
      <RequestHistory apiKeyId={null} credentialNames={new Map([['k1', 'Production']])} />
    </QueryClientProvider>,
  );
}

function mountCallbacks(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <QueryClientProvider client={qc}>
      <CallbackAttempts />
    </QueryClientProvider>,
  );
}

function stubList(rows: Array<Record<string, unknown>> = [payloadRow('p1')]): void {
  cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads' }, { body: { enabled: true, data: rows, nextCursor: null } });
}

describe('RequestHistory', () => {
  it('lists requests with the 365 day title', () => {
    stubList();
    mountHistory();
    cy.contains('h2', 'Request history (kept 365 days)').should('be.visible');
    cy.get('[data-testid="request-history-row"]').should('have.length', 1).first()
      .should('contain', 'Send message').and('contain', '400').and('contain', 'TEMPLATE_PARAMS_MISMATCH').and('contain', 'Production').and('contain', '66 ms');
  });

  it('expanding a row loads the detail and pretty-prints JSON bodies', () => {
    stubList();
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads/p1' }, { body: detail('p1') }).as('detail');
    mountHistory();
    cy.contains('button', 'View').click();
    cy.wait('@detail');
    cy.get('[data-testid="payload-request"]').should('contain', '"dst": "1"');
    cy.get('[data-testid="payload-response"]').should('contain', 'template parameters not matched');
    cy.contains('truncated').should('not.exist');
    cy.contains('button', 'Hide').click();
    cy.get('[data-testid="request-history-detail"]').should('not.exist');
  });

  it('shows the truncated note when a body was cut', () => {
    stubList();
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads/p1' }, { body: detail('p1', { requestTruncated: true }) });
    mountHistory();
    cy.contains('button', 'View').click();
    cy.contains('Body was truncated at 16 KB').should('be.visible');
  });

  it('shows a notice instead of the table when logging is not enabled', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads' }, { body: { enabled: false, data: [], nextCursor: null } });
    mountHistory();
    cy.contains('Request logging is not enabled for this platform yet.').should('be.visible');
    cy.get('[data-testid="request-history-table"]').should('not.exist');
  });

  it('shows an error with Retry and recovers', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads' }, (req) => {
      calls += 1;
      if (calls === 1) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Boom happened' } } });
      else req.reply({ body: { enabled: true, data: [payloadRow('p1')], nextCursor: null } });
    });
    mountHistory();
    cy.get('[role="alert"]').should('contain', 'Boom happened');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="request-history-row"]').should('have.length', 1);
  });

  it('loads more pages with the cursor', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads' }, (req) => {
      if (req.query['cursor'] === 'next1') req.reply({ body: { enabled: true, data: [payloadRow('p2')], nextCursor: null } });
      else req.reply({ body: { enabled: true, data: [payloadRow('p1')], nextCursor: 'next1' } });
    });
    mountHistory();
    cy.get('[data-testid="request-history-row"]').should('have.length', 1);
    cy.contains('button', 'Load more').click();
    cy.get('[data-testid="request-history-row"]').should('have.length', 2);
    cy.contains('button', 'Load more').should('not.exist');
  });

  it('renders stored bodies as literal text and never as HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    stubList();
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads/p1' }, { body: detail('p1', { requestBody: evil, responseBody: JSON.stringify({ note: evil }) }) });
    mountHistory();
    cy.contains('button', 'View').click();
    cy.get('[data-testid="payload-request"]').should('have.text', evil);
    cy.get('[data-testid="payload-response"]').should('contain.text', evil);
    cy.get('[data-testid="request-history-detail"] img').should('not.exist');
  });

  it('does not throw when the clipboard is unavailable', () => {
    stubList();
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/payloads/p1' }, { body: detail('p1') });
    mountHistory();
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'clipboard', { value: undefined, configurable: true });
    });
    cy.contains('button', 'View').click();
    cy.get('[aria-label="Copy request"]').click();
    cy.get('[data-testid="payload-request"]').should('be.visible');
  });
});

describe('CallbackAttempts', () => {
  it('rejects a non-UUID without calling the API', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/callbacks' }, (req) => {
      calls += 1;
      req.reply({ body: { data: [], nextCursor: null } });
    });
    mountCallbacks();
    cy.get('#callback-message-uuid').type('not-a-uuid');
    cy.contains('button', 'Search').click();
    cy.get('[role="alert"]').should('contain', 'Enter the message_uuid returned by the API.');
    cy.then(() => expect(calls).to.eq(0));
  });

  it('lists attempts with result labels and HTTP status', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/callbacks' }, {
      body: {
        data: [
          attempt('a1'),
          attempt('a2', { attempt: 2, outcome: 'delivered', httpStatus: 200 }),
          attempt('a3', { attempt: 3, outcome: 'network_error', httpStatus: null, reason: 'timeout' }),
          attempt('a4', { attempt: 4, outcome: 'dropped', httpStatus: null, reason: 'blocked address' }),
        ],
        nextCursor: null,
      },
    }).as('callbacks');
    mountCallbacks();
    cy.get('#callback-message-uuid').type(MSG);
    cy.contains('button', 'Search').click();
    cy.wait('@callbacks').its('request.query.messageId').should('eq', MSG);
    cy.get('[data-testid="callback-attempt-row"]').should('have.length', 4);
    cy.get('[data-testid="callback-attempts-table"]').should('contain', '500').and('contain', 'HTTP error').and('contain', 'Delivered')
      .and('contain', 'Network error').and('contain', 'timeout').and('contain', 'Dropped').and('contain', '80 ms');
  });

  it('shows the empty message when there are no attempts', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/callbacks' }, { body: { data: [], nextCursor: null } });
    mountCallbacks();
    cy.get('#callback-message-uuid').type(MSG);
    cy.contains('button', 'Search').click();
    cy.contains('No delivery attempts found for this message.').should('be.visible');
  });

  it('shows an error with Retry', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/callbacks' }, (req) => {
      calls += 1;
      if (calls === 1) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Boom happened' } } });
      else req.reply({ body: { data: [attempt('a1')], nextCursor: null } });
    });
    mountCallbacks();
    cy.get('#callback-message-uuid').type(MSG);
    cy.contains('button', 'Search').click();
    cy.get('[role="alert"]').should('contain', 'Boom happened');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="callback-attempt-row"]').should('have.length', 1);
  });
});
