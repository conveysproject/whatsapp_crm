import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplateAnalyticsView } from '../../components/templates/analytics/TemplateAnalyticsView';
import type { AnalyticsRange } from '../../lib/template-analytics';

const PATH = '/api/v1/templates/t1/analytics';
const LAST_SENT = '2026-10-15T08:30:00.000Z';

function days(from: string, n: number): Array<Record<string, unknown>> {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  return Array.from({ length: n }, (_, i) => ({
    day: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    sent: i % 5, delivered: i % 4, read: i % 3, failed: i % 2,
  }));
}

function payload(over: Record<string, unknown> = {}, tpl: Record<string, unknown> = {}): { data: Record<string, unknown> } {
  return {
    data: {
      inProgress: 0, sent: 100, delivered: 80, read: 40, failed: 5, readPercentage: 50,
      rates: { delivery: 80, read: 50, failure: 4.8 },
      reach: { uniqueRecipients: 90, lastSentAt: LAST_SENT },
      daily: days('2026-10-08', 8),
      failures: [{ code: '131026', title: 'Undeliverable', message: 'The recipient cannot receive this message', count: 5, share: 100, lastSeenAt: '2026-10-14T10:00:00.000Z' }],
      sources: [
        { source: 'api', count: 50 }, { source: 'dashboard', count: 20 }, { source: 'campaign', count: 15 },
        { source: 'flow', count: 8 }, { source: 'test', count: 4 }, { source: 'unknown', count: 3 },
      ],
      template: { name: 'Welcome Offer', language: 'en_US', category: 'MARKETING', status: 'approved', qualityScore: 'GREEN', lastEditedAt: '2026-10-01T09:00:00.000Z', previewText: 'Hello {{1}}, welcome aboard' , ...tpl },
      range: '30d', attributionNote: null,
      ...over,
    },
  };
}

function Harness({ initial = '30d' }: { initial?: AnalyticsRange }): React.JSX.Element {
  const [range, setRange] = useState<AnalyticsRange>(initial);
  return <TemplateAnalyticsView id="t1" range={range} onRangeChange={setRange} />;
}

function mount(initial: AnalyticsRange = '30d'): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  cy.mount(
    <QueryClientProvider client={qc}>
      <Harness initial={initial} />
    </QueryClientProvider>,
  );
}

function stub(body: unknown, statusCode = 200): void {
  cy.intercept({ method: 'GET', pathname: PATH }, { statusCode, body }).as('analytics');
}

describe('TemplateAnalytics page', () => {
  // Load Tailwind so visibility and the 375px layout assertions reflect the real styles (head exists by now).
  before(() => {
    // Next's style loader inserts CSS before this anchor, which only exists in a real Next document.
    if (!document.querySelector('#__next_css__DO_NOT_USE__')) {
      const anchor = document.createElement('noscript');
      anchor.id = '__next_css__DO_NOT_USE__';
      document.head.appendChild(anchor);
    }
    // @ts-expect-error CSS side-effect import has no type declarations in this tsconfig
    return import('../../app/globals.css');
  });

  it('shows a loading skeleton first', () => {
    cy.intercept({ method: 'GET', pathname: PATH }, (req) => { req.reply({ delay: 2500, body: payload() }); });
    mount();
    cy.get('[data-testid="analytics-loading"]').should('be.visible');
    cy.get('[data-testid="card-sent"]').should('be.visible');
    cy.get('[data-testid="analytics-loading"]').should('not.exist');
  });

  it('renders header, cards, funnel, chart, failures and sources', () => {
    stub(payload({ inProgress: 3 }));
    mount();
    cy.contains('h1', 'Welcome Offer').should('be.visible');
    cy.get('[data-testid="analytics-header"]').should('contain', 'en_US').and('contain', 'MARKETING').and('contain', 'Last edited:');
    cy.get('[data-testid="status-chip"]').should('have.text', 'approved');
    cy.get('[data-testid="quality"]').should('contain', 'GREEN');
    cy.get('[data-testid="preview-text"]').should('have.text', 'Hello {{1}}, welcome aboard');
    cy.contains('a', 'Back to templates').should('have.attr', 'href', '/templates');
    cy.get('[data-testid="card-sent"]').should('contain', '100');
    cy.get('[data-testid="card-delivered"]').should('contain', '80');
    cy.get('[data-testid="card-read"]').should('contain', '40');
    cy.get('[data-testid="card-failed"]').should('contain', '5');
    cy.get('[data-testid="card-delivery-rate"]').should('contain', '80%');
    cy.get('[data-testid="card-read-rate"]').should('contain', '50%');
    cy.get('[data-testid="card-failure-rate"]').should('contain', '4.8%');
    cy.get('[data-testid="card-recipients"]').should('contain', '90');
    cy.get('[data-testid="card-last-sent"]').should('contain', new Date(LAST_SENT).toLocaleString());
    cy.get('[data-testid="card-in-progress"]').should('contain', '3');
    cy.get('[data-testid="funnel-drop-delivered"]').should('contain', '20% drop-off');
    cy.get('[data-testid="funnel-drop-read"]').should('contain', '50% drop-off');
    cy.get('[data-testid="trend-chart"] .recharts-bar-rectangle').should('exist');
    cy.get('[data-testid="trend-table"] tbody tr').should('have.length', 8);
    cy.get('[data-testid="failure-row"]').should('have.length', 1).first()
      .should('contain', 'The recipient cannot receive this message').and('contain', '131026').and('contain', '5').and('contain', '100%');
    cy.get('[data-testid="source-list"]').should('contain', 'API').and('contain', 'Dashboard').and('contain', 'Campaign')
      .and('contain', 'Flow').and('contain', 'Test send').and('contain', 'Unknown / older');
    cy.get('[data-testid="date-span"]').should('have.text', '8 Oct to 15 Oct (UTC days)');
  });

  it('hides the in-progress card when nothing is in progress and shows the attribution note when present', () => {
    stub(payload({ attributionNote: 'Messages sent before 1 Oct are not attributed to a source.' }));
    mount();
    cy.get('[data-testid="card-sent"]').should('be.visible');
    cy.get('[data-testid="card-in-progress"]').should('not.exist');
    cy.get('[data-testid="attribution-note"]').should('have.text', 'Messages sent before 1 Oct are not attributed to a source.');
  });

  it('shows an em dash for null rates, never NaN or 0%', () => {
    stub(payload({ sent: 0, delivered: 0, read: 0, failed: 3, rates: { delivery: null, read: null, failure: null }, reach: { uniqueRecipients: 0, lastSentAt: null } }));
    mount();
    cy.get('[data-testid="card-delivery-rate"]').should('contain', '—');
    cy.get('[data-testid="card-read-rate"]').should('contain', '—');
    cy.get('[data-testid="card-failure-rate"]').should('contain', '—');
    cy.get('[data-testid="card-last-sent"]').should('contain', '—');
    cy.get('[data-testid="funnel"]').should('not.contain', 'NaN');
    cy.get('[data-testid="funnel-drop-delivered"]').should('not.exist');
    cy.get('[data-testid="template-analytics"]').should('not.contain', 'NaN');
  });

  it('range picker requests the chosen range', () => {
    stub(payload());
    mount();
    cy.wait('@analytics').its('request.query.range').should('eq', '30d');
    cy.get('[data-testid="range-30d"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="range-7d"]').click();
    cy.wait('@analytics').its('request.query.range').should('eq', '7d');
    cy.get('[data-testid="range-7d"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('[data-testid="range-all"]').click();
    cy.wait('@analytics').its('request.query.range').should('eq', 'all');
    cy.get('[data-testid="date-span"]').should('have.text', 'All time');
  });

  it('keeps the previous data visible (dimmed, aria-busy) while a new range loads', () => {
    cy.intercept({ method: 'GET', pathname: PATH, query: { range: '30d' } }, { body: payload() });
    cy.intercept({ method: 'GET', pathname: PATH, query: { range: '7d' } }, (req) => { req.reply({ delay: 1500, body: payload({ range: '7d' }) }); }).as('seven');
    mount();
    cy.contains('h1', 'Welcome Offer').should('be.visible');
    cy.get('[data-testid="range-7d"]').click();
    cy.contains('h1', 'Welcome Offer').should('be.visible');
    cy.get('[data-testid="card-sent"]').should('be.visible');
    cy.get('[data-testid="analytics-loading"]').should('not.exist');
    cy.get('[data-testid="analytics-content"]').should('have.attr', 'aria-busy', 'true');
    cy.wait('@seven');
    cy.get('[data-testid="analytics-content"]').should('have.attr', 'aria-busy', 'false');
  });

  it('keeps the data and shows a non-blocking alert when a background refresh fails, then recovers', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: PATH }, (req) => {
      calls += 1;
      if (calls === 2) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Boom' } } });
      else req.reply({ body: payload() });
    });
    mount();
    cy.get('[data-testid="card-sent"]').should('contain', '100');
    cy.contains('button', 'Refresh').click();
    cy.get('[data-testid="analytics-refresh-error"]').should('contain', 'Could not refresh. Showing the last loaded data.');
    cy.get('[data-testid="card-sent"]').should('contain', '100');
    cy.get('[data-testid="analytics-error"]').should('not.exist');
    cy.get('[data-testid="analytics-refresh-error"]').contains('button', 'Retry').click();
    cy.get('[data-testid="analytics-refresh-error"]').should('not.exist');
  });

  it('shows the empty state when nothing was sent', () => {
    stub(payload({ sent: 0, delivered: 0, read: 0, failed: 0, inProgress: 0, rates: { delivery: null, read: null, failure: null }, daily: [], failures: [], sources: [] }));
    mount();
    cy.contains('No messages sent with this template yet').should('be.visible');
    cy.get('[data-testid="card-sent"]').should('not.exist');
  });

  it('shows an error with Retry, never zeros, and recovers', () => {
    let calls = 0;
    cy.intercept({ method: 'GET', pathname: PATH }, (req) => {
      calls += 1;
      if (calls === 1) req.reply({ statusCode: 500, body: { error: { code: 'INTERNAL', message: 'Boom happened' } } });
      else req.reply({ body: payload() });
    });
    mount();
    cy.get('[data-testid="analytics-error"]').should('contain', 'Boom happened');
    cy.get('[data-testid="card-sent"]').should('not.exist');
    cy.contains('button', 'Retry').click();
    cy.get('[data-testid="card-sent"]').should('contain', '100');
    cy.get('[data-testid="analytics-error"]').should('not.exist');
  });

  it('shows the access message on 403', () => {
    stub({ error: { code: 'FORBIDDEN', message: 'nope' } }, 403);
    mount();
    cy.get('[data-testid="analytics-forbidden"]').should('have.text', 'You do not have access to template analytics');
    cy.get('[data-testid="card-sent"]').should('not.exist');
  });

  it('shows not found on 404', () => {
    stub({ error: { code: 'NOT_FOUND', message: 'missing' } }, 404);
    mount();
    cy.get('[data-testid="analytics-not-found"]').should('have.text', 'Template not found');
  });

  it('refresh refetches', () => {
    stub(payload());
    mount();
    cy.wait('@analytics');
    cy.contains('button', 'Refresh').click();
    cy.wait('@analytics');
  });

  it('renders server strings as literal text and never as HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const markup = '<b>bold</b> <script>alert(2)</script>';
    stub(payload({
      failures: [{ code: '<i>1</i>', title: evil, message: evil, count: 1, share: 100, lastSeenAt: null }],
    }, { previewText: markup, name: '<u>Name</u>' }));
    mount();
    cy.get('[data-testid="failure-row"]').should('contain.text', evil);
    cy.get('[data-testid="preview-text"]').should('have.text', markup);
    cy.get('h1').should('have.text', '<u>Name</u>');
    cy.get('[data-testid="template-analytics"] img').should('not.exist');
    cy.get('[data-testid="template-analytics"] b').should('not.exist');
    cy.get('[data-testid="template-analytics"] script').should('not.exist');
    cy.get('[data-testid="template-analytics"] u').should('not.exist');
  });

  it('handles a single day series', () => {
    stub(payload({ daily: [{ day: '2026-10-15', sent: 4, delivered: 3, read: 2, failed: 1 }] }));
    mount();
    cy.get('[data-testid="trend-table"] tbody tr').should('have.length', 1);
    cy.get('[data-testid="date-span"]').should('have.text', '15 Oct (UTC day)');
    cy.get('[data-testid="trend-chart"] .recharts-bar-rectangle').should('exist');
  });

  it('handles 366 daily rows', () => {
    stub(payload({ daily: days('2025-10-15', 366) }));
    mount('all');
    cy.get('[data-testid="trend-table"] tbody tr').should('have.length', 366);
    cy.get('[data-testid="trend-chart"] .recharts-bar-rectangle').should('exist');
  });

  it('Export CSV downloads a BOM-prefixed file with daily rows, a blank line and the failure table', () => {
    stub(payload({ failures: [{ code: '131026', title: null, message: '=cmd|"x"', count: 5, share: 100, lastSeenAt: null }] }));
    mount('7d');
    const captured: { blob: Blob | null; name: string } = { blob: null, name: '' };
    cy.window().then((win) => {
      cy.stub(win.URL, 'createObjectURL').callsFake((b: Blob) => { captured.blob = b; return 'blob:test'; });
      cy.stub(win.URL, 'revokeObjectURL');
      cy.stub(win.HTMLAnchorElement.prototype, 'click').callsFake(function (this: HTMLAnchorElement) { captured.name = this.download; });
    });
    cy.get('[data-testid="card-sent"]').should('be.visible');
    cy.contains('button', 'Export CSV').click();
    cy.then(() => {
      expect(captured.name).to.eq('template-welcome-offer-analytics-7d.csv');
      expect(captured.blob).to.not.eq(null);
      return captured.blob!.arrayBuffer();
    }).then((buf: ArrayBuffer) => {
      // UTF-8 BOM bytes EF BB BF at the start of the file.
      expect(Array.from(new Uint8Array(buf.slice(0, 3)))).to.deep.eq([0xef, 0xbb, 0xbf]);
      const lines = new TextDecoder('utf-8').decode(buf).split('\r\n');
      expect(lines[0]).to.eq('day,sent,delivered,read,failed');
      expect(lines).to.have.length(1 + 8 + 1 + 1 + 1);
      expect(lines[9]).to.eq('');
      expect(lines[10]).to.eq('code,message,count,share,last_seen');
      expect(lines[11]).to.eq(`131026,"'=cmd|""x""",5,100,`);
    });
  });

  it('has no horizontal page scroll at 375px', () => {
    cy.viewport(375, 800);
    stub(payload());
    mount();
    cy.get('[data-testid="card-sent"]').should('be.visible');
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});
