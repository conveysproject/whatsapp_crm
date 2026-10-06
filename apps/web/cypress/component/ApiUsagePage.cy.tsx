import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApiUsagePage from '../../app/(dashboard)/settings/api-usage/page';
import { ApiUsageLink } from '../../components/settings/api-usage/ApiUsageLink';

const counts = {
  requests: 0, success: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, authFailures: 0, failedSignins: 0,
  billableRequests: 0, errorRate: 0, messages: 0, avgLatencyMs: 0, maxLatencyMs: 0,
};

function summary(over: Record<string, unknown> = {}, granularity: 'day' | 'hour' = 'day', approximate = false) {
  return {
    range: { from: '2026-09-30T00:00:00.000Z', to: '2026-10-07T00:00:00.000Z', granularity, approximate },
    totals: { ...counts, requests: 100, success: 80, clientErrors: 15, serverErrors: 5, authFailures: 5, failedSignins: 5, errorRate: 0.1579, messages: 42, avgLatencyMs: 120, maxLatencyMs: 900, billableRequests: 95 },
    series: [
      { t: '2026-10-05', requests: 60, success: 50, errors: 8, failedSignins: 2 },
      { t: '2026-10-06', requests: 40, success: 30, errors: 7, failedSignins: 3 },
    ],
    byEndpoint: [{ endpoint: 'message.send', ...counts, requests: 70, success: 55, clientErrors: 12, serverErrors: 3, avgLatencyMs: 150 }],
    byCredential: [
      { apiKeyId: 'k1', name: 'Production', revoked: false, lastUsedAt: null, ...counts, requests: 90, clientErrors: 10, messages: 40 },
      { apiKeyId: 'k2', name: 'Old key', revoked: true, lastUsedAt: '2026-01-01T00:00:00.000Z', ...counts, requests: 10, messages: 2 },
    ],
    messagesByStatus: { queued: 1, sent: 2, delivered: 30, read: 5, failed: 3, undelivered: 1 },
    topFailureReasons: [{ code: '131049', title: 'Ecosystem engagement', count: 3 }],
    ...over,
  };
}

const failedRow = (id: string, apiKeyId: string | null = 'k1') => ({
  id, createdAt: '2026-10-06T10:00:00.000Z', method: 'POST', endpoint: 'message.send', statusCode: 400,
  outcome: 'client_error', errorClass: 'validation', durationMs: 33, messages: 0, requestId: 'r-' + id, apiKeyId,
});

function stubMe(): void {
  cy.intercept('GET', '/api/v1/users/me', {
    body: { data: { id: 'u1', fullName: 'A', email: 'a@x.com', role: 'admin', permissions: {} } },
  });
}

function stubCredentials(): void {
  const cred = (id: string, name: string, revokedAt: string | null) => ({
    id, name, callbackUrl: null, inboundUrl: null, lastUsedAt: null, revokedAt, createdAt: '2026-01-01T00:00:00.000Z',
  });
  cy.intercept('GET', '/api/v1/api-credentials', {
    body: { data: [cred('k1', 'Production', null), cred('k2', 'Old key', '2026-02-01T00:00:00.000Z'), cred('k3', 'Archived key', '2026-03-01T00:00:00.000Z')] },
  });
}

function stubRequests(): void {
  cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/requests' }, { body: { data: [failedRow('r1')], nextCursor: null } }).as('failed');
}

function mountPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <QueryClientProvider client={qc}>
      <ApiUsagePage />
    </QueryClientProvider>,
  );
}

describe('ApiUsagePage', () => {
  beforeEach(() => {
    stubMe();
    stubCredentials();
  });

  it('renders cards, chart table, tables and the failed request row', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() }).as('summary');
    stubRequests();
    mountPage();
    cy.wait('@summary').its('request.query').should('deep.include', { range: '7d' });
    cy.get('[data-testid="metric-requests"]').should('contain', '100');
    cy.get('[data-testid="metric-success-rate"]').should('contain', '80%');
    // errors = 15 + 5 - 5 = 15 ; error rate subtext
    cy.get('[data-testid="metric-errors"]').should('contain', '15').and('contain', '15.8%');
    cy.get('[data-testid="metric-failed-signins"]').should('contain', '5').and('contain', 'Requests with a wrong token');
    cy.get('[data-testid="metric-messages"]').should('contain', '42');
    cy.get('[data-testid="metric-latency"]').should('contain', '120 ms').and('contain', 'Max 900 ms');
    cy.get('body').invoke('text').should((text) => {
      expect(text.toLowerCase()).not.to.contain('billable');
      expect(text).not.to.match(/\b95\b/); // the billableRequests value from the fixture
    });
    cy.contains('error rate excludes failed sign-ins').should('be.visible');
    cy.contains('Not counting failed sign-ins').should('be.visible');
    cy.get('[data-testid="usage-chart-table"] tbody tr').should('have.length', 2);
    cy.get('[data-testid="endpoint-table"]').should('contain', 'Send message');
    cy.get('[data-testid="status-chips"]').should('contain', 'Delivered').and('contain', '30');
    cy.get('[data-testid="failure-table"]').should('contain', '131049').and('contain', 'Ecosystem engagement');
    cy.get('[data-testid="credential-table"]').should('contain', 'Production').and('contain', 'Revoked').and('contain', 'Never');
    cy.get('[data-testid="failed-request-row"]').should('have.length', 1).first().should('contain', 'Send message').and('contain', '400').and('contain', 'Invalid request').and('contain', 'Production').and('contain', '33 ms');
    cy.contains('Hourly numbers are approximate').should('not.exist');
    cy.get('[data-testid="hourly-note"]').should('not.exist');
  });

  it('shows the empty state with a link to API Credentials when there are no calls', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary({ totals: counts, series: [], byEndpoint: [], byCredential: [] }) });
    stubRequests();
    mountPage();
    cy.get('[data-testid="usage-empty"]').should('contain', 'No API requests in the last 7 days');
    cy.contains('a', 'API Credentials').should('have.attr', 'href', '/settings/vendor-settings');
    cy.get('[data-testid="metric-requests"]').should('not.exist');
    // the failed requests panel is NOT hidden by the empty state
    cy.contains('h2', 'Recent failed requests').should('be.visible');
    cy.contains('Failed requests in the selected period').should('be.visible');
    cy.get('[data-testid="failed-request-row"]').should('have.length', 1);
    cy.get('#usage-range').select('24h');
    cy.get('[data-testid="usage-empty"]').should('contain', 'No API requests in the last 24 hours');
    cy.get('#usage-range').select('30d');
    cy.get('[data-testid="usage-empty"]').should('contain', 'No API requests in the last 30 days');
  });

  it('still accepts a { data } envelope around the summary', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: { data: summary() } });
    stubRequests();
    mountPage();
    cy.get('[data-testid="metric-requests"]').should('contain', '100');
  });

  it('treats a body without totals/range/series as an error (inline alert + Retry), not the empty state', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, (req) => {
      calls += 1;
      req.reply({ body: calls === 1 ? {} : summary() });
    });
    stubRequests();
    mountPage();
    cy.get('[role="alert"]').should('contain', 'unexpected format');
    cy.contains('button', 'Retry').should('be.visible');
    cy.get('[data-testid="usage-empty"]').should('not.exist');
    cy.get('[data-testid="metric-requests"]').should('not.exist');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="metric-requests"]').should('contain', '100');
  });

  it('shows a calm message and no retry on API_NOT_AVAILABLE', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, {
      statusCode: 403, body: { error: { code: 'API_NOT_AVAILABLE', message: 'API access is not available for this organization.' } },
    }).as('summary');
    mountPage();
    cy.wait('@summary');
    cy.contains('API usage is not available for this organization.').should('be.visible');
    cy.contains('button', 'Retry').should('not.exist');
  });

  it('shows an inline error with Retry for other errors and recovers', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, (req) => {
      calls += 1;
      if (calls === 1) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Boom happened' } } });
      else req.reply({ body: summary() });
    });
    stubRequests();
    mountPage();
    cy.get('[role="alert"]').should('contain', 'Boom happened');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="metric-requests"]').should('contain', '100');
  });

  it('refetches with the new range', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() }).as('summary');
    stubRequests();
    mountPage();
    cy.wait('@summary');
    cy.get('#usage-range').select('30d');
    cy.wait('@summary').its('request.query.range').should('eq', '30d');
    cy.get('#usage-range').select('24h');
    cy.wait('@summary').its('request.query.range').should('eq', '24h');
  });

  it('filters by credential from the dropdown and by clicking a table row', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, (req) => {
      const id = req.query['apiKeyId'];
      req.reply({
        body: id
          ? summary({ byCredential: [{ apiKeyId: 'k2', name: 'Old key', revoked: true, lastUsedAt: null, ...counts, requests: 10 }] })
          : summary(),
      });
    }).as('summary');
    stubRequests();
    mountPage();
    cy.wait('@summary').its('request.query').should('not.have.property', 'apiKeyId');
    cy.get('#usage-credential option').should('have.length', 3);
    cy.get('#usage-credential option').eq(1).should('contain', 'Old key (revoked)');
    cy.get('#usage-credential').select('Production');
    cy.wait('@summary').its('request.query.apiKeyId').should('eq', 'k1');
    // the first /requests call (unfiltered) already happened; the filtered one must carry the credential AND the range
    cy.get('@failed.all').should((calls) => {
      const queries = (calls as unknown as Array<{ request: { query: Record<string, string> } }>).map((c) => c.request.query);
      expect(queries).to.deep.include({ outcome: 'error', limit: '20', range: '7d', apiKeyId: 'k1' });
    });
    cy.get('#usage-credential').select('All credentials');
    cy.wait('@summary').its('request.query').should('not.have.property', 'apiKeyId');
    cy.get('[data-testid="credential-usage-row"]').contains('Old key').click();
    cy.wait('@summary').its('request.query.apiKeyId').should('eq', 'k2');
    // the dropdown keeps every credential seen even though the filtered summary lists one
    cy.get('#usage-credential option').should('have.length', 3);
    cy.get('#usage-credential').should('have.value', 'k2');
    cy.get('[data-testid="credential-usage-row"]').should('have.length', 1);
    cy.get('[data-testid="credential-usage-row"] button').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="credential-usage-row"]').should('not.have.attr', 'aria-selected');
    cy.contains('button', 'Clear filter').click();
    cy.get('#usage-credential').should('have.value', '');
    cy.contains('button', 'Clear filter').should('not.exist');
  });

  it('sends the selected range to the failed requests list and re-queries when it changes', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() });
    stubRequests();
    mountPage();
    cy.wait('@failed').its('request.query.range').should('eq', '7d');
    cy.get('#usage-range').select('24h');
    cy.wait('@failed').its('request.query.range').should('eq', '24h');
    cy.get('#usage-range').select('30d');
    cy.wait('@failed').its('request.query.range').should('eq', '30d');
  });

  it('names credentials from the credentials query (incl. revoked), else "Other credential", else an em dash', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() });
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/requests' }, {
      body: { data: [failedRow('a', 'k3'), failedRow('b', 'zz'), failedRow('c', null)], nextCursor: null },
    });
    mountPage();
    cy.get('[data-testid="failed-request-row"]').should('have.length', 3);
    cy.get('[data-testid="failed-request-row"]').eq(0).should('contain', 'Archived key');
    cy.get('[data-testid="failed-request-row"]').eq(1).should('contain', 'Other credential');
    cy.get('[data-testid="failed-request-row"]').eq(2).should('not.contain', 'Other credential').and('contain', '—');
  });

  it('starts a NEW query from page 1 (no stale cursor) when the credential changes', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() });
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/requests' }, (req) => {
      const filtered = Boolean(req.query['apiKeyId']);
      if (req.query['cursor'] === 'c1') req.reply({ body: { data: [failedRow('r3')], nextCursor: null } });
      else req.reply({ body: { data: [failedRow(filtered ? 'only-k1' : 'r1')], nextCursor: filtered ? null : 'c1' } });
    }).as('failed');
    mountPage();
    cy.contains('button', 'Load more').click();
    cy.get('[data-testid="failed-request-row"]').should('have.length', 2);
    cy.get('#usage-credential').select('Production');
    cy.get('@failed.all').should((calls) => {
      const last = (calls as unknown as Array<{ request: { query: Record<string, string> } }>).at(-1)!.request.query;
      expect(last['apiKeyId']).to.eq('k1');
      expect(last).not.to.have.property('cursor');
    });
    cy.get('[data-testid="failed-request-row"]').should('have.length', 1);
    cy.contains('button', 'Load more').should('not.exist');
  });

  it('keeps the previous rows (dimmed, busy) while a new range loads, with no Loading flash', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() });
    let n = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/requests' }, (req) => {
      n += 1;
      req.reply({ delay: n === 1 ? 0 : 1200, body: { data: [failedRow(n === 1 ? 'old-row' : 'new-row')], nextCursor: null } });
    });
    mountPage();
    cy.get('[data-testid="failed-request-row"]').should('have.length', 1);
    cy.get('#usage-range').select('30d');
    cy.get('[data-testid="failed-requests-table"]').closest('[aria-busy]').should('have.attr', 'aria-busy', 'true').and('have.class', 'opacity-60');
    cy.get('[data-testid="failed-request-row"]').should('have.length', 1);
    cy.get('#usage-recent-failed').parent().should('not.contain', 'Loading…');
    cy.get('[data-testid="failed-requests-table"]').closest('[aria-busy]').should('have.attr', 'aria-busy', 'false');
  });

  it('shows an inline error with Retry when the failed requests list fails, then recovers', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() });
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/requests' }, (req) => {
      calls += 1;
      if (calls === 1) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'List broke' } } });
      else req.reply({ body: { data: [failedRow('r1')], nextCursor: null } });
    });
    mountPage();
    cy.get('#usage-recent-failed').parent().find('[role="alert"]').should('contain', 'List broke');
    cy.get('[data-testid="metric-requests"]').should('contain', '100');
    cy.get('#usage-recent-failed').parent().contains('button', 'Retry').click();
    cy.get('[data-testid="failed-request-row"]').should('have.length', 1);
  });

  it('labels hourly buckets with the weekday and mentions the partial first bucket', () => {
    const a = new Date(2026, 9, 6, 22, 0, 0).toISOString();
    const b = new Date(2026, 9, 7, 3, 0, 0).toISOString();
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, {
      body: {
        ...summary({ series: [
          { t: a, requests: 3, success: 3, errors: 0, failedSignins: 0 },
          { t: b, requests: 1, success: 0, errors: 1, failedSignins: 0 },
        ] }, 'hour'),
        range: { from: new Date(2026, 9, 6, 21, 42, 0).toISOString(), to: b, granularity: 'hour', approximate: false },
      },
    });
    stubRequests();
    mountPage();
    cy.get('[data-testid="usage-chart-table"] tbody th').first().invoke('text').should('match', /Tue/);
    cy.get('[data-testid="window-start-note"]').should('contain', 'Window starts at').and('contain', 'first bucket is partial');
  });

  it('shows the approximate banner and the hourly note for hourly sampled data', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, {
      body: summary({ series: [{ t: '2026-10-06T10:00:00Z', requests: 3, success: 3, errors: 0, failedSignins: 0 }] }, 'hour', true),
    });
    stubRequests();
    mountPage();
    cy.contains('Hourly numbers are approximate (some successful requests are sampled).').should('be.visible');
    cy.contains('Failed sign-ins in the hourly view can be undercounted during a flood of wrong-token requests.').should('be.visible');
  });

  it('shows the chart empty state when every bucket is zero but there are credentials', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, {
      body: summary({ series: [{ t: '2026-10-06', requests: 0, success: 0, errors: 0, failedSignins: 0 }] }),
    });
    stubRequests();
    mountPage();
    cy.get('[data-testid="chart-empty"]').should('be.visible');
  });

  it('shows the no-failures message for failure reasons', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary({ topFailureReasons: [] }) });
    stubRequests();
    mountPage();
    cy.contains('No failed messages in this period.').should('be.visible');
  });

  it('Load more appends the next page and disappears when nextCursor is null', () => {
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/summary' }, { body: summary() });
    cy.intercept({ method: 'GET', pathname: '/api/v1/api-usage/requests' }, (req) => {
      expect(req.query['outcome']).to.eq('error');
      expect(req.query['limit']).to.eq('20');
      if (req.query['cursor'] === 'c1') req.reply({ body: { data: [failedRow('r3', null), failedRow('r4')], nextCursor: null } });
      else req.reply({ body: { data: [failedRow('r1'), failedRow('r2')], nextCursor: 'c1' } });
    }).as('failed');
    mountPage();
    cy.get('[data-testid="failed-request-row"]').should('have.length', 2);
    cy.contains('button', 'Load more').click();
    cy.wait('@failed');
    cy.get('[data-testid="failed-request-row"]').should('have.length', 4);
    cy.contains('button', 'Load more').should('not.exist');
  });
});

describe('ApiUsageLink (settings index)', () => {
  function mountLink(): void {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    cy.mount(
      <QueryClientProvider client={qc}>
        <ApiUsageLink />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => stubMe());

  it('is hidden on API_NOT_AVAILABLE', () => {
    cy.intercept('GET', '/api/v1/api-credentials', {
      statusCode: 403, body: { error: { code: 'API_NOT_AVAILABLE', message: 'nope' } },
    }).as('list');
    mountLink();
    cy.wait('@list');
    cy.contains('API Usage').should('not.exist');
  });

  it('is hidden on FORBIDDEN', () => {
    cy.intercept('GET', '/api/v1/api-credentials', {
      statusCode: 403, body: { error: { code: 'FORBIDDEN', message: 'settings_api_key permission required' } },
    }).as('list');
    mountLink();
    cy.wait('@list');
    cy.contains('API Usage').should('not.exist');
  });

  it('is hidden (and never probes the API) for a user without the permission', () => {
    cy.intercept('GET', '/api/v1/users/me', {
      body: { data: { id: 'u2', fullName: 'B', email: 'b@x.com', role: 'agent', permissions: {} } },
    });
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } }).as('list');
    mountLink();
    cy.get('@list.all').should('have.length', 0);
    cy.contains('API Usage').should('not.exist');
  });

  it('is hidden while the credentials query is still loading, then appears', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { delay: 800, body: { data: [] } }).as('list');
    mountLink();
    cy.contains('API Usage').should('not.exist');
    cy.wait('@list');
    cy.contains('a', 'API Usage').should('be.visible');
  });

  it('is shown when the credentials query succeeds', () => {
    cy.intercept('GET', '/api/v1/api-credentials', { body: { data: [] } });
    mountLink();
    cy.contains('a', 'API Usage').should('have.attr', 'href', '/settings/api-usage');
    cy.contains('Requests, errors and usage per credential').should('be.visible');
  });
});
