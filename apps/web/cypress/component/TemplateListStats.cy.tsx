import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { TemplateActiveTab } from '../../app/(dashboard)/templates/TemplateActiveTab';
import type { TemplateData } from '../../app/(dashboard)/templates/TemplateRow';

function tpl(id: string, name: string, over: Partial<TemplateData> = {}): TemplateData {
  return {
    id, name, category: 'UTILITY', language: 'en', status: 'approved', components: [],
    headerFormat: null, headerText: null, bodyText: `Body of ${name}`, footerText: null, buttonCount: null,
    qualityScore: null, qualityDate: null, qualityReasons: null, rejectedReason: null, correctCategory: null,
    parameterFormat: null, messageSendTtlSeconds: null, ctaUrlTrackingOptedOut: null, libraryTemplateName: null,
    lastEditedTime: null, metaTemplateId: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z',
    ...over,
  };
}

const TEMPLATES = [tpl('t1', 'alpha_offer'), tpl('t2', 'bravo_update'), tpl('t3', 'charlie_new')];
const STATS = [
  { templateId: 't1', sent: 1240, delivered: 1180, read: 730, deliveryRate: 95.2, readRate: 61.9 },
  { templateId: 't2', sent: 0, delivered: 0, read: 0, deliveryRate: null, readRate: null },
];

function mount(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = { refresh: () => undefined, push: () => undefined, replace: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined } as unknown as AppRouterInstance;
  cy.mount(
    <AppRouterContext.Provider value={router}>
      <QueryClientProvider client={qc}>
        <TemplateActiveTab templates={TEMPLATES} />
      </QueryClientProvider>
    </AppRouterContext.Provider>,
  );
}

describe('Templates list statistics', () => {
  it('shows sent, delivered and read rate, with an em dash for templates with no data', () => {
    cy.intercept('GET', '/api/v1/templates/stats*', { data: STATS, range: '30d' }).as('stats');
    mount();
    cy.wait('@stats').its('request.url').should('include', 'range=30d');
    cy.contains('a', '1,240').should('have.attr', 'href', '/templates/t1/analytics?range=30d');
    cy.contains('1,180').should('be.visible');
    cy.contains('(95.2%)').should('be.visible');
    cy.contains('61.9%').should('be.visible');
    cy.contains('alpha_offer').parents('[class*="divide-y"]').first().should('contain.text', 'en');
    cy.get('[title="No messages in this period"]').should('have.length.at.least', 4);
  });

  it('refetches when the period changes', () => {
    cy.intercept('GET', '/api/v1/templates/stats*', { data: STATS, range: '30d' }).as('stats');
    mount();
    cy.wait('@stats');
    cy.contains('button', '7 days').click();
    cy.wait('@stats').its('request.url').should('include', 'range=7d');
  });

  it('sorts by sent with no-data templates always last, and by name', () => {
    cy.intercept('GET', '/api/v1/templates/stats*', { data: STATS, range: '30d' });
    mount();
    const names = (): Cypress.Chainable<string[]> =>
      cy.get('p.font-medium.truncate').then(($p) => $p.toArray().map((e) => e.textContent ?? ''));
    cy.contains('1,240').should('be.visible');
    cy.contains('button', 'Sent').click(); // desc: t1 has data, t2 (0 sent) and t3 (none) follow in list order
    names().should('deep.equal', ['alpha_offer', 'bravo_update', 'charlie_new']);
    cy.contains('button', 'Sent').click(); // asc: still last
    names().should('deep.equal', ['alpha_offer', 'bravo_update', 'charlie_new']);
    cy.contains('button', 'Name').click(); // asc
    names().should('deep.equal', ['alpha_offer', 'bravo_update', 'charlie_new']);
    cy.contains('button', 'Name').click(); // desc
    names().should('deep.equal', ['charlie_new', 'bravo_update', 'alpha_offer']);
  });

  it('uses a plus icon that becomes a minus when the row is expanded', () => {
    cy.intercept('GET', '/api/v1/templates/stats*', { data: STATS, range: '30d' });
    mount();
    cy.get('[aria-label="Expand details"]').first().should('have.attr', 'aria-expanded', 'false').click();
    cy.get('[aria-label="Collapse details"]').should('have.attr', 'aria-expanded', 'true');
    cy.contains('Body of alpha_offer').should('be.visible');
  });

  it('keeps the list usable when statistics fail to load', () => {
    cy.intercept('GET', '/api/v1/templates/stats*', { statusCode: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'x' } } });
    mount();
    cy.contains('Could not load sending statistics').should('be.visible');
    cy.contains('alpha_offer').should('be.visible');
  });
});
